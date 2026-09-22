import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleApi } from '../lib/server/api.ts';
import { closeDb, db } from '../lib/server/db.ts';
import { protocol, seedEvidence, validateEvidence } from '../lib/server/evidence.ts';
import { adminCommand } from '../lib/server/admin.ts';
import { enqueueMail, flushOutbox } from '../lib/server/mail.ts';
import { assembleEvidence } from '../worker/evidence.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comparison-lab-test-'));
process.env.DATA_DIR = directory;
process.env.CONTENT_DIR = path.resolve('content/reports');
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.APP_URL = 'http://localhost:3000';
process.env.MAIL_TRANSPORT = 'file';
process.env.WORKER_SECRET = 'test-worker-secret-with-more-than-32-characters';
after(() => { closeDb(); fs.rmSync(directory, { recursive: true, force: true }); });

async function call(route: string, options: { method?: string; body?: any; cookie?: string; worker?: boolean; origin?: string } = {}) {
  if (options.body && ['requests','reuse/preview'].includes(route)) options.body = { ...options.body, protocol: 'quality-pilot-v1' };
  const headers: Record<string, string> = { origin: options.origin || process.env.APP_URL! };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  if (options.worker) headers.authorization = `Bearer ${process.env.WORKER_SECRET}`;
  const response = await handleApi(new Request(`${process.env.APP_URL}/api/${route}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }));
  // Test harness emulates the separate mail daemon; API requests themselves do not dispatch queued mail.
  await flushOutbox(25);
  return { response, data: await response.json() as any };
}
function messages() {
  const folder = path.join(directory, 'mail');
  return fs.existsSync(folder) ? fs.readdirSync(folder).map(file => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'))) : [];
}
async function login(email: string, name = 'Test Requester') {
  const started = await call('auth/start', { method: 'POST', body: { name, email } });
  assert.equal(started.response.status, 200);
  const message = messages().find(m => m.to === email && m.subject.includes('verification code'));
  const code = /code is: (\d{6})/.exec(message.text)![1];
  const verified = await call('auth/verify', { method: 'POST', body: { email, code } });
  assert.equal(verified.response.status, 200);
  assert.match(verified.response.headers.get('set-cookie')!, /; HttpOnly; SameSite=Lax;/);
  return { cookie: verified.response.headers.get('set-cookie')!.split(';')[0], code };
}
function providers(scenario = '') {
  const seed = seedEvidence();
  return ['Alhena', 'Gorgias'].map(name => ({ name, website: `https://${name.toLowerCase()}${scenario ? `-${scenario}` : ''}.benchmark-business.example/`, customers: seed.live_conversations.filter((c: any) => c.vendor === name && c.mode === 'shopping').map((c: any) => ({ name: c.store, website: c.url })) }));
}
function completeEvidence() {
  const seed = seedEvidence();
  for (const conversation of seed.live_conversations) {
    conversation.capture_metadata.adapter = 'test-only-reviewed-bot-adapter';
    for (const turn of conversation.turns) {
      turn.author_verified = true;
      turn.author_evidence = { kind: 'reviewed-bot-selector', selector: '[data-test-only-bot-message]', provider: conversation.vendor, adapter_id: 'test-only-reviewed-bot-adapter', message_count: 1, markers: [{ attribute: 'reviewed-selector', value: '[data-test-only-bot-message]' }] };
    }
  }
  for (const conversation of seed.live_conversations) for (const check of conversation.checks) {
    if (check.audit.classification === 'FALSE_POSITIVE') check.audit.classification = 'FP';
    if (check.audit.classification === 'FALSE_NEGATIVE') check.audit.classification = 'FN';
    // This is a transport/validation fixture, not a fresh evaluation. Supply actual transcript
    // substrings as quote fields while preserving seed verdicts and deterministic score totals.
    const quote = conversation.turns[0].reply_as_judged.slice(0, 100);
    if (check.primary.pass) check.primary.evidence = quote;
    if (check.final.pass) check.final.evidence = quote;
    if (check.audit.classification === 'AGREE') check.final.evidence = check.primary.evidence;
    if (check.audit.classification !== 'AGREE' || check.final.pass) check.audit.evidence = check.final.evidence;
    check.evidence = check.final.evidence;
  }
  return { schema_version: 'comparison-lab-evidence/v1', study: { ...seed.study, providers: providers(), protocol_id: 'quality-pilot-v1', generated_at: new Date().toISOString() }, rubric: { ...seed.rubric, criteria: protocol().criteria, source_commit: seed.study.source_commit }, live_conversations: seed.live_conversations, validation: { passed: true }, audit: { trusted: true, agreement_pct: 99.4, verdicts: 156, agreed: 155, corrected: 1 }, provenance: { fixture: 'Test-only transport fixture based on seed transcripts and scores, with controlled quote fields; not research and never published outside temporary test directories.' } };
}

test('the complete request lifecycle is private, approval-gated, fenced and publish-once', async t => {
  const owner = await login('owner@benchmark-business.example');
  await t.test('OTP is consumed once and sessions are HttpOnly', async () => {
    assert.match(owner.cookie, /^comparison_lab_session=/);
    const replay = await call('auth/verify', { method: 'POST', body: { email: 'owner@benchmark-business.example', code: owner.code } });
    assert.equal(replay.response.status, 400);
    const session = await call('auth/session', { cookie: owner.cookie });
    assert.equal(session.data.user.email, 'owner@benchmark-business.example');
  });
  await t.test('cross-origin mutations, personal email and internal hosts are rejected', async () => {
    assert.equal((await call('auth/start', { method: 'POST', origin: 'https://evil.example', body: { name: 'Evil', email: 'evil@business.example' } })).response.status, 403);
    assert.equal((await call('auth/start', { method: 'POST', body: { name: 'Someone', email: 'test@gmail.com' } })).response.status, 400);
    const bad = providers(); bad[0].customers[0].website = 'http://127.0.0.1/';
    assert.equal((await call('requests', { method: 'POST', cookie: owner.cookie, body: { providers: bad, consent: true } })).response.status, 400);
    assert.equal((await call('requests', { method: 'POST', cookie: owner.cookie, body: { providers: providers() } })).response.status, 400);
  });
  const submitted = await call('requests', { method: 'POST', cookie: owner.cookie, body: { providers: providers(), consent: true, notes: 'Please verify these six deployments.' } });
  assert.equal(submitted.response.status, 201);
  const id = submitted.data.request.id;
  const adminMail = messages().find(m => m.subject === 'Review requested: Alhena vs. Gorgias');
  const reviewToken = /\/review\/([A-Za-z0-9_-]+)/.exec(adminMail.text)![1];
  await t.test('owner status is private and opening review links never queues work', async () => {
    assert.equal((await call(`requests/${id}`)).response.status, 401);
    const other = await login('other@benchmark-business.example');
    assert.equal((await call(`requests/${id}`, { cookie: other.cookie })).response.status, 404);
    const review = await call(`review/${reviewToken}`);
    assert.equal(review.data.request.status, 'pending_review');
    assert.equal((await call('worker/claim', { method: 'POST', worker: true })).data.job, null);
  });
  await t.test('approval requires attribution confirmation and replays do not duplicate jobs', async () => {
    assert.equal((await call(`review/${reviewToken}`, { method: 'POST', body: { decision: 'approve' } })).response.status, 400);
    for (let i = 0; i < 2; i++) assert.equal((await call(`review/${reviewToken}`, { method: 'POST', body: { decision: 'approve', confirmAttribution: true } })).data.request.status, 'queued');
    assert.equal((db().prepare('SELECT COUNT(*) AS n FROM jobs').get() as any).n, 1);
    assert.equal((await call(`review/${reviewToken}`, { method: 'POST', body: { decision: 'reject' } })).response.status, 409);
  });
  assert.equal((await call('worker/claim', { method: 'POST' })).response.status, 401);
  const first = (await call('worker/claim', { method: 'POST', worker: true })).data.job;
  assert.ok(first.leaseToken);
  assert.equal((await call('worker/claim', { method: 'POST', worker: true })).data.job, null);
  const lease = (j: any) => ({ jobId: j.id, leaseToken: j.leaseToken, fencingToken: j.fencingToken });
  await t.test('expired workers cannot commit after another worker reclaims the job', async () => {
    db().prepare('UPDATE jobs SET lease_expires_at=? WHERE id=?').run(Date.now() - 1, first.id);
    assert.equal((await call('worker/heartbeat', { method: 'POST', worker: true, body: lease(first) })).response.status, 409);
  });
  const current = (await call('worker/claim', { method: 'POST', worker: true })).data.job;
  assert.equal(current.fencingToken, first.fencingToken + 1);
  assert.equal((await call('worker/heartbeat', { method: 'POST', worker: true, body: lease(current) })).response.status, 200);
  await t.test('partial, altered, private and stale evidence cannot publish', async () => {
    const partial = completeEvidence(); partial.live_conversations.pop();
    assert.equal((await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(current), evidence: partial } })).response.status, 422);
    const altered = completeEvidence(); altered.live_conversations[0].score = 100;
    assert.equal((await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(current), evidence: altered } })).response.status, 422);
    const privateEvidence = completeEvidence(); privateEvidence.study.requester = 'owner@benchmark-business.example';
    assert.equal((await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(current), evidence: privateEvidence } })).response.status, 422);
    assert.equal((await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(first), evidence: completeEvidence() } })).response.status, 409);
  });
  const complete = await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(current), evidence: completeEvidence() } });
  assert.equal(complete.response.status, 200, JSON.stringify(complete.data));
  const slug = complete.data.report.slug;
  await t.test('publication exposes evidence, preserves arithmetic, notifies once, and cannot be repeated', async () => {
    const publicReport = await call(`reports/${slug}`);
    assert.equal(publicReport.response.status, 200);
    assert.deepEqual(publicReport.data.report.scores, [{ vendor: 'Alhena', shopping: 96, support: 100 }, { vendor: 'Gorgias', shopping: 76.7, support: 82.7 }]);
    assert.equal(JSON.stringify(publicReport.data).includes('owner@benchmark-business.example'), false);
    assert.equal(publicReport.data.evidence, undefined);
    assert.equal((await call(`reports/${slug}/details`, { cookie: owner.cookie })).data.evidence.publication.counts.turns, 120);
    assert.equal((await call(`requests/${id}`, { cookie: owner.cookie })).data.request.status, 'published');
    assert.equal((await call('worker/complete', { method: 'POST', worker: true, body: { ...lease(current), evidence: completeEvidence() } })).response.status, 409);
    assert.equal(messages().filter(m => m.to === 'owner@benchmark-business.example' && m.subject.startsWith('Your comparison report is published')).length, 1);
    assert.equal((await call(`reports/${slug}/evidence`, { cookie: owner.cookie })).response.headers.get('content-disposition')?.includes('attachment'), true);
  });
  await t.test('local administration never retries a published report', async () => {
    await assert.rejects(adminCommand('retry', id), /approved, stopped, unpublished/);
  });
});

