import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { db, closeDb } from '../lib/server/db.ts';
import { getToolLibrary, getTool, toolId, planReuse, resolveReuse, buildToolComparisons } from '../lib/server/reuse.ts';
import { protocol, seedEvidence, validateEvidence, reportSummary, SEED_SLUG } from '../lib/server/evidence.ts';
import { assembleEvidence } from '../worker/evidence.mjs';
import { assertJob, evaluationCounts } from '../worker/protocol.mjs';
import { runJob } from '../worker/index.mjs';
import type { launchCaptureBrowser } from '../worker/capture.mjs';
import { evidenceHash, REUSE_WINDOW_MS } from '../worker/reuse.mjs';
import type { Provider, Row } from '../lib/server/model.ts';

const now = Date.parse('2026-09-21T00:00:00.000Z');
function isolated() {
  closeDb(); const old = process.env.DATA_DIR; const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'single-tool-')); process.env.DATA_DIR = directory;
  return () => { closeDb(); if (old === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = old; fs.rmSync(directory, { recursive: true, force: true }); };
}
function provider(name = 'New tool', website = 'https://new-tool.example/', sample = 'sample'): Provider { return { name, website, customers: [1, 2, 3].map(i => ({ name: `${sample} store ${i}`, website: `https://${sample}-${i}.example/` })) }; }
function fixture(p: Provider, capturedAt = '2026-09-20T23:50:00.000Z') {
  const selected = seedEvidence().live_conversations.filter((c: Row) => c.vendor === 'Alhena');
  const stores = [...new Set(selected.map((c: Row) => c.store))];
  return selected.map((source: Row) => {
    const c = structuredClone(source); const store = p.customers[stores.indexOf(c.store)];
    c.vendor = p.name; c.store = store.name; c.url = store.website; c.date = capturedAt.slice(0, 10); c.captured_at = capturedAt; c.capture_metadata.adapter = 'single-tool-fixture';
    for (const t of c.turns) { t.author_verified = true; t.author_evidence = { kind: 'dom-ai-author', selector: '[data-role="assistant"]', provider: p.name, adapter_id: c.capture_metadata.adapter, message_count: 1, markers: [{ attribute: 'data-role', value: 'assistant' }] }; }
    return c;
  });
}
function persist(slug: string, evidence: Row, publishedAt = new Date(now).toISOString()) {
  const directory = path.join(process.env.DATA_DIR!, 'reports'); fs.mkdirSync(directory, { recursive: true });
  const bytes = JSON.stringify(evidence); fs.writeFileSync(path.join(directory, `${slug}.json`), bytes);
  const summary = reportSummary(slug, evidence, publishedAt);
  db().prepare('INSERT INTO reports (slug,job_id,title,published_at,summary_json,evidence_path,evidence_sha256) VALUES (?,?,?,?,?,?,?)').run(slug, null, summary.title, publishedAt, JSON.stringify(summary), `${slug}.json`, createHash('sha256').update(bytes).digest('hex'));
}
function evidence(p: Provider, capturedAt?: string) { return assembleEvidence({ providers: [p] }, fixture(p, capturedAt), { fixture: true }, { now }); }

test('one tool has exactly six complete conversations and all 78 fixed-weight decisions', () => {
  const p = provider(), snapshot = protocol(), result = evidence(p);
  assert.deepEqual(evaluationCounts([p]), { stores: 3, conversations: 6, turns: 60, checks: 78, criteria: 26 });
  assertJob({ id: 'job', leaseToken: 'lease', fencingToken: 1, providers: [p], protocol: snapshot });
  assert.deepEqual(validateEvidence(result, [p], snapshot, [], [], now), { conversations: 6, turns: 60, checks: 78, criteria: 26, stores: 3 });
  assert.equal(result.study.counts.decisions, 78); assert.equal(result.audit.verdicts, 78); assert.equal(result.study.kind, 'tool');
  const summary = reportSummary('tool', result); assert.equal(summary.kind, 'tool'); assert.equal(summary.storeCount, 3); assert.deepEqual(summary.providerWebsites, [p.website]);
  const partial = structuredClone(result); partial.live_conversations.pop(); assert.throws(() => validateEvidence(partial, [p], snapshot, [], [], now), /exactly 6/);
  const future = structuredClone(result); future.live_conversations[0].captured_at = new Date(now + 1).toISOString(); assert.throws(() => validateEvidence(future, [p], snapshot, [], [], now), /future/);
  const badIdentity = structuredClone(result); badIdentity.study.providers[0].website = 'https://wrong.example/'; assert.throws(() => validateEvidence(badIdentity, [p], snapshot, [], [], now), /provider websites/);
  assert.throws(() => evaluationCounts([p, p, p]), /One or two/);
});

