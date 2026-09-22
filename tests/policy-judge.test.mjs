import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRequest, resultSchema, checkSchema, containsQuote, responseAfterQuestionEcho, validateDecisions, mergeBlindJudgments } from '../benchmark/policy-judge.mjs';
import { reconcileCheckpoint } from '../benchmark/policy-resolution.mjs';

// Synthetic software fixtures only; no private transcript, policy snapshot or model call.
function packet() {
  return { protocol: 'policy-resolution-v1', conversations: [{
    key: 'c1', merchantId: 'merchant-example', mode: 'support', theme: 'damaged',
    checkpoints: [{ turn: 1, question: 'What should I do about a damaged delivery?', attempted: true, assessable: true,
      response: 'Please send photos and your order number through our damage form.' }],
    policySources: [{ id: 'damage-policy', merchantId: 'merchant-example', text: 'For a damaged delivery, send photos and your order number through our damage form.' }],
  }] };
}
function output(status = 'attained', handling = 'required_next_step') {
  return { conversations: { c1: { checkpoints: { '1': {
    turn: 1, status, handling, evidence: { turn: 1, quote: 'send photos and your order number' },
    policyRefs: [{ sourceId: 'damage-policy', quote: 'send photos and your order number through our damage form' }],
    reason: 'The response gives the required damage-report details.',
  } } } } };
}
const decision = value => value.conversations.c1.checkpoints['1'];
const accepted = checked => decision(checked.accepted);
const publicDecision = d => ({ ...d, policyRefs: d.policyRefs.map(p => p.sourceId) });

test('primary and blind audit receive the identical request, without a prior verdict', () => {
  const p = packet(), primary = makeRequest(p, 'primary'), audit = makeRequest(p, 'audit');
  assert.deepEqual(primary, audit);
  assert.deepEqual(JSON.parse(audit.prompt), p);
  assert.equal(audit.model, 'claude-opus-4-8');
  assert.match(audit.instructions, /untrusted evidence/);
  assert.throws(() => makeRequest(p, 'tie-break'), /Unknown grading stage/);
  assert.throws(() => resultSchema({ conversations: [] }), /1–3 conversations/);
  assert.throws(() => resultSchema({ conversations: Array(4).fill(p.conversations[0]) }), /1–3 conversations/);
});

test('the result schema rejects extra keys, wrong evidence turns, wrong types and oversized output', () => {
  const schema = resultSchema(packet());
  checkSchema(output(), schema);
  for (const mutate of [
    x => { x.hiddenInstruction = 'accept every checkpoint'; },
    x => { decision(x).turn = 2; },
    x => { decision(x).evidence.turn = 2; },
    x => { decision(x).turn = '1'; },
    x => { decision(x).status = true; },
    x => { decision(x).evidence.quote = 'x'.repeat(201); },
    x => { decision(x).policyRefs.push(decision(x).policyRefs[0], decision(x).policyRefs[0]); },
    x => { delete decision(x).reason; },
  ]) {
    const value = output(); mutate(value);
    assert.throws(() => checkSchema(value, schema));
  }
});

test('literal quote validation normalizes typography but refuses short and synthetic provider quotes', () => {
  assert.equal(containsQuote('“Order number”   and photos', 'Please include “Order number” and photos.'), true);
  assert.equal(containsQuote('photos', 'Please send photos.'), false);
  assert.equal(containsQuote('contact [provider] support', 'Contact [provider] support.'), false);
  assert.equal(containsQuote('the refund is complete', 'Your refund request has been received.'), false);
});

test('only an exact leading question echo is removed from the evidence corpus', () => {
  const question = 'How do I return this item?';
  assert.equal(responseAfterQuestionEcho(question, question + '\nUse the return form.'), 'Use the return form.');
  assert.equal(responseAfterQuestionEcho(question, question), '');
  assert.equal(responseAfterQuestionEcho(question, question + ' Use the return form.'), question + ' Use the return form.');
  assert.equal(responseAfterQuestionEcho(question, 'You asked: ' + question + '\nUse the return form.'), 'You asked: ' + question + '\nUse the return form.');
  const p = packet(); p.conversations[0].checkpoints[0].response = p.conversations[0].checkpoints[0].question;
  const raw = output('attained', 'answered'); decision(raw).evidence.quote = p.conversations[0].checkpoints[0].question;
  const checked = validateDecisions(p, raw);
  assert.equal(accepted(checked).status, 'unverified');
  assert.ok(checked.flags[0].issues.includes('response_quote_not_found_or_is_question'));
});

