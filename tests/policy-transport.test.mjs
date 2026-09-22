import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { POLICY_EXECUTION, POLICY_TRANSPORT_TIMEOUT_MS, executionSettings, executionMetadata } from '../worker/execution-profile.mjs';
import { cliArguments, cliEnvironment, validateSchema, runClaude } from '../judge/cli.mjs';
import { validateRequest, createJudgeServer } from '../judge/server.mjs';
import { resultSchema } from '../benchmark/policy-judge.mjs';
import { verdictSchema } from '../worker/verdict-schema.mjs';
import { schemaFor, qualityAuditSchema } from '../worker/policy-quality-spec.mjs';
import { claudeStructuredResponse, judgeServiceFetch } from '../worker/claude-client.mjs';
import { providerStructuredResponse } from '../worker/model-provider.mjs';

const packet = { conversations: [{ key: 'offline-context', checkpoints: [{ turn: 1 }] }] };
const request = { instructions: 'Offline transport fixture, not research evidence.', input: packet, schema: resultSchema(packet), model: 'claude-opus-4-8', ...POLICY_EXECUTION };
const value = { conversations: { 'offline-context': { checkpoints: { '1': {
  turn: 1, status: 'unverified', handling: 'none', evidence: { turn: 1, quote: '' }, policyRefs: [], reason: 'Offline fixture.',
} } } } };
const secret = 'offline-private-transport-secret-32-characters';
const token = 'offline-unused-credential';
const metadata = { provider: 'claude-cli', model: request.model, requested_model: request.model, response_id: 'offline-session', ...executionMetadata(executionSettings(request)) };
function fakeProcess(check) {
  return (binary, args, options) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
    queueMicrotask(() => {
      check?.(args, options);
      child.stdout.end(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: args[args.indexOf('--session-id') + 1],
        structured_output: value, permission_denials: [], modelUsage: { [request.model]: {} }, usage: { output_tokens: 1 } }));
      child.emit('close', 0);
    });
    return child;
  };
}
async function withPrivateConfiguration(run) {
  const keys = ['JUDGE_SERVICE_SECRET', 'JUDGE_SERVICE_URL', 'MODEL_PROVIDER'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.JUDGE_SERVICE_SECRET = secret; delete process.env.JUDGE_SERVICE_URL; process.env.MODEL_PROVIDER = 'claude-cli';
  try { return await run(); } finally { for (const k of keys) { if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k]; } }
}

test('bounded profile preserves pilot defaults and rejects every partial or arbitrary override', () => {
  assert.deepEqual(executionSettings(), { executionProfile: 'quality-pilot-v1', effort: null, maxOutputTokens: 10000, timeoutMs: 180000, transportTimeoutMs: 200000, explicit: false });
  assert.equal(executionSettings(request).transportTimeoutMs, 1250000);
  for (const patch of [{ executionProfile: 'custom' }, { effort: 'low' }, { maxOutputTokens: 16385 }, { timeoutMs: 1200001 }]) assert.throws(() => executionSettings({ ...request, ...patch }), /invalid_execution_profile/);
  for (const key of Object.keys(POLICY_EXECUTION)) {
    const partial = { ...POLICY_EXECUTION }; delete partial[key];
    assert.throws(() => executionSettings(partial), /invalid_execution_profile/);
  }
  const { executionProfile, effort, maxOutputTokens, timeoutMs, ...pilot } = request;
  assert.deepEqual([executionProfile, effort, maxOutputTokens, timeoutMs], ['policy-resolution-v1', 'high', 16384, 1200000]);
  assert.equal(cliArguments(pilot, 'session').includes('--effort'), false);
  assert.equal(cliEnvironment(token, '/tmp/offline').CLAUDE_CODE_MAX_OUTPUT_TOKENS, '10000');
});

