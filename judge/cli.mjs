import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const CLI_VERSION = '2.1.198';
export class JudgeError extends Error {
  constructor(code, status = 422) { super(code); this.code = code; this.status = status; }
}
export function validateSchema(value, schema) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JudgeError('invalid_structured_output');
    if (schema.additionalProperties !== false || Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => !Object.hasOwn(value, key))) throw new JudgeError('invalid_structured_output');
    for (const [key, field] of Object.entries(schema.properties)) if (Object.hasOwn(value, key)) validateSchema(value[key], field);
  } else if (typeof value !== schema.type || (schema.enum && !schema.enum.includes(value))) throw new JudgeError('invalid_structured_output');
}
export function cliArguments({ instructions, schema, model }, sessionId) {
  return ['--print', '--output-format', 'json', '--model', model,
    '--system-prompt', instructions, '--json-schema', JSON.stringify(schema),
    '--tools', '', '--disallowedTools', 'mcp__*', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '', '--settings', '{"disableAllHooks":true,"autoMemoryEnabled":false}',
    '--disable-slash-commands', '--no-chrome', '--no-session-persistence', '--permission-mode', 'dontAsk',
    '--session-id', sessionId, '--max-turns', '2'];
}
export function cliEnvironment(token, directory) {
  // Do not inherit API keys, endpoint overrides, host hooks, proxy credentials or Jarvis settings.
  return { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: directory, TMPDIR: directory,
    CLAUDE_CONFIG_DIR: path.join(directory, '.claude'), CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
    DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '10000',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', LANG: 'C.UTF-8' };
}
export function decodeResult(output, schema, requestedModel, sessionId) {
  let result;
  try { result = JSON.parse(output); } catch { throw new JudgeError('invalid_cli_json'); }
  if (result?.type !== 'result' || result.subtype !== 'success' || result.is_error !== false || result.session_id !== sessionId || !result.structured_output || (result.permission_denials?.length || 0) !== 0) throw new JudgeError('incomplete_cli_result');
  validateSchema(result.structured_output, schema);
  const models = Object.keys(result.modelUsage || {});
  if (models.length !== 1) throw new JudgeError('ambiguous_cli_model');
  if (requestedModel.startsWith('claude-') && models[0] !== requestedModel) throw new JudgeError('unexpected_cli_model');
  return { value: result.structured_output, metadata: { provider: 'claude-cli', cli_version: CLI_VERSION,
    model: models[0], requested_model: requestedModel, response_id: result.session_id,
    usage: result.usage, created_at: new Date().toISOString() } };
}
export async function runClaude(request, { token, signal, spawnImpl = spawn, timeoutMs = 180000, maxOutputBytes = 300000, tempRoot = os.tmpdir(), binary = '/usr/local/bin/claude' } = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new JudgeError('judge_auth_missing', 503);
  const directory = await fs.mkdtemp(path.join(tempRoot, 'comparison-judge-'));
  await fs.chmod(directory, 0o700);
  const sessionId = randomUUID();
  try {
    return await new Promise((resolve, reject) => {
      let child, bytes = 0, failure, settled = false, timer, killTimer;
      const output = [];
      const killGroup = signalName => {
        if (Number.isInteger(child?.pid) && child.pid > 0) {
          try { process.kill(-child.pid, signalName); } catch { /* already exited */ }
        } else child?.kill?.(signalName);
      };
      const finish = (error, result) => {
        if (settled) return; settled = true;
        // The leader can exit before its children. Always reap the remaining group;
        // clearing only the escalation timer would leave detached work running.
        killGroup('SIGKILL'); clearTimeout(timer); clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(result);
      };
      const stop = error => {
        if (failure || settled) return; failure = error;
        killGroup('SIGTERM');
        killTimer = setTimeout(() => killGroup('SIGKILL'), 1000);
      };
      const abort = () => stop(new JudgeError('judge_cancelled', 499));
      try { child = spawnImpl(binary, cliArguments(request, sessionId), { cwd: directory, env: cliEnvironment(token, directory), stdio: ['pipe', 'pipe', 'pipe'], detached: true, shell: false }); }
      catch { finish(new JudgeError('cli_spawn_failed', 503)); return; }
      timer = setTimeout(() => stop(new JudgeError('judge_timeout', 504)), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.on('error', () => finish(new JudgeError('cli_spawn_failed', 503)));
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > maxOutputBytes) stop(new JudgeError('cli_output_limit')); else output.push(Buffer.from(chunk)); });
      // Never return or log stderr: CLI diagnostics can contain credential or prompt data.
      child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > maxOutputBytes) stop(new JudgeError('cli_output_limit')); });
      child.stdin.on('error', () => { /* exit/error handler supplies a sanitized result */ });
      child.on('close', code => {
        if (failure) return finish(failure);
        if (code !== 0) return finish(new JudgeError('cli_failed'));
        try { finish(null, decodeResult(Buffer.concat(output).toString('utf8'), request.schema, request.model, sessionId)); }
        catch (error) { finish(error instanceof JudgeError ? error : new JudgeError('invalid_cli_result')); }
      });
      child.stdin.end(JSON.stringify(request.input));
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
