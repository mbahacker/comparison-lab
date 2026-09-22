"use client";
import { type FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { post } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReportEmailVerification({ onVerified }: { onVerified: () => void }) {
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
