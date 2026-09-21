import { WorkerError } from './protocol.mjs';
import { trustedTransport } from './transport.mjs';
import { claudeServiceConfiguration, claudeStructuredResponse } from './claude-client.mjs';

const PROVIDERS = Object.freeze({
  openai: { keyVariable: 'OPENAI_API_KEY', baseVariable: 'OPENAI_BASE_URL', defaultBase: 'https://api.openai.com/v1/', route: 'responses' },
  anthropic: { keyVariable: 'ANTHROPIC_API_KEY', baseVariable: 'ANTHROPIC_BASE_URL', defaultBase: 'https://api.anthropic.com/v1/', route: 'messages' },
});

export function modelConfiguration({ env = process.env, provider = env.MODEL_PROVIDER, requireExplicit = false } = {}) {
  // Existing programmatic callers used OpenAI before providers were configurable. A deployed
  // worker must choose explicitly; neither path infers a provider from whichever key is present.
  const selected = provider || (requireExplicit ? undefined : 'openai');
  if (selected === 'claude-cli') return claudeServiceConfiguration(env);
  if (!selected || !Object.hasOwn(PROVIDERS, selected)) throw new WorkerError('model_configuration', 'Set MODEL_PROVIDER to openai, anthropic or claude-cli');
  const spec = PROVIDERS[selected];
  const key = env[spec.keyVariable]?.trim();
  if (!key) throw new WorkerError('model_configuration', `${spec.keyVariable} is required for MODEL_PROVIDER=${selected}`);
  let base;
  try { base = new URL(env[spec.baseVariable] || spec.defaultBase); }
  catch { throw new WorkerError('model_configuration', `${spec.baseVariable} must be a valid HTTPS API URL`); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new WorkerError('model_configuration', 'Model endpoint must use HTTPS without URL credentials, query parameters or fragments');
  return { provider: selected, key, endpoint: new URL(`${base.href.replace(/\/$/, '')}/${spec.route}`) };
}

export function validateModelStartup(env = process.env) {
  const configuration = modelConfiguration({ env, requireExplicit: true });
  if (!env.JUDGE_MODEL?.trim() || !env.AUDITOR_MODEL?.trim()) throw new WorkerError('model_configuration', 'Set explicit JUDGE_MODEL and AUDITOR_MODEL IDs supported by the selected provider');
  // Return no credential values from readiness/configuration checks.
  return { provider: configuration.provider, judgeModel: env.JUDGE_MODEL, auditorModel: env.AUDITOR_MODEL };
}

export async function providerStructuredResponse({ instructions, input, schema, model, provider, signal, fetchImpl = fetch }) {
  const configuration = modelConfiguration({ provider: provider ?? process.env.MODEL_PROVIDER });
  if (typeof model !== 'string' || !model.trim()) throw new WorkerError('model_configuration', 'An explicit evaluator model ID is required');
  if (configuration.provider === 'claude-cli') return claudeStructuredResponse({ instructions, input, schema, model, signal, fetchImpl });
  const isAnthropic = configuration.provider === 'anthropic';
  const headers = isAnthropic
    ? { 'x-api-key': configuration.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${configuration.key}`, 'Content-Type': 'application/json' };
  const payload = isAnthropic
    ? { model, max_tokens: 10000, system: instructions, messages: [{ role: 'user', content: JSON.stringify(input) }], output_config: { format: { type: 'json_schema', schema } } }
    : { model, store: false, instructions, input: JSON.stringify(input), max_output_tokens: 10000, text: { format: { type: 'json_schema', name: 'criterion_verdict', strict: true, schema } } };
  const response = await trustedTransport(() => fetchImpl(configuration.endpoint, {
    method: 'POST', redirect: 'error', headers,
    signal: AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
    body: JSON.stringify(payload),
  }), { code: 'model_transport_failed', signal });
  if (!response.ok) throw new WorkerError('model_request_failed', `Model endpoint returned ${response.status}`, response.status === 429 || response.status >= 500);
  const result = await trustedTransport(() => response.json(), { code: 'model_transport_failed', signal });
  let blocks;
  if (isAnthropic) {
    if (result?.stop_reason !== 'end_turn' || !Array.isArray(result.content) || result.content.some(block => ['refusal', 'tool_use', 'server_tool_use'].includes(block?.type))) throw new WorkerError('model_incomplete', 'Judge response was incomplete or refused');
    blocks = result.content.filter(block => block?.type === 'text');
  } else {
    if (result?.status !== 'completed' || !Array.isArray(result.output)) throw new WorkerError('model_incomplete', 'Judge response was incomplete or refused');
    const content = result.output.flatMap(output => Array.isArray(output?.content) ? output.content : []);
    if (content.some(block => block?.type === 'refusal')) throw new WorkerError('model_incomplete', 'Judge response was incomplete or refused');
    blocks = content.filter(block => block?.type === 'output_text');
  }
  if (!blocks.length || blocks.some(block => typeof block.text !== 'string')) throw new WorkerError('model_incomplete', 'No bounded structured judge result');
  const text = blocks.map(block => block.text).join('');
  if (!text || text.length > 200000) throw new WorkerError('model_incomplete', 'No bounded structured judge result');
  let value;
  try { value = JSON.parse(text); } catch { throw new WorkerError('invalid_verdict', 'Judge returned invalid JSON'); }
  return { value, metadata: { provider: configuration.provider, model: result.model || model, requested_model: model, response_id: result.id, usage: result.usage, created_at: new Date().toISOString() } };
}
