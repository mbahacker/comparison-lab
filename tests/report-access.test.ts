import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleApi } from '../lib/server/api.ts';
import { closeDb, db } from '../lib/server/db.ts';
import { reportSummary, SEED_SLUG, seedEvidence } from '../lib/server/evidence.ts';
import { hash } from '../lib/server/security.ts';
import type { Row } from '../lib/server/model.ts';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comparison-report-access-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', DATA_DIR: directory, CONTENT_DIR: path.resolve('content/reports'),
    APP_URL: 'http://localhost:3100', MAIL_TRANSPORT: 'file', ADMIN_EMAIL: 'ashu@alhena.ai',
  });
});
afterEach(() => { closeDb(); fs.rmSync(directory, { recursive: true, force: true }); });

async function call(route: string, options: { method?: string; body?: Row; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { origin: process.env.APP_URL!, ...options.headers };
  if (options.body) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  const response = await handleApi(new Request(`${process.env.APP_URL}/api/${route}`, {
    method: options.method || 'GET', headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }));
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() as Row : {};
  return { response, data };
}

async function login(email: string, options: { name?: string; purpose?: string } = {}) {
  const start = await call('auth/start', { method: 'POST', body: { email, purpose: 'report', ...options } });
  assert.equal(start.response.status, 200, JSON.stringify(start.data));
  const mail = db().prepare("SELECT subject,text_body FROM outbox WHERE recipient=? AND event_key LIKE 'verify:%' ORDER BY rowid DESC LIMIT 1").get(email.toLowerCase()) as Row;
  assert.equal(mail.subject, 'Your Alhena Research Lab verification code');
  const code = /code is: (\d{6})/.exec(mail.text_body)![1];
  const verified = await call('auth/verify', { method: 'POST', body: { email, code } });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.data));
  assertPrivate(verified.response);
  return { cookie: verified.response.headers.get('set-cookie')!.split(';')[0], user: verified.data.user, code };
}

function accessRows() { return db().prepare('SELECT * FROM report_access ORDER BY action').all() as Row[]; }
function notices() { return db().prepare("SELECT * FROM outbox WHERE event_key LIKE 'report-access:%' ORDER BY rowid").all() as Row[]; }
function assertPrivate(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
}
function fixtureReport() {
  const slug = 'access-test-published-report';
  const evidence = seedEvidence();
  evidence.study.title = 'A second published comparison';
  const bytes = JSON.stringify(evidence);
  const summary = reportSummary(slug, evidence);
  fs.mkdirSync(path.join(directory, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'reports', `${slug}.json`), bytes);
  db().prepare('INSERT INTO reports (slug,title,summary_json,evidence_path,evidence_sha256,published_at) VALUES (?,?,?,?,?,?)').run(slug, summary.title, JSON.stringify(summary), `${slug}.json`, hash(bytes), new Date().toISOString());
  return slug;
}

test('public summaries remain public and never include evidence, including for signed-in readers', async () => {
  const list = await call('reports');
  assert.equal(list.response.status, 200);
  assert.equal(JSON.stringify(list.data).includes('reply_as_judged'), false);
  const anonymous = await call(`reports/${SEED_SLUG}`);
  assert.equal(anonymous.response.status, 200);
  assert.deepEqual(anonymous.data.access, { verified: false });
  assert.ok(anonymous.data.report.scores.length);
  assert.equal('evidence' in anonymous.data, false);
  assertPrivate(anonymous.response);

  const reader = await login('reader@business.example');
  const signedIn = await call(`reports/${SEED_SLUG}`, { cookie: reader.cookie });
  assert.deepEqual(signedIn.data.access, { verified: true });
  assert.equal('evidence' in signedIn.data, false);
  await call('auth/session', { cookie: reader.cookie });
  assert.equal(accessRows().length, 0);
  assert.equal(notices().length, 0);
});

test('email-only report OTP verifies a work mailbox without requiring or inventing a name', async () => {
  const reader = await login('Reader@Business.Example');
  assert.equal(reader.user.email, 'reader@business.example');
  assert.equal(reader.user.name, '');
  assert.equal(reader.user.workEmailEligible, true);
  const session = await call('auth/session', { cookie: reader.cookie });
  assert.equal(session.data.user.workEmailEligible, true);
  assert.equal((await call('requests', { method: 'POST', cookie: reader.cookie, body: { providers: [], consent: true } })).response.status, 400);
  assert.equal((db().prepare('SELECT count(*) AS n FROM requests').get() as Row).n, 0);
  assert.equal(notices().length, 0);
  assert.equal((await call('auth/verify', { method: 'POST', body: { email: 'reader@business.example', code: reader.code } })).response.status, 400);
});

