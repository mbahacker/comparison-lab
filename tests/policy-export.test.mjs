import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPolicyStudy } from '../benchmark/policy-export.mjs';

const h = 'a'.repeat(64);
const themes = { shopping: ['everyday-value', 'gift', 'problem-solver', 'compare-budget', 'beginner'], support: ['tracking', 'returns', 'damaged', 'order-mgmt', 'policy'] };
function repairSelection(record) {
  return { selectionRule: 'Fixture recorder-cause selection, not a live study.', candidates: [{
    id: record.id, provider: record.provider, store: record.store, mode: record.mode, theme: record.theme,
    reason: 'Fixture stop caused by classifier text.', originalRawSha256: record.originalRawSha256,
    newRawSha256: record.rawSha256, originalCapturedAt: record.capturedAt,
    originalFlaggedStop: { turn: 1, question: record.checkpoints[0].question, reply: 'Original observed fixture reply.', sourceActorLabel: 'human', handoverHit: 'fixture match' },
    privatePath: 'DO NOT PROJECT',
  }] };
}
function fixture() {
  const records = [];
  for (const provider of ['Vendor A', 'Vendor B']) for (let store = 1; store <= 5; store++) for (const [mode, ts] of Object.entries(themes)) for (const theme of ts) {
    records.push({ id: `${provider}-${store}-${mode}-${theme}`, provider, store: `${provider} store ${store}`, merchantId: `${provider}-merchant-${store}`, mode, theme,
      planned: 10, capturedAt: '2026-09-21T12:00:00Z', rawSha256: h, originalRawSha256: h, policyIds: [`${provider}-policy-${store}`], correctedCapture: false,
      quality: 100, qualityEvidence: { total: 100, checks: { example: { pass: true, evidence: 'Observable answer.' } }, provenance: 'retained-original-quality', auditCoverage: 'Historical audit', secret: 'DO NOT PROJECT' },
      latencyMs: Array(10).fill(3000), checkpoints: Array.from({ length: 10 }, (_, i) => {
        const d = { status: 'attained', handling: 'answered', evidence: { turn: i + 1, quote: 'Observable answer.' }, policyRefs: [], reason: 'Answers the request.' };
        return { turn: i + 1, submitted: true, assessable: true, observationState: 'submitted', question: 'Question?', reply: 'Observable answer.', completeMs: 3000, primary: d, audit: structuredClone(d) };
      }),
    });
  }
  return { records, expectedContexts: records.map(({ id, provider, store, mode, theme }) => ({ id, provider, store, mode, theme })),
    providers: [{ id: 'vendor-a', name: 'Vendor A', website: 'https://a.example' }, { id: 'vendor-b', name: 'Vendor B', website: 'https://b.example' }],
    sources: ['Vendor A','Vendor B'].flatMap(provider=>Array.from({length:5},(_,i)=>({ id: `${provider}-policy-${i+1}`, merchantId: `${provider}-merchant-${i+1}`, merchant: `${provider} store ${i+1}`, url: 'https://merchant.example/returns', retrievedAt: '2026-09-21T12:00:00Z', sha256: h, text: 'DO NOT PROJECT' }))), guardrails: [],
    slug: 'software-test-fixture', title: 'Software fixture, not observed results', description: '', preparedAt: '2026-09-21T13:00:00Z', methodSha256: h, sourceCommit: 'a'.repeat(40),
    provenance: Object.fromEntries(['sourceStudySha256', 'studySpecSha256', 'originalScoresSha256', 'repairPlanSha256', 'repairRawManifestSha256', 'pcrCompletionSha256', 'qualityCompletionSha256', 'originalQualityReuseSha256'].map(k => [k, h])),
  };
}

