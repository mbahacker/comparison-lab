import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, db } from '../lib/server/db.ts';
import { hash, SESSION_COOKIE } from '../lib/server/security.ts';
import { getPolicyStudy, listPolicyStudies } from '../lib/server/policy-studies.ts';
import { handlePolicyStudy } from '../lib/server/policy-study-api.ts';
import type { PolicyStudySummary } from '../lib/policy-study.ts';

// Synthetic software fixtures only. No files are written into a real study or release catalog.
let temporary: string, root: string;
beforeEach(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-study-test-')); root = path.join(temporary, 'published-studies');
  Object.assign(process.env, { DATA_DIR: temporary, APP_URL: 'http://localhost:3100', NODE_ENV: 'test', MAIL_TRANSPORT: 'file' });
  fs.mkdirSync(root);
});
afterEach(() => { closeDb(); fs.rmSync(temporary, { recursive: true, force: true }); });
function pin(filename: string, value: unknown) {
  const bytes = typeof value === 'string' ? value : JSON.stringify(value);
  fs.writeFileSync(path.join(root, filename), bytes); return { path: filename, sha256: hash(bytes) };
}
function fixture(change?: (summary: PolicyStudySummary) => void) {
  const method = pin('method.md', '# Offline software fixture, not research evidence');
  const metric = { value: 0, explanation: 'Synthetic software fixture only.' };
  const lane = { policyResolution: metric, quality: metric, speed: metric, composite: metric, coverage: {
    plannedCheckpoints: 250, attemptedCheckpoints: 250, observedCheckpoints: 250, submittedCheckpoints: 250, assessedCheckpoints: 250, unassessableCheckpoints: 0,
    attainedCheckpoints: 0, policyUnverifiedCheckpoints: 0, includedContexts: 25, excludedContexts: 0,
    includedStores: 5, excludedStores: 0, qualityEligibleContexts: 25, qualityEligibleStores: 5, originalCaptures: 25, repairedCaptures: 0,
  } };
  const summary: PolicyStudySummary = {
    schema: 'alhena-research-lab/policy-study-summary-v1', protocol: 'policy-resolution-v1', slug: 'offline-test', title: 'Offline fixture', description: 'Not actual research results.', publishedAt: '2020-01-03T00:00:00Z', captureStartAt: '2020-01-01T00:00:00Z', captureEndAt: '2020-01-02T00:00:00Z', commissionedBy: 'Alhena Research Lab',
    method: { status: 'final', sha256: method.sha256, sourceCommit: 'a'.repeat(40), differences: ['Different policy-resolution method.'] },
    sample: { plannedCoreContexts: 50, capturedCoreContexts: 50, guardrailContexts: 5, judgedCoreContexts: 50, pcrDecisions: 500, auditedPcrDecisions: 500 },
    providers: [{ id: 'fixture-company', name: 'Fixture Company', website: 'https://fixture.example', registeredStores: 5, shopping: lane, support: lane, overallComposite: metric }],
    limitations: ['Offline fixture.'], audit: { description: 'Mocked software test.', limitations: [] },
  };
  change?.(summary);
  const summaryPin = pin('summary.json', summary), evidence = pin('evidence.json', { conversations: [{ response: 'private fixture transcript' }], fixtureOnly: true });
  const html = pin('report.html', '<!doctype html><title>Offline fixture</title><p>private fixture transcript</p>');
  const validation = pin('validation.json', { schema: 'alhena-research-lab/policy-publication-validation-v1', protocol: 'policy-resolution-v1', status: 'complete', approvedForPublication: true, summarySha256: summaryPin.sha256, evidenceSha256: evidence.sha256, methodSha256: method.sha256, htmlSha256: html.sha256,
    captureComplete: true, scoringComplete: true, pcrAuditComplete: true, plannedCoreContexts: 50, capturedCoreContexts: 50, pcrDecisions: 500, auditedPcrDecisions: 500,
    provenanceReviewed: true, publicSummaryReviewed: true, evidencePrivacyReviewed: true, thirdPartyExcerptsReviewed: true, approvedAt: '2020-01-03T00:00:00Z' });
  const manifest = pin('manifest.json', { schema: 'alhena-research-lab/policy-publication-v1', slug: summary.slug, status: 'approved', summary: summaryPin, evidence, html, method, validation });
  pin('catalog.json', { schema: 'alhena-research-lab/policy-catalog-v1', studies: [manifest] });
  return { summary, manifest };
}
function login(email = 'reader@business.example') {
  const raw = 'software-test-session';
  db().prepare('INSERT INTO users (id,email,name,verified_at,created_at) VALUES (?,?,?,?,?)').run('reader', email, '', '2020-01-01', '2020-01-01');
  db().prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash(raw), 'reader', Date.now() + 60_000);
  return `${SESSION_COOKIE}=${raw}`;
}
function request(cookie?: string, origin = 'http://localhost:3100') { return new Request('http://localhost:3100/api/studies/offline-test/details', { headers: { origin, ...(cookie ? { cookie } : {}) } }); }

