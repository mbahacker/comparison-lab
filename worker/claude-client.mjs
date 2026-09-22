import { WorkerError } from './protocol.mjs';
import { trustedTransport } from './transport.mjs';
import { request as httpRequest } from 'node:http';
import { executionSettings, executionMetadata } from './execution-profile.mjs';

export function claudeServiceConfiguration(env = process.env) {
  const key = env.JUDGE_SERVICE_SECRET || '';
  if (key.length < 32) throw new WorkerError('model_configuration', 'JUDGE_SERVICE_SECRET must contain at least 32 characters');
  let endpoint;
  try { endpoint = new URL(env.JUDGE_SERVICE_URL || 'http://judge:3101/judge'); }
  catch { throw new WorkerError('model_configuration', 'Invalid private judge service URL'); }
  // Fixed Docker service name: this credential must never follow a public URL or redirect.
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== 'judge' || endpoint.port !== '3101' || endpoint.pathname !== '/judge' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new WorkerError('model_configuration', 'Claude judge URL must be http://judge:3101/judge');
  return { provider: 'claude-cli', key, endpoint };
}

// Native HTTP avoids fetch's independent response-header deadline during the explicit
// 20-minute profile. The caller supplies only the validated fixed private service URL.
export function judgeServiceFetch(endpoint, options, { requestImpl = httpRequest } = {}) {
  return new Promise((resolve, reject) => {
    const request = requestImpl(endpoint, { method: options.method, headers: options.headers, signal: options.signal }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 500000) { reject(new WorkerError('model_incomplete', 'Private judge response exceeded its byte limit')); response.destroy(); }
        else chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        const status = response.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      });
      response.on('error', error => reject(options.signal?.aborted ? options.signal.reason : error));
      response.on('aborted', () => reject(options.signal?.aborted ? options.signal.reason : Object.assign(new Error('Private judge response interrupted'), { code: 'ECONNRESET' })));
    });
    request.on('error', error => reject(options.signal?.aborted ? options.signal.reason : error));
    request.end(options.body);
  });
}

export async function claudeStructuredResponse({ instructions, input, schema, model, executionProfile, effort, maxOutputTokens, timeoutMs, signal, fetchImpl }) {
  const { key, endpoint } = claudeServiceConfiguration();
  let settings;
  try { settings = executionSettings({ executionProfile, effort, maxOutputTokens, timeoutMs }); }
  catch { throw new WorkerError('model_configuration', 'Unsupported judge execution profile or limits'); }
  if (settings.explicit && model !== 'claude-opus-4-8') throw new WorkerError('model_configuration', 'Policy-resolution execution requires its fixed model');
  const call = fetchImpl || (settings.explicit ? judgeServiceFetch : fetch);
  const execution = settings.explicit ? { executionProfile, effort, maxOutputTokens, timeoutMs } : {};
  const response = await trustedTransport(() => call(endpoint, {
    method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions, input, schema, model, ...execution }),
    signal: AbortSignal.any([AbortSignal.timeout(settings.transportTimeoutMs), ...(signal ? [signal] : [])]),
  }), { code: 'model_transport_failed', signal });
  if (!response.ok) throw new WorkerError('model_request_failed', `Private judge returned ${response.status}`, response.status === 429 || response.status === 503 || response.status === 504);
  const result = await trustedTransport(() => response.json(), { code: 'model_transport_failed', signal });
  if (!result?.value || result.metadata?.provider !== 'claude-cli' || result.metadata.requested_model !== model || typeof result.metadata.response_id !== 'string') throw new WorkerError('model_incomplete', 'Private judge returned an invalid result');
  if (settings.explicit && (result.metadata.model !== model || Object.entries(executionMetadata(settings)).some(([key, value]) => result.metadata[key] !== value))) throw new WorkerError('model_incomplete', 'Private judge execution metadata disagrees with the requested profile');
  return result;
}
