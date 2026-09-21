import { WorkerError } from './protocol.mjs';
import { trustedTransport } from './transport.mjs';

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

export async function claudeStructuredResponse({ instructions, input, schema, model, signal, fetchImpl = fetch }) {
  const { key, endpoint } = claudeServiceConfiguration();
  const response = await trustedTransport(() => fetchImpl(endpoint, {
    method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions, input, schema, model }),
    signal: AbortSignal.any([AbortSignal.timeout(200000), ...(signal ? [signal] : [])]),
  }), { code: 'model_transport_failed', signal });
  if (!response.ok) throw new WorkerError('model_request_failed', `Private judge returned ${response.status}`, response.status === 429 || response.status === 503 || response.status === 504);
  const result = await trustedTransport(() => response.json(), { code: 'model_transport_failed', signal });
  if (!result?.value || result.metadata?.provider !== 'claude-cli' || result.metadata.requested_model !== model || typeof result.metadata.response_id !== 'string') throw new WorkerError('model_incomplete', 'Private judge returned an invalid result');
  return result;
}
