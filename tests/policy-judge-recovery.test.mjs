import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createPolicyInvoker } from '../worker/policy-call-cache.mjs';
import { digest } from '../worker/policy-contract.mjs';
import { WorkerError } from '../worker/protocol.mjs';
import { claudeStructuredResponse, judgeServiceFetch } from '../worker/claude-client.mjs';
import { POLICY_EXECUTION } from '../worker/execution-profile.mjs';
import { createJudgeServer } from '../judge/server.mjs';
import { JudgeError } from '../judge/cli.mjs';
import { schemaFor } from '../worker/policy-quality-spec.mjs';

const request = { instructions: 'Offline regression only.', input: { fixture: true }, schema: schemaFor('shopping'), model: 'claude-opus-4-8' };
const secret = 'offline-private-transport-secret-32-characters';
const result = { value: { fixture: true }, metadata: { response_id: 'offline-result' } };
const rejection = (code = 'invalid_structured_output', status = 422) => Object.assign(new WorkerError('model_request_failed', `Private judge returned ${status} (${code})`), { judgeDiagnostic: { status, code } });
async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-rejection-'));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
async function withSecret(run) {
  const previous = process.env.JUDGE_SERVICE_SECRET; process.env.JUDGE_SERVICE_SECRET = secret;
  try { await run(); } finally { if (previous === undefined) delete process.env.JUDGE_SERVICE_SECRET; else process.env.JUDGE_SERVICE_SECRET = previous; }
}

test('private HTTP errors retain only matching allowlisted code/status, never model or secret text', async () => withSecret(async () => {
  const sensitive = 'secret-token-and-private-prompt';
  for (const [status, body, expected] of [
    [422, { error: 'invalid_structured_output', stderr: sensitive, value: sensitive }, { status: 422, code: 'invalid_structured_output' }],
    [422, { error: sensitive }, undefined], [400, { error: 'invalid_structured_output' }, undefined],
    [504, { error: 'judge_timeout', details: sensitive }, { status: 504, code: 'judge_timeout' }],
    [422, null, undefined],
  ]) {
    await assert.rejects(claudeStructuredResponse({ ...request, ...POLICY_EXECUTION, fetchImpl: async () => ({ ok: false, status, json: async () => body }) }), error => {
      assert.equal(error.code, 'model_request_failed');
      assert.deepEqual(error.judgeDiagnostic, expected);
      assert.equal(JSON.stringify(error).includes(sensitive), false);
      assert.equal(error.message.includes(sensitive), false);
      return true;
    });
  }
  await assert.rejects(claudeStructuredResponse({ ...request, ...POLICY_EXECUTION, fetchImpl: async () => ({ ok: false, status: 422, json: async () => { throw new Error(sensitive); } }) }), error => !error.judgeDiagnostic && !error.message.includes(sensitive));
}));

