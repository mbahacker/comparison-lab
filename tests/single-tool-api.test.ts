import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleApi } from '../lib/server/api.ts';
import { db, closeDb } from '../lib/server/db.ts';
import { hash } from '../lib/server/security.ts';
import type { Row } from '../lib/server/model.ts';
import { seedEvidence, getReport, SEED_SLUG } from '../lib/server/evidence.ts';
import { assembleEvidence } from '../worker/evidence.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-single-tool-api-'));
const realNow = Date.now;
let now = Date.parse('2026-09-21T00:00:00Z');
Date.now = () => now;
Object.assign(process.env, { CONTENT_DIR: path.resolve('content/reports'), NODE_ENV: 'test', APP_URL: 'https://research.example', MAIL_TRANSPORT: 'file', WORKER_SECRET: 'fixture-worker-secret-with-32-characters' });
beforeEach(() => {
  closeDb(); now = Date.parse('2026-09-21T00:00:00Z');
  process.env.DATA_DIR = fs.mkdtempSync(path.join(root, 'case-'));
  db().prepare('INSERT INTO users(id,email,name,verified_at,created_at) VALUES(?,?,?,?,?)').run('reader', 'reader@business.example', 'Fixture Reader', new Date(now).toISOString(), new Date(now).toISOString());
  db().prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash('fixture-session'), 'reader', now + 100 * 86_400_000);
});
after(() => { Date.now = realNow; closeDb(); fs.rmSync(root, { recursive: true, force: true }); });
async function call(route: string, body?: unknown, worker = false, authenticated = true) {
  if (body && ['tools/requests','tools/reuse/preview','requests','reuse/preview'].includes(route)) body = { ...(body as Record<string, unknown>), protocol: 'quality-pilot-v1' };
  const headers: Record<string, string> = { origin: process.env.APP_URL! };
  if (authenticated) headers.cookie = 'comparison_lab_session=fixture-session';
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (worker) headers.authorization = `Bearer ${process.env.WORKER_SECRET}`;
  const response = await handleApi(new Request(`${process.env.APP_URL}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: response.status, headers: response.headers, data: await response.json() as Row };
}
const provider = (name = 'Fresh Tool') => ({ name, website: `https://${name.toLowerCase().replaceAll(' ', '-')}.example/`, customers: [1, 2, 3].map(i => ({ name: `${name} Store ${i}`, website: `https://${name.toLowerCase().replaceAll(' ', '-')}-store-${i}.example/` })) });
async function submit(p = provider()) {
  const result = await call('tools/requests', { provider: p, consent: true, notes: 'Fixture only; no live calls.' });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.request;
}
async function approve(id: string) {
  const mail = db().prepare('SELECT text_body FROM outbox WHERE event_key=?').get(`request:${id}:review`) as Row;
  const token = mail.text_body.match(/\/review\/([A-Za-z0-9_-]+)/)[1];
  const result = await call(`review/${token}`, { decision: 'approve', confirmAttribution: true });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.request;
}
function evidence(job: Row) {
  const p = job.providers[0];
  const conversations = seedEvidence().live_conversations.filter((c: Row) => c.vendor === 'Alhena').map((source: Row, index: number) => {
    const c = structuredClone(source);
    const customer = p.customers[Math.floor(index / 2)];
    c.id = `fixture-${index}`; c.vendor = p.name; c.store = customer.name; c.url = customer.website;
    c.captured_at = new Date(now).toISOString(); c.date = c.captured_at.slice(0, 10); c.capture_metadata.adapter = 'fixture-only';
    for (const turn of c.turns) {
      turn.author_verified = true;
      turn.author_evidence = { kind: 'dom-ai-author', selector: '[data-role="assistant"]', provider: p.name, adapter_id: 'fixture-only', message_count: 1, markers: [{ attribute: 'data-role', value: 'assistant' }] };
    }
    for (const check of c.checks) {
      if (check.audit.classification === 'FALSE_POSITIVE') check.audit.classification = 'FP';
      if (check.audit.classification === 'FALSE_NEGATIVE') check.audit.classification = 'FN';
      const quote = c.turns[0].reply_as_judged.slice(0, 100);
      if (check.primary.pass) check.primary.evidence = quote;
      if (check.final.pass) check.final.evidence = quote;
      if (check.audit.classification === 'AGREE') check.final.evidence = check.primary.evidence;
      if (check.audit.classification !== 'AGREE' || check.final.pass) check.audit.evidence = check.final.evidence;
      check.evidence = check.final.evidence;
    }
    return c;
  });
  return assembleEvidence(job, conversations, { fixture: true }, { now });
}
const lease = (job: Row) => ({ jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken });
const count = (table: string) => (db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Row).n;

test('tool library exposes only summaries and recognizes both seeded tool cohorts without work', async () => {
  const library = await call('tools', undefined, false, false);
  assert.equal(library.status, 200); assert.equal(library.data.tools.length, 2);
  assert.equal(JSON.stringify(library.data).includes('reply_as_judged'), false);
  const tool = library.data.tools[0];
  assert.equal((await call(`tools/${tool.id}`, undefined, false, false)).data.tool.name, tool.name);
  assert.equal((await call('tools/not-found', undefined, false, false)).status, 404);
  const input = { name: tool.name, website: tool.website, customers: tool.customers.map((c: Row) => ({ name: c.name, website: c.website })) };
  const preview = await call('tools/reuse/preview', { provider: input });
  assert.equal(preview.data.reusedConversations, 6); assert.equal(preview.data.newConversations, 0);
  assert.equal(preview.data.existingTool.reportSlug, SEED_SLUG);
  const result = await call('tools/requests', { provider: input, consent: true });
  assert.equal(result.status, 200); assert.equal(result.data.existingTool.id, tool.id);
  assert.equal(count('requests'), 0); assert.equal(count('jobs'), 0);
});

test('single submission requires work-email session, consent, exactly three unique public storefronts', async () => {
  assert.equal((await call('tools/requests', { provider: provider(), consent: true }, false, false)).status, 401);
  assert.equal((await call('tools/requests', { provider: provider() })).status, 400);
  const duplicate = provider(); duplicate.customers[2].website = duplicate.customers[0].website;
  assert.equal((await call('tools/requests', { provider: duplicate, consent: true })).status, 400);
  assert.equal((await call('tools/requests', { provider: { ...provider(), customers: [] }, consent: true })).status, 400);
  db().prepare('UPDATE users SET email=? WHERE id=?').run('reader@gmail.com', 'reader');
  assert.equal((await call('tools/requests', { provider: provider(), consent: true })).status, 400);
  assert.equal(count('requests'), 0);
});

test('approved single run atomically publishes a tool and all fresh pairs; completion is idempotent and private details stay gated', async () => {
  const first = await submit(); const second = await submit();
  assert.equal(first.kind, 'tool'); assert.equal(first.providers.length, 1);
  assert.equal((await call('worker/claim', {}, true)).data.job, null);
  const reviewMail = db().prepare('SELECT text_body FROM outbox WHERE event_key=?').get(`request:${first.id}:review`) as Row;
  assert.match(reviewMail.text_body, /all 3 storefronts/); assert.match(reviewMail.text_body, /at most 60 new turns/);
  await approve(first.id); await approve(second.id);
  const job = (await call('worker/claim', {}, true)).data.job;
  assert.equal(job.providers.length, 1); assert.deepEqual(job.limits, { conversations: 6, turns: 60, decisions: 78 });
  const payload = { ...lease(job), evidence: evidence(job) };
  const result = await call('worker/complete', payload, true);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.report.kind, 'tool'); assert.equal(result.data.report.turnCount, 60);
  assert.equal(result.data.comparisons.length, 2); assert.equal(count('reports'), 3);
  assert.ok(result.data.comparisons.every((report: Row) => report.turnCount === 120));
  const generated = db().prepare('SELECT job_id,generation_key FROM reports WHERE generation_key IS NOT NULL').all() as Row[];
  assert.equal(generated.length, 2); assert.ok(generated.every(report => report.job_id === null));
  for (const report of result.data.comparisons) {
    const source = getReport(report.slug).evidence;
    assert.equal(source.publication.automatic_comparison, true);
    assert.equal(source.study.reuse.reused_conversations, 12);
    assert.ok(source.live_conversations.every((c: Row) => !!c.reuse));
    assert.ok(source.study.limitations.some((line: string) => line.includes('separately evaluated storefront samples')));
  }
  assert.equal((await call(`reports/${result.data.report.slug}`, undefined, false, false)).data.evidence, undefined);
  assert.equal((await call(`reports/${result.data.report.slug}/details`, undefined, false, false)).status, 401);
  assert.equal((await call(`reports/${result.data.report.slug}/details`)).data.evidence.publication.counts.checks, 78);
  const repeated = await call('worker/complete', payload, true);
  assert.equal(repeated.status, 200); assert.deepEqual(repeated.data, result.data);
  assert.equal(count('reports'), 3);
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM outbox WHERE event_key=?').get(`request:${first.id}:published`) as Row).n, 1);
  assert.equal((await call('worker/complete', { ...payload, fencingToken: job.fencingToken + 1 }, true)).status, 409);
  assert.equal((await call('worker/complete', { ...payload, evidence: { ...payload.evidence, injected: true } }, true)).status, 409);
  // A second approved request is linked at claim time after the first completes.
  assert.equal((await call('worker/claim', {}, true)).data.job, null);
  const linked = (await call(`requests/${second.id}`)).data.request;
  assert.equal(linked.status, 'published'); assert.equal(linked.toolId, result.data.toolId);
  assert.equal(linked.comparisons.length, 2); assert.equal(count('reports'), 3);
  const mailed = db().prepare('SELECT text_body FROM outbox WHERE event_key=?').get(`request:${first.id}:published`) as Row;
  assert.match(mailed.text_body, /6 conversations, 60 turns and 78 criterion decisions/);
  assert.ok(mailed.text_body.includes(`/tools/${result.data.toolId}`));
  assert.ok(result.data.comparisons.every((r: Row) => mailed.text_body.includes(`/reports/${r.slug}`)));
  assert.equal((await call('reports?kind=tool')).data.reports.length, 1);
  assert.equal((await call('reports?kind=comparison')).data.reports.length, 3);
});

test('pair publication failure rolls back the tool, pairs, completion and emails; identical leased retry recovers', async () => {
  const request = await submit(); await approve(request.id);
  const job = (await call('worker/claim', {}, true)).data.job;
  const payload = { ...lease(job), evidence: evidence(job) };
  db().exec("CREATE TRIGGER reject_fixture_pair BEFORE INSERT ON reports WHEN NEW.generation_key IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture pair publication failure'); END;");
  assert.equal((await call('worker/complete', payload, true)).status, 500);
  assert.equal(count('reports'), 0);
  assert.equal((db().prepare('SELECT state FROM jobs WHERE id=?').get(job.id) as Row).state, 'running');
  assert.equal((await call(`requests/${request.id}`)).data.request.status, 'running');
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM outbox WHERE event_key=?').get(`request:${request.id}:published`) as Row).n, 0);
  db().exec('DROP TRIGGER reject_fixture_pair');
  const retried = await call('worker/complete', payload, true);
  assert.equal(retried.status, 200, JSON.stringify(retried.data)); assert.equal(count('reports'), 3);
});

test('expired cohorts remain browsable but do not generate a fresh comparison', async () => {
  now = Date.parse('2026-11-01T00:00:00Z');
  const library = (await call('tools')).data;
  assert.ok(library.tools.every((tool: Row) => tool.fresh === false));
  const request = await submit(); await approve(request.id);
  const job = (await call('worker/claim', {}, true)).data.job;
  const result = await call('worker/complete', { ...lease(job), evidence: evidence(job) }, true);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(result.data.comparisons, []); assert.equal(count('reports'), 1);
  const mail = db().prepare('SELECT text_body FROM outbox WHERE event_key=?').get(`request:${request.id}:published`) as Row;
  assert.match(mail.text_body, /no compatible fresh tool cohorts/);
});
