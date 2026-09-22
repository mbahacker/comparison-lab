import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY_PROTOCOL, reconcileCheckpoint, scoreConversation, aggregatePolicyResolution, validateCompleteCohort } from '../benchmark/policy-resolution.mjs';
const reply = 'Please send photos and your order number to the published support address.';
const decision = (status = 'attained', turn = 1) => ({ status, handling: 'required_next_step', evidence: { turn, quote: 'send photos and your order number' }, policyRefs: ['policy-a'], reason: 'Published damage procedure requires these details.' });
const checkpoint = (turn = 1, status = 'attained') => ({ turn, submitted: true, assessable: true, reply, primary: decision(status, turn), audit: decision(status, turn) });
const record = (id, provider = 'Example Tool', store = 'Example Store', mode = 'support', n = 10, wins = n) => ({ id, provider, store, mode, theme: 'damaged', planned: 10, policyIds: ['policy-a'], checkpoints: Array.from({ length: n }, (_, i) => checkpoint(i + 1, i < wins ? 'attained' : 'not_attained')), quality: 90, latencyMs: [9000, 9000, 9000] });

test('nested protocol weights cannot change after fingerprinting', () => {
  assert.throws(() => { POLICY_PROTOCOL.supportWeights.resolution = 1; }, TypeError);
});

test('required policy handoff gets verified credit, independent of provider name', () => {
  assert.equal(reconcileCheckpoint(checkpoint(), ['policy-a']).attained, 1);
  assert.equal(scoreConversation(record('one', 'Tool A')).score, scoreConversation(record('two', 'Tool B')).score);
  const missing = checkpoint(); missing.primary.policyRefs = [];
  assert.throws(() => reconcileCheckpoint(missing, ['policy-a']), /independent policy/);
  const foreign = checkpoint(); foreign.audit.policyRefs = ['another-merchant'];
  assert.throws(() => reconcileCheckpoint(foreign, ['policy-a']), /foreign policy/);
});

test('blind audit disagreement earns no verified credit and stays visible', () => {
  const c = checkpoint(); c.audit = decision('not_attained');
  assert.deepEqual(reconcileCheckpoint(c, ['policy-a']), { turn: 1, status: 'unverified', attained: 0, denominator: 1, disagreement: true });
  c.audit = decision('unassessable');
  assert.equal(reconcileCheckpoint(c, ['policy-a']).denominator, 1);
});

test('unsent and unknown observations cannot be invented as either successes or failures', () => {
  const r = record('partial', 'Tool', 'Store', 'support', 3, 2);
  r.checkpoints.push({ turn: 4, submitted: false, assessable: false });
  r.checkpoints.push({ turn: 5, submitted: true, assessable: false });
  const s = scoreConversation(r);
  assert.equal(s.submitted, 4); assert.equal(s.assessable, 3); assert.equal(s.unassessable, 1);
  assert.equal(s.planned, 10); assert.equal(s.score, 200 / 3);
});

test('fabricated quotes and duplicate turns fail rather than inflate scores', () => {
  const c = checkpoint(); c.primary.evidence.quote = 'The refund has been completed';
  assert.throws(() => reconcileCheckpoint(c, ['policy-a']), /verified response quote/);
  const r = record('duplicate'); r.checkpoints.push(checkpoint(1));
  assert.throws(() => scoreConversation(r), /Duplicate/);
  const wrongTurn = checkpoint(2); wrongTurn.audit.evidence.turn = 1;
  assert.throws(() => reconcileCheckpoint(wrongTurn, ['policy-a']), /current turn/);
});

test('handling-label disagreement is exposed without overriding shared verified attainment', () => {
  const c = checkpoint(); c.audit.handling = 'answered';
  const r = reconcileCheckpoint(c, ['policy-a']);
  assert.equal(r.attained, 1); assert.equal(r.disagreement, true);
});

test('equal conversation then store weighting differs from pooling turns', () => {
  const rows = [record('a', 'Tool', 'Store One', 'support', 1, 1), record('b', 'Tool', 'Store One', 'support', 10, 0), record('c', 'Tool', 'Store Two', 'support', 10, 10)];
  const p = aggregatePolicyResolution(rows).providers[0];
  assert.equal(p.support.resolution, 75);
  assert.equal(p.support.coverage.attainedCheckpoints, 11);
  assert.equal(p.support.coverage.assessableCheckpoints, 21);
  assert.equal(p.support.coverage.verifiedAttainmentOfPlannedPercent, 36.7);
  assert.equal(p.support.composite, null); assert.equal(p.overall, null);
});

test('unconfirmed AI evidence cannot inflate resolution, quality or speed', () => {
  const r = record('faq'); r.exclusion = 'AI capability unconfirmed';
  const p = aggregatePolicyResolution([r]).providers[0];
  assert.equal(p.support.resolution, null); assert.equal(p.support.quality, null); assert.equal(p.support.speed, null);
  assert.equal(p.support.coverage.excludedConversations, 1);
  assert.equal(p.support.coverage.plannedCheckpoints, 10);
});

test('full arbitrary-provider cohort is required for final validation', () => {
  const themes = { shopping: ['everyday-value', 'gift', 'problem-solver', 'compare-budget', 'beginner'], support: ['tracking', 'returns', 'damaged', 'order-mgmt', 'policy'] };
  const rows = [];
  for (const provider of ['Example A', 'Example B', 'Example C']) for (let s = 1; s <= 5; s++) for (const [mode, values] of Object.entries(themes)) for (const theme of values) rows.push({ ...record(`${provider}-${s}-${mode}-${theme}`, provider, `Store ${s}`, mode), theme });
  const plan = rows.map(({ id, provider, store, mode, theme }) => ({ id, provider, store, mode, theme }));
  const result = validateCompleteCohort(rows, plan);
  assert.equal(result.providers.length, 3);
  for (const p of result.providers) { assert.equal(p.support.resolution, 100); assert.equal(p.support.composite, 92.8); assert.equal(p.shopping.composite, 88.6); assert.equal(p.overall, 90.7); }
  assert.throws(() => validateCompleteCohort(rows.slice(1), plan), /Incomplete/);
  assert.throws(() => validateCompleteCohort([...rows.slice(1), rows[1]], plan), /frozen cohort/);
});
