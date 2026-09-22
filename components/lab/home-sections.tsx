import Link from "next/link";
import { ArrowRight } from "lucide-react";
import questionPools from "@/rubric/full-questions.json";
import type { PolicyLane, PolicyStudySummary } from "@/lib/policy-study";
import type { ResearchTool } from "@/lib/research-library";
import { COMPOSITE_WEIGHTS, type ScorePartKey } from "@/lib/score-parts";
import { PART_NAMES, PartsLegend, ScoreRow } from "./score-bars";
import { captureRange, date } from "@/lib/client";

const LANES: { key: PolicyLane; label: string }[] = [{ key: "shopping", label: "Shopping" }, { key: "support", label: "Support" }];
const HERO_TOOL_LIMIT = 4;

function sharedStudy(tools: ResearchTool[], studies: PolicyStudySummary[]) {
  const slugs = new Set(tools.map(t => t.studySlug));
  return slugs.size === 1 ? studies.find(s => s.slug === tools[0].studySlug) : undefined;
}

export function HomeHero({ tools, studies }: { tools: ResearchTool[]; studies: PolicyStudySummary[] }) {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="shell hero-grid">
      <div className="hero-text">
        <h1 id="hero-title">Ecommerce AI agents, tested on real storefronts.</h1>
        <p className="hero-lede">Every agent gets the same customer conversations on live stores. We check each answer against the store’s own policies, time the wait, and publish the scores with the evidence behind them.</p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#tools">See the results <ArrowRight size={18} aria-hidden="true" /></a>
          <Link className="btn btn-secondary" href="/request">Analyze your tool</Link>
        </div>
        <p className="hero-disclosure">Operated by Alhena. Methods and criteria are public; the scored conversations open with a verified work email.</p>
      </div>
      <Scoreboard tools={tools} studies={studies} />
    </div>
  </section>;
}

function Scoreboard({ tools, studies }: { tools: ResearchTool[]; studies: PolicyStudySummary[] }) {
  const study = sharedStudy(tools, studies);
  const shown = tools.slice(0, HERO_TOOL_LIMIT);
  const deployments = study?.providers.reduce((sum, p) => sum + p.registeredStores, 0);
  return <aside className="scoreboard" aria-labelledby="scoreboard-title">
    <div className="scoreboard-head">
      <div>
        <p className="scoreboard-kicker">{study ? "Latest study" : "Latest results"}</p>
        <h2 id="scoreboard-title">{study ? study.title : "Latest published result per tool"}</h2>
      </div>
      {study && <Link className="scoreboard-link" href={`/studies/${study.slug}`}>Read the study</Link>}
    </div>
    {study && <p className="scoreboard-meta">{deployments} storefront deployments, {study.sample.capturedCoreContexts} conversations, captured {captureRange(study.captureStartAt, study.captureEndAt)}.</p>}
    {shown.length ? LANES.map(lane => <div className="lane-board" key={lane.key}>
      <h3>{lane.label}<span>Composite / 100</span></h3>
      <ul>{shown.map(tool => <ScoreRow key={tool.id} name={tool.name} href={`/tools/${tool.id}`} lane={lane.key} result={tool[lane.key]} />)}</ul>
    </div>) : <p className="scoreboard-empty">Scores from the first published study will appear here.</p>}
    {tools.length > HERO_TOOL_LIMIT && <a className="scoreboard-more" href="#tools">See all {tools.length} tools</a>}
    {shown.length > 0 && <div className="scoreboard-foot">
      <PartsLegend />
      <p>Each bar splits the composite into the points each measure adds. Scores describe the storefronts tested, not every deployment.</p>
    </div>}
  </aside>;
}

const MEASURES: { key: ScorePartKey; question: string; body: string }[] = [
  { key: "policyResolution", question: "Did the shopper get the right outcome?", body: "The correct answer, or the next step the store’s policy calls for, such as a handoff to a person. Each check is judged twice, blind." },
  { key: "quality", question: "Was the answer any good?", body: "Direct, specific answers grounded in the store’s catalog and policies, with useful product picks and clear next steps. Graded on 26 published criteria." },
  { key: "speed", question: "How long did the shopper wait?", body: "Time until the complete answer appears. Three seconds scores 100; 22 seconds or more scores zero." },
];

export function HomeMeasures() {
  return <section className="measures" aria-labelledby="measures-title">
    <div className="shell">
      <div className="section-intro">
        <h2 id="measures-title">What every score is made of</h2>
        <p>Shopping and support are scored separately. A great product guide and a great returns desk need different strengths, so each lane weighs the three measures differently.</p>
      </div>
      <div className="measure-grid">
        {MEASURES.map(m => <article className="measure" key={m.key}>
          <p className="measure-name"><i className={`swatch part-${m.key}`} />{PART_NAMES[m.key]}</p>
          <h3>{m.question}</h3>
          <p>{m.body}</p>
          <dl className="measure-weights">
            {LANES.map(lane => { const weight = Math.round(COMPOSITE_WEIGHTS[lane.key][m.key] * 100); return <div key={lane.key}>
              <dt>{lane.label}</dt>
              <dd><span className="weight-track"><span className={`part-${m.key}`} style={{ width: `${weight}%` }} /></span>{weight}%</dd>
            </div>; })}
          </dl>
        </article>)}
      </div>
    </div>
  </section>;
}