test('empty catalog exposes no scores, and unknown studies return 404', async () => {
  assert.deepEqual(listPolicyStudies(), []);
  assert.equal((await handlePolicyStudy(request(), 'offline-test')).status, 404);
});
test('public whitelist and protected work-email access retain logging, origin and hash checks', async () => {
  fixture();
  const publicResponse = await handlePolicyStudy(request(), 'offline-test');
  const data = await publicResponse.json();
  assert.equal(data.study.protocol, 'policy-resolution-v1');
  assert.equal(JSON.stringify(data).includes('private fixture transcript'), false);
  assert.equal(JSON.stringify(data).includes('evidence.json'), false);
  for (const resource of ['details', 'evidence', 'html', 'method', 'validation']) assert.equal((await handlePolicyStudy(request(), 'offline-test', [resource])).status, 401);
  const cookie = login();
  assert.equal((await handlePolicyStudy(request(cookie, 'https://foreign.example'), 'offline-test', ['details'])).status, 403);
  const response = await handlePolicyStudy(request(cookie), 'offline-test', ['details']);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal((await response.json()).evidence.conversations[0].response, 'private fixture transcript');
  await handlePolicyStudy(request(cookie), 'offline-test', ['details']);
  const access = db().prepare('SELECT report_slug,access_count,notification_count FROM report_access').get();
  assert.deepEqual({ ...access }, { report_slug: 'study:offline-test', access_count: 2, notification_count: 1 });
  const mail = db().prepare("SELECT text_body FROM outbox WHERE event_key LIKE 'report-access:%'").get();
  assert.match(String(mail?.text_body), /\/studies\/offline-test/);
  const html = await handlePolicyStudy(request(cookie), 'offline-test', ['html']);
  assert.match(html.headers.get('content-disposition')!, /attachment/); assert.match(html.headers.get('content-security-policy')!, /sandbox allow-scripts/);
});
test('personal-email sessions cannot unlock study artifacts', async () => {
  fixture(); const cookie = login('reader@gmail.com');
  assert.equal((await handlePolicyStudy(request(cookie), 'offline-test', ['details'])).status, 403);
  assert.equal(db().prepare('SELECT count(*) n FROM report_access').get()?.n, 0);
});
test('incomplete, injected summary, tampered evidence and symlink escape fail closed', () => {
  fixture(s => { s.sample.auditedPcrDecisions = 499; });
  assert.throws(() => listPolicyStudies(), /incomplete/i);
  fixture(s => { Object.assign(s, { privateTranscript: 'Must not leak.' }); });
  assert.throws(() => listPolicyStudies(), /unrecognized/i);
  fixture(); fs.appendFileSync(path.join(root, 'evidence.json'), ' ');
  assert.throws(() => getPolicyStudy('offline-test'), /hash mismatch/);
  fixture(); const original = fs.readFileSync(path.join(root, 'evidence.json'));
  fs.writeFileSync(path.join(temporary, 'outside.json'), original); fs.unlinkSync(path.join(root, 'evidence.json')); fs.symlinkSync(path.join(temporary, 'outside.json'), path.join(root, 'evidence.json'));
  assert.throws(() => listPolicyStudies(), /escapes/);
});
