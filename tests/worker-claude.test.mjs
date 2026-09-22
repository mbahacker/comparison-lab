import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { cliArguments, cliEnvironment, decodeResult, runClaude, JudgeError } from '../judge/cli.mjs';
import { createJudgeServer, validateRequest } from '../judge/server.mjs';
import { verdictSchema } from '../worker/verdict-schema.mjs';
import { validateModelStartup } from '../worker/model-provider.mjs';
import { claudeServiceConfiguration, claudeStructuredResponse } from '../worker/claude-client.mjs';

const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const request = { instructions: 'Use only the rubric.', input: { text: 'Untrusted transcript.' }, schema, model: 'selected-model' };
const token = 'fixture-token-do-not-send';
const secret = 'fixture-transport-secret-at-least-32-characters';
const result = (sessionId, overrides = {}) => ({ type: 'result', subtype: 'success', is_error: false, session_id: sessionId, structured_output: { ok: true }, modelUsage: { 'resolved-model': { inputTokens: 4 } }, usage: { input_tokens: 4 }, permission_denials: [], ...overrides });

function fakeProcess(handler) {
  return (binary, args, options) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
    queueMicrotask(() => handler(child, binary, args, options));
    return child;
  };
}

test('CLI subprocess has no tools or inherited credentials/settings and persists no sessions', () => {
  const args = cliArguments(request, 'session');
  for (const flag of ['--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(args[args.indexOf('--max-turns') + 1], '2');
  assert.equal(JSON.parse(args[args.indexOf('--settings') + 1]).disableAllHooks, true);
  assert.deepEqual(JSON.parse(args[args.indexOf('--mcp-config') + 1]), { mcpServers: {} });
  assert.equal(args.includes('--bare'), false); assert.equal(args.includes('--dangerously-skip-permissions'), false);
  const env = cliEnvironment(token, '/tmp/isolated');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, token); assert.equal(env.HOME, '/tmp/isolated');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'WORKER_API_KEY', 'JUDGE_SERVICE_SECRET']) assert.equal(env[key], undefined);
  assert.equal(args.join(' ').includes(token), false);
});

test('CLI decoder fails closed on incomplete/refused/unstructured, extra fields and wrong sessions', () => {
  assert.deepEqual(decodeResult(JSON.stringify(result('s')), schema, 'alias', 's').value, { ok: true });
  for (const patch of [{ subtype: 'error_max_turns' }, { is_error: true }, { type: 'assistant' }, { session_id: 'other' }, { structured_output: null }, { structured_output: { ok: 'true' } }, { structured_output: { ok: true, extra: 1 } }, { permission_denials: [{}] }, { modelUsage: {} }, { modelUsage: { first: {}, second: {} } }]) {
    assert.throws(() => decodeResult(JSON.stringify(result('s', patch)), schema, 'alias', 's'), JudgeError);
  }
  assert.throws(() => decodeResult('not JSON', schema, 'alias', 's'), /invalid_cli_json/);
  assert.throws(() => decodeResult(JSON.stringify(result('s')), schema, 'claude-selected-version', 's'), /unexpected_cli_model/);
});

test('fresh CLI calls isolate homes/sessions, accept bounded structured output and clean up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-test-'));
  try {
    const directories = [], sessions = [];
    const spawnImpl = fakeProcess((child, binary, args, options) => {
      assert.equal(options.shell, false); assert.equal(options.detached, true);
      assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, token);
      directories.push(options.cwd); sessions.push(args[args.indexOf('--session-id') + 1]);
      child.stdout.write(JSON.stringify(result(sessions.at(-1)))); child.emit('close', 0);
    });
    const first = await runClaude(request, { token, spawnImpl, tempRoot: root });
    const second = await runClaude(request, { token, spawnImpl, tempRoot: root });
    assert.notEqual(directories[0], directories[1]); assert.notEqual(sessions[0], sessions[1]);
    assert.notEqual(first.metadata.response_id, second.metadata.response_id);
    assert.equal(first.metadata.provider, 'claude-cli'); assert.equal(first.metadata.model, 'resolved-model');
    assert.equal(JSON.stringify(first).includes(token), false);
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('CLI timeout, cancellation, output limit and nonzero exit expose sanitized errors', async () => {
  const stopped = fakeProcess(() => {});
  await assert.rejects(runClaude(request, { token, spawnImpl: stopped, timeoutMs: 5 }), error => error.code === 'judge_timeout');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runClaude(request, { token, spawnImpl: stopped, signal: controller.signal }), error => error.code === 'judge_cancelled');
  await assert.rejects(runClaude(request, { token, maxOutputBytes: 10, spawnImpl: fakeProcess(child => { child.stderr.write(token); }) }), error => error.code === 'cli_output_limit' && !error.message.includes(token));
  await assert.rejects(runClaude(request, { token, spawnImpl: fakeProcess(child => { child.stderr.write(token); child.emit('close', 1); }) }), error => error.code === 'cli_failed' && !error.message.includes(token));
});