test('OTP attempt budget persists and locks the challenge', async () => {
  await call('auth/start', { method: 'POST', body: { name: 'Attempt Test', email: 'attempts@benchmark-business.example' } });
  const message = messages().find(m => m.to === 'attempts@benchmark-business.example');
  const correct = /code is: (\d{6})/.exec(message.text)![1];
  const wrong = correct === '000000' ? '111111' : '000000';
  for (let i = 0; i < 6; i++) assert.equal((await call('auth/verify', { method: 'POST', body: { email: 'attempts@benchmark-business.example', code: wrong } })).response.status, 400);
  assert.equal((await call('auth/verify', { method: 'POST', body: { email: 'attempts@benchmark-business.example', code: correct } })).response.status, 400);
  assert.equal((db().prepare('SELECT attempts FROM otp_challenges WHERE email=?').get('attempts@benchmark-business.example') as any).attempts, 6);
});

test('criterion gates cannot be bypassed by changing score and awarded points together', () => {
  const evidence = completeEvidence();
  const conversation = evidence.live_conversations[0];
  const check = conversation.checks.find((c: any) => c.id === 'e_options');
  check.pass = true; check.awarded = 2; conversation.score += 2; conversation.dimension_scores.rich += 2;
  assert.throws(() => validateEvidence(evidence, providers(), protocol()), /deterministic gate/);
});

