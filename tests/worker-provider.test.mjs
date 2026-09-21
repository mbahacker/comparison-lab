import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { modelConfiguration, validateModelStartup } from '../worker/model-provider.mjs';
import { structuredResponse, verdictSchema, judgeCapture } from '../worker/judge.mjs';
import { failureDetails } from '../worker/index.mjs';
import { deriveCheckedScore } from '../worker/scoring.mjs';
import { criteriaFor, WorkerError } from '../worker/protocol.mjs';

const variables = ['MODEL_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'JUDGE_MODEL', 'AUDITOR_MODEL'];
async function environment(values, callback) {
  const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  for (const key of variables) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  try { return await callback(); }
  finally { for (const key of variables) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
const options = { instructions: 'Judge only the fixed rubric.', input: { transcript: 'Untrusted captured text' }, schema: verdictSchema('support'), model: 'operator-selected-model' };
const anthropicResult = (overrides = {}) => ({ id: 'msg_fixture', model: 'resolved-model-version', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"fixture":true}' }], usage: { input_tokens: 20, output_tokens: 5 }, ...overrides });
const successful = result => async () => ({ ok: true, status: 200, json: async () => result });

test('a running worker requires an explicit known provider, its own API key, and both model IDs', () => {
  const common = { JUDGE_MODEL: 'configured-judge', AUDITOR_MODEL: 'configured-auditor' };
  assert.throws(() => validateModelStartup({ ...common, OPENAI_API_KEY: 'test-only' }), /MODEL_PROVIDER/);
  assert.throws(() => validateModelStartup({ ...common, MODEL_PROVIDER: 'claude-cli', ANTHROPIC_API_KEY: 'test-only' }), /MODEL_PROVIDER/);
  assert.throws(() => validateModelStartup({ ...common, MODEL_PROVIDER: 'anthropic', OPENAI_API_KEY: 'test-only' }), /ANTHROPIC_API_KEY/);
  assert.throws(() => validateModelStartup({ ...common, MODEL_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'test-only' }), /OPENAI_API_KEY/);
  assert.throws(() => validateModelStartup({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only', JUDGE_MODEL: 'configured-judge' }), /AUDITOR_MODEL/);
  assert.deepEqual(validateModelStartup({ ...common, MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only' }), { provider: 'anthropic', judgeModel: 'configured-judge', auditorModel: 'configured-auditor' });
  assert.deepEqual(validateModelStartup({ ...common, MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only' }), { provider: 'openai', judgeModel: 'configured-judge', auditorModel: 'configured-auditor' });
  assert.throws(() => modelConfiguration({ env: { OPENAI_API_KEY: 'test-only', OPENAI_BASE_URL: 'http://not-tls.example/v1' } }), /HTTPS/);
});

test('Anthropic uses Messages API structured outputs without OpenAI credentials or tools', async () => {
  await environment({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'anthropic-test-only' }, async () => {
    const result = await structuredResponse({ ...options, fetchImpl: async (url, request) => {
      assert.equal(new URL(url).href, 'https://api.anthropic.com/v1/messages');
      assert.equal(request.headers['x-api-key'], 'anthropic-test-only');
      assert.equal(request.headers['anthropic-version'], '2023-06-01');
      assert.equal(request.headers.Authorization, undefined);
      assert.equal(request.redirect, 'error');
      const payload = JSON.parse(request.body);
      assert.equal(payload.system, options.instructions);
      assert.deepEqual(payload.messages, [{ role: 'user', content: JSON.stringify(options.input) }]);
      assert.deepEqual(payload.output_config.format, { type: 'json_schema', schema: options.schema });
      assert.equal(payload.max_tokens, 10000);
      assert.equal(payload.model, options.model);
      assert.equal(payload.tools, undefined);
      assert.equal(payload.store, undefined);
      return { ok: true, json: async () => anthropicResult() };
    } });
    assert.deepEqual(result.value, { fixture: true });
    assert.equal(result.metadata.provider, 'anthropic');
    assert.equal(result.metadata.model, 'resolved-model-version');
    assert.equal(result.metadata.requested_model, options.model);
    assert.equal(result.metadata.response_id, 'msg_fixture');
    assert.equal(JSON.stringify(result).includes('anthropic-test-only'), false);
  });
});

test('OpenAI remains the compatible direct-call default and keeps its existing request payload', async () => {
  await environment({ OPENAI_API_KEY: 'openai-test-only', ANTHROPIC_API_KEY: 'unused-test-only' }, async () => {
    const result = await structuredResponse({ ...options, fetchImpl: async (url, request) => {
      assert.equal(new URL(url).href, 'https://api.openai.com/v1/responses');
      assert.equal(request.headers.Authorization, 'Bearer openai-test-only');
      assert.equal(request.headers['x-api-key'], undefined);
      const payload = JSON.parse(request.body);
      assert.equal(payload.store, false);
      assert.equal(payload.instructions, options.instructions);
      assert.equal(payload.input, JSON.stringify(options.input));
      assert.equal(payload.text.format.strict, true);
      assert.deepEqual(payload.text.format.schema, options.schema);
      assert.equal(payload.max_output_tokens, 10000);
      assert.equal(payload.tools, undefined);
      return { ok: true, json: async () => ({ status: 'completed', id: 'resp_fixture', model: 'resolved-openai-version', output: [{ content: [{ type: 'output_text', text: '{"fixture":true}' }] }] }) };
    } });
    assert.equal(result.metadata.provider, 'openai');
    assert.equal(result.metadata.model, 'resolved-openai-version');
    assert.equal(result.metadata.requested_model, options.model);
  });
});

test('Anthropic HTTP200 refusals, truncation, tool use and malformed outputs never produce verdicts', async () => {
  await environment({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only' }, async () => {
    for (const stop_reason of ['refusal', 'max_tokens', 'tool_use', 'pause_turn', 'stop_sequence', null]) {
      await assert.rejects(structuredResponse({ ...options, fetchImpl: successful(anthropicResult({ stop_reason })) }), error => error.code === 'model_incomplete' && failureDetails(error).retryable === false);
    }
    for (const content of [[], [{ type: 'text', text: '' }], [{ type: 'refusal', text: 'No' }], [{ type: 'tool_use', input: {} }], [{ type: 'text', text: 42 }], [{ type: 'text', text: 'x'.repeat(200001) }]]) {
      await assert.rejects(structuredResponse({ ...options, fetchImpl: successful(anthropicResult({ content })) }), error => error.code === 'model_incomplete');
    }
    await assert.rejects(structuredResponse({ ...options, fetchImpl: successful(anthropicResult({ content: [{ type: 'text', text: '{broken' }] })) }), error => error.code === 'invalid_verdict');
  });
});

test('both providers retain bounded retry classifications for HTTP and transport failures', async () => {
  for (const provider of ['openai', 'anthropic']) await environment({ MODEL_PROVIDER: provider, OPENAI_API_KEY: 'test-only', ANTHROPIC_API_KEY: 'test-only' }, async () => {
    for (const status of [400, 401, 403, 429, 500, 529]) {
      await assert.rejects(structuredResponse({ ...options, fetchImpl: async () => ({ ok: false, status }) }), error => error.code === 'model_request_failed' && failureDetails(error).retryable === (status === 429 || status >= 500));
    }
    await assert.rejects(structuredResponse({ ...options, fetchImpl: async () => { throw new DOMException('Timed out', 'TimeoutError'); } }), error => error.code === 'model_transport_failed' && error.retryable === true);
    const controller = new AbortController(); controller.abort(new WorkerError('lease_lost', 'Superseded'));
    await assert.rejects(structuredResponse({ ...options, signal: controller.signal, fetchImpl: async () => { throw new DOMException('Timed out', 'TimeoutError'); } }), error => error.code === 'lease_lost' && error.retryable === false);
  });
});

test('OpenAI explicit refusal blocks cannot be accepted alongside otherwise valid JSON', async () => {
  await environment({ MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only' }, async () => {
    await assert.rejects(structuredResponse({ ...options, fetchImpl: successful({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"fixture":true}' }, { type: 'refusal', refusal: 'No' }] }] }) }), error => error.code === 'model_incomplete');
  });
});

test('judge and auditor preserve the fixed rubric flow and publish provider provenance', async () => {
  await environment({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-only', JUDGE_MODEL: 'configured-judge', AUDITOR_MODEL: 'configured-auditor' }, async () => {
    const capture = { vendor: 'Example Vendor', store: 'Example Store', mode: 'support', theme: 'returns', turns: [{ question: 'What is your return policy?', reply: 'Test-only captured text.', response_complete: true }] };
    const signals = { no_deflect: true };
    const upstream = { normalizeUserMessage: value => value, stripWidgetChrome: value => value, convoSignals: () => signals, rubricText: 'PINNED RUBRIC FIXTURE', deriveScores: deriveCheckedScore };
    const checks = Object.fromEntries(criteriaFor('support').map(c => [c.id, { pass: false, evidence: '' }]));
    const auditChecks = Object.fromEntries(criteriaFor('support').map(c => [c.id, { classification: 'AGREE', reason: 'Test-only fixture.', evidence: '' }]));
    const calls = [];
    const judged = await judgeCapture(capture, upstream, { call: async supplied => {
      calls.push(supplied);
      return structuredResponse({ ...supplied, fetchImpl: successful(anthropicResult({ id: `msg_${calls.length}`, model: supplied.model, content: [{ type: 'text', text: JSON.stringify({ checks: calls.length === 1 ? checks : auditChecks, resolution_class: 'failed', learning: 'Transport fixture only.' }) }] })) });
    } });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, 'configured-judge'); assert.equal(calls[1].model, 'configured-auditor');
    assert.match(calls[0].instructions, /PINNED RUBRIC FIXTURE/);
    assert.match(calls[1].instructions, /fresh adversarial auditor/);
    assert.equal(judged.score, 0);
    assert.equal(judged.checks.length, 10);
    assert.equal(judged.judging.primary.provider, 'anthropic'); assert.equal(judged.judging.auditor.provider, 'anthropic');
    assert.equal(judged.judging.primary.response_id, 'msg_1'); assert.equal(judged.judging.auditor.response_id, 'msg_2');
  });
});

test('Compose gates optional execution behind a worker profile without requiring dummy model keys', () => {
  const compose = fs.readFileSync(new URL('../compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /worker:\s*\n\s*profiles: \[worker\]/);
  for (const key of ['WORKER_SECRET', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'JUDGE_MODEL', 'AUDITOR_MODEL', 'MODEL_PROVIDER']) {
    assert.equal(compose.includes(`\${${key}:?`), false, `${key} must be checked only when the worker starts`);
  }
});