test('exit 1 classifies only complete same-session turn/output exhaustion, without exposing error text', async () => {
  for (const [subtype, code] of [['error_max_turns', 'incomplete_cli_result'], ['error_max_structured_output_retries', 'invalid_structured_output']]) {
    await assert.rejects(runClaude(request, { token, spawnImpl: fakeProcess((child, _binary, args) => {
      child.stdout.write(JSON.stringify({ type: 'result', subtype, is_error: true,
        session_id: args[args.indexOf('--session-id') + 1], errors: [token, request.instructions], permission_denials: [] }));
      child.stderr.write(token); child.emit('close', 1);
    }) }), error => {
      assert.equal(error.code, code); assert.equal(error.status, 422);
      assert.equal(error.message, code);
      assert.equal(JSON.stringify(error).includes(token), false);
      assert.equal(JSON.stringify(error).includes(request.instructions), false);
      return true;
    });
  }
});

test('failed exits never accept success or infer retryability from malformed, foreign or generic errors', async () => {
  const cases = [
    { patch: { subtype: 'error_during_execution', errors: ['authentication_error rate_limit_error error_max_turns'] } },
    { patch: { subtype: 'error_max_budget_usd' } },
    { patch: { subtype: 'unknown_error' } },
    { patch: { session_id: 'different-session' } },
    { patch: { is_error: false } },
    { patch: { type: 'assistant' } },
    { patch: { errors: 'error_max_turns' } },
    { patch: { errors: [{ code: 'error_max_turns' }] } },
    { patch: { structured_output: { ok: true } } },
    { patch: { permission_denials: [{}] } },
    { patch: { permission_denials: {} } },
    { exitCode: 2 }, { exitCode: null },
    { raw: '{"type":"result"' }, { raw: 'error_max_turns ' + token },
    { success: true },
  ];
  for (const fixture of cases) {
    await assert.rejects(runClaude(request, { token, spawnImpl: fakeProcess((child, _binary, args) => {
      const sessionId = args[args.indexOf('--session-id') + 1];
      const value = fixture.success ? result(sessionId) : { type: 'result', subtype: 'error_max_turns',
        is_error: true, session_id: sessionId, errors: [token], permission_denials: [], ...fixture.patch };
      child.stdout.write(fixture.raw ?? JSON.stringify(value));
      child.stderr.write(token); child.emit('close', Object.hasOwn(fixture, 'exitCode') ? fixture.exitCode : 1);
    }) }), error => error.code === 'cli_failed' && error.message === 'cli_failed' && !JSON.stringify(error).includes(token));
  }
});

