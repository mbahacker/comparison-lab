import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
const AUTOMATIC_REJECTIONS = new Set(['judge_busy', 'invalid_cli_json', 'incomplete_cli_result',
  'invalid_structured_output', 'invalid_cli_result', 'cli_output_limit']);
const BACKOFF_MS = [2000, 5000];
const retryRequired = () => new WorkerError('model_rejection_requires_retry', 'The judge rejected this call. Automatic recovery is unavailable or exhausted; a later explicit operator retry is required.');

// Opt in with automaticRetries: 1 or 2. This is a total stage-chain allowance,
// never a per-process/per-fence budget. The default preserves manual later-fence
// recovery; an operator can explicitly use it after the automatic budget is spent.
export function createPolicyInvoker({ cacheDirectory, fencingToken, signal, call, automaticRetries = 0, sleep = delay }) {
  if (!Number.isInteger(fencingToken) || fencingToken < 1) throw new Error('Invalid call-cache fencing token');
  if (!Number.isInteger(automaticRetries) || automaticRetries < 0 || automaticRetries > 2) throw new Error('Automatic judge retries must be 0, 1 or 2');
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
    // Each pass re-reads the immutable chain, including retries persisted by an
    // earlier process. No accepted response is ever followed by another call.
    for (;;) {
      let attempt = 0, prefix, intent, previous;
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
        previous = { intent, rejection };
        attempt++;
      }
      let retry;
      if (previous) {
        if (fencingToken < previous.intent.fencingToken) throw new WorkerError('resume_conflict', 'An older job lease cannot retry a newer model intent');
        if (automaticRetries) {
          if (attempt > automaticRetries || !AUTOMATIC_REJECTIONS.has(previous.rejection.judge.code)) throw retryRequired();
          const delayMs = BACKOFF_MS[attempt - 1];
          await sleep(delayMs, undefined, { signal });
          retry = { kind: 'automatic', delayMs, maximumAutomaticRetries: automaticRetries, previousRejectionSha256: digest(previous.rejection) };
        } else {
          if (fencingToken <= previous.intent.fencingToken) throw retryRequired();
          retry = { kind: 'operator', previousRejectionSha256: digest(previous.rejection) };
        }
      }
      signal?.throwIfAborted();
      // Append-only retry intents preserve every rejected attempt. A crash after
      // this write without a response or definitive rejection stays unknown.
      intent = { request, sha256: requestSha256, startedAt: new Date().toISOString(), fencingToken, ...(retry ? { retry } : {}) };
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
        if (automaticRetries && attempt < automaticRetries && definitiveJudgeRejection(diagnostic) && AUTOMATIC_REJECTIONS.has(diagnostic.code)) continue;
        throw error;
      }
      const receipt = { value: result.value, metadata: { ...result.metadata, requestSha256 } };
      await write(responseFile, receipt);
      return receipt;
    }
  };
}
