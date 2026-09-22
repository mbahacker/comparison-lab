import fs from 'node:fs/promises';
import path from 'node:path';
import { digest } from './policy-contract.mjs';
import { POLICY_EXECUTION } from './execution-profile.mjs';
import { WorkerError } from './protocol.mjs';
import { definitiveJudgeRejection, validJudgeDiagnostic } from './judge-errors.mjs';

async function read(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const write = (file, value) => fs.writeFile(file, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
const unknown = () => new WorkerError('model_outcome_unknown', 'A prior model request has no definitive rejection or retained response. Operator reconciliation is required; it will not be replayed automatically.');

export function createPolicyInvoker({ cacheDirectory, fencingToken, signal, call }) {
  if (!Number.isInteger(fencingToken) || fencingToken < 1) throw new Error('Invalid call-cache fencing token');
  return async (request, stage) => {
    signal?.throwIfAborted();
    if (!/^[a-zA-Z0-9_-]+$/.test(stage)) throw new Error('Invalid model stage');
    const requestSha256 = digest(request), name = path.join(cacheDirectory, `${stage}-${requestSha256}`);
    const responseFile = name + '-response.json', cached = await read(responseFile);
    // Successful responses retain the existing cache format and are never replaced.
    if (cached) {
      if (cached.metadata?.requestSha256 !== requestSha256) throw new WorkerError('resume_conflict', 'Retained model response does not match its request');
      return cached;
    }
    let attempt = 0, prefix, intent;
    for (;;) {
      prefix = name + (attempt ? `-retry-${attempt}` : '');
      intent = await read(prefix + '-request.json');
      if (!intent) break;
      if (intent.sha256 !== requestSha256 || digest(intent.request) !== requestSha256) throw new WorkerError('resume_conflict', 'Retained model intent does not match its request');
      const rejection = await read(prefix + '-rejection.json');
      if (!rejection) throw unknown();
      if (rejection.schema !== 'policy-judge-rejection/v1' || rejection.requestSha256 !== requestSha256
        || rejection.requestIntentSha256 !== digest(intent) || rejection.attempt !== attempt
        || !Number.isInteger(intent.fencingToken) || intent.fencingToken < 1
        || rejection.fencingToken !== intent.fencingToken || !validJudgeDiagnostic(rejection.judge)) {
        throw new WorkerError('resume_conflict', 'Retained judge rejection does not match its request intent');
      }
      if (!definitiveJudgeRejection(rejection.judge)) throw unknown();
      if (fencingToken <= intent.fencingToken) throw new WorkerError('model_rejection_requires_retry', 'The judge rejected this call. A later authorized job retry is required; this attempt will not repeat it.');
      attempt++;
    }
    // Append-only retry intents preserve every rejected attempt. A crash after this
    // write without either a response or a definitive rejection stays unknown.
    intent = { request, sha256: requestSha256, startedAt: new Date().toISOString(), fencingToken };
    await write(prefix + '-request.json', intent);
    let result;
    try {
      result = await call({ ...request, input: request.input || JSON.parse(request.prompt), ...POLICY_EXECUTION, signal });
    } catch (error) {
      const diagnostic = validJudgeDiagnostic(error.judgeDiagnostic);
      if (diagnostic) await write(prefix + '-rejection.json', {
        schema: 'policy-judge-rejection/v1', requestSha256, requestIntentSha256: digest(intent),
        attempt, fencingToken, rejectedAt: new Date().toISOString(), judge: diagnostic,
      });
      throw error;
    }
    const receipt = { value: result.value, metadata: { ...result.metadata, requestSha256 } };
    await write(responseFile, receipt);
    return receipt;
  };
}