type Pool = { key: string; label: string; guardrail?: boolean };
const THEMES = LANES.map(lane => ({ ...lane, themes: (questionPools[lane.key] as Pool[]).filter(p => !p.guardrail).map(p => p.label) }));

export function HomeProcess({ study }: { study?: PolicyStudySummary }) {
  const deployments = study?.providers.reduce((sum, p) => sum + p.registeredStores, 0);
  return <section className="process" aria-labelledby="process-title">
    <div className="shell process-grid">
      <div className="section-intro process-intro">
        <h2 id="process-title">How an evaluation works</h2>
        <p>The same four steps for every tool.{study && " The figures come from the latest study."}</p>
        <Link className="text-arrow" href="/methodology">Read the full methodology <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <ol className="process-steps">
        <li>
          <h3>Pick live storefronts</h3>
          <p>Five real stores for each tool. The vendor suggests three; we find and verify two more from its published customer stories.</p>
          {study && <p className="step-proof"><strong>{deployments}</strong> storefront deployments</p>}
        </li>
        <li>
          <h3>Talk to the agent like a customer</h3>
          <p>Every store gets the same scripted conversations: five shopping, five support, and a guardrail test that tries to pull the agent off course.</p>
          <div className="theme-lists">{THEMES.map(lane => <div key={lane.key}><p>{lane.label}</p><ul>{lane.themes.map(t => <li key={t}>{t}</li>)}</ul></div>)}</div>
          <p className="step-source">Question pools from Gorgias’s public <a href="https://github.com/gorgias/ai-agent-benchmark" target="_blank" rel="noreferrer">AI agent benchmark</a>.</p>
          {study && <p className="step-proof"><strong>{study.sample.capturedCoreContexts}</strong> conversations, plus {study.sample.guardrailContexts} guardrail tests</p>}
        </li>
        <li>
          <h3>Judge every checkpoint twice, blind</h3>
          <p>Each checkpoint gets an AI judgment and a separate blind audit, and only counts when both agree on the evidence. Scores come from fixed arithmetic, not from a judge’s opinion of the whole conversation.</p>
          {study && <p className="step-proof"><strong>{study.sample.auditedPcrDecisions}</strong> checkpoints judged and audited</p>}
        </li>
        <li>
          <h3>Publish the evidence</h3>
          <p>Scores, capture dates, coverage and limits are public. The conversations behind them open with a verified work email.</p>
          {study && <p className="step-proof">Latest study published <strong>{date(study.publishedAt)}</strong></p>}
        </li>
      </ol>
    </div>
  </section>;
}

export function HomeCallToAction() {
  return <section className="cta-band" aria-labelledby="cta-title">
    <div className="shell cta-inner">
      <div>
        <h2 id="cta-title">Put your AI agent to the test.</h2>
        <p>Name your tool and three stores that use it, then verify your work email. We find two more, run the evaluation after review, and publish results that pass validation.</p>
      </div>
      <div className="cta-actions">
        <Link className="btn btn-inverse" href="/request">Analyze your tool</Link>
        <Link className="cta-link" href="/methodology">Read the methodology</Link>
      </div>
    </div>
  </section>;
}

const FAQ: { q: string; a: string }[] = [
  { q: "Is this a ranking of vendors?", a: "No. Each score describes the storefronts and capture dates in its study. Merchant setups differ, and storefronts that could not be scored are left out rather than counted as zero." },
  { q: "What does the composite score measure?", a: "It combines resolution, answer quality and full-answer speed with published weights: 40/35/25 for shopping and 50/40/10 for support. Use the metric selector to inspect each part. Resolution can credit a documented next step, such as a required handoff; it does not confirm that a refund or case was completed afterwards." },
  { q: "Who runs Alhena Research Lab?", a: "Alhena operates and commissions these studies, and its own agent appears in the results. Separate AI judging and audits do not make the Lab an independent research institution, so the scoring record and limitations accompany every report." },
  { q: "What can I read without signing in?", a: "Study scores, sample sizes, capture dates, summaries and methods are public. Detailed conversations, criterion decisions and evidence downloads require a verified work email." },
  { q: "Is every evaluation fully automatic?", a: "Research verifies five customer deployments before an operator approves testing. AI then runs the conversations, judges responses and audits resolution decisions, and validated results publish automatically. Temporary failures can retry within fixed limits; unsupported widgets, uncertain response attribution and failed validation may need operator review. Incomplete runs stay unpublished." },
  { q: "What happened to the earlier quality scores?", a: "They remain in the historical quality pilot archive with their original scores and capture dates. The pilot used a separate scope and protocol, so its scores are not combined with the current results." },
];

export function HomeFaq() {
  return <section className="faq" aria-labelledby="faq-title">
    <div className="shell faq-grid">
      <div className="section-intro">
        <h2 id="faq-title">Read this before the scores</h2>
        <p>What the numbers cover, and what they don’t.</p>
      </div>
      <div className="faq-list">{FAQ.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
    </div>
  </section>;
}