test('seed contributes two safe tool cohorts, and exact single-tool reuse finds its six source conversations', () => {
  const cleanup = isolated(); try {
    const library = getToolLibrary(now); assert.equal(library.tools.length, 2);
    const alhena = library.tools.find(t => t.name === 'Alhena')!;
    assert.equal(alhena.conversationCount, 6); assert.equal(alhena.turnCount, 60); assert.equal(alhena.customers.length, 3); assert.equal(alhena.fresh, true);
    for (const customer of alhena.customers) {
      const dates = Object.values(customer.analyses as Record<string, { capturedAt: string }>).map(a => new Date(a.capturedAt).toISOString()).sort();
      assert.equal(customer.oldestCaptureAt, dates[0]); assert.equal(customer.capturedAt, dates.at(-1));
    }
    assert.deepEqual(alhena.comparisonSlugs, [SEED_SLUG]); assert.equal(JSON.stringify(library).includes('reply_as_judged'), false);
    assert.equal(toolId('http://WWW.ALHENA.AI/'), alhena.id); assert.equal(getTool(alhena.id, now)?.name, 'Alhena');
    const p = { name: alhena.name, website: alhena.website, customers: alhena.customers.map((c: Row) => ({ name: c.name, website: c.website })) };
    const plan = planReuse([p], protocol(), true, now); assert.equal(plan.existingTool?.id, alhena.id); assert.equal(plan.reusedConversations, 6); assert.equal(plan.newConversations, 0); assert.equal(plan.newStores, 0);
    const cached = resolveReuse(plan, [p], protocol(), now); const result = assembleEvidence({ providers: [p], reusedConversations: cached }, cached, { reused_only: true }, { now });
    assert.equal(validateEvidence(result, [p], protocol(), [], cached, now).checks, 78);
    assert.equal(getTool(alhena.id, now + REUSE_WINDOW_MS)?.fresh, false);
  } finally { cleanup(); }
});

test('tool library selects a coherent three-store sample without combining or double-weighting cohorts', () => {
  const cleanup = isolated(); try {
    const first = provider('Same tool', 'https://same.example/', 'older'); persist('older', evidence(first, '2026-09-20T21:00:00.000Z'));
    const second = provider('Same tool', 'https://same.example/', 'newer'); persist('newer', evidence(second));
    const tool = getTool(toolId(second.website), now)!;
    assert.equal(tool.reportSlug, 'newer'); assert.deepEqual(tool.customers.map((c: Row) => c.website), second.customers.map(c => c.website)); assert.equal(tool.storeCount, 3);
    const count = getToolLibrary(now).tools.length;
    for (const pair of buildToolComparisons('newer', protocol(), now)) persist(pair.slug, pair.evidence);
    assert.equal(getToolLibrary(now).tools.length, count); assert.deepEqual(getTool(tool.id, now)?.scores, tool.scores);
    assert.equal(getTool(tool.id, now)?.reportSlug, 'newer');
  } finally { cleanup(); }
});

test('automatic pairs reuse only complete fresh cohorts, preserve origin hashes and are idempotent', () => {
  const cleanup = isolated(); try {
    const p = provider(); const native = evidence(p); persist('new-tool', native);
    const pairs = buildToolComparisons('new-tool', protocol(), now); assert.equal(pairs.length, 2);
    for (const pair of pairs) {
      assert.equal(pair.evidence.live_conversations.length, 12); assert.equal(pair.evidence.study.reuse.new_conversations, 0); assert.equal(pair.evidence.publication.automatic_comparison, true);
      assert.ok(pair.evidence.live_conversations.every((c: Row) => c.reuse));
      const newConversations = pair.evidence.live_conversations.filter((c: Row) => c.vendor === p.name);
      assert.equal(newConversations.length, 6); assert.ok(newConversations.every((c: Row) => c.reuse.sourceReportHash === evidenceHash(native) && c.captured_at === '2026-09-20T23:50:00.000Z'));
      assert.ok(pair.evidence.study.limitations.some((s: string) => s.includes('Per-turn AI-author proof')));
      persist(pair.slug, pair.evidence);
    }
    assert.equal(buildToolComparisons('new-tool', protocol(), now).length, 0);
    assert.equal(buildToolComparisons('new-tool', protocol(), now + REUSE_WINDOW_MS).length, 0);
    assert.equal(getTool(toolId(p.website), now)?.comparisonSlugs.length, 2);
    const cohort = getToolLibrary(now).tools.find(t => t.name === 'Alhena')!;
    const alhena = { name: cohort.name, website: cohort.website, customers: cohort.customers.map((c: Row) => ({ name: c.name, website: c.website })) };
    const cached = resolveReuse(planReuse([alhena], protocol(), true, now), [alhena], protocol(), now);
    persist('alhena-source-view', assembleEvidence({ providers: [alhena], reusedConversations: cached }, cached, { reused_only: true }, { now }));
    assert.equal(buildToolComparisons('alhena-source-view', protocol(), now).length, 0, 'seed and equivalent source-derived pairs already exist');
  } finally { cleanup(); }
});

test('single-tool worker performs exactly six capture/judge calls and emits a 60-turn result', async () => {
  const cleanup = isolated(); const oldNow = Date.now; Date.now = () => now;
  try {
    const p = provider(); const conversations = fixture(p); let captures = 0, judges = 0; let result: Row | undefined;
    const run = await runJob({ id: 'single', leaseToken: 'lease', fencingToken: 1, providers: [p], protocol: protocol() }, async (route: string, body: Row) => { if (route === 'complete') result = body.evidence; }, {
      rootDirectory: process.env.DATA_DIR, loadReference: async () => ({ manifest: { fixture: true } }), startProxy: async () => ({ url: 'fixture', close: async () => {} }), launchBrowser: async () => ({ close: async () => {} }) as unknown as Awaited<ReturnType<typeof launchCaptureBrowser>>,
      capture: async ({ store, mode }: Row) => { captures++; return conversations.find((c: Row) => c.store === store.name && c.mode === mode); }, judge: async (c: Row) => { judges++; return c; },
    });
    assert.equal(run.status, 'completed'); assert.equal(captures, 6); assert.equal(judges, 6); assert.ok(result); assert.equal(validateEvidence(result, [p], protocol(), [], [], now).turns, 60);
  } finally { Date.now = oldNow; cleanup(); }
});
