"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { api, post, date } from "@/lib/client";
import type { AnalysisRequest, ExistingTool, ReusePreview } from "@/lib/reuse-client";
import { ComparisonDetails } from "./request-flow";

type Review = {
  request: AnalysisRequest;
  requester: { name: string; email: string };
  expiresAt: string;
  decided: boolean;
  reuse?: ReusePreview & { existingTool?: ExistingTool };
};
export function AdminReview({ token }: { token: string }) {
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api<Review>(`/review/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(""); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [token]);
  async function decide(decision: "approve" | "reject") {
    setBusy(true); setError("");
    try {
      const result = await post<{ request: AnalysisRequest }>(`/review/${encodeURIComponent(token)}`, { decision, note, confirmAttribution: confirmed });
      if (!result.request?.status) throw new Error("The saved decision could not be confirmed. Refresh this page to check its status.");
      setData(previous => previous ? { ...previous, decided: true, request: result.request } : previous);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save your decision."); }
    finally { setBusy(false); }
  }
  const isTool = data?.request.kind === "tool" || data?.request.providers.length === 1;
  const stores = data?.request.providers.reduce((count, provider) => count + provider.customers.length, 0) || 0;
  const target = data?.request.toolId ? `/tools/${encodeURIComponent(data.request.toolId)}` : data?.request.reportSlug ? data.request.reportPath || `/reports/${encodeURIComponent(data.request.reportSlug)}` : null;
  const errorText = !token ? "Open the private review link from your approval email." : error;
  return <main id="main" className="shell prose-page">
    <p className="eyebrow">PRIVATE APPROVAL</p>
    <h1>{data ? isTool ? "Review tool analysis." : "Review comparison." : "Review request."}</h1>
    {errorText && <div className="error-box" role="alert">{errorText}</div>}
    {!data && !errorText && <p role="status">Loading the request…</p>}
    {data && <div className="status-card">
      <div className="status-header"><ShieldCheck size={21} /><span className="status-label">{data.request.status.replaceAll("_", " ")}</span></div>
      <h2>{data.request.providers.map(provider => provider.name).join(" vs. ")}</h2>
      <p>Requested by <strong>{data.requester.name}</strong> · {data.requester.email}<br />Submitted {date(data.request.createdAt)}</p>
      <ComparisonDetails vendors={data.request.providers} />
      {data.request.notes && <div className="request-scope"><strong>Requester’s context</strong><p>{data.request.notes}</p></div>}
      {data.decided ? <div className="notice"><Check size={18} /><div>
        <p>Your decision is saved. {data.request.status === "queued" ? "The approved run is queued." : data.request.status === "published" ? "The completed analysis is available." : data.request.status === "rejected" ? "The request was declined." : `Current request status: ${data.request.status.replaceAll("_", " ")}.`} Requester updates are sent by email.</p>
        {target && <p><Link className="text-link" href={target}>{data.request.toolId ? "Open tool profile" : "Open report"}</Link></p>}
        <Link href="/">Return to the library</Link>
      </div></div> : <>
        <div className="request-scope">
          <strong>{isTool ? "Approve one tool analysis." : "Approve this comparison."}</strong>
          <p>{stores} storefronts, {data.request.limits?.conversations ?? stores * 2} conversations, at most {data.request.limits?.turns ?? stores * 20} new turns. Eligible analysis from the last 30 days is reused. The current plan is checked again before execution.</p>
          {data.reuse && <p>{data.reuse.reusedConversations} conversations have reusable evidence; {data.reuse.newConversations} need new testing. {(data.reuse.existingTool || data.reuse.existingReport) && "A current complete analysis already exists, so approval links to it without starting another run."}</p>}
          <p>Completed evidence publishes after validation. Unsupported widgets, incomplete evidence or unresolved audit issues stop publication.</p>
          {isTool && <p>The tool is analyzed once. Comparison reports are generated against compatible tool analyses in the library using captures from the last 30 days. Other tools’ expired analyses are not refreshed without separate approval.</p>}
        </div>
        <label className="checkbox-label"><Checkbox disabled={busy} checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /><span>I reviewed all {stores} storefronts and verified that the named {isTool ? "tool is" : "providers are"} deployed as submitted. This request is suitable for the shopping and support rubric.</span></label>
        <label className="field" style={{ marginTop: 24 }}>Message for the requester <span className="optional">Optional</span><textarea disabled={busy} maxLength={2000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Explain an approval condition or why the request is being declined." /></label>
        <div className="form-actions"><Button variant="outline" disabled={busy} onClick={() => decide("reject")}>Decline request</Button><Button className="primary-button" disabled={busy || !confirmed} onClick={() => decide("approve")}>{busy ? "Saving…" : "Approve request"}</Button></div>
        <p className="private-note">This link is private. Opening it does not approve or start a run.</p>
      </>}
    </div>}
  </main>;
}