test('publication rejects invented quotes and contradictory or low-agreement audit assertions', () => {
  const invented = completeEvidence();
  const check = invented.live_conversations[0].checks.find((c: any) => c.id === 'a_direct');
  check.primary.evidence = check.final.evidence = check.evidence = check.audit.evidence = 'INVENTED EVIDENCE NOT PRESENT IN ANY CAPTURE';
  assert.throws(() => validateEvidence(invented, providers(), protocol()), /passing quote/);
  const contradictory = completeEvidence();
  contradictory.live_conversations[0].checks[0].audit.classification = 'FN';
  assert.throws(() => validateEvidence(contradictory, providers(), protocol()), /audit classification/);
  const lowAgreement = completeEvidence();
  for (const conversation of lowAgreement.live_conversations) for (const verdict of conversation.checks) {
    verdict.primary.pass = !verdict.final.pass;
    if (verdict.primary.pass) verdict.primary.evidence = conversation.turns[0].reply_as_judged.slice(0, 100);
    verdict.audit.classification = verdict.primary.pass ? 'FP' : 'FN';
    verdict.audit.evidence = verdict.final.evidence;
  }
  lowAgreement.audit = { trusted: true, agreement_pct: 0, verdicts: 156, agreed: 0, corrected: 156 };
  assert.throws(() => validateEvidence(lowAgreement, providers(), protocol()), /audit agreement/);
  const wrongTotal = completeEvidence(); wrongTotal.audit.agreed = 156;
  assert.throws(() => validateEvidence(wrongTotal, providers(), protocol()), /audit agreement/);
});

