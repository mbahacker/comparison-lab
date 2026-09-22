import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyLaneResult } from '../lib/policy-study.ts';
import { compositeParts, fullAnswerSeconds } from '../lib/score-parts.ts';

function lane(resolution: number | null, quality: number | null, speed: number | null, composite: number | null, speedExplanation = 'Synthetic fixture.'): PolicyLaneResult {
  const metric = (value: number | null, explanation = 'Synthetic fixture.') => ({ value, explanation });
  return {
    policyResolution: metric(resolution), quality: metric(quality), speed: metric(speed, speedExplanation), composite: metric(composite),
    coverage: { plannedCheckpoints: 0, attemptedCheckpoints: 0, observedCheckpoints: 0, submittedCheckpoints: 0,
      assessedCheckpoints: 0, unassessableCheckpoints: 0, attainedCheckpoints: 0, policyUnverifiedCheckpoints: 0,
      includedContexts: 0, excludedContexts: 0, includedStores: 0, excludedStores: 0,
      qualityEligibleContexts: 0, qualityEligibleStores: 0, originalCaptures: 0, repairedCaptures: 0 },
  };
}

test('composite parts use the published lane weights and sum to the displayed composite', () => {
  const shopping = compositeParts('shopping', lane(64.8, 83, 53.7, 68.4));
  assert.ok(shopping);
  assert.deepEqual(shopping.map(p => p.weight), [0.4, 0.35, 0.25]);
  assert.ok(Math.abs(shopping.reduce((sum, p) => sum + p.points, 0) - 68.4) < 1e-9);
  const support = compositeParts('support', lane(72.8, 95, 70, 81.4));
  assert.ok(support);
  assert.deepEqual(support.map(p => p.weight), [0.5, 0.4, 0.1]);
  assert.ok(Math.abs(support.reduce((sum, p) => sum + p.points, 0) - 81.4) < 1e-9);
});

test('composite parts decline to split ineligible or unreconciled composites', () => {
  assert.equal(compositeParts('shopping', lane(64.8, 83, 53.7, null)), null);
  assert.equal(compositeParts('shopping', lane(null, 83, 53.7, 68.4)), null);
  assert.equal(compositeParts('shopping', lane(64.8, 83, 53.7, 60)), null);
});

test('full-answer seconds come only from an explicit published duration', () => {
  assert.equal(fullAnswerSeconds(lane(1, 1, 1, 1, 'Full-answer completion 11.8 seconds; 100 at 3 seconds, zero at 22 seconds.')), 11.8);
  assert.equal(fullAnswerSeconds(lane(1, 1, 1, 1, 'Speed score out of 100.')), null);
});
