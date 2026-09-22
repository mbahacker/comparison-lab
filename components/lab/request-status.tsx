"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, date } from "@/lib/client";
import type { AnalysisRequest } from "@/lib/reuse-client";
import { ComparisonDetails } from "./request-flow";

const explanation: Record<string, string> = {
  researching: "We are verifying the submitted deployments and researching two more storefronts. All five will be reviewed before evaluation starts.",
  pending_review: "Your request is waiting for review. We’ll email you after a decision.",
  queued: "Your request has been approved and is queued for evaluation.",
  running: "The evaluation reuses eligible published evidence and captures, judges and audits any new conversations. We’ll email you when the completed analysis is published.",
  judging: "The captured conversations are being scored against the published rubric.",
  auditing: "The scoring decisions are being audited before validation.",
  rejected: "This request was not approved. See the reviewer’s note below.",
  failed: "The run could not complete. No incomplete analysis has been published. The operator has been notified.",
  needs_review: "This run needs the operator’s attention before it can proceed. No new analysis has been published from this request.",
  needs_adapter: "A storefront chat could not be tested reliably. The operator has been notified, and no new analysis has been published from this request.",
};

export function RequestStatus({ id }: { id: string }) {
  const [request, setRequest] = useState<AnalysisRequest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback((signal?: AbortSignal) =>
    api<{ request: AnalysisRequest }>(`/requests/${encodeURIComponent(id)}`, { signal }).then(data => {
      if (!signal?.aborted) { setRequest(data.request); setError(""); }
    }).catch(failure => {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Unable to load your request.");
    }).finally(() => { if (!signal?.aborted) setLoading(false); }), [id]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => { void load(controller.signal); }, 30000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [load]);
  const isTool = request?.kind === "tool" || request?.providers.length === 1;
  const index = request?.status === "published" ? 4 : ["pending_review", "rejected"].includes(request?.status || "") ? 1 : request?.status === "queued" ? 2 : 3;
  const target = request?.toolId ? `/tools/${encodeURIComponent(request.toolId)}` : request?.reportSlug ? request.reportPath || `/reports/${encodeURIComponent(request.reportSlug)}` : null;
  return <main id="main" className="shell prose-page">
    <Link href="/" className="back-link"><ArrowLeft size={16} />Tool library</Link>
    <p className="eyebrow">{isTool ? "YOUR TOOL ANALYSIS" : "YOUR REQUEST"}</p>
    <h1>{request ? request.providers.map(provider => provider.name).join(" vs. ") : "Request status"}</h1>
    {error ? <div className="status-card">
      <div className="error-box" role="alert">{error}</div>
      <p>Request details are private. If your session has expired, verify the same work email again to view this request.</p>
      <Link className="button primary" href="/request">Verify work email <ArrowRight size={16} /></Link>
    </div> : request ? <>
      <div className="status-header"><span className="status-label">{request.status.replaceAll("_", " ")}</span><span className="private-note">Submitted {date(request.createdAt)}</span></div>
      <ol className="status-timeline">{["Email verified", "In review", "Approved", "Evaluating", "Published"].map((step, i) => <li key={step} className={i <= index ? "reached" : ""}>{step}</li>)}</ol>
      <div className="status-card">
        <h2>{request.status === "published" ? isTool ? "Your tool analysis is ready." : "Your comparison report is ready." : "We have your request."}</h2>
        <p>{request.status === "published"
          ? isTool ? "The completed tool analysis is published. Open its profile to explore the results and any available comparisons." : "The completed comparison is published. Its conversations and scoring evidence are available to explore."
          : explanation[request.status] || "The request is being processed."}</p>
        {request.reviewNote && <div className="request-scope"><strong>Reviewer’s note</strong><p>{request.reviewNote}</p></div>}
        {target && <Link className="button primary" href={target}>{request.toolId ? "Explore the tool analysis" : "Explore the report"} <ArrowRight size={16} /></Link>}
        {request.status === "published" && !!request.comparisons?.length && <div className="request-scope">
          <strong>Available comparison reports</strong>
          <ul className="mt-3 space-y-2">{request.comparisons.map(report => <li key={report.slug}><Link className="text-link" href={report.path || `/reports/${encodeURIComponent(report.slug)}`}>{report.title} <ArrowRight size={14} /></Link></li>)}</ul>
        </div>}
        {isTool && <p className="private-note">Comparison reports use compatible tool analyses captured within the last 30 days. Other tools are not retested automatically; refreshing older evidence requires a new approved request.</p>}
        <ComparisonDetails vendors={request.providers} />
        <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh status"}</Button>
      </div>
      <p className="private-note">Only your verified session can view this request. Your name and email do not appear in published evidence.</p>
    </> : <p role="status">Loading your request…</p>}
  </main>;
}
