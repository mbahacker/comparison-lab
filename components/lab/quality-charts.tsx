"use client";

import { useId, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  ShoppingBag,
  Headphones,
  Table2,
} from "lucide-react";
import {
  qualityChartData,
  type QualityConversation,
  type QualityCriterion,
  type QualityMode,
} from "@/lib/chart-data";

const number = (value: number | null) =>
  value === null
    ? "Unavailable"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
const providerColor = (index: number) =>
  `var(--chart-provider-${index + 1}, ${["#0866ff", "#715cd6", "#2193ab", "#d67800"][index % 4]})`;

export function QualityDashboard({
  conversations,
  criteria,
  onInspect,
  mode: selectedMode,
  onModeChange,
}: {
  conversations: QualityConversation[];
  criteria: QualityCriterion[];
  onInspect: (conversationId: string) => void;
  mode?: QualityMode;
  onModeChange?: (mode: QualityMode) => void;
}) {
  const [localMode, setLocalMode] = useState<QualityMode>("shopping");
  const mode = selectedMode ?? localMode;
  const setMode = (next: QualityMode) => {
    setLocalMode(next);
    onModeChange?.(next);
  };
  const chartId = useId();
  const data = useMemo(
    () => qualityChartData(conversations, criteria, mode),
    [conversations, criteria, mode],
  );
  const color = (vendor: string) => providerColor(data.vendors.indexOf(vendor));
  const modeLabel = mode === "shopping" ? "Shopping" : "Support";
  return (
    <section
      className="quality-dashboard"
      aria-label="Interactive quality charts"
    >
      <div className="quality-dashboard-heading">
        <div>
          <span className="quality-eyebrow">
            <BarChart3 size={15} aria-hidden="true" /> EXPLORE THE RESULTS
          </span>
          <h2>Follow the score to the evidence.</h2>
          <p>The same published rubric, viewed from three angles.</p>
        </div>
        <div
          className="quality-mode-switch"
          role="group"
          aria-label="Choose evaluation lane"
        >
          {(["shopping", "support"] as const).map((lane) => (
            <button
              key={lane}
              type="button"
              aria-pressed={mode === lane}
              onClick={() => setMode(lane)}
            >
              {lane === "shopping" ? (
                <ShoppingBag size={16} aria-hidden="true" />
              ) : (
                <Headphones size={16} aria-hidden="true" />
              )}
              {lane === "shopping" ? "Shopping" : "Support"}
            </button>
          ))}
        </div>
      </div>
      <p className="quality-sr-only" role="status">
        Showing {modeLabel.toLowerCase()} quality for {data.stores.length} live
        conversations.
      </p>
      <div className="quality-chart-grid">
        <article
          className="chart-card quality-provider-card"
          aria-labelledby={`${chartId}-means`}
        >
          <div className="quality-card-heading">
            <span className="quality-chart-kicker">
              01 / THE SAMPLE AVERAGE
            </span>
            <h3 id={`${chartId}-means`}>{modeLabel} quality</h3>
            <p>Mean score across each provider’s tested storefronts.</p>
          </div>
          <div className="quality-mean-chart">
            {data.providers.map((provider) => (
              <div className="quality-mean-row" key={provider.vendor}>
                <div className="quality-mean-label">
                  <span>
                    <i
                      style={{ background: color(provider.vendor) }}
                      aria-hidden="true"
                    />
                    {provider.vendor}
                  </span>
                  <strong style={{ color: color(provider.vendor) }}>
                    {number(provider.mean)}
                    {provider.mean !== null && <small>/100</small>}
                  </strong>
                </div>
                <div
                  className="quality-bar-track quality-mean-track"
                  role="img"
                  aria-label={`${provider.vendor}: ${number(provider.mean)}${provider.mean === null ? "" : " out of 100"}, ${provider.count} scored conversations`}
                >
                  <span
                    style={{
                      width: `${provider.mean ?? 0}%`,
                      background: color(provider.vendor),
                    }}
                  />
                </div>
                <span className="quality-sample-count">
                  {provider.count} scored{" "}
                  {provider.count === 1 ? "conversation" : "conversations"}
                </span>
              </div>
            ))}
            {!data.providers.length && <p>No live scores are available.</p>}
            <div className="quality-axis" aria-hidden="true">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          <p className="quality-chart-note">
            Each lane stands on its own. These means describe this sample and do
            not establish an overall vendor ranking.
          </p>
        </article>

        <article
          className="chart-card quality-store-card"
          aria-labelledby={`${chartId}-stores`}
        >
          <div className="quality-card-heading">
            <span className="quality-chart-kicker">
              02 / BEHIND THE AVERAGE
            </span>
            <h3 id={`${chartId}-stores`}>Every storefront, visible.</h3>
            <p>
              Select a bar to inspect its conversation and scoring decisions.
            </p>
          </div>
          <div className="quality-store-chart">
            {data.stores.map((store) => (
              <button
                className="quality-store-row"
                key={store.id}
                type="button"
                onClick={() => onInspect(store.id)}
                aria-label={`Inspect ${store.vendor}, ${store.store}, ${modeLabel.toLowerCase()} evidence: ${number(store.score)}${store.score === null ? "" : " out of 100"}`}
                title={`${store.vendor} · ${store.store}: ${number(store.score)}${store.score === null ? "" : "/100"}. Open evidence.`}
              >
                <span className="quality-store-label">
                  <strong>{store.store}</strong>
                  <small>{store.vendor}</small>
                </span>
                <span className="quality-bar-track">
                  <span
                    style={{
                      width: `${store.score ?? 0}%`,
                      background: color(store.vendor),
                    }}
                  />
                </span>
                <b>{store.score === null ? "—" : number(store.score)}</b>
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            ))}
            {!data.stores.length && (
              <p>
                No live {modeLabel.toLowerCase()} conversations are available.
              </p>
            )}
          </div>
          <p className="quality-chart-note">
            Scores out of 100. Different customer deployments; archived regrades
            are excluded.
          </p>
        </article>
      </div>

      <article
        className="chart-card quality-dimensions-card"
        aria-labelledby={`${chartId}-dimensions`}
      >
        <div className="quality-dimensions-heading">
          <div className="quality-card-heading">
            <span className="quality-chart-kicker">03 / INSIDE THE RUBRIC</span>
            <h3 id={`${chartId}-dimensions`}>Where the points come from.</h3>
            <p>
              Average percentage of available rubric points earned in each
              dimension.
            </p>
          </div>
          <div className="quality-legend" aria-label="Provider colors">
            {data.vendors.map((vendor) => (
              <span key={vendor}>
                <i style={{ background: color(vendor) }} aria-hidden="true" />
                {vendor}
              </span>
            ))}
          </div>
        </div>
        <div className="quality-dimension-grid">
          {data.dimensions.map((dimension) => (
            <div className="quality-dimension" key={dimension.id}>
              <div className="quality-dimension-title">
                <h4>{dimension.label}</h4>
                <span>{dimension.maxPoints} rubric points</span>
              </div>
              {dimension.providers.map((provider) => (
                <div
                  className="quality-dimension-provider"
                  key={provider.vendor}
                >
                  <div className="quality-dimension-value">
                    <span>{provider.vendor}</span>
                    <strong>
                      {provider.percent === null
                        ? "—"
                        : `${number(provider.percent)}%`}
                    </strong>
                  </div>
                  <div
                    className="quality-bar-track quality-dimension-track"
                    role="img"
                    aria-label={`${provider.vendor}, ${dimension.label}: ${provider.meanPoints === null ? "unavailable" : `${number(provider.meanPoints)} of ${dimension.maxPoints} available points on average, ${number(provider.percent)} percent, from ${provider.count} conversations`}`}
                    title={`${provider.vendor}: ${number(provider.meanPoints)} / ${dimension.maxPoints} points on average. ${provider.count} conversations.`}
                  >
                    <span
                      style={{
                        width: `${provider.percent ?? 0}%`,
                        background: color(provider.vendor),
                      }}
                    />
                  </div>
                  <small className="quality-dimension-points">
                    {provider.meanPoints === null
                      ? "Evidence unavailable"
                      : `${number(provider.meanPoints)} / ${dimension.maxPoints} points · n=${provider.count}`}
                  </small>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="quality-chart-note">
          Dimension percentages make different point totals comparable. They do
          not change the rubric weights or create a new composite score.
          Incomplete dimension evidence is excluded from that dimension’s mean
          and sample count.
        </p>
      </article>

      <details className="quality-table-alternative">
        <summary>
          <Table2 size={16} aria-hidden="true" />
          View chart data as tables
        </summary>
        <div className="quality-table-scroll">
          <table>
            <caption>{modeLabel} provider means, live sample only</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Mean /100</th>
                <th scope="col">Conversations</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((provider) => (
                <tr key={provider.vendor}>
                  <th scope="row">{provider.vendor}</th>
                  <td>{number(provider.mean)}</td>
                  <td>{provider.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <caption>{modeLabel} storefront scores</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Storefront</th>
                <th scope="col">Score /100</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((store) => (
                <tr key={store.id}>
                  <td>{store.vendor}</td>
                  <th scope="row">{store.store}</th>
                  <td>{number(store.score)}</td>
                  <td>
                    <button type="button" onClick={() => onInspect(store.id)}>
                      Inspect {store.id}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <caption>
              {modeLabel} rubric dimensions: mean earned points and percentage
              of available points
            </caption>
            <thead>
              <tr>
                <th scope="col">Dimension</th>
                <th scope="col">Provider</th>
                <th scope="col">Mean points</th>
                <th scope="col">Available points</th>
                <th scope="col">Percentage</th>
                <th scope="col">Conversations</th>
              </tr>
            </thead>
            <tbody>
              {data.dimensions.flatMap((dimension) =>
                dimension.providers.map((provider) => (
                  <tr key={`${dimension.id}-${provider.vendor}`}>
                    <th scope="row">{dimension.label}</th>
                    <td>{provider.vendor}</td>
                    <td>{number(provider.meanPoints)}</td>
                    <td>{dimension.maxPoints}</td>
                    <td>
                      {provider.percent === null
                        ? "Unavailable"
                        : `${number(provider.percent)}%`}
                    </td>
                    <td>{provider.count}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
      <style jsx>{`
        .quality-dashboard {
          margin: 2.8rem 0;
          color: var(--foreground, #24143c);
        }
        .quality-dashboard-heading,
        .quality-dimensions-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .quality-eyebrow {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--chart-provider-1, #0866ff);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.13em;
        }
        .quality-dashboard h2 {
          font-size: clamp(1.7rem, 3vw, 2.3rem);
          line-height: 1.15;
          margin: 0.65rem 0;
          letter-spacing: -0.04em;
        }
        .quality-dashboard-heading p,
        .quality-card-heading p {
          font-size: 0.875rem;
          color: var(--muted-foreground, #736a80);
          line-height: 1.55;
          margin: 0.5rem 0 0;
        }
        .quality-mode-switch {
          display: flex;
          padding: 5px;
          border-radius: 999px;
          background: var(--secondary, #f0e9f8);
          gap: 3px;
          flex-shrink: 0;
        }
        .quality-mode-switch button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border: 0;
          padding: 0.7rem 1rem;
          border-radius: 999px;
          color: inherit;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 650;
          background: transparent;
          cursor: pointer;
        }
        .quality-mode-switch button[aria-pressed="true"] {
          background: var(--chart-provider-1, #0866ff);
          color: #fff;
          box-shadow: 0 3px 10px #512f7720;
        }
        .quality-mode-switch button:focus-visible,
        .quality-store-row:focus-visible,
        .quality-table-alternative summary:focus-visible,
        .quality-table-alternative button:focus-visible {
          outline: 3px solid var(--chart-provider-1, #0866ff);
          outline-offset: 4px;
        }
        .quality-chart-grid {
          display: grid;
          grid-template-columns: 1fr 1.12fr;
          gap: 1.3rem;
          margin-bottom: 1.3rem;
        }
        .quality-dashboard .chart-card {
          min-width: 0;
          border: 1px solid var(--border, #e8dff1);
          border-radius: 20px;
          background: var(--card, #fff);
          padding: clamp(1.2rem, 2.6vw, 2rem);
          box-shadow: 0 8px 28px #48266105;
        }
        .quality-chart-kicker {
          font-size: 0.64rem;
          font-weight: 750;
          letter-spacing: 0.13em;
          color: var(--muted-foreground, #736a80);
        }
        .quality-card-heading h3 {
          margin: 0.65rem 0 0;
          font-size: 1.35rem;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }
        .quality-mean-chart {
          margin: 2rem 0 0;
        }
        .quality-mean-row {
          margin-bottom: 1.8rem;
        }
        .quality-mean-label,
        .quality-dimension-value {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: baseline;
        }
        .quality-mean-label > span {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 650;
        }
        .quality-mean-label i,
        .quality-legend i {
          width: 9px;
          height: 9px;
          display: inline-block;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .quality-mean-label strong {
          font-size: 2.7rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.06em;
        }
        .quality-mean-label small {
          font-size: 0.8rem;
          color: var(--muted-foreground, #736a80);
          letter-spacing: 0;
          font-weight: 500;
          margin-left: 3px;
        }
        .quality-bar-track {
          display: block;
          height: 12px;
          border-radius: 5px;
          overflow: hidden;
          background: var(--muted, #f1edf7);
          position: relative;
        }
        .quality-bar-track > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          transition: width 0.4s ease;
        }
        .quality-mean-track {
          height: 20px;
          border-radius: 6px;
          margin: 0.9rem 0 0.4rem;
          background: repeating-linear-gradient(
            90deg,
            var(--muted, #f1edf7),
            var(--muted, #f1edf7) calc(25% - 1px),
            var(--border, #e2d9ed) calc(25% - 1px),
            var(--border, #e2d9ed) 25%
          );
        }
        .quality-sample-count,
        .quality-dimension-points {
          font-size: 0.68rem;
          color: var(--muted-foreground, #736a80);
        }
        .quality-axis {
          display: flex;
          justify-content: space-between;
          color: var(--muted-foreground, #736a80);
          font-size: 0.65rem;
        }
        .quality-chart-note {
          font-size: 0.72rem;
          color: var(--muted-foreground, #736a80);
          line-height: 1.65;
          margin: 1.5rem 0 0;
        }
        .quality-store-chart {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin: 1.4rem -0.45rem 0;
        }
        .quality-store-row {
          display: grid;
          width: 100%;
          grid-template-columns: minmax(110px, 1fr) minmax(
              55px,
              1.15fr
            ) 32px 14px;
          align-items: center;
          gap: 0.7rem;
          padding: 0.6rem 0.45rem;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: inherit;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }
        .quality-store-row:hover {
          background: var(--muted, #f5f0fb);
        }
        .quality-store-label {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .quality-store-label strong {
          font-size: 0.78rem;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }
        .quality-store-label small {
          font-size: 0.64rem;
          color: var(--muted-foreground, #736a80);
          margin-top: 2px;
        }
        .quality-store-row > b {
          text-align: right;
          font-size: 0.8rem;
          font-variant-numeric: tabular-nums;
        }
        .quality-store-row :global(svg) {
          color: var(--muted-foreground, #736a80);
        }
        .quality-dimensions-heading {
          margin-bottom: 1.75rem;
        }
        .quality-legend {
          display: flex;
          gap: 0.85rem;
          flex-wrap: wrap;
          font-size: 0.72rem;
        }
        .quality-legend span {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .quality-dimension-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
          gap: 1.5rem;
        }
        .quality-dimension-title h4 {
          margin: 0;
          font-size: 0.84rem;
        }
        .quality-dimension-title > span {
          color: var(--muted-foreground, #736a80);
          font-size: 0.67rem;
        }
        .quality-dimension-provider {
          margin-top: 1rem;
        }
        .quality-dimension-value {
          font-size: 0.69rem;
          margin-bottom: 0.35rem;
        }
        .quality-dimension-value > span {
          overflow-wrap: anywhere;
        }
        .quality-dimension-value strong {
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .quality-dimension-track {
          height: 8px;
        }
        .quality-dimension-points {
          display: block;
          margin-top: 0.3rem;
          font-size: 0.6rem;
        }
        .quality-table-alternative {
          border: 1px solid var(--border, #e8dff1);
          border-radius: 12px;
          margin-top: 1rem;
          background: var(--card, #fff);
        }
        .quality-table-alternative summary {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1rem 1.3rem;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .quality-table-scroll {
          overflow-x: auto;
          padding: 0 1.3rem 1.3rem;
        }
        .quality-table-alternative table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
          white-space: nowrap;
          margin: 0 0 1.5rem;
        }
        .quality-table-alternative caption {
          text-align: left;
          font-weight: 700;
          padding: 0.8rem 0;
          white-space: normal;
        }
        .quality-table-alternative th,
        .quality-table-alternative td {
          text-align: left;
          padding: 0.6rem;
          border-bottom: 1px solid var(--border, #e8dff1);
        }
        .quality-table-alternative button {
          border: 0;
          background: none;
          color: var(--chart-provider-1, #0866ff);
          cursor: pointer;
          text-decoration: underline;
        }
        .quality-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @media (max-width: 800px) {
          .quality-chart-grid {
            grid-template-columns: 1fr;
          }
          .quality-dashboard-heading,
          .quality-dimensions-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .quality-mean-chart {
            margin-top: 1.6rem;
          }
        }
        @media (max-width: 430px) {
          .quality-dimension-grid {
            grid-template-columns: 1fr 1fr;
            gap: 1.2rem;
          }
          .quality-store-row {
            grid-template-columns: minmax(100px, 1fr) minmax(
                45px,
                1fr
              ) 29px 12px;
            gap: 0.45rem;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .quality-bar-track > span {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
