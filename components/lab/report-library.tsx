"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, ClipboardCheck, Globe2, Search } from "lucide-react";
import { ReportSummary, ToolSummary, score, date } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PolicyStudySummary } from "@/lib/policy-study";
import type { ResearchTool } from "@/lib/research-library";
import { LatestResearchResults, researchCaptureDates } from "./latest-research-results";

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
  return <main id="main" className="library">
    <section className="lab-hero shell">
      <div className="hero-copy"><p className="eyebrow"><span className="live-dot" /> ALHENA RESEARCH LAB</p>
        <h1>Put ecommerce AI<br /><span>to the test.</span></h1>
        <p className="intro">Compare the latest published research on shopping and support. Explore composite scores, policy-compliant resolution, answer quality and speed, then follow each result to its evidence.</p>
        <div className="hero-actions"><a href="#tools" className="button primary" onClick={() => { changeTab("tools"); document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }); }}>Explore latest results <ArrowRight size={17} /></a><Link href="/request" className="button outline-button">Evaluate your tool <ArrowUpRight size={18} /></Link></div>
        <p className="hero-note">Submit one tool and three customer stores. We research two more for a five-storefront evaluation. <Link href="/methodology">See how it works.</Link></p>
      </div>
      <div className="hero-snapshot tool-library-snapshot"><p className="eyebrow">LATEST PUBLISHED RESEARCH</p><h2>Every score.<br />Evidence behind it.</h2>
        <div className="library-totals"><div><strong>{latestTools.length}</strong><span>tools in current results</span></div><div><strong>{studies.length}</strong><span>published studies</span></div><div><strong>26</strong><span>quality criteria</span></div></div>
        <p>Composite scores combine policy-compliant resolution, quality and speed. Each study retains its capture dates and included coverage.</p>
        <div className="mini-legend"><span><i className="shopping-dot" />Shopping composite</span><span><i className="support-dot" />Support composite</span></div>
        {latestTools.slice(0, 3).map(t => <Link key={t.id} className="snapshot-tool" href={`/tools/${t.id}`}><strong>{t.name}</strong><span>{t.shopping.composite.value === null ? "Not eligible" : score(t.shopping.composite.value)}<small>{t.shopping.composite.value === null ? "" : " / 100"}</small></span><span>{t.support.composite.value === null ? "Not eligible" : score(t.support.composite.value)}<small>{t.support.composite.value === null ? "" : " / 100"}</small></span></Link>)}
        {!latestTools.length && <p className="private-note">Approved study results will appear here. Historical quality pilots remain in their archive.</p>}
      </div>
    </section>
    <div className="shell">
      {studies.length > 0 && <section className="comparison-cta"><div><p className="eyebrow">LATEST COMPARATIVE STUDY</p><h2>{studies[0].title}</h2><p>Read the scores, complete coverage and underlying conversation evidence.</p></div><Link className="button primary" href={`/studies/${studies[0].slug}`}>Read the study <ArrowRight size={17} /></Link></section>}
      <section className="proof-ribbon" aria-label="Published research scope"><div><Globe2 /><span><strong>Study-specific samples</strong><small>Included storefronts shown per lane</small></span></div><div><ClipboardCheck /><span><strong>26 quality criteria</strong><small>Quality is a separate score component</small></span></div><div><BarChart3 /><span><strong>Choose the metric</strong><small>Composite, resolution, quality or speed</small></span></div></section>
      <section className="library-section" id="results">
        <div className="section-heading"><div><p className="eyebrow">THE RESULTS, OPEN TO EXPLORE</p><h2>See the tools. Compare the evidence.</h2><p>Scores describe the selected storefront sample. They are not an overall vendor ranking.</p></div></div>
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="max-w-full flex-wrap group-data-[orientation=horizontal]/tabs:h-auto" aria-label="Research library views"><TabsTrigger value="tools">Latest results <span className="tab-count">{latestTools.length}</span></TabsTrigger><TabsTrigger value="comparisons">Comparative studies <span className="tab-count">{studies.length}</span></TabsTrigger><TabsTrigger className="whitespace-normal" value="archive">Historical quality pilot archive</TabsTrigger></TabsList>
          <TabsContent value="tools" forceMount hidden={tab !== "tools"}><LatestResearchResults tools={latestTools} /></TabsContent>
          <TabsContent value="comparisons" forceMount hidden={tab !== "comparisons"}><StudyComparisons studies={studies} /></TabsContent>
          <TabsContent value="archive" forceMount hidden={tab !== "archive"}><QualityPilotArchive tools={tools} reports={comparisons} /></TabsContent>
        </Tabs>
      </section>
      <section className="comparison-cta tool-submit-cta"><div><p className="eyebrow">ADD TO THE EVIDENCE</p><h2>How does your tool perform?</h2><p>Enter your tool, its website and three customer stores, then verify your work email. We research two more deployments for review. After approval, AI tests live storefront conversations and assesses policy-compliant resolution, answer quality and speed. Results that pass validation automatically join the current library and compatible comparisons.</p><p><Link href="/methodology" className="text-link">Read the evaluation methodology <ArrowRight size={15} /></Link></p></div><Link className="button primary" href="/request">Analyze your tool <ArrowRight size={17} /></Link></section>
      <section className="library-section faq-section"><p className="eyebrow">A FEW FAIR QUESTIONS</p><h2>Know what you’re looking at.</h2>
        <details><summary>What does the default score measure?</summary><p>The default is the latest study’s composite, combining policy-compliant resolution, answer quality and full-answer speed. Use the metric selector to inspect each component separately. Policy-compliant resolution can include a documented required next step; it does not establish a completed refund or downstream case resolution.</p></details>
        <details><summary>What happens to earlier quality evaluations?</summary><p>They remain in the Historical quality pilot archive with their original scores and capture dates. The pilot uses a separate scope and protocol. Its scores are not combined with the current research results.</p></details>
        <details><summary>Is every evaluation fully automatic?</summary><p>Research verifies five customer deployments before an operator approves testing. AI then runs conversations, judges responses and audits policy-resolution decisions. Validated results publish automatically. Temporary failures can retry within fixed limits; unsupported widgets, uncertain response attribution and failed validation may still require operator review. Incomplete runs remain unpublished.</p></details>
        <details><summary>What can I read without signing in?</summary><p>Study scores, sample sizes, capture dates, summaries and methods are public. Detailed conversations, criterion decisions and evidence downloads require a verified work email.</p></details>
        <details><summary>Who runs Alhena Research Lab?</summary><p>Alhena operates and commissions these studies. Separate AI judging and audit do not make the Lab an independent research institution. The scoring record and limitations accompany every report.</p></details>
      </section>
    </div>
  </main>;
}