test('both purposes require work email, requests require a name, and invalid addresses cannot unlock reports', async () => {
  for (const purpose of [undefined, 'request']) {
    assert.equal((await call('auth/start', { method: 'POST', body: { purpose, name: 'A Reader', email: 'reader@gmail.com' } })).response.status, 400);
    assert.equal((await call('auth/start', { method: 'POST', body: { purpose, email: 'reader@business.example' } })).response.status, 400);
  }
  for (const email of ['reader@gmail.com', 'reader@outlook.com', 'reader@proton.me', 'reader@mailinator.com', 'reader@sub.mailinator.com', 'a..b@business.example', 'a@bad..example', 'invalid', 'a@-bad.example']) {
    assert.equal((await call('auth/start', { method: 'POST', body: { purpose: 'report', email } })).response.status, 400, email);
  }
  const nameless = await login('reader@business.example');
  assert.equal(nameless.user.workEmailEligible, true);
  assert.equal((await call('requests', { method: 'POST', cookie: nameless.cookie, body: { providers: [], consent: true } })).response.status, 400);
  const named = await login('owner@business.example', { purpose: 'request', name: 'Original Name' });
  const reopened = await login('owner@business.example');
  assert.equal(reopened.user.name, 'Original Name');
  assert.equal(reopened.user.id, named.user.id);
  assert.equal(reopened.user.workEmailEligible, true);
});

test('a pre-existing personal-email session cannot unlock details or downloads', async () => {
  const raw = 'test-only-existing-personal-session';
  db().prepare('INSERT INTO users (id,email,name,verified_at,created_at) VALUES (?,?,?,?,?)').run('personal', 'reader@gmail.com', 'Existing Reader', new Date().toISOString(), new Date().toISOString());
  db().prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash(raw), 'personal', Date.now() + 60_000);
  const cookie = `comparison_lab_session=${raw}`;
  assert.deepEqual((await call(`reports/${SEED_SLUG}`, { cookie })).data.access, { verified: false });
  assert.equal((await call('auth/session', { cookie })).data.user.workEmailEligible, false);
  for (const route of ['details', 'evidence', 'html']) assert.equal((await call(`reports/${SEED_SLUG}/${route}`, { cookie })).response.status, 403);
  assert.equal((await call('requests', { method: 'POST', cookie, body: { providers: [], consent: true } })).response.status, 400);
  assert.equal((await call('auth/verify', { method: 'POST', body: { email: 'reader@gmail.com', code: '123456' } })).response.status, 400);
  assert.equal(accessRows().length, 0);
  assert.equal(notices().length, 0);
});

test('all detailed routes reject missing, invalid and expired sessions without creating access records', async () => {
  const reader = await login('expired@business.example');
  db().prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1);
  for (const cookie of [undefined, 'comparison_lab_session=invalid', reader.cookie]) {
    for (const route of ['details', 'evidence', 'html']) {
      const result = await call(`reports/${SEED_SLUG}/${route}`, { cookie });
      assert.equal(result.response.status, 401, route);
      assert.equal('evidence' in result.data, false);
      assertPrivate(result.response);
    }
  }
  assert.deepEqual((await call(`reports/${SEED_SLUG}`, { cookie: reader.cookie })).data.access, { verified: false });
  assert.equal(accessRows().length, 0);
  assert.equal(notices().length, 0);
});

test('explicit detail access returns evidence and atomically queues an identifying administrator notification', async () => {
  const reader = await login('viewer@business.example');
  const result = await call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie, headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.evidence.live_conversations.length, 12);
  assertPrivate(result.response);
  const [audit] = accessRows();
  assert.equal(audit.user_id, reader.user.id);
  assert.equal(audit.report_slug, SEED_SLUG);
  assert.equal(audit.action, 'view');
  assert.equal(audit.access_count, 1);
  assert.equal(audit.notification_count, 1);
  const [notice] = notices();
  assert.equal(notice.recipient, 'ashu@alhena.ai');
  assert.ok(notice.subject.includes(result.data.report.title));
  assert.ok(notice.subject.includes('viewer@business.example'));
  assert.match(notice.text_body, /Action: viewed/);
  assert.equal(notice.status, 'pending');
});

