import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_PROTOCOL, PROTOCOL_SHA256, createEvaluationPlan, comparisonCompatibility, validateCohort } from '../benchmark/protocol.mjs';

const executionProfile = { browserBuild: 'fixture-chromium', captureEnvironment: 'fixture-isolated-host', timingProfile: 'fixture-3cpu-2contexts',
  judgeTransport: 'fixture', judgeModel: 'claude-opus-4-8', judgeEffort: 'high', judgeRuntime: 'fixture',
  auditorModel: 'claude-opus-4-8', auditorTransport: 'fixture', auditorEffort: 'high', auditorRuntime: 'fixture',
  judgeSpecSha256: 'a'.repeat(64), auditorSpecSha256: 'b'.repeat(64), timingSourceSha256: 'c'.repeat(64) };
function tool(name, index) {
  return { name, website: `https://tool${index}.example.com`, storefronts: Array.from({ length: 5 }, (_, i) => ({ name: `Customer ${i}`,
    website: `https://store${index}-${i}.example.com`, adapter: 'fixture', deploymentEvidence: 'offline fixture only', deploymentVerified: true, adapterReviewed: true })) };
}
const plan = tools => createEvaluationPlan({ tools, runDate: '2026-09-21', executionProfile });

test('arbitrary companies use the identical complete protocol, without a two-company limit', () => {
  const { plan: one } = plan([tool('Unlisted tool', 1)]);
  assert.equal(one.expectedCoreConversations, 50);
  assert.equal(one.expectedGuardrailConversations, 5);
  assert.equal(one.plannedCoreTurns + one.plannedGuardrailTurns, 515);
  const { plan: four } = plan(['Alhena', 'Gorgias', 'Other tool', 'Another tool'].map(tool));
  assert.equal(four.contexts.length, 220);
  for (const name of four.tools.map(t => t.name)) {
    const contexts = four.contexts.filter(c => c.provider === name);
    assert.equal(contexts.filter(c => c.mode === 'support').length, 25);
    assert.equal(contexts.filter(c => c.mode === 'shopping' && !c.guardrail).length, 25);
    assert.equal(contexts.filter(c => c.guardrail).length, 5);
  }
  assert.equal(new Set(four.contexts.map(c => c.id)).size, 220);
  assert.equal(one.protocolSha256, four.protocolSha256);
  assert.equal(one.comparisonFingerprint, four.comparisonFingerprint);
});

test('aggregation contract rejects omitted or reassigned scenarios even if declared counts look valid', () => {
  const cohort = plan([tool('One tool', 1)]);
  assert.deepEqual(validateCohort(cohort.plan, cohort.roster), { tools: 1, storefronts: 5, contexts: 55 });
  const incomplete = structuredClone(cohort); incomplete.plan.contexts.pop();
  assert.throws(() => validateCohort(incomplete.plan, incomplete.roster), /Every storefront/);
  const altered = structuredClone(cohort); altered.plan.contexts[0].provider = 'Another company';
  assert.throws(() => validateCohort(altered.plan, altered.roster), /roster/);
  const renamed = structuredClone(cohort); renamed.plan.contexts[0].id = 'unrelated-identifier';
  assert.throws(() => validateCohort(renamed.plan, renamed.roster), /roster/);
  const pilot = structuredClone(cohort); pilot.plan.protocol = 'quality-pilot-v1';
  assert.throws(() => validateCohort(pilot.plan, pilot.roster), /protocol/);
});

test('planning rejects an undersized, duplicate, unverified, or changed-judge cohort', () => {
  const small = tool('Small', 1); small.storefronts.pop(); assert.throws(() => plan([small]), /five/);
  assert.throws(() => plan([tool('One', 1), tool('Two', 1)]), /Duplicate tool/);
  const duplicate = tool('Duplicate', 1); duplicate.storefronts[1].website = duplicate.storefronts[0].website;
  assert.throws(() => plan([duplicate]), /Duplicate storefront/);
  const duplicateName = tool('Duplicate name', 1); duplicateName.storefronts[1].name = duplicateName.storefronts[0].name;
  assert.throws(() => plan([duplicateName]), /Duplicate storefront name/);
  assert.throws(() => plan([tool('__proto__', 1)]), /dictionary key/);
  const unverified = tool('Unknown', 1); unverified.storefronts[0].adapterReviewed = false;
  assert.throws(() => plan([unverified]), /review/);
  assert.throws(() => createEvaluationPlan({ tools: [tool('One', 1)], runDate: '2026-09-21', executionProfile: { ...executionProfile, judgeModel: 'other-model' } }), /pinned judge/);
});

test('full methodology and timing configuration cannot be mutated through a caller', () => {
  assert.throws(() => { FULL_PROTOCOL.weights.shopping.quality = 1; });
  assert.throws(() => { FULL_PROTOCOL.themes.support.push('easy-only'); });
  assert.equal(FULL_PROTOCOL.weights.shopping.automation + FULL_PROTOCOL.weights.shopping.quality + FULL_PROTOCOL.weights.shopping.speed, 1);
});

test('reuse preserves original dates, requires the same method and audit, and rejects pilots', () => {
  const fingerprint = plan([tool('One', 1)]).plan.comparisonFingerprint;
  const evaluation = { protocol: FULL_PROTOCOL.id, protocolSha256: PROTOCOL_SHA256, comparisonFingerprint: fingerprint,
    status: 'validated', auditComplete: true, evidenceSealed: true, captureDates: ['2026-09-01T00:00:00Z'] };
  assert.equal(comparisonCompatibility([evaluation, evaluation], '2026-09-21').compatible, true);
  assert.equal(comparisonCompatibility([evaluation, { ...evaluation, protocol: 'quality-pilot-v1' }], '2026-09-21').compatible, false);
  assert.equal(comparisonCompatibility([evaluation, { ...evaluation, auditComplete: false }], '2026-09-21').compatible, false);
  assert.equal(comparisonCompatibility([evaluation, { ...evaluation, captureDates: ['2026-08-01'] }], '2026-09-21').compatible, false);
  assert.equal(comparisonCompatibility([evaluation, { ...evaluation, captureDates: ['2026-09-22'] }], '2026-09-21').compatible, false);
  assert.equal(comparisonCompatibility([evaluation, { ...evaluation, comparisonFingerprint: 'f'.repeat(64) }], '2026-09-21').compatible, false);
});

test('audit prompt or effort changes invalidate cross-tool compatibility', () => {
  const original = plan([tool('One', 1)]).plan;
  for (const changed of [{ auditorEffort: 'low' }, { auditorSpecSha256: 'd'.repeat(64) }, { judgeRuntime: 'different-cli' }]) {
    const next = createEvaluationPlan({ tools: [tool('Two', 2)], runDate: '2026-09-21', executionProfile: { ...executionProfile, ...changed } }).plan;
    assert.notEqual(next.comparisonFingerprint, original.comparisonFingerprint);
  }
});
