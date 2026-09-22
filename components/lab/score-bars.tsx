import Link from "next/link";
import { score } from "@/lib/client";
import type { PolicyLane, PolicyLaneResult } from "@/lib/policy-study";
import { compositeParts, fullAnswerSeconds, SCORE_PARTS, type ScorePartKey } from "@/lib/score-parts";

/** Shared by the homepage scoreboard and study pages; no hooks, so it renders on server or client. */
export const PART_NAMES: Record<ScorePartKey, string> = { policyResolution: "Resolution", quality: "Quality", speed: "Speed" };

export function ScoreRow({ name, href, lane, result }: { name: string; href?: string; lane: PolicyLane; result: PolicyLaneResult }) {
  const value = result.composite.value;
  const parts = compositeParts(lane, result);
  const seconds = fullAnswerSeconds(result);
  const summary = value === null
    ? `${name} ${lane} composite: not eligible`
    : `${name} ${lane} composite ${score(value)} out of 100${parts ? `: ${parts.map(p => `${PART_NAMES[p.key].toLowerCase()} ${score(p.score)}`).join(", ")}` : ""}`;
  const label = <><strong>{name}</strong>{seconds !== null && <small>{seconds.toFixed(1)} s to a full answer</small>}</>;
  return <li className="score-row">
    {href ? <Link className="score-row-name" href={href}>{label}</Link> : <div className="score-row-name">{label}</div>}
    <div className="score-bar" role="img" aria-label={summary}>
      <span className="bar-fill">
        {parts
          ? parts.map(p => <span key={p.key} className={`bar-part part-${p.key}`} style={{ width: `${p.points}%` }} title={`${PART_NAMES[p.key]} ${score(p.score)} × ${Math.round(p.weight * 100)}% = ${p.points.toFixed(1)} points`} />)
          : value !== null && <span className="bar-part part-total" style={{ width: `${value}%` }} />}
      </span>
    </div>
    <strong className={value === null ? "score-row-value is-empty" : "score-row-value"}>{value === null ? "Not eligible" : score(value)}</strong>
  </li>;
}

export function PartsLegend() {
  return <ul className="parts-legend" aria-label="Bar segments">{SCORE_PARTS.map(key => <li key={key}><i className={`swatch part-${key}`} />{PART_NAMES[key]}</li>)}</ul>;
}
