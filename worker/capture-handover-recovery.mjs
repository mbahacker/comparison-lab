import { finalizePolicyCapture } from './capture.mjs';
import { sha256 } from './upstream.mjs';
import reviewedAdapters from './adapters.json' with { type: 'json' };
import { publicHost } from './provider-fingerprint.mjs';

// Reconcile only the retained, positively attributed AI reply followed by this
// observed handoff UI. Do not discard arbitrary text or infer response timing.
export function recoverRetainedHandover(originalBytes, planned) {
  const capture = JSON.parse(originalBytes.toString());
  const turns = capture.turns;
  const last = turns?.at(-1);
  const invalid = () => { throw Error('Retained capture does not prove the reviewed handover boundary'); };
  if (capture.id !== planned.id || capture.stop_reason?.code !== 'needs_adapter' ||
      capture.stop_reason?.message !== 'Visible reply contains text outside positively attributed AI messages' ||
      !capture.capture_metadata?.provider_attribution?.verified || !Array.isArray(turns) || !turns.length || turns.length > planned.questions.length) invalid();
  const adapter = reviewedAdapters.find(value => value.id === capture.capture_metadata.adapter && value.vendor === capture.vendor && publicHost('https://' + value.hostname) === publicHost(capture.url));
  if (!adapter?.assistantMessages) invalid();
  if (turns.some((turn, index) => turn.turn !== index + 1 || turn.question !== planned.questions[index] || turn.unsent !== false || !turn.author_verified || turn.speaker !== 'ai' ||
      turn.author_evidence?.provider !== capture.vendor || turn.author_evidence?.adapter_id !== capture.capture_metadata.adapter ||
      turn.author_evidence.kind !== 'reviewed-bot-selector' || turn.author_evidence.selector !== adapter.assistantMessages ||
      !Number.isInteger(turn.author_evidence.message_count) || turn.author_evidence.message_count < 1 || !Array.isArray(turn.author_evidence.markers) || !turn.author_evidence.markers.length ||
      turn.author_evidence.markers.some(marker => marker.attribute !== 'reviewed-selector' || marker.value !== adapter.assistantMessages))) invalid();
  if (turns.slice(0, -1).some(turn => turn.response_complete !== true) || last.response_complete !== false || last.complete_ms !== null ||
      last.completed_at !== null || last.submission_confirmed !== true || last.observed_reply_ambiguous !== false || !last.reply?.trim()) invalid();
  const observed = last.observed_reply_text;
  if (typeof observed !== 'string' || !observed.startsWith(last.reply) ||
      !/^\s*Waiting for (?:an? )?agent[.…]*\s*\n\s*End chat\s*$/i.test(observed.slice(last.reply.length))) invalid();
  const originalCaptureSha256 = sha256(originalBytes);
  capture.capture_metadata.recovery = { version: 'retained-handover-v1', originalCaptureSha256,
    reason: 'Known handoff queue and End chat controls followed the positively attributed AI reply; no new conversation or timing observation.' };
  last.handover = true;
  finalizePolicyCapture(capture, planned, 'human_handover');
  delete capture.source_capture_sha256;
  capture.source_capture_sha256 = sha256(JSON.stringify(capture));
  return capture;
}