test('a real SIGTERM-resistant descendant cannot outlive an exited CLI leader', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-process-test-'));
  const pidFile = path.join(root, 'descendant.pid');
  let descendant;
  try {
    const grandchild = "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)";
    const fixture = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','ignore','ignore','ipc']});child.on('message',()=>{fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.disconnect();});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
    const spawnImpl = (_binary, _args, options) => spawn(process.execPath, ['-e', fixture], options);
    await assert.rejects(runClaude(request, { token, spawnImpl, tempRoot: root, timeoutMs: 500 }), error => error.code === 'judge_timeout');
    descendant = Number(await fs.readFile(pidFile, 'utf8'));
    assert.ok(descendant > 0);
    let alive = true;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { process.kill(descendant, 0); } catch { alive = false; break; }
      // Linux may expose a killed orphan briefly as a zombie until PID 1 reaps it.
      try { if ((await fs.readFile(`/proc/${descendant}/stat`, 'utf8')).split(' ')[2] === 'Z') { alive = false; break; } } catch { /* macOS has no /proc */ }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(alive, false, 'descendant must be dead after leader exit cleanup');
  } finally {
    if (descendant) { try { process.kill(descendant, 'SIGKILL'); } catch { /* already dead */ } }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('judge service accepts only exact rubric schemas and configured model IDs', () => {
  const fixed = { ...request, schema: verdictSchema('shopping') };
  validateRequest(fixed, ['selected-model']);
  for (const bad of [{ ...fixed, model: 'unapproved' }, request, { ...fixed, shell: 'arbitrary' }, { ...fixed, instructions: '' }]) assert.throws(() => validateRequest(bad, ['selected-model']), /invalid_request/);
  assert.throws(() => createJudgeServer({ token, models: ['selected-model'] }), /judge_configuration/);
});

test('private judge authenticates, bounds concurrency to one and never returns token or raw errors', async () => {
  let release, calls = 0;
  const server = createJudgeServer({ token, secret, models: ['selected-model'], run: async (_request, options) => {
    assert.equal(options.token, token); calls++;
    await new Promise(resolve => { release = resolve; });
    throw new Error(`private credential ${token}`);
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/judge`;
  const opts = { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, schema: verdictSchema('support') }) };
  try {
    assert.equal((await fetch(url, { ...opts, headers: {} })).status, 401);
    const first = fetch(url, opts);
    while (!release) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal((await fetch(url, opts)).status, 429);
    release(); const response = await first;
    assert.equal(response.status, 500); assert.equal(calls, 1);
    assert.deepEqual(await response.json(), { error: 'judge_failed' });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('claude-cli worker requires only private transport credentials, never a Claude credential', async () => {
  assert.deepEqual(validateModelStartup({ MODEL_PROVIDER: 'claude-cli', JUDGE_SERVICE_SECRET: secret, JUDGE_MODEL: 'selected-model', AUDITOR_MODEL: 'selected-auditor' }), { provider: 'claude-cli', judgeModel: 'selected-model', auditorModel: 'selected-auditor' });
  assert.throws(() => claudeServiceConfiguration({ JUDGE_SERVICE_SECRET: secret, JUDGE_SERVICE_URL: 'https://public.example/judge' }), /must be/);
  const before = process.env.JUDGE_SERVICE_SECRET; process.env.JUDGE_SERVICE_SECRET = secret;
  try {
    const value = await claudeStructuredResponse({ ...request, fetchImpl: async (url, options) => {
      assert.equal(String(url), 'http://judge:3101/judge'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, `Bearer ${secret}`);
      assert.equal(options.body.includes(token), false);
      return { ok: true, json: async () => ({ value: { ok: true }, metadata: { provider: 'claude-cli', requested_model: request.model, response_id: 'fresh' } }) };
    } });
    assert.equal(value.value.ok, true);
    for (const status of [401, 422, 429, 503, 504]) await assert.rejects(claudeStructuredResponse({ ...request, fetchImpl: async () => ({ ok: false, status }) }), error => error.retryable === [429, 503, 504].includes(status));
  } finally { if (before === undefined) delete process.env.JUDGE_SERVICE_SECRET; else process.env.JUDGE_SERVICE_SECRET = before; }
});

test('CLI overlay isolates the token and splits rather than increases the memory budget', async () => {
  const compose = await fs.readFile(new URL('../compose.claude.yml', import.meta.url), 'utf8');
  const worker = compose.split('  judge:')[0];
  assert.equal(worker.includes('CLAUDE_CODE_OAUTH_TOKEN'), false); assert.equal(worker.includes('secrets:'), false);
  assert.match(compose, /LAB_CLAUDE_WORKER_MEMORY:-3g/); assert.match(compose, /LAB_JUDGE_MEMORY:-1g/);
  assert.match(compose, /internal: true/); assert.equal(compose.includes('ports:'), false);
  assert.match(await fs.readFile(new URL('../.gitignore', import.meta.url), 'utf8'), /\.secrets\//);
  assert.match(await fs.readFile(new URL('../.dockerignore', import.meta.url), 'utf8'), /\.secrets/);
});