test('publication requires positive AI authorship, not a claimed speaker label', () => {
  const unknown = completeEvidence(); delete unknown.live_conversations[0].turns[0].author_evidence;
  assert.throws(() => validateEvidence(unknown, providers(), protocol()), /AI author evidence/);
  const unverified = completeEvidence(); unverified.live_conversations[0].turns[0].author_verified = false;
  assert.throws(() => validateEvidence(unverified, providers(), protocol()), /AI author evidence/);
  const mismatched = completeEvidence(); mismatched.live_conversations[0].turns[0].author_evidence.provider = 'Different provider';
  assert.throws(() => validateEvidence(mismatched, providers(), protocol()), /AI author evidence/);
  const human = completeEvidence();
  human.live_conversations[0].turns[0].author_evidence = { ...human.live_conversations[0].turns[0].author_evidence, kind: 'dom-ai-author', markers: [{ attribute: 'data-author', value: 'human' }] };
  assert.throws(() => validateEvidence(human, providers(), protocol()), /AI author/);
});

test('the real worker evidence assembler produces the server publication contract', () => {
  const fixture = completeEvidence();
  const job = { providers: providers(), protocol: protocol() };
  // Transport-only fixture, deliberately not a live evaluation. No network or model calls.
  for (const conversation of fixture.live_conversations) {
    for (const turn of conversation.turns) {
      turn.reply = turn.reply_as_judged = 'Test-only captured AI response for the worker/API contract.';
    }
    conversation.score = 0;
    conversation.dimension_scores = Object.fromEntries(Object.keys(conversation.dimension_scores).map(key => [key, 0]));
    for (const check of conversation.checks) {
      check.judge_pass = check.pass = false; check.awarded = 0;
      check.evidence = '';
      check.primary = { pass: false, evidence: '' };
      check.final = { pass: false, evidence: '' };
      check.audit = { classification: 'AGREE', reason: 'Test-only fail verdict for the transport fixture.', evidence: '' };
    }
  }
  const assembled = assembleEvidence(job, fixture.live_conversations, { fixture: true });
  assert.deepEqual(validateEvidence(assembled, providers(), protocol()), { conversations: 12, turns: 120, checks: 156, criteria: 26, stores: 6 });
});

test('rejection cannot enqueue work, and a renewed review link revokes its predecessor', async () => {
  const owner = await login('reject@benchmark-business.example');
  const submitted = await call('requests', { method: 'POST', cookie: owner.cookie, body: { providers: providers('rejection'), consent: true } });
  const id = submitted.data.request.id;
  const reviewMail = messages().find(m => m.text.includes(`Requester: Test Requester <reject@benchmark-business.example>`));
  const oldToken = /\/review\/([A-Za-z0-9_-]+)/.exec(reviewMail.text)![1];
  await adminCommand('reissue-review', id);
  assert.equal((await call(`review/${oldToken}`)).response.status, 404);
  const newMail = messages().find(m => m.subject === 'Comparison review link renewed' && m.text.includes(id));
  const newToken = /\/review\/([A-Za-z0-9_-]+)/.exec(newMail.text)![1];
  assert.equal((await call(`review/${newToken}`, { method: 'POST', body: { decision: 'reject', note: 'The proposed deployments could not be confirmed.' } })).data.request.status, 'rejected');
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM jobs WHERE request_id=?').get(id) as any).n, 0);
  assert.equal((await call('worker/claim', { method: 'POST', worker: true })).data.job, null);
});

