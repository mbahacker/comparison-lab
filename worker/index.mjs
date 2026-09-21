import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertJob, WorkerError } from './protocol.mjs';
import { loadUpstream } from './upstream.mjs';
import { startPublicProxy } from './network.mjs';
import { launchCaptureBrowser, captureConversation } from './capture.mjs';
import { judgeCapture } from './judge.mjs';
import { assembleEvidence } from './evidence.mjs';
import { trustedTransport } from './transport.mjs';
import { validateModelStartup } from './model-provider.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function apiClient({ baseUrl, workerKey, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || !workerKey || workerKey.length < 32) throw new WorkerError('worker_configuration', 'API base URL and a worker key of at least 32 characters are required');
  return async (endpoint, data = {}) => {
    const response = await trustedTransport(() => fetchImpl(new URL(`/api/worker/${endpoint}`, base), { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${workerKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) }), { code: 'worker_api_transport' });
    if (!response.ok) {
      let detail = '';
      try { const body = await response.json(); if (typeof body.error === 'string') detail = ': ' + body.error.slice(0, 500); } catch { /* diagnostics are optional */ }
      throw new WorkerError(response.status === 409 ? 'lease_lost' : 'worker_api_failed', `Worker API returned ${response.status}${detail}`, response.status === 429 || response.status >= 500);
    }
    return trustedTransport(() => response.json(), { code: 'worker_api_transport' });
  };
}
export function failureDetails(error, signal) {
  const reason = signal?.aborted && signal.reason instanceof WorkerError ? signal.reason : error;
  return { code: /^[a-z_]+$/.test(reason?.code || '') ? reason.code : 'worker_failed',
    retryable: reason instanceof WorkerError && reason.retryable === true, message: reason?.message || 'Worker failed' };
}
export async function runJob(job, api, { rootDirectory = process.env.WORKER_DATA_DIR || './data', upstream, adapters = [] } = {}) {
  assertJob(job);
  const lease = { jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken };
  const control = new AbortController();
  const directory = path.resolve(rootDirectory, String(job.id).replace(/[^a-zA-Z0-9_-]/g, '_'), `attempt-${job.fencingToken}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let beating = false, proxy, browser;
  const heartbeat = setInterval(async () => {
    if (beating || control.signal.aborted) return;
    beating = true;
    try { await api('heartbeat', lease); } catch (error) { control.abort(error); } finally { beating = false; }
  }, 20000);
  const timeBudget = setTimeout(() => control.abort(new WorkerError('job_budget_exceeded', 'Four hour job time budget exceeded')), 4 * 60 * 60 * 1000);
  try {
    upstream ||= await loadUpstream();
    proxy = await startPublicProxy();
    browser = await launchCaptureBrowser(proxy.url);
    const abortBrowser = () => browser.close().catch(() => {}); control.signal.addEventListener('abort', abortBrowser, { once: true });
    const conversations = [];
    // Same ordered themes and fresh contexts for every provider/store. No adaptive prompts.
    for (const provider of job.providers) for (const store of provider.customers) for (const mode of ['shopping', 'support']) {
      control.signal.throwIfAborted();
      const capture = await captureConversation({ browser, provider, store, mode, jobDirectory: directory, adapters, upstream, signal: control.signal });
      const judged = await judgeCapture(capture, upstream, { signal: control.signal });
      conversations.push(judged);
      await fs.writeFile(path.join(directory, `${capture.id}-judged.json`), JSON.stringify(judged, null, 2), { mode: 0o600 });
    }
    const evidence = assembleEvidence(job, conversations, upstream.manifest);
    await fs.writeFile(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
    control.signal.throwIfAborted();
    await api('complete', { ...lease, evidence });
    return { status: 'completed', jobId: job.id };
  } catch (error) {
    // Persist exact diagnostics locally. Public error strings contain no page text, tokens,
    // email addresses, model output, or arbitrary URLs.
    const { code, message, retryable } = failureDetails(error, control.signal);
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ code, message, retryable, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    if (code !== 'lease_lost') await api('fail', { ...lease, code, message: `Evaluation stopped (${code}). Evidence was retained privately for operator review.`, retryable }).catch(() => {});
    return { status: 'failed', jobId: job.id, code };
  } finally { clearInterval(heartbeat); clearTimeout(timeBudget); await browser?.close().catch(() => {}); await proxy?.close(); }
}
export async function main() {
  validateModelStartup();
  const api = apiClient({ baseUrl: process.env.APP_BASE_URL, workerKey: process.env.WORKER_API_KEY });
  const upstream = await loadUpstream();
  const adapters = process.env.WORKER_ADAPTERS_FILE ? JSON.parse(await fs.readFile(process.env.WORKER_ADAPTERS_FILE, 'utf8')) : [];
  let stopped = false; process.on('SIGTERM', () => { stopped = true; }); process.on('SIGINT', () => { stopped = true; });
  while (!stopped) {
    try {
      const { job } = await api('claim');
      if (job) console.log(JSON.stringify(await runJob(job, api, { upstream, adapters })));
      else await sleep(10000);
    } catch (error) { console.error(JSON.stringify({ code: error.code || 'worker_error', message: 'Worker could not claim or process a job' })); await sleep(10000); }
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