test('real service rejection wire is sanitized and unknown JudgeError codes become ambiguous generic failure', async () => withSecret(async () => {
  let error = new JudgeError('invalid_structured_output');
  const server = createJudgeServer({ token: 'unused-fixture-token', secret, models: [request.model], run: async () => { throw error; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const localUrl = `http://127.0.0.1:${server.address().port}/judge`;
  const invoke = () => claudeStructuredResponse({ ...request, ...POLICY_EXECUTION, fetchImpl: (_url, options) => judgeServiceFetch(localUrl, options) });
  try {
    await assert.rejects(invoke(), e => e.judgeDiagnostic?.code === 'invalid_structured_output' && e.judgeDiagnostic.status === 422);
    error = new JudgeError('private-token-must-not-escape', 422);
    await assert.rejects(invoke(), e => e.judgeDiagnostic?.code === 'judge_failed' && e.judgeDiagnostic.status === 500 && !e.message.includes('private-token'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));

test('explicit rejection appends one retry only on a later attempt; successful result and rejected bytes are preserved', async () => fixture(async cacheDirectory => {
  let calls = 0;
  const call = async () => { if (++calls === 1) throw rejection(); return result; };
  const first = createPolicyInvoker({ cacheDirectory, fencingToken: 1, call });
  await assert.rejects(first(request, 'audit'), /invalid_structured_output/);
  const files = await fs.readdir(cacheDirectory), original = new Map(await Promise.all(files.map(async name => [name, await fs.readFile(path.join(cacheDirectory, name), 'utf8')])));
  assert.equal(files.length, 2);
  const diagnostic = JSON.parse(original.get(files.find(name => name.endsWith('-rejection.json'))));
  assert.deepEqual(diagnostic.judge, { status: 422, code: 'invalid_structured_output' });
  assert.equal(diagnostic.requestSha256, digest(request));
  await assert.rejects(first(request, 'audit'), error => error.code === 'model_rejection_requires_retry');
  assert.equal(calls, 1);
  const second = createPolicyInvoker({ cacheDirectory, fencingToken: 2, call });
  const received = await second(request, 'audit');
  assert.equal(received.metadata.requestSha256, digest(request));
  assert.equal(calls, 2);
  for (const [name, bytes] of original) assert.equal(await fs.readFile(path.join(cacheDirectory, name), 'utf8'), bytes);
  assert.deepEqual(await createPolicyInvoker({ cacheDirectory, fencingToken: 3, call })(request, 'audit'), received);
  assert.equal(calls, 2);
}));

test('missing bodies, timeout, cancellation and unknown failures never authorize a replay', async () => {
  for (const error of [new WorkerError('model_request_failed', 'Private judge returned 422'), rejection('judge_timeout', 504), rejection('judge_cancelled', 499), rejection('judge_failed', 500), rejection('invented', 422), new Error('Network outcome unknown')]) {
    await fixture(async cacheDirectory => {
      let calls = 0;
      const call = async () => { calls++; throw error; };
      await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 1, call })(request, 'audit'));
      await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 2, call })(request, 'audit'), e => e.code === 'model_outcome_unknown');
      assert.equal(calls, 1);
    });
  }
});

test('a retry with an ambiguous outcome blocks later retries; each completed rejection stays immutable', async () => fixture(async cacheDirectory => {
  let calls = 0;
  const call = async () => { if (++calls === 1) throw rejection(); throw new Error('Lost retry response'); };
  for (const fencingToken of [1, 2]) await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken, call })(request, 'audit'));
  await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 3, call })(request, 'audit'), error => error.code === 'model_outcome_unknown');
  assert.equal(calls, 2);
  const files = await fs.readdir(cacheDirectory);
  assert.equal(files.filter(name => name.endsWith('-rejection.json')).length, 1);
  assert.equal(files.filter(name => name.endsWith('-request.json')).length, 2);
}));

test('rejection must bind exact retained intent and request; conflicting cache is not replayed', async () => fixture(async cacheDirectory => {
  let calls = 0;
  const call = async () => { calls++; throw rejection(); };
  await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 1, call })(request, 'audit'));
  const filename = path.join(cacheDirectory, (await fs.readdir(cacheDirectory)).find(name => name.endsWith('-rejection.json')));
  const receipt = JSON.parse(await fs.readFile(filename, 'utf8'));
  receipt.requestIntentSha256 = '0'.repeat(64);
  await fs.writeFile(filename, JSON.stringify(receipt));
  await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 2, call })(request, 'audit'), error => error.code === 'resume_conflict');
  assert.equal(calls, 1);
}));

test('legacy bare request intent remains unknown even after a worker upgrade', async () => fixture(async cacheDirectory => {
  const name = `audit-${digest(request)}`;
  await fs.writeFile(path.join(cacheDirectory, name + '-request.json'), JSON.stringify({ request, sha256: digest(request), startedAt: new Date().toISOString() }));
  await assert.rejects(createPolicyInvoker({ cacheDirectory, fencingToken: 100, call: () => assert.fail('Historical unknown must not be called') })(request, 'audit'), error => error.code === 'model_outcome_unknown');
}));
