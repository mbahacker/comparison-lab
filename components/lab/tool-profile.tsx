"use client";
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { ToolSummary, ReportSummary, score, date } from '@/lib/client';
import { captureDates, ComparisonCard, Freshness } from './report-library';
import type { ResearchTool } from '@/lib/research-library';
import { POLICY_LABEL, type PolicyStudySummary, type StudyMetric } from '@/lib/policy-study';
import { toolSummarySentence } from '@/lib/study-findings';
import { BeyondChatWidget } from './product-scope';

function ResearchMetric({label,metric}:{label:string;metric:StudyMetric}) {
 return <div><p className="eyebrow">{label}</p><strong>{metric.value === null ? 'Not eligible' : `${score(metric.value)} / 100`}</strong><p className="private-note">{metric.explanation}</p></div>;
}

export function ToolProfile({research,pilot,study,comparisons}:{research?:ResearchTool;pilot?:ToolSummary;study?:PolicyStudySummary;comparisons:ReportSummary[]}) {
 if (!research && !pilot) return null;
 return <main id="main" className="shell report-page tool-profile">
  <Link href="/#tools" className="back-link"><ArrowLeft size={16}/>All evaluated tools</Link>
  {research ? <>
   <div className="report-heading"><div><p className="eyebrow">LATEST APPROVED STUDY · {research.protocol}</p><h1>{research.name}</h1><p className="intro">{toolSummarySentence(research)}</p><a className="text-link" href={research.website} target="_blank" rel="noreferrer">{new URL(research.website).hostname}<ExternalLink size={15}/></a></div></div>
   <p className="tool-capture-note">Captures <strong>{date(research.captureStartAt)} to {date(research.captureEndAt)}</strong>. Published {date(research.publishedAt)}. {research.registeredStores} registered storefronts. Selected by capture end date, then publication date.</p>
   <div className="caveat"><strong>Public-session scope</strong><p>Policy-compliant resolution includes a verified policy-required next step. These scores do not prove completed refunds, account actions or human-resolved orders. Coverage differs by lane and provider; this is an Alhena-commissioned study, not independent certification or a universal vendor ranking.</p></div>
   <div className="hero-actions"><Link className="button primary" href={`/studies/${research.studySlug}`}>Read the study and evidence <ArrowRight size={17}/></Link><Link className="button outline-button" href="/studies/policy-resolution-v1">Read the methodology</Link></div>
   <p className="private-note">Source: <Link href={`/studies/${research.studySlug}`}>{research.studyTitle}</Link>. Summaries are public; detailed evidence requires a verified work email.</p>
   <BeyondChatWidget name={research.name} website={research.website} />
   {(['shopping','support'] as const).map(mode=><section className="library-section" key={mode}><h2>{mode === 'shopping' ? 'Shopping' : 'Support'}</h2><div className="summary-score-grid"><article className="summary-score-card"><ResearchMetric label="Composite" metric={research[mode].composite}/></article><article className="summary-score-card"><ResearchMetric label={POLICY_LABEL} metric={research[mode].policyResolution}/></article><article className="summary-score-card"><ResearchMetric label="Answer quality" metric={research[mode].quality}/></article><article className="summary-score-card"><ResearchMetric label="Full-answer speed score" metric={research[mode].speed}/></article></div></section>)}
   <section className="library-section"><h2>Overall composite</h2><ResearchMetric label="Overall composite" metric={research.overallComposite}/></section>
   <section className="library-section"><h2>Evidence coverage</h2><p>Registered storefronts describe the cohort. Included storefronts and assessed checkpoints describe usable policy-resolution evidence. Unknown and unsent checkpoints are not presumed successes or failures.</p><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Lane</th><th>Checkpoints: planned / attempted / observed</th><th>Recorded submitted / assessed / unassessable</th><th>Attained / unverified</th><th>Contexts: included / excluded</th><th>Storefronts: included / registered</th><th>Quality eligible: contexts / storefronts</th><th>Captures: original / repaired</th></tr></thead><tbody>{(['shopping','support'] as const).map(mode=>{const c=research[mode].coverage;return <tr key={mode}><th>{mode === 'shopping' ? 'Shopping' : 'Support'}</th><td>{c.plannedCheckpoints} / {c.attemptedCheckpoints} / {c.observedCheckpoints}</td><td>{c.submittedCheckpoints} / {c.assessedCheckpoints} / {c.unassessableCheckpoints}</td><td>{c.attainedCheckpoints} / {c.policyUnverifiedCheckpoints}</td><td>{c.includedContexts} / {c.excludedContexts}</td><td>{c.includedStores} / {research.registeredStores}</td><td>{c.qualityEligibleContexts} / {c.qualityEligibleStores}</td><td>{c.originalCaptures} / {c.repairedCaptures}</td></tr>;})}</tbody></table></div></section>
   {study && <details className="method-card"><summary>Study scope and limitations</summary>{study.limitations.map((item,i)=><p key={i}>{item}</p>)}</details>}
   {study && <section className="library-section"><h2>Audit scope</h2><p>{study.audit.description}</p>{study.audit.limitations.map((item,i)=><p key={i}>{item}</p>)}</section>}
   {pilot && <details className="method-card"><summary>Historical quality-pilot archive · {captureDates(pilot)}</summary><p>This earlier sample retains its original quality scores and dates. Its quality-only scores are not the latest study composites or quality components.</p><PilotContent tool={pilot} comparisons={comparisons}/></details>}
  </> : pilot && <><div className="caveat"><strong>Historical quality-pilot profile</strong><p>No policy-resolution study is published for this tool. These are the original quality-only results and capture dates.</p></div><PilotContent tool={pilot} comparisons={comparisons} standalone/></>}
 </main>;
}

