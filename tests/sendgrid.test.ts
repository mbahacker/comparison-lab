import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, readiness } from '../lib/server/config.ts';
import { closeDb, db } from '../lib/server/db.ts';
import { enqueueMail, flushOutbox, sendGridSender } from '../lib/server/mail.ts';

const environmentNames = ['DATA_DIR', 'NODE_ENV', 'APP_URL', 'MAIL_TRANSPORT', 'MAIL_FROM', 'SENDGRID_API_KEY', 'RESEND_API_KEY'];
const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comparison-lab-sendgrid-test-'));
  Object.assign(process.env, {
    DATA_DIR: directory, NODE_ENV: 'production', APP_URL: 'https://comparison.test',
    MAIL_TRANSPORT: 'sendgrid', MAIL_FROM: 'Comparison Lab <reports@business.example>',
    SENDGRID_API_KEY: 'test-sendgrid-key',
  });
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = async () => { throw new Error('Unmocked network access is prohibited in this test.'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  closeDb();
  fs.rmSync(directory, { recursive: true, force: true });
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
});

function outbox(id: string) {
  return db().prepare('SELECT * FROM outbox WHERE id=?').get(id)!;
}

test('SendGrid accepts multipart transactional mail with a parsed sender and tracking disabled', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response(null, { status: 202 });
  };
  const text = 'Your report is ready.\n\nhttps://comparison.test/reports/example';
  const id = enqueueMail('sendgrid:accepted', 'recipient@business.example', 'Comparison report', text);
  const html = outbox(id).html_body;
  assert.deepEqual(await flushOutbox(1, id), [{ id, sent: true }]);
  await flushOutbox(1, id);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.sendgrid.com/v3/mail/send');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal);
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), 'Bearer test-sendgrid-key');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.has('idempotency-key'), false);
  assert.deepEqual(JSON.parse(String(init.body)), {
    from: { name: 'Comparison Lab', email: 'reports@business.example' },
    personalizations: [{ to: [{ email: 'recipient@business.example' }], custom_args: { outbox_id: id } }],
    subject: 'Comparison report',
    content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
    tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
  });
  assert.equal(outbox(id).status, 'sent');
  assert.equal(outbox(id).last_error, null);
});

test('SendGrid errors remain retryable with a stable correlation ID and no provider body disclosure', async () => {
  const ids: string[] = [];
  let status = 503;
  globalThis.fetch = async (_url, init) => {
    ids.push(JSON.parse(String(init!.body)).personalizations[0].custom_args.outbox_id);
    return new Response('Provider detail with private-recipient@business.example and secret-value', { status });
  };
  const id = enqueueMail('sendgrid:retry', 'recipient@business.example', 'Test', 'Test only.');
  enqueueMail('sendgrid:retry', 'recipient@business.example', 'Test', 'Test only.');
  const started = Date.now();
  assert.deepEqual(await flushOutbox(1, id), [{ id, sent: false }]);
  assert.equal(outbox(id).status, 'pending');
  assert.equal(outbox(id).attempt, 1);
  assert.ok(Number(outbox(id).next_attempt_at) >= started + 30_000);
  assert.equal(outbox(id).last_error, 'Email delivery returned HTTP 503.');
  assert.deepEqual(await flushOutbox(1, id), [], 'A queued retry must respect its backoff.');
  db().prepare('UPDATE outbox SET next_attempt_at=0 WHERE id=?').run(id);
  status = 202;
  assert.deepEqual(await flushOutbox(1, id), [{ id, sent: true }]);
  assert.equal(outbox(id).attempt, 2);
  assert.deepEqual(ids, [id, id]);
  assert.equal(db().prepare('SELECT COUNT(*) AS count FROM outbox').get()!.count, 1);
});

test('SendGrid only marks documented 202 acceptance as sent and sanitizes thrown transport errors', async () => {
  for (const status of [200, 400, 401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response('Private provider failure', { status });
    const id = enqueueMail(`sendgrid:status:${status}`, 'recipient@business.example', 'Test', 'Test only.');
    await flushOutbox(1, id);
    assert.equal(outbox(id).status, 'pending');
    assert.equal(outbox(id).last_error, `Email delivery returned HTTP ${status}.`);
  }
  globalThis.fetch = async () => { throw new Error('secret-api-key and recipient@business.example must not enter diagnostics'); };
  const id = enqueueMail('sendgrid:transport-error', 'recipient@business.example', 'Test', 'Test only.');
  await flushOutbox(1, id);
  assert.equal(outbox(id).status, 'pending');
  assert.equal(outbox(id).last_error, 'Email delivery failed. Check transport connectivity and provider configuration.');
});

test('SendGrid accepts bare or named senders and safely rejects malformed sender configuration before HTTP', async () => {
  assert.deepEqual(sendGridSender('reports@business.example'), { email: 'reports@business.example' });
  assert.deepEqual(sendGridSender(' "Comparison Lab" <reports@business.example> '), { email: 'reports@business.example', name: 'Comparison Lab' });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 202 }); };
  for (const sender of ['', 'not-an-address', 'a@business.example, b@business.example', 'Lab <a@business.example> extra', 'Lab\r\nBcc: hidden@business.example <a@business.example>']) {
    assert.throws(() => sendGridSender(sender), /MAIL_FROM must contain one email address/);
  }
  process.env.MAIL_FROM = 'Broken private-sender-value';
  const id = enqueueMail('sendgrid:invalid-from', 'recipient@business.example', 'Test', 'Test only.');
  await flushOutbox(1, id);
  assert.equal(calls, 0);
  assert.equal(outbox(id).status, 'pending');
  assert.match(String(outbox(id).last_error), /^MAIL_FROM must contain one email address/);
  assert.doesNotMatch(String(outbox(id).last_error), /private-sender-value/);
  delete process.env.SENDGRID_API_KEY;
  db().prepare('UPDATE outbox SET next_attempt_at=0 WHERE id=?').run(id);
  await flushOutbox(1, id);
  assert.equal(calls, 0);
  assert.equal(outbox(id).last_error, 'SendGrid is not configured.');
});

test('mail readiness requires the selected provider key and disallows production file delivery', () => {
  delete process.env.MAIL_TRANSPORT;
  assert.equal(config().mailTransport, 'sendgrid');
  assert.equal(readiness().emailConfigured, true);
  delete process.env.SENDGRID_API_KEY;
  process.env.RESEND_API_KEY = 'test-resend-key';
  assert.equal(readiness().emailConfigured, false);
  process.env.MAIL_TRANSPORT = 'resend';
  assert.equal(readiness().emailConfigured, true);
  delete process.env.RESEND_API_KEY;
  process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
  assert.equal(readiness().emailConfigured, false);
  process.env.MAIL_TRANSPORT = 'file';
  assert.equal(readiness().emailConfigured, false);
  Object.assign(process.env, { NODE_ENV: 'test' });
  delete process.env.MAIL_TRANSPORT;
  assert.equal(config().mailTransport, 'file');
  assert.equal(readiness().emailConfigured, true);
  process.env.MAIL_TRANSPORT = 'unsupported';
  assert.equal(readiness().emailConfigured, false);
});