test('complete cohort projects deterministic results and explicitly separates public fields', () => {
  const input = fixture(); input.provenance.secret = 'DO NOT PROJECT';
  const { summary, evidence, reviewState } = projectPolicyStudy(input);
  assert.equal(summary.sample.plannedCoreContexts, 100);
  assert.equal(summary.sample.pcrDecisions, 1000);
  assert.equal(summary.sample.auditedPcrDecisions, 1000);
  assert.equal(summary.providers[0].overallComposite.value, 100);
  assert.equal(evidence.storefrontResults.length, 20);
  assert.equal(evidence.conversations.length, 100);
  assert.equal(JSON.stringify({ summary, evidence }).includes('DO NOT PROJECT'), false);
  assert.match(reviewState, /Unpublished/);
  assert.ok(summary.limitations.some(x => x.includes('after reviewing')));
  assert.ok(summary.method.differences.includes('Cause-selected capture repairs retained: 0. The source study remains unchanged.'));
});

test('repair disclosure reflects actual cohort and optional execution-amendment provenance is hash-only', () => {
  const input = fixture();
  input.records[0].correctedCapture = true;
  input.records[0].qualityEvidence.provenance = 'fresh-repair-quality';
  input.repairSelections = repairSelection(input.records[0]);
  input.provenance.schedulingAmendmentSha256 = 'b'.repeat(64);
  const { summary, evidence } = projectPolicyStudy(input);
  assert.ok(summary.method.differences.includes('Cause-selected capture repairs retained: 1. The source study remains unchanged.'));
  assert.equal(evidence.provenance.schedulingAmendmentSha256, 'b'.repeat(64));
  assert.equal(evidence.repairSelections.candidates.length, 1);
  assert.ok(!JSON.stringify(evidence).includes('DO NOT PROJECT'));
  input.provenance.schedulingAmendmentSha256 = 'private-path-or-key';
  assert.throws(() => projectPolicyStudy(input), /content hash/);
});

test('repair selection cannot be missing, duplicated or rebound to a different source', () => {
  const input = fixture(); input.records[0].correctedCapture = true;
  input.records[0].qualityEvidence.provenance = 'fresh-repair-quality';
  assert.throws(() => projectPolicyStudy(input), /repair selection evidence/);
  input.repairSelections = repairSelection(input.records[0]);
  input.repairSelections.candidates[0].newRawSha256 = 'b'.repeat(64);
  assert.throws(() => projectPolicyStudy(input), /source mismatch/);
  input.repairSelections = repairSelection(input.records[0]);
  input.repairSelections.candidates[0].id = 'not-the-repaired-record';
  assert.throws(() => projectPolicyStudy(input), /identity mismatch/);
});

test('unknown, unsent and excluded observations remain visible with distinct denominators', () => {
  const input = fixture(), c = input.records[0];
  Object.assign(c.checkpoints[0], { submitted: true, assessable: false, observationState: 'unknown', primary: null, audit: null });
  Object.assign(c.checkpoints[1], { submitted: false, assessable: false, observationState: 'not_submitted', primary: null, audit: null });
  const excluded = input.records[1]; excluded.exclusion = 'unconfirmed actor'; excluded.quality = null; excluded.qualityEvidence = null; excluded.latencyMs = [];
  for (const t of excluded.checkpoints) Object.assign(t, { assessable: false, primary: null, audit: null });
  const { summary, evidence } = projectPolicyStudy(input), coverage = summary.providers[0].shopping.coverage;
  assert.equal(coverage.plannedCheckpoints, 250);
  assert.equal(coverage.submittedCheckpoints, 249);
  assert.equal(coverage.assessedCheckpoints, 238);
  assert.equal(coverage.unassessableCheckpoints, 11);
  assert.equal(coverage.excludedContexts, 1);
  assert.equal(evidence.conversations[0].turns[0].unsent, false);
  assert.equal(evidence.conversations[0].turns[0].observationState, 'unknown');
  assert.equal(evidence.conversations[0].turns[1].unsent, true);
});

