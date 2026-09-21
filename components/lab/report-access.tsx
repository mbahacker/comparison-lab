"use client";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail } from "lucide-react";
import { api, date, post, ReportSummary, score } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareReportButton } from "@/components/lab/share-report";

export function ReportAccess({ slug, children }: { slug: string; children: (onVerificationRequired: () => void) => ReactNode }) {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [verified, setVerified] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");
  const gate = useRef<HTMLDivElement>(null);
  const requireVerification = useCallback(() => setVerified(false), []);
  useEffect(() => {
    let active = true;
    api<{ report: ReportSummary; access: { verified: boolean } }>(`/reports/${encodeURIComponent(slug)}`)
      .then(data => { if (active) { setReport(data.report); setVerified(data.access.verified); } })
      .catch(e => { if (active) setError(e.message); });
    function restoreIntent() {
      if (new URLSearchParams(window.location.hash.slice(1)).has("view")) setRequested(true);
    }
    restoreIntent();
    window.addEventListener("hashchange", restoreIntent);
    return () => { active = false; window.removeEventListener("hashchange", restoreIntent); };
  }, [slug]);
  useEffect(() => { if (requested && !verified) gate.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [requested, verified]);
  if (requested && verified) return children(requireVerification);
  if (error) return <main id="main" className="shell prose-page"><div className="error-box" role="alert">{error}</div><Link href="/">Back to reports</Link></main>;
  if (!report) return <main id="main" className="shell prose-page" role="status">Loading report summary…</main>;
  return <main id="main" className="shell report-page">
    <Link href="/" className="back-link"><ArrowLeft size={16} />Report library</Link>
    <div className="report-heading"><div>
      <div className="report-meta"><span className="pill">REPORT SUMMARY</span><span>{date(report.publishedAt)}</span></div>
      <h1>{report.title}</h1><p className="intro">{report.description}</p>
      <p className="private-note">Commissioned by {report.commissionedBy || "Alhena Research Lab"}. Separate AI judging and audit.</p>
    </div><ShareReportButton title={report.title} /></div>
    <div className="report-stats">{[[report.storeCount,"Storefronts"],[report.conversationCount,"Scored conversations"],[report.turnCount,"Captured turns"],[report.criterionCount,"Published criteria"]].map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="summary-score-grid">{(["shopping", "support"] as const).map(mode => <section className="summary-score-card" key={mode}>
      <p className="eyebrow">{mode.toUpperCase()} QUALITY</p><h2>{mode === "shopping" ? "Choosing a product" : "Resolving a question"}</h2>
      {report.scores.map((entry,index) => <div className="summary-score-row" key={entry.vendor}><div><span>{entry.vendor}</span><strong>{score(entry[mode])}<small> / 100</small></strong></div><div className="summary-score-track"><span className={index === 0 ? "primary-score" : "secondary-score"} style={{width:`${Math.max(0, Math.min(100,entry[mode]))}%`}} /></div></div>)}
      <p className="private-note">Mean score across each provider’s selected storefronts.</p>
    </section>)}</div>
    <div className="caveat"><strong>Read the sample in context.</strong><p>Different storefront deployments and configurations. These quality scores do not establish an overall vendor ranking.</p>{(report.limitations || []).map(value => <p key={value}>{value}</p>)}</div>
    <div ref={gate} className="report-access-panel">
      <div><p className="eyebrow">THE EVIDENCE BEHIND THE SCORES</p><h2>See every answer and scoring decision.</h2><p>Explore the full conversations, storefront results, criterion decisions and audit notes. Download the complete evidence.</p>
      <p className="private-note"><Check size={15} /> Summary and published rubric are open to everyone. Detailed access uses a verified work email.</p></div>
      {requested && !verified ? <ReportEmailVerification onVerified={() => setVerified(true)} /> : <div className="report-access-action"><LockKeyhole size={28} /><Button onClick={() => setRequested(true)}>View detailed report <ArrowRight size={16} /></Button><p className="private-note">{verified ? "Your email is already verified." : "Verify your work email with a six-digit code."}</p></div>}
    </div>
    <p className="private-note">View or download activity and your verified email are shared privately with the Alhena team. Your email is never included in the report. <Link href="/privacy">Privacy details</Link>.</p>
    <Link href="/methodology" className="text-link">Read the published rubric <ArrowRight size={16} /></Link>
  </main>;
}

function ReportEmailVerification({ onVerified }: { onVerified: () => void }) {
  const [email,setEmail] = useState(""), [code,setCode] = useState(""), [sent,setSent] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(""), [notice,setNotice] = useState("");
  async function send(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError("");
    try { const result = await post<{message:string}>("/auth/start", {email,purpose:"report"}); setCode(""); setSent(true); setNotice(result.message); }
    catch (e) {setError(e instanceof Error ? e.message : "Please try again.");} finally {setBusy(false);}
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {await post("/auth/verify",{email,code}); onVerified();}
    catch(e) {setError(e instanceof Error ? e.message : "Please try again.");} finally {setBusy(false);}
  }
  return <form className="report-email-form" onSubmit={sent ? verify : send} aria-label="Verify email for detailed report">
    <Mail size={23}/><h3>{sent ? "Check your inbox" : "Unlock the detailed report"}</h3>
    {error && <p className="error-box" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {sent ? <><p className="muted">Enter the code sent to {email}. It expires in ten minutes.</p><label className="field">Six-digit code<Input autoFocus aria-label="Six-digit verification code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></label></> : <label className="field">Work email<Input autoFocus type="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>}
    <Button type="submit" disabled={busy || (sent && code.length !== 6)}>{busy ? "Please wait…" : sent ? "Verify & view report" : "Send verification code"}</Button>
    {sent && <div className="form-secondary-actions"><button type="button" disabled={busy} onClick={()=>send()}>Resend code</button><button type="button" disabled={busy} onClick={()=>{setSent(false);setCode("");setNotice("");setError("");}}>Use another email</button></div>}
    <p className="private-note">Alhena receives your email and the report you access. No marketing signup is required.</p>
  </form>;
}
