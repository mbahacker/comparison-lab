// A named profile authorizes one fixed bounded execution contract, not arbitrary runtime options.
export const POLICY_EXECUTION = Object.freeze({ executionProfile: 'policy-resolution-v1', effort: 'high', maxOutputTokens: 16384, timeoutMs: 1200000 });
export const POLICY_TRANSPORT_TIMEOUT_MS = 1250000;
export function executionSettings(request = {}) {
  const fields = ['executionProfile', 'effort', 'maxOutputTokens', 'timeoutMs'];
  if (fields.every(key => request[key] === undefined)) return { executionProfile: 'quality-pilot-v1', effort: null, maxOutputTokens: 10000, timeoutMs: 180000, transportTimeoutMs: 200000, explicit: false };
  if (fields.some(key => request[key] !== POLICY_EXECUTION[key])) throw new Error('invalid_execution_profile');
  return { ...POLICY_EXECUTION, transportTimeoutMs: POLICY_TRANSPORT_TIMEOUT_MS, explicit: true };
}
export function executionMetadata(settings) {
  return { execution_profile: settings.executionProfile, effort: settings.effort, max_output_tokens: settings.maxOutputTokens,
    output_token_limit_scope: 'per-model-turn', timeout_ms: settings.timeoutMs };
}