function PilotContent({tool,comparisons,standalone=false}:{tool:ToolSummary;comparisons:ReportSummary[];standalone?:boolean}) {
 return <>
  <div className="report-heading"><div><p className="eyebrow">HISTORICAL QUALITY PILOT · {tool.protocol}</p>{standalone ? <h1>{tool.name}</h1> : <h2>{tool.name} quality pilot</h2>}<p className="intro">Shopping and support quality across three selected customer storefronts, using the same 26 published criteria.</p><a className="text-link" href={tool.website} target="_blank" rel="noreferrer">{new URL(tool.website).hostname}<ExternalLink size={15}/></a></div><Freshness fresh={tool.fresh}/></div>
  <div className="tool-score-hero">{(['shopping','support'] as const).map(lane=><section className={`tool-score-panel ${lane}`} key={lane}><p className="eyebrow">{lane.toUpperCase()} QUALITY</p><div><strong>{score(tool.scores[lane])}</strong><span>/ 100</span></div><p>Mean of three storefront conversations.</p></section>)}</div>
  <div className="report-stats">{[[tool.storeCount,'Storefronts'],[tool.conversationCount,'Conversations'],[tool.turnCount,'Captured turns'],[26,'Published criteria']].map(([v,l])=><div key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
  <p className="tool-capture-note">Original capture dates: <strong>{captureDates(tool)}</strong>. {tool.fresh ? `Eligible for new comparisons until ${date(tool.expiresAt)}.` : 'These results remain available as historical evidence. A fresh evaluation is needed before creating new comparisons.'}</p>
  <div className="hero-actions"><Link className="button primary" href={`/reports/${tool.reportSlug}#view=conversations`}>Explore detailed evidence <ArrowRight size={17}/></Link><Link className="button outline-button" href={`/request?${new URLSearchParams({provider:tool.name,website:tool.website})}`}>{tool.fresh?'View evaluation availability':'Request a fresh evaluation'}<ArrowUpRightIcon/></Link></div>
  <p className="private-note">Summaries are public. Detailed conversations and scoring decisions require a verified work email.</p>
  <section className="library-section"><p className="eyebrow">BEHIND THE TOOL SCORE</p><h2>Three deployments. Every result visible.</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Customer storefront</th><th>Shopping /100</th><th>Support /100</th><th>Captured</th></tr></thead><tbody>{tool.customers.map(c=><tr key={c.website}><td><a href={c.website} rel="noreferrer" target="_blank">{c.name}<ExternalLink size={13}/></a></td><td>{score(c.shopping)}</td><td>{score(c.support)}</td><td>{captureDates({oldestCaptureAt:c.oldestCaptureAt || c.capturedAt,evaluatedAt:c.capturedAt})}</td></tr>)}</tbody></table></div></section>
  <section className="library-section"><p className="eyebrow">HISTORICAL COMPARISONS</p><h2>{tool.name} quality-pilot reports</h2><p>Reports retain their original capture dates and source evaluations.</p><div className="report-list">{comparisons.map(r=><ComparisonCard key={r.slug} report={r}/>)}</div>{!comparisons.length&&<div className="empty-state">Quality-pilot comparison reports appear when another compatible tool evaluation is available within the 30-day window.</div>}</section>
  <div className="caveat"><strong>Scope and limitations</strong><p>Operated and commissioned by Alhena Research Lab. Scores describe this selected sample, not universal tool performance or an overall vendor ranking.</p>{tool.limitations.map(l=><p key={l}>{l}</p>)}<Link href="/methodology/quality-pilot-v1">Read the scoring rubric and methodology</Link></div>
 </>;
}
function ArrowUpRightIcon(){return <ExternalLink size={16}/>;}
