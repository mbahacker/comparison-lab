import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStopReason } from '../worker/capture.mjs';
import { recoverRetainedHandover } from '../worker/capture-handover-recovery.mjs';
import { sha256 } from '../worker/upstream.mjs';

const planned = { id: 'offline-handover', merchantId: 'offline-store', questions: Array.from({ length: 10 }, (_, i) => `Offline question ${i + 1}`) };
function fixture() {
  // Offline fixture exercising the deployed, reviewed selector; no storefront is visited.
  const proof = { kind: 'reviewed-bot-selector', provider: 'Sierra', adapter_id: 'sierra-gap-contact-v1', selector: 'li.role-assistant', markers: [{ attribute: 'reviewed-selector', value: 'li.role-assistant' }], message_count: 1 };
  return { id: planned.id, vendor: 'Sierra', url: 'https://www.gap.com/', capture_metadata: { adapter: 'sierra-gap-contact-v1', provider_attribution: { verified: true } },
    stop_reason: { code: 'needs_adapter', message: 'Visible reply contains text outside positively attributed AI messages' },
    turns: Array.from({ length: 4 }, (_, i) => ({ turn: i + 1, question: planned.questions[i], reply: i === 3 ? "I'll connect you with Customer Service for further assistance." : 'Offline attributed AI answer.',
      speaker: 'ai', author_verified: true, author_evidence: proof, response_complete: i < 3, unsent: false, complete_ms: i < 3 ? 1000 : null,
      completed_at: i < 3 ? '2026-09-22T19:00:01.000Z' : null, sent_at: '2026-09-22T19:00:00.000Z',
      ...(i === 3 ? { submission_confirmed: true, observed_reply_ambiguous: false,
        observed_reply_text: "I'll connect you with Customer Service for further assistance.\n\nWaiting for agent…\nEnd chat" } : {}) })) };
}

test('known waiting-for-agent UI terminates capture without treating it as AI text', () => {
  const text = 'AI reply\n\nWaiting for agent…\nEnd chat';
  const snapshot = { question_anchor_found: true, unknown_author_messages: 0, author_messages: [{ text: 'AI reply' }] };
  assert.equal(captureStopReason(text, snapshot), 'human_handover');
  assert.equal(captureStopReason(text), null);
  assert.equal(captureStopReason('Waiting for agent…'), null);
  assert.equal(captureStopReason(text, { ...snapshot, author_messages: [{ text }] }), null);
  assert.equal(captureStopReason(text, { ...snapshot, unknown_author_messages: 1 }), null);
  assert.equal(captureStopReason('A human agent has joined\n' + 'x'.repeat(4001)), null);
  assert.equal(captureStopReason('Verify you are human\n' + 'x'.repeat(4001)), null);
  assert.equal(captureStopReason('You can avoid waiting for agent assistance by using this guide.'), null);
  assert.equal(captureStopReason('Waiting for product information'), null);
});

test('retained handover preserves observed turns, source hash, and incomplete timing', () => {
  const input = fixture(); const original = JSON.stringify(input);
  const recovered = recoverRetainedHandover(Buffer.from(original), planned);
  assert.deepEqual(input, JSON.parse(original));
  assert.equal(recovered.capture_metadata.recovery.originalCaptureSha256, sha256(Buffer.from(original)));
  assert.equal(recovered.stop_reason.code, 'human_handover');
  assert.equal(recovered.turns.filter(turn => turn.submitted).length, 4);
  assert.equal(recovered.turns.filter(turn => turn.response_complete).length, 3);
  assert.equal(recovered.turns.filter(turn => turn.unsent).length, 6);
  assert.equal(recovered.turns[3].handover, true);
  assert.equal(recovered.turns[3].assessable, true);
  assert.equal(recovered.turns[3].complete_ms, null);
  assert.equal(recovered.turns[3].completed_at, null);
  assert.equal(recovered.turns[3].response_complete, false);
  assert.equal(recovered.turns[3].reply, input.turns[3].reply);
  assert.equal(recovered.turns[3].observed_reply_text, input.turns[3].observed_reply_text);
  const unhashed = structuredClone(recovered); delete unhashed.source_capture_sha256;
  assert.equal(recovered.source_capture_sha256, sha256(JSON.stringify(unhashed)));
});

test('recovery rejects mixed/unknown text, unconfirmed sends, altered questions and other errors', () => {
  const mutations = [
    c => { c.turns[3].observed_reply_text += '\nA human provided an answer.'; },
    c => { c.turns[3].observed_reply_text = c.turns[3].reply + '\nUnrecognized system notice'; },
    c => { c.turns[3].observed_reply_ambiguous = true; },
    c => { c.turns[3].submission_confirmed = false; },
    c => { c.turns[3].author_verified = false; },
    c => { c.turns[3].author_evidence = { provider: 'Someone else' }; },
    c => { delete c.turns[3].author_evidence.kind; },
    c => { delete c.turns[3].author_evidence.selector; },
    c => { delete c.turns[3].author_evidence.markers; },
    c => { delete c.turns[3].author_evidence.message_count; },
    c => { c.turns[3].author_evidence.selector = '.unreviewed'; },
    c => { c.turns[3].question = 'A different question'; },
    c => { c.turns[3].complete_ms = 120000; },
    c => { c.stop_reason.code = 'capture_error'; },
  ];
  for (const mutate of mutations) { const input = fixture(); mutate(input); assert.throws(() => recoverRetainedHandover(JSON.stringify(input), planned), /does not prove/); }
});
