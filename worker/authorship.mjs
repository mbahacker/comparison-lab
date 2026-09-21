import { WorkerError } from './protocol.mjs';

export const AUTHOR_MARKERS = Object.freeze({
  'data-message-author': ['assistant', 'ai', 'bot'],
  'data-author': ['assistant', 'ai', 'bot'],
  'data-role': ['assistant', 'ai', 'bot'],
  'data-sender-type': ['assistant', 'ai', 'bot'],
  'data-author-type': ['assistant', 'ai', 'bot'],
  'data-message-role': ['assistant', 'ai', 'bot'],
  'data-testid': ['assistant-message', 'ai-message', 'bot-message'],
});
const norm = text => String(text).replace(/\s+/g, ' ').trim();

// A provider fingerprint or a transcript delta is not evidence of who authored a
// message. Every character of the substantive visible reply must belong to the
// positively attributed assistant message nodes. Unknown/mixed authors fail closed.
export function verifyAssistantReply(snapshot, reply, { provider, adapterId, assistantSelector }) {
  const messages = snapshot.author_messages || [];
  if (!snapshot.question_anchor_found || !messages.length) throw new WorkerError('needs_adapter', 'No positive AI message-author evidence');
  if (snapshot.unknown_author_messages > 0) throw new WorkerError('needs_adapter', 'A new message has an unknown or non-AI author');
  const attributed = messages.filter(m => norm(m.text));
  if (!attributed.length) throw new WorkerError('needs_adapter', 'No attributable assistant response text');
  const joined = norm(attributed.map(m => m.text).join('\n'));
  if (joined !== norm(reply)) throw new WorkerError('needs_adapter', 'Visible reply contains text outside positively attributed AI messages');
  const kind = assistantSelector ? 'reviewed-bot-selector' : 'dom-ai-author';
  const markers = assistantSelector ? [{ attribute: 'reviewed-selector', value: assistantSelector }] : attributed.flatMap(m => m.markers);
  if (!markers.length || (!assistantSelector && markers.some(m => !AUTHOR_MARKERS[m.attribute]?.includes(m.value)))) throw new WorkerError('needs_adapter', 'AI marker is not in the explicit author allowlist');
  const uniqueMarkers = [...new Map(markers.map(m => [JSON.stringify(m), m])).values()];
  return { kind, selector: assistantSelector || uniqueMarkers.map(m => `[${m.attribute}="${m.value}" i]`).join(', '),
    provider, adapter_id: adapterId, markers: uniqueMarkers, message_count: attributed.length };
}
