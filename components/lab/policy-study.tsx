"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ReportEmailVerification } from './report-email-verification';
import { api, date, score } from '@/lib/client';
import { POLICY_LABEL, type PolicyStudyDetails, type PolicyStudySummary, type StudyMetric } from '@/lib/policy-study';

function Metric({ label, metric }: { label: string; metric: StudyMetric }) {
  return <div><p className="eyebrow">{label}</p><strong>{metric.value === null ? 'Not eligible' : `${score(metric.value)} / 100`}</strong><p className="private-note">{metric.explanation}</p></div>;
}
/** Details are mounted lazily; transcript text is never inserted as HTML. */
function EvidenceNode({ label, value }: { label: string; value: unknown }) {
  const [opened, setOpened] = useState(false);
  if (value === null || typeof value !== 'object') return <p><strong>{label}: </strong><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value)}</span></p>;
  const entries = Object.entries(value);
  return <details className="method-card" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary>{label} · {entries.length} {Array.isArray(value) ? 'records' : 'fields'}</summary>{opened && entries.map(([key, item]) => <EvidenceNode key={key} label={key} value={item} />)}</details>;
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
  return <main id="main" className="shell report-page">
    <Link href="/studies" className="back-link">All policy-resolution studies</Link>
    <div className="report-heading"><div><p className="eyebrow">ALHENA RESEARCH LAB · {study.protocol}</p><h1>{study.title}</h1><p className="intro">{study.description}</p><p className="private-note">Commissioned by {study.commissionedBy}. Published {date(study.publishedAt)}. Captures {date(study.captureStartAt)} to {date(study.captureEndAt)}.</p></div></div>
    <div className="caveat"><strong>Interpret the scores within their public-session scope.</strong><p>Policy-compliant resolution can include a verified policy-required next step. It does not establish actual refunds, completed account actions or human-resolved orders. This is a separately versioned Alhena Research Lab method, not an independent certification or the Gorgias leaderboard.</p>{study.limitations.map((item, i) => <p key={i}>{item}</p>)}</div>
    <div className="report-stats">{[[study.sample.capturedCoreContexts, 'Captured core contexts'], [study.sample.judgedCoreContexts, 'Judged core contexts'], [study.sample.guardrailContexts, 'Guardrail contexts'], [study.sample.auditedPcrDecisions, 'Audited PCR decisions']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {(['shopping', 'support'] as const).map(mode => <section key={mode}><h2>{mode === 'shopping' ? 'Shopping' : 'Support'}</h2><div className="summary-score-grid">{study.providers.map(provider => <article className="summary-score-card" key={provider.id}><h3>{provider.name}</h3><Metric label="Composite" metric={provider[mode].composite} /><Metric label={POLICY_LABEL} metric={provider[mode].policyResolution} /><Metric label="Quality" metric={provider[mode].quality} /><Metric label="Full-answer speed score" metric={provider[mode].speed} /></article>)}</div><div className="data-table-wrap"><table className="data-table"><caption>{mode} evidence coverage</caption><thead><tr><th>Company</th><th>Checkpoints: planned / attempted / observed</th><th>Recorded submitted / assessed / unassessable</th><th>Attained / unverified</th><th>Contexts: included / excluded</th><th>Stores: included / excluded</th><th>Quality eligible: contexts / stores</th><th>Captures: original / repaired</th></tr></thead><tbody>{study.providers.map(provider => { const c = provider[mode].coverage; return <tr key={provider.id}><th>{provider.name}</th><td>{c.plannedCheckpoints} / {c.attemptedCheckpoints} / {c.observedCheckpoints}</td><td>{c.submittedCheckpoints} / {c.assessedCheckpoints} / {c.unassessableCheckpoints}</td><td>{c.attainedCheckpoints} / {c.policyUnverifiedCheckpoints}</td><td>{c.includedContexts} / {c.excludedContexts}</td><td>{c.includedStores} / {c.excludedStores}</td><td>{c.qualityEligibleContexts} / {c.qualityEligibleStores}</td><td>{c.originalCaptures} / {c.repairedCaptures}</td></tr>; })}</tbody></table></div></section>)}
    <section><h2>Overall composite</h2><div className="summary-score-grid">{study.providers.map(provider => <article className="summary-score-card" key={provider.id}><h3>{provider.name}</h3><Metric label="Overall composite" metric={provider.overallComposite} /></article>)}</div></section>
    <section><h2>Method and audit</h2><p>{study.audit.description}</p>{study.audit.limitations.map((value, i) => <p key={i}>{value}</p>)}{study.method.differences.map((value, i) => <p key={i}>{value}</p>)}<p><Link href="/studies/policy-resolution-v1">Read the versioned methodology</Link></p><p className="private-note">Frozen method SHA-256: <code style={{ overflowWrap: 'anywhere' }}>{study.method.sha256}</code></p></section>
    <section className="study-protected-evidence"><h2>The evidence behind the scores</h2><p>Detailed decisions, source records and available study downloads require a verified work email. Your email and view or download activity are shared privately with Alhena. <Link href="/privacy">Privacy details</Link>.</p>{error && <p className="error-box" role="alert">{error}</p>}{details ? <><div className="form-secondary-actions">{details.downloads.map(item => <Button key={item.resource} disabled={busy} onClick={() => download(item)}>Download {item.resource === 'html' ? 'interactive report' : item.resource === 'bundle' ? 'evidence bundle' : item.resource}</Button>)}</div><p className="private-note">Each download retains the published bytes and SHA-256 pin. The method and approval receipt identify the reviewed publication inputs.</p><EvidenceNode label="Evidence record" value={details.evidence} /></> : requested && !verified ? <ReportEmailVerification onVerified={() => { setVerified(true); void loadDetails(); }} /> : <Button disabled={busy} onClick={() => void loadDetails()}>{busy ? 'Loading…' : 'View detailed study'}</Button>}</section>
  </main>;
}
