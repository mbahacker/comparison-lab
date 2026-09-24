import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOPPING_PROTOCOL as p, SHOPPING_PROTOCOL_HASH as hash, digest, scoreShoppingJourney as score, isShoppingMetricCompatible } from '../benchmark/shopping-journey.mjs';
import { assertJob } from '../worker/protocol.mjs';
function fixture() {
  const plan = { protocol: p.id, protocolHash: hash, provider: 'Example', executionProfile: p.executionProfile, registeredAt: '2026-09-20T00:00:00Z', stores: Array.from({ length: 5 }, (_, i) => ({ id: `store${i}`, url: `https://store${i}.example`, tasks: p.outcomes.map(t => ({ id: t.id, scenario: t.request, constraints: 'Size M, blue, under $100', expectedEvidence: t.success, primaryInterface: 'chat', url: `https://store${i}.example/product` })) })) };
  const b = { plan, planHash: digest(plan), evaluatedAt: '2026-09-21T00:00:00Z', artifacts: [], cells: [] };
  for (const store of plan.stores) for (const [kind, definitions] of [['task', p.outcomes], ['surface', p.interfaces]]) for (const def of definitions) {
    const key = `${kind}:${def.id}`;
    const roles = kind === 'task' ? [...new Set(['attribution', ...def.evidenceRoles])] : ['attribution', 'interaction', 'placement'];
    const evidenceRefs = roles.map(role => {
      const id = `${store.id}/${key}/${role}`, content = `TEST FIXTURE ONLY ${id}`;
      b.artifacts.push({ id, content, sha256: digest(content), store: store.id, cell: key, role, url: store.url, capturedAt: role.endsWith('-after') ? '2026-09-20T02:00:00Z' : '2026-09-20T01:00:00Z' }); return id;
    });
    b.cells.push({ store: store.id, key, status: kind === 'task' ? 'observed' : 'usable', interface: 'chat', reason: 'Fixture observation', primary: { reviewer: 'primary', verdict: 'pass', reason: 'Fixture decision', evidenceRefs }, audit: { reviewer: 'audit', blind: true, verdict: 'pass', reason: 'Fixture audit', evidenceRefs } });
  }
  return b;
}
test('separate outcomes and reach; support and combined scores are untouched', () => {
  const result = score(fixture());
  assert.equal(result.outcomeScore, 100); assert.equal(result.reachScore, 100);
  assert.equal(result.observedTasks, 30); assert.equal(result.supportChanged, false);
  assert.equal(result.combinedScore, null); assert.equal(result.publicationStatus, 'requires-evidence-review');
});
test('missing and blocked observations prevent headline scores without denominator inflation', () => {
  const b = fixture(); b.cells = b.cells.filter(c => !(c.store === 'store0' && c.key === 'task:discovery'));
  b.cells.find(c => c.key === 'surface:chat').status = 'blocked';
  const result = score(b);
  assert.equal(result.outcomeScore, null); assert.equal(result.reachScore, null);
  assert.equal(result.verifiedReachLowerBound, 96); assert.equal(result.observedTasks, 29); assert.equal(result.verifiedOutcomeLowerBound, 96.7);
});
test('failed outcomes do not remove usable interfaces or earn outcome credit', () => {
  const b = fixture(); const cell = b.cells.find(c => c.key === 'task:cart-action');
  cell.primary.verdict = cell.audit.verdict = 'fail';
  const result = score(b); assert.equal(result.outcomeScore, 96.7); assert.equal(result.reachScore, 100);
});
test('auditor disagreement cannot earn credit', () => {
  const b = fixture(); b.cells[0].audit.verdict = 'fail';
  b.cells.find(c => c.key === 'surface:chat').audit.verdict = 'fail';
  const result = score(b); assert.equal(result.outcomeScore, 96.7); assert.equal(result.reachScore, null); assert.equal(result.disagreements, 2);
});
test('duplicate widgets and duplicate storefronts cannot inflate reach', () => {
  const b = fixture(); b.cells.push(structuredClone(b.cells.find(c => c.key === 'surface:chat')));
  assert.throws(() => score(b), /Duplicate cell/);
  const c = fixture(); c.plan.stores[1].url = c.plan.stores[0].url; c.planHash = digest(c.plan);
  assert.throws(() => score(c), /Distinct storefront/);
});
test('not observed requires audited discovery-path evidence and counts zero only for sampled reach', () => {
  const b = fixture(); const cell = b.cells.find(c => c.key === 'surface:chat'); cell.status = 'not-observed';
  assert.throws(() => score(b), /discovery path/);
  b.artifacts.find(a => a.id === cell.primary.evidenceRefs[0]).role = 'discovery-path';
  const result = score(b); assert.equal(result.reachScore, 96); assert.equal(result.outcomeScore, 100);
});
for (const role of ['attribution', 'cart-after', 'transition-after']) test(`${role} evidence cannot be replaced by an unsupported claim`, () => {
  const b = fixture(); b.artifacts.find(a => a.role === role).role = 'assistant-claim';
  assert.throws(() => score(b), /attribution|outcome evidence/);
});
test('cart/transition before-and-after cannot be the same state snapshot', () => {
  const b = fixture(); b.artifacts.find(a => a.role === 'cart-after').capturedAt = '2026-09-20T01:00:00Z';
  assert.throws(() => score(b), /chronologically ordered/);
});
test('foreign evidence, tampering, reused pre-registration transcripts, route changes and non-independent audit rejected', () => {
  const mutations = [b => { b.cells[0].audit.evidenceRefs = b.cells[1].audit.evidenceRefs; }, b => { b.artifacts[0].content += ' changed'; }, b => { b.artifacts[0].capturedAt = '2026-09-19T00:00:00Z'; }, b => { b.cells[0].interface = 'search'; }, b => { b.cells[0].audit.reviewer = 'primary'; }];
  for (const mutate of mutations) { const b = fixture(); mutate(b); assert.throws(() => score(b)); }
});
test('version, plan integrity, freshness and profile constrain comparisons', () => {
  const b = fixture(); const a = score(b); assert.equal(isShoppingMetricCompatible(a, a, '2026-09-22'), true);
  assert.equal(isShoppingMetricCompatible(a, a, '2026-10-22'), false);
  for (const change of [{ protocol: 'policy-resolution-v1' }, { protocolHash: 'different' }, { executionProfile: 'mobile' }, { outcomeScore: null }, { outcomeScore: 200 }]) assert.equal(isShoppingMetricCompatible(a, { ...a, ...change }, '2026-09-22'), false);
  b.plan.provider = 'tampered'; assert.throws(() => score(b), /Plan hash/);
  const c = fixture(); c.evaluatedAt = '2026-10-22T00:00:00Z'; assert.throws(() => score(c), /30 days/);
});
test('v2 cannot fall through to the chat-only pilot worker', () => {
  assert.throws(() => assertJob({ id: 'job', leaseToken: 'token', fencingToken: 1, protocol: { id: p.id } }), /Unsupported protocol/);
});

test('summary binds the complete evidence bundle and metric compatibility is specific', () => {
  const b = fixture(), a = score(b); assert.equal(a.sourceEvidenceSha256, digest(b));
  assert.equal(isShoppingMetricCompatible(a, { ...a, reachScore: null }, '2026-09-22', 'reachScore'), false);
  assert.equal(isShoppingMetricCompatible(a, a, '2026-09-22', 'combinedScore'), false);
});
test('hostname identity rejects private hosts and duplicate trailing-dot spelling', () => {
  for (const url of ['https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://store0.example.']) {
    const b = fixture(); b.plan.stores[1].url = url; b.planHash = digest(b.plan); assert.throws(() => score(b), /public storefront|Distinct storefront/);
  }
});