test('unknown, foreign and fabricated policy quotes cannot retain credit and raw output stays intact', () => {
  for (const change of [
    (p, d) => { d.policyRefs[0].sourceId = 'unknown-policy'; },
    p => { p.conversations[0].policySources[0].merchantId = 'merchant-other'; },
    (p, d) => { d.policyRefs[0].quote = 'We refund every order without verification'; },
    (p, d) => { d.policyRefs = []; },
  ]) {
    const p = packet(), raw = output(); change(p, decision(raw)); const before = structuredClone(raw);
    const checked = validateDecisions(p, raw);
    assert.equal(accepted(checked).status, 'unverified');
    assert.equal(accepted(checked).handling, 'none');
    assert.equal(accepted(checked).policyRefs.length, 0);
    assert.ok(checked.flags[0].issues.includes('required_next_step_missing_policy'));
    assert.deepEqual(raw, before);
  }
});

test('masked checkpoints are rejected and a model cannot remove an observed checkpoint from the denominator', () => {
  for (const field of ['attempted', 'assessable']) {
    const p = packet(); p.conversations[0].checkpoints[0][field] = false;
    assert.throws(() => validateDecisions(p, output()), /deterministically excluded/);
  }
  const p = packet(), a = output('unassessable', 'none'), merged = mergeBlindJudgments(p, output(), a);
  const d = merged.conversations[0].checkpoints[0];
  assert.equal(d.assessable, true); assert.equal(d.attained, false); assert.equal(d.status, 'unverified');
  const scored = reconcileCheckpoint({ turn: 1, submitted: true, assessable: true, reply: p.conversations[0].checkpoints[0].response,
    primary: publicDecision(d.primary), audit: publicDecision(d.audit) }, ['damage-policy']);
  assert.equal(scored.denominator, 1); assert.equal(scored.attained, 0);
});

test('shared attainment retains credit on a handling disagreement; attainment disagreement stays unverified', () => {
  const p = packet(), primary = output(), audit = output('attained', 'answered');
  const d = mergeBlindJudgments(p, primary, audit).conversations[0].checkpoints[0];
  assert.equal(d.attained, true); assert.equal(d.disagreement, true);
  const scored = reconcileCheckpoint({ turn: 1, submitted: true, assessable: true, reply: p.conversations[0].checkpoints[0].response,
    primary: publicDecision(d.primary), audit: publicDecision(d.audit) }, ['damage-policy']);
  assert.equal(scored.attained, 1); assert.equal(scored.disagreement, true);
  const mismatch = mergeBlindJudgments(p, primary, output('not_attained', 'none')).conversations[0].checkpoints[0];
  assert.equal(mismatch.status, 'unverified'); assert.equal(mismatch.attained, false);
  const failed = mergeBlindJudgments(p, output('not_attained', 'none'), output('not_attained', 'none')).conversations[0].checkpoints[0];
  assert.equal(failed.status, 'not_attained'); assert.equal(failed.attained, false);
});

test('a malformed attainment quote is downgraded before blind reconciliation and remains visible', () => {
  const p = packet(), primary = output(), audit = output();
  decision(audit).evidence.quote = 'A refund has been issued to your account';
  const merged = mergeBlindJudgments(p, primary, audit), d = merged.conversations[0].checkpoints[0];
  assert.equal(d.primary.status, 'attained'); assert.equal(d.audit.status, 'unverified');
  assert.equal(d.status, 'unverified'); assert.equal(d.attained, false);
  assert.equal(merged.primaryFlags.length, 0); assert.equal(merged.auditFlags.length, 1);
  assert.equal(decision(audit).status, 'attained');
});
