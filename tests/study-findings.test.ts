import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyLaneResult, PolicyStudySummary } from '../lib/policy-study.ts';
import { featuredStudy, studyFindings, studyMetaDescription } from '../lib/study-findings.ts';

function lane(composite: number | null, seconds: number | null, includedStores = 5): PolicyLaneResult {
  const metric = (value: number | null, explanation = 'Synthetic fixture.') => ({ value, explanation });
  return {
    policyResolution: metric(50), quality: metric(70),
    speed: metric(50, seconds === null ? 'Speed score only.' : `Full-answer completion ${seconds} seconds; 100 at 3 seconds, zero at 22 seconds.`),
    composite: metric(composite),
    coverage: { plannedCheckpoints: 0, attemptedCheckpoints: 0, observedCheckpoints: 0, submittedCheckpoints: 0,
      assessedCheckpoints: 0, unassessableCheckpoints: 0, attainedCheckpoints: 0, policyUnverifiedCheckpoints: 0,
      includedContexts: 0, excludedContexts: 0, includedStores, excludedStores: 5 - includedStores,
      qualityEligibleContexts: 0, qualityEligibleStores: 0, originalCaptures: 0, repairedCaptures: 0 },
  };
}

function study(providers: PolicyStudySummary['providers']): PolicyStudySummary {
  return {
    schema: 'alhena-research-lab/policy-study-summary-v1', protocol: 'policy-resolution-v1', slug: 'fixture', title: 'Fixture study',
    description: 'Offline fixture.', publishedAt: '2020-01-04T00:00:00Z', captureStartAt: '2020-01-02T10:00:00Z', captureEndAt: '2020-01-03T10:00:00Z',
    commissionedBy: 'Alhena Research Lab', method: { status: 'final', sha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), differences: [] },
    sample: { plannedCoreContexts: 0, capturedCoreContexts: 0, guardrailContexts: 0, judgedCoreContexts: 0, pcrDecisions: 0, auditedPcrDecisions: 0 },
    providers, limitations: [], audit: { description: '', limitations: [] },
  };
}
const provider = (name: string, shopping: PolicyLaneResult, support: PolicyLaneResult, overall: number | null) =>
  ({ id: name.toLowerCase(), name, website: `https://${name.toLowerCase()}.example/`, registeredStores: 5, shopping, support, overallComposite: { value: overall, explanation: 'Synthetic.' } });

test('findings quote published values in study order with scope and coverage', () => {
  const findings = studyFindings(study([
    provider('Beta', lane(55.8, 17.2, 4), lane(75.8, 14.1, 4), 65.8),
    provider('Alpha', lane(68.4, 11.8), lane(81.4, 8.7), 74.9),
  ]));
  assert.equal(findings[0], 'Shopping composite, out of 100: Beta 55.8, Alpha 68.4.');
  assert.equal(findings[1], 'Support composite, out of 100: Beta 75.8, Alpha 81.4.');
  assert.match(findings[3], /shopping Beta 17\.2 s, Alpha 11\.8 s; support Beta 14\.1 s, Alpha 8\.7 s/);
  assert.match(findings[4], /Beta's results include 4 of 5 storefronts for shopping and 4 of 5 for support/);
  assert.match(findings.at(-1)!, /on-site chat widget across the 10 storefront deployments captured Jan 2–3, 2020\. They do not cover other products either vendor sells/);
});

test('findings omit timing when a duration is unpublished and show ineligible scores plainly', () => {
  const findings = studyFindings(study([provider('Alpha', lane(null, null), lane(80, 9), null)]));
  assert.equal(findings[0], 'Shopping composite, out of 100: Alpha not eligible.');
  assert.ok(!findings.some(f => f.startsWith('Average time')));
  assert.ok(!findings.some(f => f.includes('storefronts for shopping')));
});

test('meta description leads with scores', () => {
  const text = studyMetaDescription(study([provider('Alpha', lane(68.4, 11.8), lane(81.4, 8.7), 74.9), provider('Beta', lane(55.8, 17.2), lane(75.8, 14.1), 65.8)]));
  assert.ok(text.startsWith('Alpha 68.4/81.4 vs Beta 55.8/75.8: '));
  assert.ok(text.length <= 160, `${text.length} characters`);
});

test('the featured study is the newest original study with the most providers, never a derived comparison', () => {
  const pair = { ...study([provider('Alpha', lane(1, 9), lane(1, 9), 1), provider('Beta', lane(1, 9), lane(1, 9), 1)]), slug: 'pair', captureEndAt: '2020-01-03T00:00:00Z' };
  const single = { ...study([provider('Gamma', lane(1, 9), lane(1, 9), 1)]), slug: 'single', captureEndAt: '2020-02-01T00:00:00Z' };
  const derived = { ...study([provider('Alpha', lane(1, 9), lane(1, 9), 1), provider('Gamma', lane(1, 9), lane(1, 9), 1)]), slug: 'derived', captureEndAt: '2020-02-01T00:00:00Z', derivedFrom: [{ slug: 'pair', sha256: 'c'.repeat(64) }] };
  assert.equal(featuredStudy([derived, single, pair])?.slug, 'pair');
  assert.equal(featuredStudy([derived, single])?.slug, 'single');
  assert.equal(featuredStudy([derived]), undefined);
});
