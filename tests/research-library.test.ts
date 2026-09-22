import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyStudySummary, PolicyLaneResult } from '../lib/policy-study.ts';
import { projectResearchTools, researchToolDescription, researchToolStructuredData } from '../lib/research-library.ts';
import { toolId } from '../lib/server/reuse.ts';

function fixture(slug: string, captured: string, published: string, website = 'https://example.com/'): PolicyStudySummary {
  const metric = (value: number) => ({ value, explanation: 'Synthetic software fixture, not actual research.' });
  const lane = (): PolicyLaneResult => ({
    policyResolution: metric(40), quality: metric(70), speed: metric(50), composite: metric(53),
    coverage: { plannedCheckpoints: 250, attemptedCheckpoints: 240, observedCheckpoints: 235, submittedCheckpoints: 238,
      assessedCheckpoints: 230, unassessableCheckpoints: 8, attainedCheckpoints: 90, policyUnverifiedCheckpoints: 20,
      includedContexts: 24, excludedContexts: 1, includedStores: 4, excludedStores: 1,
      qualityEligibleContexts: 22, qualityEligibleStores: 4, originalCaptures: 23, repairedCaptures: 2 },
  });
  return {
    schema: 'alhena-research-lab/policy-study-summary-v1', protocol: 'policy-resolution-v1', slug, title: `Study ${slug}`,
    description: 'Offline test fixture.', publishedAt: published, captureStartAt: '2020-01-01T00:00:00Z', captureEndAt: captured,
    commissionedBy: 'Alhena Research Lab', method: { status: 'final', sha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), differences: ['Synthetic.'] },
    sample: { plannedCoreContexts: 50, capturedCoreContexts: 50, guardrailContexts: 5, judgedCoreContexts: 48, pcrDecisions: 460, auditedPcrDecisions: 460 },
    providers: [{ id: 'source-provider-label', name: 'Example', website, registeredStores: 5, shopping: lane(), support: lane(), overallComposite: metric(53) }],
    limitations: ['Selected sample.'], audit: { description: 'Fixture audit.', limitations: ['No live calls.'] },
  };
}

test('latest selection uses normalized website identity and capture time before publication time', () => {
  const older = fixture('republished-old', '2020-01-02T00:00:00Z', '2020-02-01T00:00:00Z', 'https://www.example.com/');
  const latest = fixture('latest-capture', '2020-01-03T00:00:00Z', '2020-01-04T00:00:00Z');
  latest.providers[0].shopping.quality.value = 61;
  latest.providers[0].support.quality.value = 62;
  const result = projectResearchTools([older, latest], toolId);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, toolId('https://www.example.com/'));
  assert.equal(result[0].studySlug, 'latest-capture');
  assert.deepEqual([result[0].shopping.quality.value, result[0].support.quality.value], [61, 62]);
  assert.equal(result[0].captureEndAt, latest.captureEndAt);
});

test('ties use actual timestamp instants, publication and deterministic slug independent of input order', () => {
  const a = fixture('a-study', '2020-01-02T01:00:00+01:00', '2020-01-03T00:00:00Z');
  const b = fixture('b-study', '2020-01-02T00:00:00Z', '2020-01-04T00:00:00Z');
  assert.equal(projectResearchTools([a, b], toolId)[0].studySlug, 'b-study');
  a.publishedAt = b.publishedAt;
  assert.deepEqual(projectResearchTools([a, b], toolId), projectResearchTools([b, a], toolId));
  assert.equal(projectResearchTools([b, a], toolId)[0].studySlug, 'a-study');
});

test('newest nulls remain null without mixing lanes or falling back to earlier favorable scores', () => {
  const old = fixture('old', '2020-01-02T00:00:00Z', '2020-01-03T00:00:00Z');
  const latest = fixture('new', '2020-01-04T00:00:00Z', '2020-01-05T00:00:00Z');
  latest.providers[0].support.quality.value = null;
  latest.providers[0].support.composite.value = null;
  latest.providers[0].overallComposite.value = null;
  const [tool] = projectResearchTools([old, latest], toolId);
  assert.equal(tool.support.quality.value, null);
  assert.equal(tool.support.composite.value, null);
  assert.equal(tool.overallComposite.value, null);
  assert.match(researchToolDescription(tool), /support composite not eligible/);
  assert.match(researchToolDescription(tool), /overall composite not eligible/);
  const metadata = researchToolStructuredData(tool, 'https://lab.example/');
  assert.equal(metadata.variableMeasured.some(x => x.name === 'Overall composite'), false);
  assert.equal(metadata.variableMeasured.some(x => x.name === 'Support Answer quality'), false);
  assert.equal(metadata.variableMeasured.find(x => x.name === 'Shopping Answer quality')?.value, 70);
  assert.equal(metadata.variableMeasured.find(x => x.name === 'Shopping Composite')?.value, 53);
  assert.equal(metadata.citation, 'https://lab.example/studies/new');
});

test('projection allowlists public fields and clones nested scores and coverage', () => {
  const study = fixture('safe', '2020-01-02T00:00:00Z', '2020-01-03T00:00:00Z');
  Object.assign(study, { rawTranscript: 'private marker' });
  Object.assign(study.providers[0], { readerEmail: 'private marker' });
  Object.assign(study.providers[0].shopping, { evidence: 'private marker' });
  Object.assign(study.providers[0].shopping.quality, { quotes: ['private marker'] });
  Object.assign(study.providers[0].shopping.coverage, { privatePath: 'private marker' });
  const [tool] = projectResearchTools([study], toolId);
  assert.equal(JSON.stringify(tool).includes('private marker'), false);
  assert.deepEqual(Object.keys(tool).sort(), ['id','name','website','studySlug','studyTitle','protocol','publishedAt','captureStartAt','captureEndAt','registeredStores','shopping','support','overallComposite'].sort());
  tool.shopping.quality.value = 0;
  tool.shopping.coverage.assessedCheckpoints = 0;
  assert.equal(study.providers[0].shopping.quality.value, 70);
  assert.equal(study.providers[0].shopping.coverage.assessedCheckpoints, 230);
});

test('arbitrary providers need no pilot and incompatible studies do not displace compatible results', () => {
  const first = fixture('one', '2020-01-02T00:00:00Z', '2020-01-03T00:00:00Z');
  const second = fixture('two', '2020-01-04T00:00:00Z', '2020-01-05T00:00:00Z', 'https://second.example/');
  second.providers[0].name = 'Second';
  const incompatible = structuredClone(first);
  Object.assign(incompatible, { protocol: 'quality-pilot-v1', captureEndAt: '2020-01-06T00:00:00Z' });
  assert.deepEqual(projectResearchTools([first, second, incompatible], toolId).map(x => x.name), ['Example', 'Second']);
  assert.deepEqual(projectResearchTools([], toolId), []);
});

test('duplicate normalized providers in a single approved study fail rather than arbitrarily choose a row', () => {
  const study = fixture('duplicate', '2020-01-02T00:00:00Z', '2020-01-03T00:00:00Z');
  study.providers.push({ ...structuredClone(study.providers[0]), id: 'other-source-id', website: 'https://www.example.com/' });
  assert.throws(() => projectResearchTools([study], toolId), /Duplicate normalized provider/);
});
