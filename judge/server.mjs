import http from 'node:http';
import fs from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { verdictSchema } from '../worker/verdict-schema.mjs';
import { CLI_VERSION, JudgeError, runClaude } from './cli.mjs';
import { resultSchema } from '../benchmark/policy-judge.mjs';
import { executionSettings, POLICY_TRANSPORT_TIMEOUT_MS } from '../worker/execution-profile.mjs';
import { schemaFor, qualityAuditSchema } from '../worker/policy-quality-spec.mjs';
import { judgeDiagnostic } from '../worker/judge-errors.mjs';

const schemas = ['shopping', 'support'].flatMap(mode => [false, true].map(audit => JSON.stringify(verdictSchema(mode, audit))));
const policyQualitySchemas = ['shopping', 'support'].flatMap(mode => [schemaFor(mode), qualityAuditSchema(mode)].map(schema => JSON.stringify(schema)));
export function validateRequest(body, models) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new JudgeError('invalid_request', 400);
  let settings;
  try { settings = executionSettings(body); } catch { throw new JudgeError('invalid_request', 400); }
  const keys = settings.explicit ? 'effort,executionProfile,input,instructions,maxOutputTokens,model,schema,timeoutMs' : 'input,instructions,model,schema';
  if (Object.keys(body).sort().join(',') !== keys || !models.includes(body.model) || typeof body.instructions !== 'string' || !body.instructions.trim() || body.instructions.length > 90000 || !body.input || typeof body.input !== 'object' || Array.isArray(body.input)) throw new JudgeError('invalid_request', 400);
  if (settings.explicit && body.model !== 'claude-opus-4-8') throw new JudgeError('invalid_request', 400);
  if (schemas.includes(JSON.stringify(body.schema))) return settings;
  if (!settings.explicit) throw new JudgeError('invalid_request', 400);
  if (policyQualitySchemas.includes(JSON.stringify(body.schema))) return settings;
  try {
    const conversations = body.input.conversations;
    if (!Array.isArray(conversations) || conversations.length < 1 || conversations.length > 3) throw Error();
    const keys = new Set();
    for (const c of conversations) {
      if (!c || !/^[a-zA-Z0-9_-]{1,128}$/.test(c.key) || keys.has(c.key) || !Array.isArray(c.checkpoints) || c.checkpoints.length < 1 || c.checkpoints.length > 10) throw Error();
      keys.add(c.key);
      const turns = new Set();
      for (const t of c.checkpoints) {
        if (!Number.isInteger(t?.turn) || t.turn < 1 || t.turn > 10 || turns.has(t.turn)) throw Error();
        turns.add(t.turn);
      }
    }
    if (JSON.stringify(body.schema) !== JSON.stringify(resultSchema(body.input))) throw Error();
  } catch { throw new JudgeError('invalid_request', 400); }
  return settings;
}
export function createJudgeServer({ token, secret, models, run = runClaude }) {
  if (!token || typeof secret !== 'string' || secret.length < 32 || !models?.length || models.some(model => typeof model !== 'string' || !model.trim())) throw new JudgeError('judge_configuration', 503);
  let active = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); } };
    if (req.method === 'GET' && req.url === '/health') return send(200, { ready: true, busy: active, cliVersion: CLI_VERSION });
    const auth = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${secret}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'unauthorized' });
    if (req.method !== 'POST' || req.url !== '/judge') return send(404, { error: 'not_found' });
    if (active) return send(429, { error: 'judge_busy' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'json_required' });
    active = true;
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abort); req.on('aborted', abort);
    const bodyTimer = setTimeout(() => { controller.abort(); req.destroy(); }, 15000);
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 500000) throw new JudgeError('request_too_large', 413); chunks.push(Buffer.from(chunk)); }
      clearTimeout(bodyTimer);
      let request; try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new JudgeError('invalid_json', 400); }
      const settings = validateRequest(request, models);
      if (controller.signal.aborted) throw new JudgeError('judge_cancelled', 499);
      const result = await run(request, { token, signal: controller.signal, timeoutMs: settings.timeoutMs });
      send(200, result);
    } catch (error) {
      const diagnostic = error instanceof JudgeError && judgeDiagnostic(error.status, { error: error.code });
      send(diagnostic ? diagnostic.status : 500, { error: diagnostic ? diagnostic.code : 'judge_failed' });
    }
    finally { clearTimeout(bodyTimer); res.off('close', abort); req.off('aborted', abort); active = false; }
  });
  server.requestTimeout = POLICY_TRANSPORT_TIMEOUT_MS; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}
export async function main() {
  const token = (await fs.readFile(process.env.CLAUDE_TOKEN_FILE || '/run/secrets/claude_oauth_token', 'utf8')).trim();
  const version = await promisify(execFile)('/usr/local/bin/claude', ['--version'], { timeout: 10000, maxBuffer: 10000, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp' } });
  if (!version.stdout.startsWith(`${CLI_VERSION} `)) throw new JudgeError('cli_version_mismatch', 503);
  const server = createJudgeServer({ token, secret: process.env.JUDGE_SERVICE_SECRET, models: [process.env.JUDGE_MODEL, process.env.AUDITOR_MODEL] });
  server.listen(3101, '0.0.0.0');
  const stop = () => { server.close(); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Judge startup failed; check private configuration and pinned CLI installation.'); process.exitCode = 1; });
