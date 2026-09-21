"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BarChart3, ClipboardCheck, Globe2, Search, Table2 } from "lucide-react";
import { ReportSummary, ToolSummary, score, date } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Lane = "shopping" | "support";
export function ReportLibrary({ tools, reports }: { tools: ToolSummary[]; reports: ReportSummary[] }) {
  const [tab,setTab] = useState("tools"), [q,setQ] = useState(""), [view,setView] = useState("table"), [sort,setSort] = useState<"name"|Lane>("name");
  useEffect(() => {
    const restore = () => { if (["tools","comparisons"].includes(location.hash.slice(1))) {setTab(location.hash.slice(1)); document.getElementById("results")?.scrollIntoView();} };
    restore(); window.addEventListener("hashchange",restore); return () => window.removeEventListener("hashchange",restore);
  },[]);
  const shownTools = tools.filter(t => `${t.name} ${t.website}`.toLowerCase().includes(q.toLowerCase())).sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : b.scores[sort]-a.scores[sort] || a.name.localeCompare(b.name));
  const comparisons = reports.filter(r => r.vendors.length === 2);
  const shownReports = comparisons.filter(r => `${r.title} ${r.vendors.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  function changeTab(value:string) { setTab(value); setQ(""); history.replaceState(null,"",`#${value}`); }
  return <main id="main" className="library">
    <section className="lab-hero shell">
      <div className="hero-copy"><p className="eyebrow"><span className="live-dot"/> ALHENA RESEARCH LAB</p>
        <h1>Put ecommerce AI<br/><span>to the test.</span></h1>
        <p className="intro">Explore every evaluated tool. Compare shopping and support quality, then follow the scores to real conversation evidence.</p>
        <div className="hero-actions"><Link href="/request" className="button primary">Analyze your tool <ArrowUpRight size={18}/></Link><a href="#tools" className="button outline-button" onClick={()=>{setTab("tools");document.getElementById("results")?.scrollIntoView({behavior:"smooth"});}}>Explore the results <ArrowRight size={17}/></a></div>
        <p className="hero-note">One tool. Three customer storefronts. A place in the research library.</p>
      </div>
      <div className="hero-snapshot tool-library-snapshot"><p className="eyebrow">THE GROWING EVIDENCE LIBRARY</p><h2>Evaluate once.<br/>Compare across the field.</h2>
        <div className="library-totals"><div><strong>{tools.length}</strong><span>evaluated tools</span></div><div><strong>{comparisons.length}</strong><span>comparison reports</span></div><div><strong>26</strong><span>quality criteria</span></div></div>
        <p>Every comparison uses validated source evaluations. Original capture dates and limitations travel with the evidence.</p>
        <div className="mini-legend"><span><i className="shopping-dot"/>Shopping quality</span><span><i className="support-dot"/>Support quality</span></div>
        {tools.slice(0,3).map(t=><Link key={t.id} className="snapshot-tool" href={`/tools/${t.id}`}><strong>{t.name}</strong><span>{score(t.scores.shopping)}<small> / 100</small></span><span>{score(t.scores.support)}<small> / 100</small></span></Link>)}
      </div>
    </section>
    <div className="shell">
      <section className="proof-ribbon" aria-label="Evaluation protocol"><div><Globe2/><span><strong>Real storefronts</strong><small>Three deployments per tool</small></span></div><div><ClipboardCheck/><span><strong>One published rubric</strong><small>Fixed questions and weights</small></span></div><div><BarChart3/><span><strong>Two quality scores</strong><small>Shopping and support, separately</small></span></div></section>
      <section className="library-section" id="results">
        <div className="section-heading"><div><p className="eyebrow">THE RESULTS, OPEN TO EXPLORE</p><h2>See the tools. Compare the evidence.</h2><p>Scores describe the selected storefront sample. They are not an overall vendor ranking.</p></div></div>
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList aria-label="Research library views"><TabsTrigger value="tools">All tools <span className="tab-count">{tools.length}</span></TabsTrigger><TabsTrigger value="comparisons">Comparison reports <span className="tab-count">{comparisons.length}</span></TabsTrigger></TabsList>
          <TabsContent value="tools" forceMount hidden={tab!=="tools"}>
            <div className="library-tools"><div className="view-switch" role="group" aria-label="Results display"><button aria-pressed={view==="table"} onClick={()=>setView("table")}><Table2 size={16}/>Table</button><button aria-pressed={view==="charts"} onClick={()=>setView("charts")}><BarChart3 size={16}/>Charts</button></div><div className="search-wrap"><Search size={18}/><Input aria-label="Search evaluated tools" value={q} onChange={e=>setQ(e.target.value)} placeholder="Find a tool"/></div><label className="sort-label">Sort by<select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="name">Tool name</option><option value="shopping">Shopping quality</option><option value="support">Support quality</option></select></label></div>
            <div hidden={view!=="table"} className="data-table-wrap library-score-table"><table className="data-table"><caption>Latest complete evaluation for each tool. Scores out of 100.</caption><thead><tr><th>Tool</th><th>Shopping quality</th><th>Support quality</th><th>Sample</th><th>Capture dates</th><th>Freshness</th></tr></thead><tbody>{shownTools.map(t=><tr key={t.id}><td><Link className="tool-name-link" href={`/tools/${t.id}`}>{t.name}<ArrowUpRight size={15}/></Link><small>{new URL(t.website).hostname}</small></td><td><ScoreCell value={t.scores.shopping} lane="shopping"/></td><td><ScoreCell value={t.scores.support} lane="support"/></td><td>{t.storeCount} storefronts<br/><small>{t.conversationCount} conversations</small></td><td>{captureDates(t)}</td><td><Freshness fresh={t.fresh}/></td></tr>)}</tbody></table></div>
            <div hidden={view!=="charts"} className="library-chart-grid">{(["shopping","support"] as const).map(lane=><section className="library-lane-chart" key={lane}><p className="eyebrow">{lane.toUpperCase()} QUALITY</p><h3>{lane === "shopping" ? "Helping a shopper choose" : "Resolving a support question"}</h3><p className="private-note">Mean score across three storefronts, out of 100.</p>{shownTools.map(t=><Link href={`/tools/${t.id}`} key={t.id} className="library-chart-row"><div><strong>{t.name}</strong><span>{score(t.scores[lane])}<small> / 100</small></span></div><div className={`score-track ${lane}`}><span style={{width:`${t.scores[lane]}%`}}/></div><small>{captureDates(t)}{!t.fresh ? " · Refresh needed" : ""}</small></Link>)}<div className="chart-ticks"><span>0</span><span>50</span><span>100</span></div></section>)}</div>
            {!shownTools.length && <div className="empty-state"><h3>{q ? "No matching tools" : "The library is ready for its first tool"}</h3><p>Submit a tool and three customer storefronts for review.</p><Link href="/request" className="text-link">Analyze your tool <ArrowRight size={16}/></Link></div>}
            <div className="library-method-note"><strong>Same criteria. Visible limits.</strong><p>Each tool has six ten-turn conversations across three customer storefronts: three shopping and three support conversations. Charts use one complete evaluation per tool, so reusing it in multiple reports does not inflate the sample.</p><p>Fresh means every capture is within 30 days. Older results stay visible with a refresh notice, but are not used to create new automatic comparisons. Different storefronts and merchant configurations can affect scores.</p><Link href="/methodology">Read all 26 scoring criteria <ArrowRight size={15}/></Link></div>
          </TabsContent>
          <TabsContent value="comparisons" forceMount hidden={tab!=="comparisons"}>
            <div className="library-tools"><p>Side-by-side reports, assembled from the underlying evaluations.</p><div className="search-wrap"><Search size={18}/><Input aria-label="Search comparison reports" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search two tools"/></div></div>
            <div className="report-list">{shownReports.map(r=><ComparisonCard key={r.slug} report={r}/>)}</div>
            {!shownReports.length && <div className="empty-state"><h3>{q ? "No matching comparisons" : "Comparisons appear when compatible evaluations are ready"}</h3><p>After an approved tool evaluation passes validation, reports are created against the other eligible tools in the library.</p></div>}
          </TabsContent>
        </Tabs>
      </section>
      <section className="comparison-cta tool-submit-cta"><div><p className="eyebrow">ADD TO THE EVIDENCE</p><h2>How does your tool perform?</h2><p>Enter one tool and three customer storefronts. After review, we evaluate it once and create comparisons against compatible, recent evaluations already in the library.</p></div><Link className="button primary" href="/request">Analyze your tool <ArrowRight size={17}/></Link></section>
      <section className="library-section faq-section"><p className="eyebrow">A FEW FAIR QUESTIONS</p><h2>Know what you’re looking at.</h2>
        <details><summary>Do new comparisons require new testing?</summary><p>The new tool is tested only on missing or expired storefront conversations. Pairwise reports reuse validated source evaluations captured within 30 days. Assembling a comparison adds no new shopper conversations or model judging calls.</p></details>
        <details><summary>What can I read without signing in?</summary><p>Tool scores, sample sizes, capture dates, summaries and the rubric are public. Detailed conversations, criterion decisions and evidence downloads require a verified work email.</p></details>
        <details><summary>Who runs Alhena Research Lab?</summary><p>Alhena operates and commissions these studies. Separate AI judging and audit do not make the Lab an independent research institution. The scoring record and limitations accompany every report.</p></details>
        <details><summary>Are these the full Gorgias leaderboard scores?</summary><p>No. These studies apply the pinned shopping and support quality criteria with two fixed themes. They do not calculate automation, speed or an overall composite score.</p></details>
      </section>
    </div>
  </main>;
}
export function captureDates(t:Pick<ToolSummary,"oldestCaptureAt"|"evaluatedAt">) { const start=date(t.oldestCaptureAt),end=date(t.evaluatedAt); return start===end?end:`${start} – ${end}`; }
export function Freshness({fresh}:{fresh:boolean}) {return <span className={`freshness ${fresh?"current":"aged"}`}>{fresh?"Within 30 days":"Refresh needed"}</span>;}
function ScoreCell({value,lane}:{value:number;lane:Lane}) {return <div className="score-cell"><strong>{score(value)}</strong><div className={`score-track ${lane}`}><span style={{width:`${value}%`}}/></div></div>;}
export function ComparisonCard({report:r}:{report:ReportSummary}) {return <article className="report-card"><div className="report-card-main"><div className="report-meta"><span className="pill">QUALITY COMPARISON</span><span>Published {date(r.publishedAt)}</span></div><h2><Link href={`/reports/${r.slug}`}>{r.title}</Link></h2><p>{r.description}</p><div className="report-facts"><span><b>{r.storeCount}</b> storefronts</span><span><b>{r.turnCount}</b> captured turns</span><span><b>{r.criterionCount}</b> criteria</span></div><Link href={`/reports/${r.slug}`} className="button primary">Explore the report <ArrowRight size={17}/></Link><p className="card-disclosure">Original capture dates and limitations are retained. Read the evidence before interpreting the scores.</p></div><div className="score-preview"><p className="eyebrow">QUALITY SCORES / 100</p>{(["shopping","support"] as const).map(lane=><div className="preview-lane" key={lane}><h3>{lane==="shopping"?"Shopping":"Support"}</h3>{r.scores.map(s=><div className="preview-score-row" key={s.vendor}><span>{s.vendor}</span><strong>{score(s[lane])}</strong></div>)}</div>)}</div></article>;}
