export type QualityMode = "shopping" | "support";

export type QualityCriterion = {
  id: string;
  mode: string;
  dimension: string;
  points: number;
};

export type QualityConversation = {
  id: string;
  vendor: string;
  store: string;
  mode: string;
  kind?: string;
  score?: number | null;
  checks: {
    id: string;
    points: number;
    awarded?: number | null;
    pass?: boolean;
  }[];
};

export type ProviderQuality = {
  vendor: string;
  mean: number | null;
  count: number;
};
export type DimensionQuality = {
  id: string;
  label: string;
  maxPoints: number;
  providers: {
    vendor: string;
    meanPoints: number | null;
    percent: number | null;
    count: number;
  }[];
};

export const dimensionLabel = (id: string) =>
  ({
    answer: "Answer quality",
    discovery: "Discovery",
    recommendation: "Recommendation",
    rich: "Rich elements",
    close: "Closing",
    resolution: "Resolution",
    accuracy: "Accuracy",
    actionability: "Actionability",
  })[id] || id.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** These views are descriptive summaries of the live sample, not a new scoring rubric. */
export function qualityChartData(
  conversations: QualityConversation[],
  criteria: QualityCriterion[],
  mode: QualityMode,
) {
  const live = conversations.filter((c) => !c.kind || c.kind === "live");
  const vendors = [...new Set(live.map((c) => c.vendor))];
  const selected = live.filter((c) => c.mode === mode);
  const scoreRows = selected.map((c) => ({
    id: c.id,
    vendor: c.vendor,
    store: c.store,
    score:
      validNumber(c.score) && c.score >= 0 && c.score <= 100 ? c.score : null,
  }));
  const providers: ProviderQuality[] = vendors.map((vendor) => {
    const scores = scoreRows
      .filter((c) => c.vendor === vendor && c.score !== null)
      .map((c) => c.score as number);
    return {
      vendor,
      count: scores.length,
      mean: scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null,
    };
  });
  const selectedCriteria = criteria.filter(
    (c) => c.mode === mode && validNumber(c.points) && c.points > 0,
  );
  const dimensions: DimensionQuality[] = [
    ...new Set(selectedCriteria.map((c) => c.dimension)),
  ].map((id) => {
    const dimensionCriteria = selectedCriteria.filter(
      (c) => c.dimension === id,
    );
    const maxPoints = dimensionCriteria.reduce((sum, c) => sum + c.points, 0);
    return {
      id,
      label: dimensionLabel(id),
      maxPoints,
      providers: vendors.map((vendor) => {
        const earned: number[] = [];
        for (const conversation of selected.filter(
          (c) => c.vendor === vendor,
        )) {
          const checks = dimensionCriteria.map((criterion) => {
            const matches = conversation.checks.filter(
              (check) => check.id === criterion.id,
            );
            if (matches.length !== 1) return null;
            const check = matches[0];
            return check.points === criterion.points &&
              validNumber(check.awarded) &&
              check.awarded >= 0 &&
              check.awarded <= criterion.points
              ? check.awarded
              : null;
          });
          // Missing evidence is unavailable; it must never masquerade as a failed criterion.
          if (checks.every((points): points is number => points !== null))
            earned.push(checks.reduce((sum, points) => sum + points, 0));
        }
        const meanPoints = earned.length
          ? earned.reduce((sum, value) => sum + value, 0) / earned.length
          : null;
        return {
          vendor,
          count: earned.length,
          meanPoints,
          percent: meanPoints === null ? null : (meanPoints / maxPoints) * 100,
        };
      }),
    };
  });
  return { vendors, providers, stores: scoreRows, dimensions };
}
