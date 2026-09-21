import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  qualityChartData,
  type QualityConversation,
  type QualityCriterion,
} from "../lib/chart-data.ts";

const criteria: QualityCriterion[] = [
  { id: "one", mode: "shopping", dimension: "answer", points: 60 },
  { id: "two", mode: "shopping", dimension: "answer", points: 40 },
];
const conversation = (
  patch: Partial<QualityConversation> = {},
): QualityConversation => ({
  id: "1",
  vendor: "Provider",
  store: "Store",
  mode: "shopping",
  score: 0,
  checks: [
    { id: "one", points: 60, awarded: 0 },
    { id: "two", points: 40, awarded: 0 },
  ],
  ...patch,
});

test("chart summaries preserve zero, missing scores and lanes without data", () => {
  const result = qualityChartData(
    [
      conversation(),
      conversation({ id: "2", score: null }),
      conversation({
        id: "3",
        vendor: "Support only",
        mode: "support",
        score: 80,
      }),
    ],
    criteria,
    "shopping",
  );
  assert.deepEqual(result.providers, [
    { vendor: "Provider", mean: 0, count: 1 },
    { vendor: "Support only", mean: null, count: 0 },
  ]);
  assert.equal(result.stores[1].score, null);
});

test("archives do not enter live charts, and missing criterion evidence does not become failure", () => {
  const result = qualityChartData(
    [
      conversation({
        checks: [
          { id: "one", points: 60, awarded: 60 },
          { id: "two", points: 40, awarded: 0 },
        ],
        score: 60,
      }),
      conversation({ id: "2", checks: [], score: null }),
      conversation({ id: "archive", kind: "archived", score: 100 }),
    ],
    criteria,
    "shopping",
  );
  assert.equal(result.stores.length, 2);
  assert.deepEqual(result.dimensions[0].providers[0], {
    vendor: "Provider",
    meanPoints: 60,
    percent: 60,
    count: 1,
  });
});

test("dimension charts reject duplicate, invalid and mismatched weight checks", () => {
  const invalid = [
    [
      { id: "one", points: 60, awarded: 61 },
      { id: "two", points: 40, awarded: 40 },
    ],
    [
      { id: "one", points: 59, awarded: 30 },
      { id: "two", points: 40, awarded: 40 },
    ],
    [
      { id: "one", points: 60, awarded: 30 },
      { id: "one", points: 60, awarded: 30 },
      { id: "two", points: 40, awarded: 40 },
    ],
  ];
  for (const checks of invalid) {
    const result = qualityChartData(
      [conversation({ checks })],
      criteria,
      "shopping",
    );
    assert.deepEqual(result.dimensions[0].providers[0], {
      vendor: "Provider",
      meanPoints: null,
      percent: null,
      count: 0,
    });
  }
});

test("published sample charts reproduce stored scores and exact rubric totals", () => {
  const evidence = JSON.parse(
    readFileSync(
      new URL(
        "../content/reports/alhena-vs-gorgias-2026-09-20/evidence.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const shopping = qualityChartData(
    evidence.live_conversations,
    evidence.rubric.criteria,
    "shopping",
  );
  const support = qualityChartData(
    evidence.live_conversations,
    evidence.rubric.criteria,
    "support",
  );
  assert.deepEqual(
    shopping.providers.map((p) => p.mean),
    [96, 230 / 3],
  );
  assert.deepEqual(
    support.providers.map((p) => p.mean),
    [100, 248 / 3],
  );
  for (const result of [shopping, support]) {
    assert.equal(
      result.dimensions.reduce(
        (sum, dimension) => sum + dimension.maxPoints,
        0,
      ),
      100,
    );
    for (const provider of result.providers) {
      const points = result.dimensions.reduce(
        (sum, dimension) =>
          sum +
          (dimension.providers.find((p) => p.vendor === provider.vendor)
            ?.meanPoints ?? 0),
        0,
      );
      assert.ok(Math.abs(points - (provider.mean ?? 0)) < 1e-10);
    }
  }
});
