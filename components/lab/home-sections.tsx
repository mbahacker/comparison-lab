import Link from "next/link";
import { ArrowRight } from "lucide-react";
import questionPools from "@/rubric/full-questions.json";
import type { PolicyLane, PolicyStudySummary } from "@/lib/policy-study";
import type { ResearchTool } from "@/lib/research-library";
import { COMPOSITE_WEIGHTS, type ScorePartKey } from "@/lib/score-parts";
import { PART_NAMES, PartsLegend, ScoreRow } from "./score-bars";
import { DemoLink } from "./demo-link";
import { captureRange, date } from "@/lib/client";
import type { FaqItem } from "@/lib/faq";
import { studyShortName } from "@/lib/study-findings";

const LANES: { key: PolicyLane; label: string }[] = [{ key: "shopping", label: "Shopping" }, { key: "support", label: "Support" }];

function sharedStudy(tools: ResearchTool[], studies: PolicyStudySummary[]) {
  const slugs = new Set(tools.map(t => t.studySlug));
  return slugs.size === 1 ? studies.find(s => s.slug === tools[0].studySlug) : undefined;
}

export function HomeHero() {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="shell hero-grid">
      <div className="hero-text">
        <h1 id="hero-title">Ecommerce AI agents, tested on real storefronts.</h1>
        <p className="hero-lede">Every agent gets the same customer conversations in the chat widget on live stores. We check each answer against the store’s own policies, time the wait, and publish the scores with the evidence behind them.</p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#latest">See the results <ArrowRight size={18} aria-hidden="true" /></a>
          <Link className="btn btn-secondary" href="/request">Analyze your tool</Link>
        </div>
        <p className="hero-disclosure">Operated by Alhena. Methods and criteria are public; the scored conversations open with a verified work email.</p>
      </div>
      <HeroArt />
    </div>
  </section>;
}

/** Illustration of what a test looks like: a storefront chat widget answering under the store's policy, and the three measures. Generic by design: no real store, conversation or score. */
function HeroArt() {
  return <div className="hero-art" role="img" aria-label="Illustration: a storefront's chat widget answers a shopper's returns question under the store's policy, while the answer is checked for resolution and quality and its wait time is measured.">
    <div className="art-window art-stack art-stack-2" aria-hidden="true" />
    <div className="art-window art-stack art-stack-1" aria-hidden="true" />
    <div className="art-window art-main" aria-hidden="true">
      <div className="art-bar"><i /><i /><i /><span /></div>
      <div className="art-store">
        <div className="art-banner"><span /><span /></div>
        <div className="art-grid">{Array.from({ length: 6 }, (_, i) => <div className="art-tile" key={i}><b /><span /><span /></div>)}</div>
      </div>
      <div className="art-chat">
        <div className="art-chat-head"><i />Store assistant</div>
        <p className="art-bubble art-shopper">Can I still return a sale item I bought five weeks ago?</p>
        <p className="art-bubble art-agent">Sale items can be returned within 30 days, so this one is outside the window. I can connect you with the team to look at options.</p>
      </div>
    </div>
    <ul className="art-checks" aria-hidden="true">
      <li className="art-check art-check-1"><i className="swatch part-policyResolution" />Right outcome under the store’s policy<b>✓</b></li>
      <li className="art-check art-check-2"><i className="swatch part-quality" />Answer quality, 26 criteria<b>✓</b></li>
      <li className="art-check art-check-3"><i className="swatch part-speed" />Time to the full answer<b>⏱</b></li>
    </ul>
  </div>;
}

const RESULTS_TOOL_LIMIT = 8;

