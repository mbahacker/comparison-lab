"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ReportEmailVerification } from './report-email-verification';
import { PartsLegend, ScoreRow } from './score-bars';
import { DemoLink } from './demo-link';
import { ProductScope } from './product-scope';
import { fullAnswerSeconds } from '@/lib/score-parts';
import { studyFindings } from '@/lib/study-findings';
import { api, captureRange, date, score } from '@/lib/client';
import { POLICY_LABEL, type PolicyStudyDetails, type PolicyStudySummary, type StudyMetric } from '@/lib/policy-study';

/** Details are mounted lazily; transcript text is never inserted as HTML. */
function EvidenceNode({ label, value }: { label: string; value: unknown }) {
  const [opened, setOpened] = useState(false);
  if (value === null || typeof value !== 'object') return <p><strong>{label}: </strong><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value)}</span></p>;
  const entries = Object.entries(value);
  return <details className="method-card" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary>{label} · {entries.length} {Array.isArray(value) ? 'records' : 'fields'}</summary>{opened && entries.map(([key, item]) => <EvidenceNode key={key} label={key} value={item} />)}</details>;
}
const LANES = [{ key: 'shopping', label: 'Shopping' }, { key: 'support', label: 'Support' }] as const;
const MEASURE_ROWS: { key: 'composite' | 'policyResolution' | 'quality' | 'speed'; label: string }[] = [
  { key: 'composite', label: 'Composite' }, { key: 'policyResolution', label: 'Resolution' }, { key: 'quality', label: 'Quality' }, { key: 'speed', label: 'Speed score' },
];
const metricValue = (metric: StudyMetric) => metric.value === null ? 'Not eligible' : score(metric.value);
/** The published speed explanation leads with one provider's duration; the scale after it is shared. */
function speedScale(metric: StudyMetric) {
  const scale = metric.explanation.replace(/^Full-answer completion \d+(?:\.\d+)? seconds;\s*/i, '');
  return scale === metric.explanation ? metric.explanation : `Average time to the complete answer, scored ${scale}`;
}
export function PolicyStudy({ study }: { study: PolicyStudySummary }) {
  const [verified, setVerified] = useState(false), [requested, setRequested] = useState(false);
  const [details, setDetails] = useState<PolicyStudyDetails | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const base = `/studies/${encodeURIComponent(study.slug)}`;
  useEffect(() => {
    let active = true;
    api<{ access: { verified: boolean } }>(base).then(result => { if (active) setVerified(result.access.verified); }).catch(() => { /* Detail requests still enforce authentication server-side. */ });
    return () => { active = false; };
  }, [base]);
  async function loadDetails() {
    setRequested(true); setError(''); setBusy(true);
    try {
      const response = await fetch(`/api${base}/details`, { credentials: 'same-origin', cache: 'no-store' });
      if ([401, 403].includes(response.status)) { setVerified(false); setDetails(null); return; }
      if (!response.ok) throw new Error('The detailed study could not be loaded. Please try again.');
      setDetails(await response.json()); setVerified(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function download(item: PolicyStudyDetails['downloads'][number]) {
    setError(''); setBusy(true);
    try {
      const response = await fetch(`/api${base}/${item.resource}`, { credentials: 'same-origin', cache: 'no-store' });
      if ([401, 403].includes(response.status)) { setVerified(false); setDetails(null); setRequested(true); return; }
      if (!response.ok) throw new Error('The download could not be loaded. Please try again.');
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a');
      anchor.href = url; anchor.download = item.filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  const first = study.providers[0];
  const findings = studyFindings(study);
  const deployments = study.providers.reduce((sum, p) => sum + p.registeredStores, 0);
  const stats: [number, string][] = [[deployments, 'storefront deployments'], [study.sample.capturedCoreContexts, 'conversations captured'], [study.sample.judgedCoreContexts, 'conversations judged'], [study.sample.guardrailContexts, 'guardrail tests'], [study.sample.auditedPcrDecisions, 'checkpoints judged and audited']];
  return <main id="main" className="study-page">
    <header className="study-hero">
      <div className="shell">
        <Link href="/studies" className="back-link">All studies</Link>
        <p className="study-kicker">Comparative study</p>
        <h1>{study.title}</h1>
        <p className="study-lede">{study.description}</p>
        <p className="study-meta">Published <time dateTime={study.publishedAt}>{date(study.publishedAt)}</time>. Captured <time dateTime={`${study.captureStartAt}/${study.captureEndAt}`}>{captureRange(study.captureStartAt, study.captureEndAt)}</time>. Commissioned by {study.commissionedBy} using the <Link href="/studies/policy-resolution-v1">{study.protocol}</Link> method.</p>
      </div>
    </header>
    <section className="study-stats" aria-label="Study sample">
      <div className="shell study-stats-grid">{stats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    </section>
    {findings.length > 0 && <section className="study-findings" aria-labelledby="study-findings">
      <div className="shell study-findings-grid">
        <h2 id="study-findings">Key findings</h2>
        <ul>{findings.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>}
    <section className="study-section" aria-labelledby="study-results">
      <div className="shell">
        <div className="section-intro"><h2 id="study-results">Results</h2><p>Scores out of 100 for the storefronts in this study. Each bar splits a lane composite into the points resolution, quality and speed add.</p></div>
        <div className="study-overall">{study.providers.map(p => <div key={p.id}><span>{p.name}</span><strong>{metricValue(p.overallComposite)}</strong><small>overall composite</small></div>)}</div>
        <div className="study-lanes">{LANES.map(lane => <div className="lane-board" key={lane.key}><h3>{lane.label}<span>Composite / 100</span></h3><ul>{study.providers.map(p => <ScoreRow key={p.id} name={p.name} lane={lane.key} result={p[lane.key]} />)}</ul></div>)}</div>
        <PartsLegend />
        <h3 className="study-subhead">Score breakdown</h3>
        <div className="data-table-wrap"><table className="data-table study-breakdown">
          <caption>Each measure out of 100 unless marked, by lane and provider.</caption>
          <thead>
            <tr><th scope="col" rowSpan={2}>Measure</th>{LANES.map(lane => <th scope="colgroup" colSpan={study.providers.length} key={lane.key}>{lane.label}</th>)}</tr>
            <tr>{LANES.map(lane => study.providers.map(p => <th scope="col" key={`${lane.key}-${p.id}`}>{p.name}</th>))}</tr>
          </thead>
          <tbody>
            {MEASURE_ROWS.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{LANES.map(lane => study.providers.map(p => <td key={`${lane.key}-${p.id}`}>{metricValue(p[lane.key][row.key])}</td>))}</tr>)}
            <tr><th scope="row">Average full answer</th>{LANES.map(lane => study.providers.map(p => { const seconds = fullAnswerSeconds(p[lane.key]); return <td key={`${lane.key}-${p.id}`}>{seconds === null ? '–' : `${seconds.toFixed(1)} s`}</td>; }))}</tr>
            <tr><th scope="row">Storefronts included</th>{LANES.map(lane => study.providers.map(p => <td key={`${lane.key}-${p.id}`}>{p[lane.key].coverage.includedStores} of {p.registeredStores}</td>))}</tr>
            <tr><th scope="row">Conversations included</th>{LANES.map(lane => study.providers.map(p => { const c = p[lane.key].coverage; return <td key={`${lane.key}-${p.id}`}>{c.includedContexts} of {c.includedContexts + c.excludedContexts}</td>; }))}</tr>
          </tbody>
        </table></div>
        <details className="study-disclosure"><summary>Full evidence coverage</summary>{LANES.map(lane => <div className="data-table-wrap" key={lane.key}><table className="data-table"><caption>{lane.label} evidence coverage</caption><thead><tr><th>Company</th><th>Checkpoints: planned / attempted / observed</th><th>Recorded submitted / assessed / unassessable</th><th>Attained / unverified</th><th>Contexts: included / excluded</th><th>Stores: included / excluded</th><th>Quality eligible: contexts / stores</th><th>Captures: original / repaired</th></tr></thead><tbody>{study.providers.map(provider => { const c = provider[lane.key].coverage; return <tr key={provider.id}><th>{provider.name}</th><td>{c.plannedCheckpoints} / {c.attemptedCheckpoints} / {c.observedCheckpoints}</td><td>{c.submittedCheckpoints} / {c.assessedCheckpoints} / {c.unassessableCheckpoints}</td><td>{c.attainedCheckpoints} / {c.policyUnverifiedCheckpoints}</td><td>{c.includedContexts} / {c.excludedContexts}</td><td>{c.includedStores} / {c.excludedStores}</td><td>{c.qualityEligibleContexts} / {c.qualityEligibleStores}</td><td>{c.originalCaptures} / {c.repairedCaptures}</td></tr>; })}</tbody></table></div>)}</details>
        {first && <dl className="study-defs">
          <div><dt>{POLICY_LABEL}</dt><dd>{first.shopping.policyResolution.explanation}</dd></div>
          <div><dt>Quality</dt><dd>{first.shopping.quality.explanation}</dd></div>
          <div><dt>Full-answer speed</dt><dd>{speedScale(first.shopping.speed)}</dd></div>
          <div><dt>Composite</dt><dd>Shopping: {first.shopping.composite.explanation} Support: {first.support.composite.explanation}</dd></div>
          <div><dt>Overall composite</dt><dd>{first.overallComposite.explanation}</dd></div>
        </dl>}
      </div>
    </section>
    <ProductScope providers={study.providers} />
    <section className="study-section study-caveats" aria-labelledby="study-caveats">
      <div className="shell">
        <div className="section-intro"><h2 id="study-caveats">Read this before the scores</h2><p>Policy-compliant resolution can include a verified policy-required next step. It does not establish actual refunds, completed account actions or human-resolved orders. This is a separately versioned Alhena Research Lab method, not an independent certification or the Gorgias leaderboard.</p></div>
        <ul className="study-limits">{study.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div>
    </section>
    <section className="study-section" aria-labelledby="study-method">
      <div className="shell study-method-grid">
        <div className="section-intro"><h2 id="study-method">How the scores were checked</h2><p>{study.audit.description}</p><Link className="text-arrow" href="/studies/policy-resolution-v1">Read the versioned methodology</Link></div>
        <div>
          <h3 className="study-subhead">What changed from the source study</h3>
          <ul className="study-list">{study.method.differences.map((value, i) => <li key={i}>{value}</li>)}</ul>
          {study.audit.limitations.length > 0 && <details className="study-disclosure"><summary>Audit notes ({study.audit.limitations.length})</summary><ul className="study-list">{study.audit.limitations.map((value, i) => <li key={i}>{value}</li>)}</ul></details>}
          <p className="study-hash">Frozen method SHA-256 <code>{study.method.sha256}</code></p>
        </div>
      </div>
    </section>
    <section className="study-section study-protected-evidence" aria-labelledby="study-evidence">
      <div className="shell">
        <div className="study-evidence-panel">
          <h2 id="study-evidence">Read every conversation behind these scores</h2>
          <p>Detailed decisions, source records and available study downloads require a verified work email. Your email and view or download activity are shared privately with Alhena. <Link href="/privacy">Privacy details</Link>.</p>
          {error && <p className="error-box" role="alert">{error}</p>}
          {details ? <><div className="form-secondary-actions">{details.downloads.map(item => <Button key={item.resource} disabled={busy} onClick={() => download(item)}>Download {item.resource === 'html' ? 'interactive report' : item.resource === 'bundle' ? 'evidence bundle' : item.resource}</Button>)}</div><p className="private-note">Each download retains the published bytes and SHA-256 pin. The method and approval receipt identify the reviewed publication inputs.</p></> : requested && !verified ? <ReportEmailVerification onVerified={() => { setVerified(true); void loadDetails(); }} /> : <Button className="study-evidence-button" disabled={busy} onClick={() => void loadDetails()}>{busy ? 'Loading…' : 'View detailed study'}</Button>}
        </div>
        {details && <EvidenceNode label="Evidence record" value={details.evidence} />}
      </div>
    </section>
    <section className="study-demo-section" aria-label="Book a demo">
      <div className="shell study-demo">
        <p><strong>Considering Alhena?</strong> See how its shopping and support agents would handle your customers’ questions.</p>
        <DemoLink placement="study" className="btn btn-primary" />
      </div>
    </section>
  </main>;
}