test('exact PCR nested arrays and integer bounds decode; invalid turn, fields, quotes and policy references fail', () => {
  validateSchema(value, request.schema);
  const invalid = change => { const copy = structuredClone(value); change(copy.conversations['offline-context'].checkpoints['1']); return copy; };
  for (const output of [
    invalid(t => { t.turn = 1.1; }), invalid(t => { t.turn = 2; }), invalid(t => { t.evidence.turn = '1'; }),
    invalid(t => { t.policyRefs = {}; }), invalid(t => { t.policyRefs = Array(3).fill({ sourceId: 's', quote: 'q' }); }),
    invalid(t => { t.policyRefs = [{ sourceId: 's', quote: 'q', extra: true }]; }),
    invalid(t => { t.reason = 'x'.repeat(181); }), invalid(t => { t.evidence.quote = 'x'.repeat(201); }),
    invalid(t => { t.status = 'arbitrary'; }), invalid(t => { delete t.handling; }),
  ]) assert.throws(() => validateSchema(output, request.schema), /invalid_structured_output/);
});

test('service accepts only fixed quality schemas or packet-derived bounded PCR schemas under the explicit profile', () => {
  assert.equal(validateRequest(request, [request.model]).timeoutMs, 1200000);
  for (const mode of ['shopping', 'support']) for (const audit of [false, true]) validateRequest({ ...request, schema: verdictSchema(mode, audit) }, [request.model]);
  for (const mode of ['shopping', 'support']) for (const schema of [schemaFor(mode), qualityAuditSchema(mode)]) validateRequest({ ...request, schema }, [request.model]);
  const malformed = [
    { ...request, schema: verdictSchema('support'), model: 'different-model' },
    { ...request, shell: 'unapproved' }, { ...request, effort: 'low' },
    { ...request, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
    { ...request, schema: resultSchema({ conversations: [{ key: 'different', checkpoints: [{ turn: 1 }] }] }) },
  ];
  for (const checkpoints of [[], [{ turn: 0 }], [{ turn: 11 }], [{ turn: 1 }, { turn: 1 }]]) {
    const input = { conversations: [{ key: 'offline-context', checkpoints }] };
    malformed.push({ ...request, input, schema: resultSchema(input) });
  }
  const duplicate = { conversations: [packet.conversations[0], packet.conversations[0]] };
  malformed.push({ ...request, input: duplicate, schema: resultSchema(duplicate) });
  for (const body of malformed) assert.throws(() => validateRequest(body, [request.model, 'different-model']), /invalid_request/);
  const { executionProfile, effort, maxOutputTokens, timeoutMs, ...withoutProfile } = request;
  assert.ok(executionProfile && effort && maxOutputTokens && timeoutMs);
  assert.throws(() => validateRequest(withoutProfile, [request.model]), /invalid_request/);
  for (const schema of [schemaFor('shopping'), qualityAuditSchema('support')]) {
    assert.throws(() => validateRequest({ ...withoutProfile, schema }, [request.model]), /invalid_request/);
    const changed = structuredClone(schema); changed.additionalProperties = true;
    assert.throws(() => validateRequest({ ...request, schema: changed }, [request.model]), /invalid_request/);
  }
});

test('judge image COPY layout resolves both PCR and full quality schema declarations without worker runtime dependencies', async () => {
  const root = new URL('../', import.meta.url), directory = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-layout-'));
  try {
    const dockerfile = await fs.readFile(new URL('judge/Dockerfile', root), 'utf8');
    for (const line of dockerfile.split('\n').filter(line => line.startsWith('COPY '))) {
      const parts = line.split(/\s+/).slice(1), destination = parts.pop();
      const target = path.join(directory, destination);
      await fs.mkdir(target, { recursive: true });
      for (const source of parts) {
        if (source.endsWith('/')) await fs.cp(new URL(source, root), target, { recursive: true });
        else await fs.copyFile(new URL(source, root), path.join(target, path.basename(source)));
      }
    }
    const isolated = await import(pathToFileURL(path.join(directory, 'judge/server.mjs')).href);
    isolated.validateRequest(request, [request.model]);
    for (const mode of ['shopping','support']) for (const schema of [schemaFor(mode), qualityAuditSchema(mode)]) isolated.validateRequest({ ...request, schema }, [request.model]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('isolated CLI applies explicit effort and output budget and returns truthful fresh execution receipts', async () => {
  const calls = [];
  const spawnImpl = fakeProcess((args, options) => {
    calls.push({ args, options });
    assert.equal(args[args.indexOf('--effort') + 1], 'high');
    assert.equal(args[args.indexOf('--tools') + 1], '');
    assert.equal(args[args.indexOf('--max-turns') + 1], '2');
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '16384');
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(options.env.JUDGE_SERVICE_SECRET, undefined);
    assert.equal(options.shell, false);
  });
  const primary = await runClaude(request, { token, spawnImpl });
  const audit = await runClaude(request, { token, spawnImpl });
  assert.deepEqual(primary.value, value);
  assert.notEqual(primary.metadata.response_id, audit.metadata.response_id);
  assert.notEqual(calls[0].options.cwd, calls[1].options.cwd);
  for (const [key, expected] of Object.entries(executionMetadata(executionSettings(request)))) assert.equal(primary.metadata[key], expected);
  assert.equal(JSON.stringify(primary).includes(token), false);
  await assert.rejects(runClaude(request, { token, spawnImpl, timeoutMs: 1200001 }), /invalid_execution_profile/);
});

test('worker-to-service PCR fixture carries the contract and rejects changed or missing execution receipts', async () => {
  await withPrivateConfiguration(async () => {
    const server = createJudgeServer({ token, secret, models: [request.model], run: async (body, options) => {
      assert.deepEqual(body, request); assert.equal(options.timeoutMs, 1200000);
      return runClaude(body, { ...options, spawnImpl: fakeProcess() });
    } });
    assert.equal(server.requestTimeout, POLICY_TRANSPORT_TIMEOUT_MS);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const localUrl = `http://127.0.0.1:${server.address().port}/judge`;
    try {
      const received = await providerStructuredResponse({ ...request, fetchImpl: async (url, options) => {
        assert.equal(String(url), 'http://judge:3101/judge'); assert.equal(options.redirect, 'error');
        return judgeServiceFetch(localUrl, options);
      } });
      assert.equal(received.metadata.effort, 'high');
      assert.deepEqual(received.value, value);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const field of ['effort', 'max_output_tokens', 'timeout_ms', 'execution_profile', 'output_token_limit_scope']) {
      const bad = { ...metadata }; delete bad[field];
      await assert.rejects(claudeStructuredResponse({ ...request, fetchImpl: async () => ({ ok: true, json: async () => ({ value, metadata: bad }) }) }), /execution metadata/);
    }
  });
});

test('bounded native private HTTP response honors cancellation and byte limits without fetch header timeout', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/oversized') res.end('x'.repeat(500001));
    else if (req.url === '/delayed') setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"fixture":true}'); }, 30);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const normal = await judgeServiceFetch(origin + '/delayed', { method: 'POST', body: '{}', signal: AbortSignal.timeout(1000) });
    assert.deepEqual(await normal.json(), { fixture: true });
    await assert.rejects(judgeServiceFetch(origin + '/waiting', { method: 'POST', body: '{}', signal: AbortSignal.timeout(5) }), error => error.name === 'TimeoutError');
    await assert.rejects(judgeServiceFetch(origin + '/oversized', { method: 'POST', body: '{}', signal: AbortSignal.timeout(1000) }), error => error.code === 'model_incomplete');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('unsupported direct-provider profiles fail before any external request', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'offline-unused-key';
  try {
    await assert.rejects(providerStructuredResponse({ ...request, provider: 'openai', fetchImpl: () => { throw Error('must not fetch'); } }), error => error.code === 'model_configuration');
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
