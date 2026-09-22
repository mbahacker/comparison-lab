// Shared wire allowlist. Never retain free-form CLI output, error messages, or
// unknown response properties as a diagnostic or as permission to repeat a call.
const STATUSES = Object.freeze({
  unauthorized: 401, not_found: 404, judge_busy: 429, json_required: 415,
  invalid_request: 400, invalid_json: 400, request_too_large: 413,
  invalid_execution_profile: 400, judge_auth_missing: 503, cli_spawn_failed: 503,
  invalid_cli_json: 422, incomplete_cli_result: 422, invalid_structured_output: 422,
  ambiguous_cli_model: 422, unexpected_cli_model: 422, invalid_cli_result: 422,
  cli_failed: 422, cli_output_limit: 422,
  judge_timeout: 504, judge_cancelled: 499, judge_failed: 500,
});
const UNKNOWN_OUTCOMES = new Set(['judge_timeout', 'judge_cancelled', 'judge_failed']);

export function judgeDiagnostic(status, body) {
  const code = body?.error;
  return typeof code === 'string' && Object.hasOwn(STATUSES, code) && STATUSES[code] === status
    ? { status, code } : null;
}

export function validJudgeDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'code,status') return null;
  return judgeDiagnostic(value.status, { error: value.code });
}

// A result explicitly rejected by the private service is not an accepted verdict.
// This does not assert that no model work occurred. Timeout/cancel/unknown failures
// remain ambiguous even when the HTTP error was received in full.
export function definitiveJudgeRejection(value) {
  const diagnostic = validJudgeDiagnostic(value);
  return !!diagnostic && !UNKNOWN_OUTCOMES.has(diagnostic.code);
}
