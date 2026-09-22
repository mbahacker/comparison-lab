import type { PolicyLane, PolicyLaneResult } from './policy-study.ts';

/** Published policy-resolution-v1 composite weights (docs/policy-resolution-methodology.md). */
export const COMPOSITE_WEIGHTS = {
  shopping: { policyResolution: 0.4, quality: 0.35, speed: 0.25 },
  support: { policyResolution: 0.5, quality: 0.4, speed: 0.1 },
} as const;

export const SCORE_PARTS = ['policyResolution', 'quality', 'speed'] as const;
export type ScorePartKey = typeof SCORE_PARTS[number];
export type ScorePart = { key: ScorePartKey; score: number; weight: number; points: number };

/**
 * Splits a lane composite into the weighted points each component contributes.
 * Returns null when a component is missing or the published components do not
 * reconcile with the published composite, so callers show the composite alone.
 * Points are rescaled to sum exactly to the displayed composite.
 */
export function compositeParts(lane: PolicyLane, result: PolicyLaneResult): ScorePart[] | null {
  const composite = result.composite.value;
  if (composite === null) return null;
  const parts: ScorePart[] = [];
  for (const key of SCORE_PARTS) {
    const score = result[key].value;
    if (score === null) return null;
    const weight = COMPOSITE_WEIGHTS[lane][key];
    parts.push({ key, score, weight, points: score * weight });
  }
  const total = parts.reduce((sum, part) => sum + part.points, 0);
  if (total <= 0 || Math.abs(total - composite) > 0.2) return null;
  return parts.map(part => ({ ...part, points: part.points * composite / total }));
}

/** Average full-answer time in seconds, as stated in the published speed explanation. */
export function fullAnswerSeconds(result: PolicyLaneResult): number | null {
  const match = /completion\s+(\d+(?:\.\d+)?)\s+seconds/i.exec(result.speed.explanation);
  return match ? Number(match[1]) : null;
}