test('unsupported captures stay private, notify requester and can be deliberately retried by an operator', async () => {
  const owner = await login('paused@benchmark-business.example');
  const submitted = await call('requests', { method: 'POST', cookie: owner.cookie, body: { providers: providers('unsupported'), consent: true } });
  const id = submitted.data.request.id;
  const reviewMail = messages().find(m => m.text.includes('Requester: Test Requester <paused@benchmark-business.example>'));
  const reviewToken = /\/review\/([A-Za-z0-9_-]+)/.exec(reviewMail.text)![1];
  await call(`review/${reviewToken}`, { method: 'POST', body: { decision: 'approve', confirmAttribution: true } });
  const job = (await call('worker/claim', { method: 'POST', worker: true })).data.job;
  const lease = { jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken };
  const stopped = await call('worker/fail', { method: 'POST', worker: true, body: { ...lease, code: 'needs_adapter', message: 'Widget selectors need manual review.', retryable: false } });
  assert.equal(stopped.data.status, 'needs_review');
  assert.equal((await call(`requests/${id}`, { cookie: owner.cookie })).data.request.reportSlug, null);
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM reports WHERE job_id=?').get(job.id) as any).n, 0);
  assert.equal(messages().filter(m => m.to === 'paused@benchmark-business.example' && m.subject === 'Your comparison needs additional review').length, 1);
  await adminCommand('retry', id);
  const retried = (await call('worker/claim', { method: 'POST', worker: true })).data.job;
  assert.equal(retried.attempt, 1);
  assert.equal(retried.fencingToken, job.fencingToken + 1);
  assert.equal((await call('worker/fail', { method: 'POST', worker: true, body: { ...lease, code: 'stale', message: 'Stale failure', retryable: false } })).response.status, 409);
  await call('worker/fail', { method: 'POST', worker: true, body: { jobId: retried.id, leaseToken: retried.leaseToken, fencingToken: retried.fencingToken, code: 'needs_adapter', message: 'Still unsupported in test.', retryable: false } });
});

test('email delivery failure is durable, uses an idempotency key and retries without duplicate events', async () => {
  const realFetch = globalThis.fetch;
  const beforeTransport = process.env.MAIL_TRANSPORT;
  const beforeKey = process.env.RESEND_API_KEY;
  process.env.MAIL_TRANSPORT = 'resend'; process.env.RESEND_API_KEY = 'test-resend-key';
  let calls = 0; const keys: string[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    calls++; keys.push(init.headers['idempotency-key']);
    return new Response('{}', { status: calls === 1 ? 503 : 200 });
  }) as typeof fetch;
  try {
    const id = enqueueMail('test:durable-event', 'delivery@business.example', 'Test only', 'Test only.');
    enqueueMail('test:durable-event', 'delivery@business.example', 'Test only', 'Test only.');
    await flushOutbox();
    assert.equal((db().prepare('SELECT status FROM outbox WHERE id=?').get(id) as any).status, 'pending');
    db().prepare('UPDATE outbox SET next_attempt_at=0 WHERE id=?').run(id);
    await flushOutbox(); await flushOutbox();
    assert.equal(calls, 2);
    assert.deepEqual(keys, [id, id]);
    assert.equal((db().prepare('SELECT status FROM outbox WHERE id=?').get(id) as any).status, 'sent');
  } finally {
    globalThis.fetch = realFetch;
    process.env.MAIL_TRANSPORT = beforeTransport;
    if (beforeKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = beforeKey;
  }
});

test('production cannot silently use development-file verification', async () => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const response = await call('auth/start', { method: 'POST', body: { name: 'Not Sent', email: 'production@business.example' } });
    assert.equal(response.response.status, 503);
    assert.equal(messages().some(m => m.to === 'production@business.example'), false);
  } finally { Object.assign(process.env, { NODE_ENV: 'test' }); }
});

test('worker claim and heartbeat never wait for queued email delivery', async () => {
  const stopped = db().prepare("SELECT request_id FROM jobs WHERE state='needs_review' LIMIT 1").get() as any;
  await adminCommand('retry', stopped.request_id);
  enqueueMail('test:slow-provider', 'slow@business.example', 'Slow test', 'Test only.');
  const realFetch = globalThis.fetch; const beforeTransport = process.env.MAIL_TRANSPORT;
  let deliveries = 0;
  process.env.MAIL_TRANSPORT = 'resend'; process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = (async () => {
    deliveries++;
    await new Promise(resolve => setTimeout(resolve, 200));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const workerHeaders = { authorization: `Bearer ${process.env.WORKER_SECRET}`, 'content-type': 'application/json' };
  try {
    const claimed = await handleApi(new Request(`${process.env.APP_URL}/api/worker/claim`, { method: 'POST', headers: workerHeaders, body: '{}' }));
    const { job } = await claimed.json() as any;
    assert.ok(job);
    const heartbeat = await handleApi(new Request(`${process.env.APP_URL}/api/worker/heartbeat`, { method: 'POST', headers: workerHeaders, body: JSON.stringify({ jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken }) }));
    assert.equal(heartbeat.status, 200);
    assert.equal(deliveries, 0, 'Worker control endpoints must only enqueue mail, never dispatch it.');
    assert.equal((db().prepare("SELECT status FROM outbox WHERE event_key='test:slow-provider'").get() as any).status, 'pending');
  } finally {
    globalThis.fetch = realFetch; process.env.MAIL_TRANSPORT = beforeTransport; delete process.env.RESEND_API_KEY;
  }
});
