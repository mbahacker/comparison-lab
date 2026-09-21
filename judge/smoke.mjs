// Operator-only: two minimal model requests, no evaluation job, report or external message.
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CLI_VERSION, runClaude } from './cli.mjs';

const installed = await promisify(execFile)('/usr/local/bin/claude', ['--version'], { timeout: 10000, maxBuffer: 10000, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp' } });
if (!installed.stdout.startsWith(`${CLI_VERSION} `)) throw new Error('CLI version mismatch');
const token = (await fs.readFile(process.env.CLAUDE_TOKEN_FILE || '/run/secrets/claude_oauth_token', 'utf8')).trim();
const models = [process.env.JUDGE_MODEL, process.env.AUDITOR_MODEL];
if (models.some(model => typeof model !== 'string' || !model.trim())) throw new Error('Configure both models for the smoke test');
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const results = [];
for (const model of models) {
  const result = await runClaude({ instructions: 'Return the requested structured JSON and nothing else. Set ok to true.', input: { request: 'Connectivity and JSON schema smoke test only.' }, schema, model }, { token });
  if (result.value.ok !== true) throw new Error('Smoke verdict failed');
  results.push({ model: result.metadata.model, response_id: result.metadata.response_id });
}
if (results[0].response_id === results[1].response_id) throw new Error('Sessions were reused');
const leftovers = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('comparison-judge-'));
if (leftovers.length) throw new Error('Temporary session cleanup failed');
let memoryPeakBytes = null;
try { memoryPeakBytes = Number((await fs.readFile('/sys/fs/cgroup/memory.peak', 'utf8')).trim()); } catch { /* cgroup v1 may omit this */ }
console.log(JSON.stringify({ passed: true, cliVersion: CLI_VERSION, sessions: results, memoryPeakBytes, temporarySessionsRemaining: leftovers.length }));
