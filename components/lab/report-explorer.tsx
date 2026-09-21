"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QualityDashboard } from "@/components/lab/quality-charts";
import { ShareReportButton } from "@/components/lab/share-report";
import { ReportAccess } from "@/components/lab/report-access";
import { ReportSummary, score, date } from "@/lib/client";
type Criterion = {
  id: string;
  mode: string;
  dimension: string;
  points: number;
  passes_when: string;
  signal_gate?: string | null;
};
type Check = {
  id: string;
  points: number;
  awarded: number;
  pass: boolean;
  evidence: string;
  signal_gate?: string | null;
  signal_present?: boolean;
  audit?: Record<string, unknown> | null;
  primary?: unknown;
  final?: unknown;
};
type Conversation = {
  id: string;
  vendor: string;
  store: string;
  mode: string;
  theme: string;
  date: string;
  url: string;
  score: number;
  kind?: string;
  published_score?: number;
  checks: Check[];
  capture_metadata: unknown;
  source_capture_sha256?: string;
  reuse?: { sourceReportSlug: string; sourceConversationId: string; capturedAt: string; date: string; sourceLimitations?: string[]; historicalAuthorVerification?: boolean };
  turns: {
    turn: number;
    question: string;
    reply: string;
    reply_as_judged?: string;
  }[];
};
type Evidence = {
  study: {
    title: string;
    limitations: string[];
    scope: string;
    performed_by: string;
    scoring_statement: string;
    source_commit: string;
    rubric_url: string;
    independence_disclosure: string;
  };
  rubric: { criteria: Criterion[]; [key: string]: unknown };
  live_conversations: Conversation[];
  archived_conversations?: Conversation[];
  notes?: { id: string; title: string; category: string; markdown: string }[];
  [key: string]: unknown;
};
export function ReportExplorer({ slug }: { slug: string }) {
  return <ReportAccess slug={slug}>{(onVerificationRequired) => <DetailedReport slug={slug} onVerificationRequired={onVerificationRequired} />}</ReportAccess>;
}
function DetailedReport({ slug, onVerificationRequired }: { slug: string; onVerificationRequired: () => void }) {
  const [downloadBusy, setDownloadBusy] = useState(false), [downloadError, setDownloadError] = useState("");
  const [report, setReport] = useState<ReportSummary | null>(null),
    [evidence, setEvidence] = useState<Evidence | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [q, setQ] = useState(""),
    [target, setTarget] = useState(""),
    [chartMode, setChartMode] = useState<"shopping" | "support">("shopping");
  useEffect(() => {
    fetch(`/api/reports/${encodeURIComponent(slug)}/details`, { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (response.status === 401 || response.status === 403) { onVerificationRequired(); return null; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The detailed report could not be loaded.");
        return data as { report: ReportSummary; evidence: Evidence };
      })
      .then((d) => {
        if (!d) return;
        setReport(d.report);
        setEvidence(d.evidence);
      })
      .catch((e) => setError(e.message));
  }, [slug, onVerificationRequired]);
  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const view = params.get("view");
      setTab(
        view &&
          [
            "overview",
            "criteria",
            "conversations",
            "method",
            "sources",
          ].includes(view)
          ? view
          : "overview",
      );
      setTarget(params.get("conversation") || "");
      setChartMode(params.get("mode") === "support" ? "support" : "shopping");
      setQ("");
    }
    readLocation();
    window.addEventListener("hashchange", readLocation);
    window.addEventListener("popstate", readLocation);
    return () => {
      window.removeEventListener("hashchange", readLocation);
      window.removeEventListener("popstate", readLocation);
    };
  }, []);
  function updateLocation(view: string, id = "", mode = chartMode) {
    const params = new URLSearchParams({ view, mode });
    if (id) params.set("conversation", id);
    window.history.pushState(null, "", `#${params}`);
  }
  function changeTab(view: string) {
    setTab(view);
    setTarget("");
    updateLocation(view);
  }
  function jump(id: string) {
    setQ("");
    setTarget(id);
    setTab("conversations");
    updateLocation("conversations", id);
  }
  function changeChartMode(mode: "shopping" | "support") {
    setChartMode(mode);
    updateLocation("overview", "", mode);
  }
  async function download(format: "evidence" | "html") {
    setDownloadBusy(true); setDownloadError("");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(slug)}/${format}`, { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401 || response.status === 403) { onVerificationRequired(); return; }
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "The download could not be completed."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `${slug}-${format === "html" ? "report.html" : "evidence.json"}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setDownloadError(e instanceof Error ? e.message : "The download could not be completed."); }
    finally { setDownloadBusy(false); }
  }
  useEffect(() => {
    if (tab === "conversations" && target) {
      const el = document.getElementById(
        `conversation-${target}`,
      ) as HTMLDetailsElement | null;
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [tab, target]);
  if (error)
    return (
      <main id="main" className="shell prose-page">
        <div className="error-box" role="alert">
          {error}
        </div>
        <Link href="/">Back to reports</Link>
      </main>
    );
  if (!report || !evidence)
    return (
      <main id="main" className="shell prose-page" role="status">
        Loading the report and its evidence…
      </main>
    );
  const rows = evidence.live_conversations;
  const stores = [...new Set(rows.map((r) => `${r.vendor}|||${r.store}`))];
  const all = [...rows, ...(evidence.archived_conversations || [])];
  const matching = all.filter((r) =>
    `${r.vendor} ${r.store} ${r.mode} ${JSON.stringify(r.turns)}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <main id="main" className="shell report-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Report library
      </Link>
      <div className="report-heading">
        <div>
          <div className="report-meta">
            <span className="pill">QUALITY PILOT</span>
            <span>{date(report.publishedAt)}</span>
          </div>
          <h1>{report.title}</h1>
          <p className="intro">{report.description}</p>
          <p className="private-note">
            Commissioned by{" "}
            {report.commissionedBy || "the Alhena Research Lab operator"}. Separate
            AI judging and audit.
          </p>
        </div>
        <div className="report-actions">
          <ShareReportButton title={report.title} />
          <Button variant="outline" disabled={downloadBusy} onClick={() => download("evidence")}>
            <Download size={16} />
            Evidence JSON
          </Button>
          {report.hasHtml && <Button variant="outline" disabled={downloadBusy} onClick={() => download("html")}><Download size={16} />Full report HTML</Button>}
        </div>
      </div>
      {downloadError && <div className="error-box" role="alert">{downloadError}</div>}
      <div className="report-stats">
        {[
          [report.storeCount, "Live storefronts"],
          [report.conversationCount, "Scored conversations"],
          [report.turnCount, "Question-and-answer turns"],
          [report.criterionCount, "Published criteria"],
        ].map(([n, t]) => (
          <div key={t}>
            <strong>{n}</strong>
            <span>{t}</span>
          </div>
        ))}
      </div>
      <div className="caveat">
        <strong>An exploratory sample, with quality scores only.</strong>
        <p>
          Different storefront deployments and configurations. No overall vendor
          ranking or speed claim is established by these results.
        </p>
        {(report.limitations || [])
          .filter((l) => /session|isolation/i.test(l))
          .map((l) => (
            <p key={l}>{l}</p>
          ))}
      </div>
      <Tabs value={tab} onValueChange={changeTab} className="report-tabs">
        <TabsList>
          <TabsTrigger value="overview">Results</TabsTrigger>
          <TabsTrigger value="criteria">26 criteria</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="method">Method & limits</TabsTrigger>
          <TabsTrigger value="sources">Sources & audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <QualityDashboard
            conversations={rows}
            criteria={evidence.rubric.criteria}
            onInspect={jump}
            mode={chartMode}
            onModeChange={changeChartMode}
          />
          <h2 className="report-section-title">The live results</h2>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Storefront</th>
                  <th>Shopping /100</th>
                  <th>Support /100</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((key) => {
                  const [vendor, store] = key.split("|||");
                  return (
                    <tr key={key}>
                      <td>{vendor}</td>
                      <td>{store}</td>
                      {["shopping", "support"].map((mode) => {
                        const r = rows.find(
                          (x) =>
                            x.vendor === vendor &&
                            x.store === store &&
                            x.mode === mode,
                        );
                        return (
                          <td className="number" key={mode}>
                            {r ? (
                              <button
                                onClick={() => jump(r.id)}
                                aria-label={`Inspect ${store} ${mode} evidence`}
                              >
                                {r.score}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="private-note">
            Select a score to open its full conversation, criterion decisions
            and audit notes.
          </p>
        </TabsContent>
        <TabsContent value="criteria">
          {["shopping", "support"].map((mode) => (
            <section key={mode}>
              <h2 className="report-section-title">
                {mode === "shopping"
                  ? "Shopping: 16 criteria"
                  : "Support: 10 criteria"}{" "}
                · 100 points
              </h2>
              <div className="data-table-wrap">
                <table className="data-table criteria-table">
                  <thead>
                    <tr>
                      <th>Criterion</th>
                      <th>Points</th>
                      {rows
                        .filter((r) => r.mode === mode)
                        .map((r) => (
                          <th key={r.id}>
                            {r.store}
                            <br />
                            {r.vendor}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.rubric.criteria
                      .filter((c) => c.mode === mode)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            <details>
                              <summary>{c.id.replaceAll("_", " ")}</summary>
                              <p>{c.passes_when}</p>
                            </details>
                            <code>{c.dimension}</code>
                          </td>
                          <td>{c.points}</td>
                          {rows
                            .filter((r) => r.mode === mode)
                            .map((r) => {
                              const chk = r.checks.find((x) => x.id === c.id);
                              return (
                                <td key={r.id}>
                                  <button
                                    onClick={() => jump(r.id)}
                                    aria-label={`${r.store}: ${c.id} evidence`}
                                  >
                                    <span
                                      className={
                                        !chk
                                          ? "criterion-unavailable"
                                          : chk.pass
                                            ? "criterion-pass"
                                            : "criterion-fail"
                                      }
                                    >
                                      {!chk
                                        ? "Unavailable"
                                        : chk.pass
                                          ? "Pass"
                                          : "Fail"}
                                    </span>
                                  </button>
                                </td>
                              );
                            })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </TabsContent>
        <TabsContent value="conversations">
          <h2 className="report-section-title">
            Every question. Every captured answer.
          </h2>
          <div className="search-wrap transcript-search">
            <Search size={18} />
            <Input
              aria-label="Search conversations"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search storefronts, questions or answers"
            />
          </div>
          <p className="private-note">
            {matching.length} of {all.length} conversations. Archived regrades
            are labeled separately.
          </p>
          {matching.map((r) => (
            <ConversationPanel
              key={r.id}
              conversation={r}
              criteria={evidence.rubric.criteria}
              active={target === r.id}
            />
          ))}
          {!matching.length && (
            <div className="empty-state">
              No matching conversations.
              <Button variant="outline" onClick={() => setQ("")}>
                Clear search
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="method">
          <div className="prose-content">
            <h2 className="report-section-title">What this report measures</h2>
            <p>{evidence.study.scope}</p>
            <p>{evidence.study.scoring_statement}</p>
            <h3>Who performed the evaluation</h3>
            <p>{evidence.study.performed_by}</p>
            <p>{evidence.study.independence_disclosure}</p>
            <h3>Limits to interpretation</h3>
            <ul>
              {(evidence.study.limitations || []).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <Link className="text-link" href="/methodology">
              Read the published rubric <ExternalLink size={16} />
            </Link>
          </div>
          {evidence.supplementary_diagnostic != null && (
            <JsonDetails
              title="Separate session diagnostic"
              value={evidence.supplementary_diagnostic}
            />
          )}
          <JsonDetails
            title="Exact question pools"
            value={evidence.question_pools}
          />
          <JsonDetails
            title="Capture recoveries and excluded attempts"
            value={evidence.excluded_or_recovered_attempts}
          />
        </TabsContent>
        <TabsContent value="sources">
          <h2 className="report-section-title">The evidence record</h2>
          <p className="muted">
            Original notes and supporting records are preserved below. They may
            include technical capture details. The complete dataset is also
            available as JSON.
          </p>
          <p className="private-note">
            Rubric reference:{" "}
            <a
              href={evidence.study.rubric_url}
              target="_blank"
              rel="noreferrer"
            >
              Gorgias’s published rubric
            </a>
            . Version <code>{evidence.study.source_commit}</code>.
          </p>
          {(evidence.notes || []).map((n) => (
            <details className="notes-details" key={n.id}>
              <summary>{n.title}</summary>
              <pre>{n.markdown}</pre>
            </details>
          ))}
          {[
            ["Separate AI scoring audit", "audit"],
            ["Archived report comparison", "historical_comparison"],
            ["Published composite arithmetic", "published_math"],
            ["Canonical rubric snapshot", "rubric"],
            ["Source provenance and integrity hashes", "provenance"],
            ["Privacy redactions", "redactions"],
            ["Evidence validation", "validation"],
          ].map(([title, key]) => (
            <JsonDetails title={title} value={evidence[key]} key={key} />
          ))}
        </TabsContent>
      </Tabs>
      <section className="share-strip">
        <div>
          <h3>What does your shortlist look like?</h3>
          <p>
            Request a comparison using the same published criteria on the
            storefronts your team wants to evaluate.
          </p>
        </div>
        <Link
          className="button primary"
          href={`/request?${new URLSearchParams({ providerA: report.vendors[0] || "", providerB: report.vendors[1] || "" })}`}
        >
          Request a comparison <ExternalLink size={16} />
        </Link>
      </section>
    </main>
  );
}
function ConversationPanel({
  conversation: r,
  criteria,
  active,
}: {
  conversation: Conversation;
  criteria: Criterion[];
  active: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (active && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [active]);
  return (
    <details
      ref={ref}
      open={active || undefined}
      id={`conversation-${r.id}`}
      className="conversation-panel"
    >
      <summary>
        <div>
          <strong>{r.store}</strong>
          <small>
            {r.vendor} · {r.mode} ·{" "}
            {r.reuse ? "Reused published capture" : r.kind === "archived" ? "Archived regrade" : "Live capture"}
          </small>
        </div>
        <b>
          {r.score}
          <small> /100</small>
        </b>
      </summary>
      <div className="conversation-content">
        {r.reuse && <div className="caveat"><strong>Previously evaluated on {date(r.reuse.capturedAt || r.reuse.date)}.</strong><p>This conversation and its scoring were reused from <Link href={`/reports/${encodeURIComponent(r.reuse.sourceReportSlug)}#${new URLSearchParams({view:"conversations",conversation:r.reuse.sourceConversationId})}`}>the original report</Link>. It was not rerun for this comparison. The original capture conditions and limitations still apply.</p>{r.reuse.historicalAuthorVerification && <p>Attribution is inherited from the original report. It did not record per-turn AI-author proof, and no new verification was performed.</p>}</div>}
        <ShareReportButton
          title={`${r.store} ${r.mode} conversation`}
          label="Copy conversation link"
          fragment={new URLSearchParams({
            view: "conversations",
            conversation: r.id,
          }).toString()}
        />
        {r.kind === "archived" && (
          <p className="caveat">
            Archived transcript, regraded using the pinned rubric. Original
            published score: {r.published_score}. This is separate from the live
            sample.
          </p>
        )}
        <details className="evidence-checks">
          <summary>
            All {r.checks.length} criterion decisions and audit evidence
          </summary>
          {r.checks.map((c) => (
            <div className="check-item" key={c.id}>
              <h4>
                <span>
                  {c.id} · {c.awarded}/{c.points} points
                </span>
                <span className={c.pass ? "criterion-pass" : "criterion-fail"}>
                  {c.pass ? "Pass" : "Fail"}
                </span>
              </h4>
              <p>{criteria.find((x) => x.id === c.id)?.passes_when}</p>
              <blockquote>{c.evidence}</blockquote>
              {c.signal_gate && (
                <p>
                  Required signal: {c.signal_gate} ·{" "}
                  {c.signal_present ? "present" : "absent"}
                </p>
              )}
              {c.audit && (
                <JsonDetails
                  title="Audit decision"
                  value={{ primary: c.primary, final: c.final, audit: c.audit }}
                />
              )}
            </div>
          ))}
        </details>
        {r.turns.map((t) => (
          <article className="turn" key={t.turn}>
            <div className="turn-label">
              Turn {t.turn} of {r.turns.length}
            </div>
            <div className="question">{t.question}</div>
            <div className="reply">{t.reply}</div>
            {t.reply_as_judged && t.reply_as_judged !== t.reply && (
              <JsonDetails
                title="Exact response text supplied to the judge"
                value={t.reply_as_judged}
              />
            )}
          </article>
        ))}
        <JsonDetails
          title="Capture metadata and integrity hash"
          value={{
            url: r.url,
            date: r.date,
            metadata: r.capture_metadata,
            sha256: r.source_capture_sha256,
            reuse: r.reuse,
          }}
        />
      </div>
    </details>
  );
}
function JsonDetails({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details className="notes-details">
      <summary>{title}</summary>
      <pre>
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