test('missing audit, missing planned checkpoint and old repair quality fail closed', () => {
  let input = fixture(); input.records[0].checkpoints[0].audit = null;
  assert.throws(() => projectPolicyStudy(input), /Invalid resolution decision/);
  input = fixture(); input.records[0].checkpoints.pop();
  assert.throws(() => projectPolicyStudy(input), /ten planned/);
  input = fixture(); input.records[0].correctedCapture = true;
  assert.throws(() => projectPolicyStudy(input), /cannot reuse/);
});

test('merchant identities constrain allowed policies and both decisions, including otherwise valid required-next-step credit', () => {
  let input = fixture(), r = input.records[0];
  r.policyIds = ['Vendor B-policy-1'];
  assert.throws(() => projectPolicyStudy(input), /Foreign merchant/);
  input = fixture(); r = input.records[0];
  for (const d of [r.checkpoints[0].primary, r.checkpoints[0].audit]) { d.handling='required_next_step';d.policyRefs=[{sourceId:'Vendor B-policy-1',quote:'Not exported policy text'}]; }
  assert.throws(() => projectPolicyStudy(input), /foreign merchant/);
  input = fixture(); delete input.sources[0].merchantId;
  assert.throws(() => projectPolicyStudy(input), /merchant identity/);
});

test('unknown observations cannot be assessed and a submitted state needs an actual recorded attempt', () => {
  let input=fixture(); input.records[0].checkpoints[0].observationState='unknown';
  assert.throws(()=>projectPolicyStudy(input),/observation mask/);
  input=fixture();input.records[0].checkpoints[0].submitted=false;input.records[0].checkpoints[0].assessable=false;
  assert.throws(()=>projectPolicyStudy(input),/observation mask/);
});

test('quality criterion projection strips private fields and rejects nested provenance or criterion values', () => {
  let input=fixture();input.records[0].qualityEvidence.criteria={example:{pass:true,evidence:'Observable answer.',weight:5,signalGate:null,signalSatisfied:true,awardedPoints:5,privateRuntime:{secret:'DO NOT PROJECT'},intent:'DO NOT PROJECT'}};
  let output=projectPolicyStudy(input);assert.ok(!JSON.stringify(output).includes('DO NOT PROJECT'));assert.deepEqual(output.evidence.conversations[0].quality.criteria.example,{pass:true,evidence:'Observable answer.',weight:5,signalGate:null,signalSatisfied:true,awardedPoints:5});
  input.records[0].qualityEvidence.provenance={runtime:'DO NOT PROJECT'};assert.throws(()=>projectPolicyStudy(input),/sanitized strings/);
  input=fixture();input.records[0].qualityEvidence.auditCoverage={metadata:'DO NOT PROJECT'};assert.throws(()=>projectPolicyStudy(input),/sanitized strings/);
  input=fixture();input.records[0].qualityEvidence.criteria={example:{evidence:{secret:'DO NOT PROJECT'}}};assert.throws(()=>projectPolicyStudy(input),/criterion field/);
});

test('display-only link redaction preserves frozen score calculation and immutable raw evidence', () => {
  const input = fixture();
  const original = projectPolicyStudy(input);
  const capability = 'https://merchant.example/cart/c/opaque-fixture?key=fictional-secret';
  const turn = input.records[0].checkpoints[0];
  turn.reply = capability;
  turn.primary.evidence.quote = capability;
  turn.audit.evidence.quote = capability;
  input.records[0].qualityEvidence.checks.example.evidence = capability;
  const output = projectPolicyStudy(input);
  assert.deepEqual(output.aggregation, original.aggregation);
  assert.equal(turn.reply, capability);
  assert.ok(!JSON.stringify(output).includes('fictional-secret'));
  assert.ok(!JSON.stringify(output).includes('opaque-fixture'));
  assert.equal(output.evidence.privacyRedactions.length, 4);
  assert.match(output.summary.limitations.at(-1), /do not change scores/);
});
