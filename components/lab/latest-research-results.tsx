"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, Search, Table2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { date, score } from "@/lib/client";
import type { ResearchTool } from "@/lib/research-library";

type Lane = "shopping" | "support";
type Metric = "composite" | "policyResolution" | "quality" | "speed";
const metrics: Record<Metric, { label: string; explanation: string }> = {
  composite: { label: "Composite", explanation: "The study's weighted combination of policy-compliant resolution, answer quality and full-answer speed. Open the study for its weights and coverage." },
  policyResolution: { label: "Policy-compliant resolution (PCR)", explanation: "Verified attainment of observable submitted checkpoints. A documented required next step can count; completed refunds or downstream case resolution are not verified." },
  quality: { label: "Answer quality", explanation: "The study's answer-quality component, evaluated with the published shopping and support criteria. This is separate from the composite." },
  speed: { label: "Full-answer speed", explanation: "The study's full-answer speed score, out of 100. Higher is better; this score is not a duration in seconds." },
};

export function researchCaptureDates(tool: Pick<ResearchTool, "captureStartAt" | "captureEndAt">) {
  const start = date(tool.captureStartAt), end = date(tool.captureEndAt);
  return start === end ? end : `${start} – ${end}`;
}

function ResearchScore({ value, lane }: { value: number | null; lane: Lane }) {
  if (value === null) return <span className="private-note">Not eligible</span>;
  return <div className="score-cell"><strong>{score(value)}</strong><div className={`score-track ${lane}`}><span style={{ width: `${value}%` }} /></div></div>;
}

export function LatestResearchResults({ tools }: { tools: ResearchTool[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "charts">("table");
  const [metric, setMetric] = useState<Metric>("composite");
  const [sort, setSort] = useState<"name" | Lane>("name");
  const selected = metrics[metric];
  const shown = tools.filter(t => `${t.name} ${t.website} ${t.studyTitle}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    const av = a[sort][metric].value, bv = b[sort][metric].value;
    if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
    if (bv === null) return -1;
    return bv - av || a.name.localeCompare(b.name);
  });
  return <>
    <div className="library-tools">
      <div className="view-switch" role="group" aria-label="Latest research display"><button aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={16} />Table</button><button aria-pressed={view === "charts"} onClick={() => setView("charts")}><BarChart3 size={16} />Charts</button></div>
      <label className="sort-label">Metric<select value={metric} onChange={e => setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <div className="search-wrap"><Search size={18} /><Input aria-label="Search latest research tools" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a tool" /></div>
      <label className="sort-label">Sort by<select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="name">Tool name</option><option value="shopping">Shopping {selected.label.toLowerCase()}</option><option value="support">Support {selected.label.toLowerCase()}</option></select></label>
    </div>
    <p className="library-method-note" aria-live="polite"><strong>{selected.label} / 100.</strong> {selected.explanation}</p>
    <div hidden={view !== "table"} className="data-table-wrap library-score-table"><table className="data-table">
      <caption>Latest approved study result per tool. {selected.label} scores out of 100; capture dates and included coverage are retained.</caption>
      <thead><tr><th>Tool</th><th>Shopping {selected.label.toLowerCase()}</th><th>Support {selected.label.toLowerCase()}</th><th>{metric === "quality" ? "Quality evidence coverage" : "PCR evidence coverage"}</th><th>Capture dates</th><th>Study and evidence</th></tr></thead>
      <tbody>{shown.map(t => <tr key={t.id}>
        <td><Link className="tool-name-link" href={`/tools/${t.id}`}>{t.name}<ArrowUpRight size={15} /></Link><small>{new URL(t.website).hostname}</small></td>
        <td><ResearchScore value={t.shopping[metric].value} lane="shopping" /></td><td><ResearchScore value={t.support[metric].value} lane="support" /></td>
        <td>Shopping: {metric === "quality" ? t.shopping.coverage.qualityEligibleStores : t.shopping.coverage.includedStores} / {t.registeredStores} storefronts<br />Support: {metric === "quality" ? t.support.coverage.qualityEligibleStores : t.support.coverage.includedStores} / {t.registeredStores} storefronts<br /><small>{metric === "quality" ? t.shopping.coverage.qualityEligibleContexts : t.shopping.coverage.includedContexts} shopping / {metric === "quality" ? t.support.coverage.qualityEligibleContexts : t.support.coverage.includedContexts} support contexts {metric === "quality" ? "quality eligible" : "included in PCR"}</small>{metric === "speed" && <small>See the study for timing coverage.</small>}</td>
        <td>{researchCaptureDates(t)}</td>
        <td><Link href={`/studies/${t.studySlug}`} className="text-link">Read the study <ArrowUpRight size={15} /></Link><small>{t.protocol}<br />Published {date(t.publishedAt)}</small></td>
      </tr>)}</tbody>
    </table></div>
    <div hidden={view !== "charts"} className="library-chart-grid">{(["shopping", "support"] as const).map(lane => <section className="library-lane-chart" key={lane}>
      <p className="eyebrow">{lane.toUpperCase()} · {selected.label.toUpperCase()}</p><h3>{lane === "shopping" ? "Shopping assistance" : "Support assistance"}</h3><p className="private-note">Latest approved {selected.label.toLowerCase()} score per tool, out of 100.</p>
      {shown.map(t => <Link href={`/tools/${t.id}`} key={t.id} className="library-chart-row"><div><strong>{t.name}</strong><span>{t[lane][metric].value === null ? "Not eligible" : <>{score(t[lane][metric].value)}<small> / 100</small></>}</span></div>{t[lane][metric].value !== null && <div className={`score-track ${lane}`}><span style={{ width: `${t[lane][metric].value}%` }} /></div>}<small>{metric === "quality" ? "Quality eligible" : "PCR evidence"}: {metric === "quality" ? t[lane].coverage.qualityEligibleStores : t[lane].coverage.includedStores} of {t.registeredStores} storefronts · {metric === "quality" ? t[lane].coverage.qualityEligibleContexts : t[lane].coverage.includedContexts} contexts<br />Captured {researchCaptureDates(t)}{metric === "speed" && <><br />Timing coverage is detailed in the study.</>}</small></Link>)}
      <div className="chart-ticks"><span>0</span><span>50</span><span>100</span></div>
    </section>)}</div>
    {!shown.length && <div className="empty-state"><h3>{query ? "No matching tools" : "No published research results yet"}</h3><p>{query ? "Try another tool or study name." : "Approved study results appear here with their method, evidence and capture dates."}</p><Link href="/studies" className="text-link">Browse research studies <ArrowRight size={16} /></Link></div>}
    <div className="library-method-note"><strong>One published study result per tool.</strong><p>The table and charts use the same selected metric. Samples and merchant configurations differ, and excluded storefronts are not assigned zero scores. Capture dates describe the evidence; publication dates do not establish fresh testing.</p><Link href="/methodology">Compare the research methods <ArrowRight size={15} /></Link></div>
  </>;
}
