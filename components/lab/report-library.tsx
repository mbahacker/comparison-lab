"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { ReportSummary, ToolSummary, score, date } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PolicyStudySummary } from "@/lib/policy-study";
import type { ResearchTool } from "@/lib/research-library";
import { LatestResearchResults, researchCaptureDates } from "./latest-research-results";
import { studyHeadline } from "@/lib/study-findings";

type Lane = "shopping" | "support";
type LibraryTab = "tools" | "comparisons" | "archive";
type LibraryProps = { tools: ToolSummary[]; reports: ReportSummary[]; studies?: PolicyStudySummary[]; latestTools?: ResearchTool[] };

export function ReportLibrary({ tools, reports, studies = [], latestTools = [] }: LibraryProps) {
  const [tab, setTab] = useState<LibraryTab>("tools");
  const comparisons = reports.filter(r => r.vendors.length === 2);
  useEffect(() => {
    const restore = () => {
      const requested = location.hash.slice(1);
      if (["tools", "comparisons", "studies", "archive"].includes(requested)) {
        setTab(requested === "studies" ? "comparisons" : requested as LibraryTab);
        document.getElementById("results")?.scrollIntoView();
      }
    };
    restore(); window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  function changeTab(value: string) { setTab(value as LibraryTab); history.replaceState(null, "", `#${value}`); }
  return <section className="explorer" id="results" aria-labelledby="results-title">
    <div className="shell">
      <div className="section-intro explorer-intro">
        <h2 id="results-title">Explore every result</h2>
        <p>Switch the metric, compare shopping and support, and open any study for its full evidence. Scores describe each study’s storefront sample, not an overall vendor ranking.</p>
      </div>
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="max-w-full flex-wrap group-data-[orientation=horizontal]/tabs:h-auto" aria-label="Research library views"><TabsTrigger value="tools">Latest results <span className="tab-count">{latestTools.length}</span></TabsTrigger><TabsTrigger value="comparisons">Comparative studies <span className="tab-count">{studies.length}</span></TabsTrigger><TabsTrigger className="whitespace-normal" value="archive">Historical quality pilot archive</TabsTrigger></TabsList>
        <TabsContent value="tools" forceMount hidden={tab !== "tools"}><LatestResearchResults tools={latestTools} /></TabsContent>
        <TabsContent value="comparisons" forceMount hidden={tab !== "comparisons"}><StudyComparisons studies={studies} /></TabsContent>
        <TabsContent value="archive" forceMount hidden={tab !== "archive"}><QualityPilotArchive tools={tools} reports={comparisons} /></TabsContent>
      </Tabs>
    </div>
  </section>;
}

function StudyComparisons({ studies }: { studies: PolicyStudySummary[] }) {
  const [query, setQuery] = useState("");
  const shown = studies.filter(s => `${studyHeadline(s)} ${s.title} ${s.providers.map(p => p.name).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="library-tools"><p>Published comparative research, with its versioned method and complete evidence.</p><div className="search-wrap"><Search size={18} /><Input aria-label="Search comparative studies" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a study or tool" /></div></div>
    <div className="report-list">{shown.map(study => <article className="report-card" key={study.slug}><div className="report-card-main"><div className="report-meta"><span className="pill">POLICY-RESOLUTION STUDY</span><span>Published {date(study.publishedAt)}</span></div><h2><Link href={`/studies/${study.slug}`}>{studyHeadline(study)}</Link></h2><p>{study.description}</p><p className="private-note">Captures {researchCaptureDates(study)} · {study.protocol}</p><div className="report-facts"><span><b>{study.sample.capturedCoreContexts}</b> captured core contexts</span><span><b>{study.sample.judgedCoreContexts}</b> assessed contexts</span><span><b>{study.sample.auditedPcrDecisions}</b> audited checkpoints</span></div><Link className="button primary" href={`/studies/${study.slug}`}>Explore the study <ArrowRight size={17} /></Link><p className="card-disclosure">Selected public storefront sessions. Resolution includes a policy-prescribed next step; it does not establish downstream case completion.</p></div><div className="score-preview"><p className="eyebrow">COMPOSITE SCORES / 100</p>{(["shopping", "support"] as const).map(mode => <div className="preview-lane" key={mode}><h3>{mode === "shopping" ? "Shopping" : "Support"}</h3>{study.providers.map(p => <div className="preview-score-row" key={p.id}><span>{p.name}</span><strong>{p[mode].composite.value === null ? "Not eligible" : score(p[mode].composite.value)}</strong></div>)}</div>)}</div></article>)}</div>
    {!shown.length && <div className="empty-state"><h3>{query ? "No matching studies" : "No published comparative studies yet"}</h3><p>Approved studies will appear here with their scores and evidence.</p></div>}
  </>;
}

function QualityPilotArchive({ tools, reports }: { tools: ToolSummary[]; reports: ReportSummary[] }) {
  const [query, setQuery] = useState("");
  const shownTools = tools.filter(t => `${t.name} ${t.website}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const shownReports = reports.filter(r => `${r.title} ${r.vendors.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="library-method-note"><strong>Historical quality pilot archive</strong><p>Earlier quality-only evaluations and comparison reports retain their original method and capture dates. They are separate from the latest research composites, PCR and speed results.</p><p>{tools.length} quality-pilot tools · {reports.length} quality comparison reports. Pilot reuse eligibility is shown only for this archive.</p></div>
    <div className="library-tools"><h3>Tool quality evaluations</h3><div className="search-wrap"><Search size={18} /><Input aria-label="Search historical quality pilots" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an archived tool or report" /></div></div>
    <div className="data-table-wrap library-score-table"><table className="data-table"><caption>Historical quality-pilot scores out of 100. These are not the current research composites.</caption><thead><tr><th>Tool</th><th>Shopping quality</th><th>Support quality</th><th>Pilot sample</th><th>Original capture dates</th><th>Pilot reuse eligibility</th></tr></thead><tbody>{shownTools.map(t => <tr key={t.id}><td><Link className="tool-name-link" href={`/tools/${t.id}`}>{t.name}<ArrowUpRight size={15} /></Link><small>{new URL(t.website).hostname}</small></td><td><ScoreCell value={t.scores.shopping} lane="shopping" /></td><td><ScoreCell value={t.scores.support} lane="support" /></td><td>{t.storeCount} storefronts<br /><small>{t.conversationCount} conversations</small></td><td>{captureDates(t)}</td><td><Freshness fresh={t.fresh} /></td></tr>)}</tbody></table></div>
    {!shownTools.length && <p className="empty-state">{query ? "No matching archived tools." : "No historical quality pilots are available."}</p>}
    <div className="library-method-note"><strong>Quality-pilot scope.</strong><p>Each tool has six ten-turn conversations across three customer storefronts: three shopping and three support conversations. Pilot comparisons reuse compatible source evaluations within 30 days; publication does not reset capture dates.</p><Link href="/methodology/quality-pilot-v1">Read the methods and scope <ArrowRight size={15} /></Link></div>
    <h3>Historical quality comparison reports</h3><div className="report-list">{shownReports.map(r => <ComparisonCard key={r.slug} report={r} />)}</div>
    {!shownReports.length && <p className="empty-state">{query ? "No matching archived comparison reports." : "No historical quality comparison reports are available."}</p>}
  </>;
}
export function captureDates(t:Pick<ToolSummary,"oldestCaptureAt"|"evaluatedAt">) { const start=date(t.oldestCaptureAt),end=date(t.evaluatedAt); return start===end?end:`${start} – ${end}`; }
export function Freshness({fresh}:{fresh:boolean}) {return <span className={`freshness ${fresh?"current":"aged"}`}>{fresh?"Within 30 days":"Refresh needed"}</span>;}
function ScoreCell({value,lane}:{value:number;lane:Lane}) {return <div className="score-cell"><strong>{score(value)}</strong><div className={`score-track ${lane}`}><span style={{width:`${value}%`}}/></div></div>;}
export function ComparisonCard({report:r}:{report:ReportSummary}) {return <article className="report-card"><div className="report-card-main"><div className="report-meta"><span className="pill">QUALITY COMPARISON</span><span>Published {date(r.publishedAt)}</span></div><h2><Link href={`/reports/${r.slug}`}>{r.title}</Link></h2><p>{r.description}</p><div className="report-facts"><span><b>{r.storeCount}</b> storefronts</span><span><b>{r.turnCount}</b> captured turns</span><span><b>{r.criterionCount}</b> criteria</span></div><Link href={`/reports/${r.slug}`} className="button primary">Explore the report <ArrowRight size={17}/></Link><p className="card-disclosure">Original capture dates and limitations are retained. Read the evidence before interpreting the scores.</p></div><div className="score-preview"><p className="eyebrow">QUALITY SCORES / 100</p>{(["shopping","support"] as const).map(lane=><div className="preview-lane" key={lane}><h3>{lane==="shopping"?"Shopping":"Support"}</h3>{r.scores.map(s=><div className="preview-score-row" key={s.vendor}><span>{s.vendor}</span><strong>{score(s[lane])}</strong></div>)}</div>)}</div></article>;}