function StudyComparisons({ studies }: { studies: PolicyStudySummary[] }) {
  const [query, setQuery] = useState("");
  const shown = studies.filter(s => `${s.title} ${s.providers.map(p => p.name).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="library-tools"><p>Published comparative research, with its versioned method and complete evidence.</p><div className="search-wrap"><Search size={18} /><Input aria-label="Search comparative studies" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a study or tool" /></div></div>
    <div className="report-list">{shown.map(study => <article className="report-card" key={study.slug}><div className="report-card-main"><div className="report-meta"><span className="pill">POLICY-RESOLUTION STUDY</span><span>Published {date(study.publishedAt)}</span></div><h2><Link href={`/studies/${study.slug}`}>{study.title}</Link></h2><p>{study.description}</p><p className="private-note">Captures {researchCaptureDates(study)} · {study.protocol}</p><div className="report-facts"><span><b>{study.sample.capturedCoreContexts}</b> captured core contexts</span><span><b>{study.sample.judgedCoreContexts}</b> assessed contexts</span><span><b>{study.sample.auditedPcrDecisions}</b> audited checkpoints</span></div><Link className="button primary" href={`/studies/${study.slug}`}>Explore the study <ArrowRight size={17} /></Link><p className="card-disclosure">Selected public storefront sessions. Resolution includes a policy-prescribed next step; it does not establish downstream case completion.</p></div><div className="score-preview"><p className="eyebrow">COMPOSITE SCORES / 100</p>{(["shopping", "support"] as const).map(mode => <div className="preview-lane" key={mode}><h3>{mode === "shopping" ? "Shopping" : "Support"}</h3>{study.providers.map(p => <div className="preview-score-row" key={p.id}><span>{p.name}</span><strong>{p[mode].composite.value === null ? "Not eligible" : score(p[mode].composite.value)}</strong></div>)}</div>)}</div></article>)}</div>
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