/** Latest composite per tool, in its own section below the hero so it can grow with the library. */
export function HomeResults({ tools, studies }: { tools: ResearchTool[]; studies: PolicyStudySummary[] }) {
  const study = sharedStudy(tools, studies);
  const shown = tools.slice(0, RESULTS_TOOL_LIMIT);
  const deployments = study?.providers.reduce((sum, p) => sum + p.registeredStores, 0);
  return <section className="results-board" id="latest" aria-labelledby="latest-title">
    <div className="shell">
      <div className="results-head">
        <div className="section-intro">
          <h2 id="latest-title">Latest results</h2>
          <p>{study
            ? <>From the <Link href={`/studies/${study.slug}`}>{studyShortName(study)}</Link>: {deployments} storefront deployments, {study.sample.capturedCoreContexts} conversations, captured <time dateTime={`${study.captureStartAt}/${study.captureEndAt}`}>{captureRange(study.captureStartAt, study.captureEndAt)}</time>.</>
            : <>Each tool’s composite score out of 100 from its latest published study. Open a tool for its study, sample and capture dates.</>}</p>
        </div>
        <Link className="text-arrow" href="/studies">Browse the studies <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      {shown.length ? <div className="results-lanes">{LANES.map(lane => <div className="lane-board" key={lane.key}>
        <h3>{lane.label}<span>Composite / 100</span></h3>
        <ul>{shown.map(tool => <ScoreRow key={tool.id} name={tool.name} href={`/tools/${tool.id}`} lane={lane.key} result={tool[lane.key]} />)}</ul>
      </div>)}</div> : <p className="scoreboard-empty">Scores from the first published study will appear here.</p>}
      {tools.length > RESULTS_TOOL_LIMIT && <a className="scoreboard-more" href="#tools">See all {tools.length} tools</a>}
      {shown.length > 0 && <div className="results-foot">
        <PartsLegend />
        <p>Each bar splits the composite into the points each measure adds. Scores cover the on-site chat widget on the storefronts tested, not every product or deployment.</p>
      </div>}
    </div>
  </section>;
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
        <p>The same four steps for every tool.{study && <> The figures come from the <Link href={`/studies/${study.slug}`}>{studyShortName(study)}</Link>.</>}</p>
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
          <p>Every store gets the same scripted conversations in its on-site chat widget: five shopping, five support, and a guardrail test that tries to pull the agent off course.</p>
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
          {study && <p className="step-proof">Published <strong>{date(study.publishedAt)}</strong></p>}
        </li>
      </ol>
    </div>
  </section>;
}

export function HomeCallToAction() {
  return <section className="cta-band" aria-label="Next steps">
    <div className="shell cta-inner">
      <div className="cta-panel">
        <h2>Put your AI agent to the test.</h2>
        <p>Name your tool and three stores that use it, then verify your work email. We find two more, run the evaluation after review, and publish results that pass validation.</p>
        <div className="cta-actions">
          <Link className="btn btn-inverse" href="/request">Analyze your tool</Link>
          <Link className="cta-link" href="/methodology">Read the methodology</Link>
        </div>
      </div>
      <div className="cta-panel cta-panel-demo">
        <h2>See Alhena on your store.</h2>
        <p>Considering Alhena? Book a demo to see how its shopping and support agents would handle your customers’ questions.</p>
        <div className="cta-actions">
          <DemoLink placement="home_cta" className="btn btn-primary" />
        </div>
      </div>
    </div>
  </section>;
}

export function HomeFaq({ items }: { items: FaqItem[] }) {
  return <section className="faq" aria-labelledby="faq-title">
    <div className="shell faq-grid">
      <div className="section-intro">
        <h2 id="faq-title">Read this before the scores</h2>
        <p>What the numbers cover, and what they don’t.</p>
      </div>
      <div className="faq-list">{items.map((item, i) => <details key={item.q} open={i === 0 && Boolean(item.points)}><summary>{item.q}</summary>{item.points ? <><p>{item.lead}</p><ul className="faq-points">{item.points.map(point => <li key={point}>{point}</li>)}</ul>{item.href && <p><Link href={item.href}>{item.linkText ?? "Read more"}</Link></p>}</> : <p>{item.a}{item.href && <> <Link href={item.href}>{item.linkText ?? "Read more"}</Link>.</>}</p>}</details>)}</div>
    </div>
  </section>;
}