test('repeat views and both download formats count each access but notify once per action in a rolling 24 hours', async () => {
  const reader = await login('repeat@business.example');
  const views = await Promise.all(Array.from({ length: 8 }, () => call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie })));
  assert.ok(views.every(result => result.response.status === 200));
  const json = await call(`reports/${SEED_SLUG}/evidence`, { cookie: reader.cookie });
  assert.equal(json.response.status, 200);
  assert.equal(json.data.live_conversations.length, 12);
  assert.match(json.response.headers.get('content-disposition')!, /attachment;.*\.json/);
  assertPrivate(json.response);
  const html = await call(`reports/${SEED_SLUG}/html`, { cookie: reader.cookie, headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document' } });
  assert.equal(html.response.status, 200);
  assert.match(html.response.headers.get('content-disposition')!, /attachment;.*\.html/);
  assert.match(await html.response.text(), /<!doctype html/i);
  assertPrivate(html.response);
  assert.deepEqual(accessRows().map(row => [row.action, row.access_count, row.notification_count]), [['download', 2, 1], ['view', 8, 1]]);
  assert.equal(notices().length, 2);

  db().prepare("UPDATE report_access SET last_notified_at=? WHERE action='view'").run(Date.now() - 86_400_001);
  await Promise.all([call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie }), call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie })]);
  assert.deepEqual(accessRows().map(row => [row.action, row.access_count, row.notification_count]), [['download', 2, 1], ['view', 10, 2]]);
  assert.equal(notices().length, 3);
});

test('notification dedupe is scoped to the reader and report, and applies to newly published evidence', async () => {
  const slug = fixtureReport();
  const first = await login('first@business.example');
  const second = await login('second@business.example');
  assert.equal('evidence' in (await call(`reports/${slug}`)).data, false);
  assert.equal((await call(`reports/${slug}/evidence`)).response.status, 401);
  for (const [report, cookie] of [[SEED_SLUG, first.cookie], [SEED_SLUG, second.cookie], [slug, first.cookie]]) {
    assert.equal((await call(`reports/${report}/details`, { cookie })).response.status, 200);
  }
  assert.equal(accessRows().length, 3);
  assert.equal(notices().length, 3);
  assert.equal((await call(`reports/${slug}/evidence`, { cookie: first.cookie })).response.status, 200);
  assert.equal((await call(`reports/${slug}/html`, { cookie: first.cookie })).response.status, 404);
  assert.equal((await call('reports/no-such-report/details', { cookie: first.cookie })).response.status, 404);
  assert.equal(notices().length, 4);
});

test('cross-origin reads, embedded resources and prefetch cannot trigger report notifications', async () => {
  const reader = await login('csrf@business.example');
  const unsafe: Record<string, string>[] = [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-dest': 'image' },
    { 'sec-fetch-dest': 'iframe' },
    { referer: 'https://evil.example/article' },
    { 'sec-purpose': 'prefetch' },
    { purpose: 'prefetch' },
  ];
  for (const headers of unsafe) {
    for (const route of ['details', 'evidence', 'html']) {
      const result = await call(`reports/${SEED_SLUG}/${route}`, { cookie: reader.cookie, headers });
      assert.equal(result.response.status, 403, JSON.stringify(headers));
      assertPrivate(result.response);
    }
  }
  assert.equal(accessRows().length, 0);
  assert.equal(notices().length, 0);
  // Direct user navigation without an Origin header remains compatible with downloads.
  const direct = await call(`reports/${SEED_SLUG}/evidence`, { cookie: reader.cookie, headers: { origin: '', 'sec-fetch-site': 'none', 'sec-fetch-dest': 'document' } });
  assert.equal(direct.response.status, 200);
});

test('a failed notification insert rolls back the access count instead of silently losing an audit notification', async () => {
  const reader = await login('atomic@business.example');
  db().exec("CREATE TRIGGER block_access_notice BEFORE INSERT ON outbox WHEN NEW.event_key LIKE 'report-access:%' BEGIN SELECT RAISE(ABORT, 'test-only outbox failure'); END;");
  const originalError = console.error;
  try {
    console.error = () => {};
    assert.equal((await call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie })).response.status, 500);
  } finally { console.error = originalError; }
  assert.equal(accessRows().length, 0);
  assert.equal(notices().length, 0);
  db().exec('DROP TRIGGER block_access_notice');
  assert.equal((await call(`reports/${SEED_SLUG}/details`, { cookie: reader.cookie })).response.status, 200);
  assert.equal(accessRows()[0].access_count, 1);
  assert.equal(notices().length, 1);
});
