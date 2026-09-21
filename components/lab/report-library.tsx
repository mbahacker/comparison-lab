"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Search,
  FileText,
  ArrowUpRight,
  RefreshCw,
  ShoppingBag,
  MessagesSquare,
  ScanLine,
  ClipboardCheck,
  Globe2,
  ChevronRight,
} from "lucide-react";
import { api, ReportSummary, score, date } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReportLibrary() {
  const [reports, setReports] = useState<ReportSummary[]>([]),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError("");
    api<{ reports: ReportSummary[] }>("/reports")
      .then((d) => setReports(d.reports))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const shown = reports.filter((r) =>
    `${r.title} ${r.description} ${r.vendors.join(" ")}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  const latest = reports[0];
  return (
    <main id="main" className="library">
      <section className="lab-hero shell">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> ALHENA COMPARISON LAB
          </p>
          <h1>
            Put ecommerce AI
            <br />
            <span>to the test.</span>
          </h1>
          <p className="intro">
            Go beyond the demo. See how AI agents answer real shopping and
            support questions, with the conversations behind every score.
          </p>
          <div className="hero-actions">
            <a href="#reports" className="button primary">
              Explore the evidence <ArrowDownRight />
            </a>
            <Link href="/request" className="button outline-button">
              Test your shortlist <ArrowUpRight size={17} />
            </Link>
          </div>
          <p className="hero-note">
            <ScanLine size={16} /> Open evidence. Published criteria. No email
            required to explore.
          </p>
        </div>
        {latest ? (
          <FeaturedSnapshot report={latest} />
        ) : (
          <div className="hero-snapshot snapshot-placeholder">
            <ScanLine size={40} />
            <h2>The answers are the evidence.</h2>
            <p>
              Every completed report includes conversations, criterion decisions
              and the limits of its findings.
            </p>
          </div>
        )}
      </section>
      <div className="shell">
        <section className="proof-ribbon" aria-label="Evaluation protocol">
          <div>
            <Globe2 />
            <span>
              <strong>Real storefronts</strong>
              <small>Live customer-facing agents</small>
            </span>
          </div>
          <div>
            <ClipboardCheck />
            <span>
              <strong>26 published criteria</strong>
              <small>Fixed weights for every provider</small>
            </span>
          </div>
          <div>
            <MessagesSquare />
            <span>
              <strong>Inspectable conversations</strong>
              <small>Follow the evidence, turn by turn</small>
            </span>
          </div>
        </section>
        <section className="library-section" id="reports">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE EVIDENCE, OPEN TO EVERYONE</p>
              <h2>Look closer. Decide with confidence.</h2>
              <p>
                Compare the scores. Then read what the agents actually said.
              </p>
            </div>
            <span className="report-count">
              {reports.length} published{" "}
              {reports.length === 1 ? "report" : "reports"}
            </span>
          </div>
          <div className="library-tools">
            <div className="section-label">Comparison reports</div>
            <div className="search-wrap">
              <Search size={18} />
              <Input
                aria-label="Search reports"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search companies or reports"
              />
            </div>
          </div>
          {loading && (
            <div className="empty-state" role="status">
              Loading published reports…
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
              <Button variant="outline" onClick={load}>
                <RefreshCw size={16} />
                Try again
              </Button>
            </div>
          )}
          {!loading && !error && shown.length === 0 && (
            <div className="empty-state">
              <FileText />
              <h2>
                {q ? "No matching reports" : "The first report is on its way"}
              </h2>
              <p>
                {q
                  ? "Try a company name or clear your search."
                  : "You can submit a comparison for review now."}
              </p>
              {q && (
                <Button variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              )}
            </div>
          )}
          <div className="report-list">
            {shown.map((r) => (
              <article className="report-card" key={r.slug}>
                <div className="report-card-main">
                  <div className="report-meta">
                    <span className="pill">QUALITY PILOT</span>
                    <span>{date(r.publishedAt)}</span>
                  </div>
                  <h2>
                    <Link href={`/reports/${r.slug}`}>{r.title}</Link>
                  </h2>
                  <p>{r.description}</p>
                  <div className="report-facts">
                    <span>
                      <b>{r.storeCount}</b> storefronts
                    </span>
                    <span>
                      <b>{r.turnCount}</b> test turns
                    </span>
                    <span>
                      <b>{r.criterionCount}</b> criteria
                    </span>
                  </div>
                  <Link href={`/reports/${r.slug}`} className="button primary">
                    Explore the report <ArrowRight size={18} />
                  </Link>
                  <p className="card-disclosure">
                    Commissioned by{" "}
                    {r.commissionedBy || "the Comparison Lab operator"}. Results
                    describe this sample.
                  </p>
                </div>
                <div className="score-preview">
                  <p className="eyebrow">TWO JOBS. SEPARATE QUALITY SCORES.</p>
                  {(["shopping", "support"] as const).map((mode) => (
                    <div className="preview-lane" key={mode}>
                      <h3>
                        {mode === "shopping" ? (
                          <ShoppingBag size={17} />
                        ) : (
                          <MessagesSquare size={17} />
                        )}{" "}
                        {mode === "shopping" ? "Shopping" : "Support"}{" "}
                        <small>/ 100</small>
                      </h3>
                      {r.scores.map((v, i) => (
                        <div className="preview-score" key={v.vendor}>
                          <span>
                            <i style={{ background: providerColor(i) }} />
                            {v.vendor}
                          </span>
                          <div className="preview-track">
                            <div
                              style={{
                                width: `${v[mode]}%`,
                                background: providerColor(i),
                              }}
                            />
                          </div>
                          <b>{score(v[mode])}</b>
                        </div>
                      ))}
                    </div>
                  ))}
                  <p>
                    Provider means across selected storefronts. Quality only.
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BEHIND EVERY SCORE</p>
              <h2>Same questions. Visible reasoning.</h2>
            </div>
            <Link href="/methodology" className="text-link">
              Read the full rubric <ArrowRight size={17} />
            </Link>
          </div>
          <div className="method-features">
            {[
              {
                icon: ShoppingBag,
                title: "Two real-world jobs",
                text: "Can it help a shopper choose? Can it resolve a support question? Shopping and support are evaluated separately.",
                tone: "peach",
              },
              {
                icon: ClipboardCheck,
                title: "Published scoring rules",
                text: "An AI judge and a separate audit review the captured answers. Code adds the points using the rubric’s fixed weights.",
                tone: "lavender",
              },
              {
                icon: ScanLine,
                title: "Evidence you can inspect",
                text: "Open the transcripts, check individual decisions and read the limitations. Every published score comes with its working.",
                tone: "mint",
              },
            ].map(({ icon: Icon, title, text, tone }) => (
              <article className={`method-feature ${tone}`} key={title}>
                <span className="feature-icon">
                  <Icon size={23} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="method-disclosure">
            Operated by Alhena. Sponsorship, sample limits and the full scoring
            record are disclosed with every report.
          </p>
        </section>
        <section className="request-banner">
          <div>
            <p className="eyebrow">YOUR NEXT AI DECISION STARTS HERE</p>
            <h2>
              Which two providers
              <br />
              is your team evaluating?
            </h2>
            <p>
              Bring your shortlist and three customer storefronts per provider.
              We review each request before testing.
            </p>
            <Link href="/request" className="button primary">
              Request your comparison <ArrowUpRight size={18} />
            </Link>
          </div>
          <ol className="request-journey">
            <li>
              <span>01</span>
              <div>
                <strong>Verify your work email</strong>
                <p>Your contact details stay private.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Tell us who to compare</strong>
                <p>Two providers. Three storefronts each.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Get the evidence</strong>
                <p>
                  After approval, completed and validated reports publish. We
                  email you the link.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="lab-faq">
          <div>
            <p className="eyebrow">A FEW FAIR QUESTIONS</p>
            <h2>Know what you’re looking at.</h2>
          </div>
          <div>
            <details>
              <summary>What do the scores measure?</summary>
              <p>
                Shopping and support answer quality against 26 published
                criteria. They describe the tested conversations and
                configurations. They do not combine speed or automation into an
                overall ranking.
              </p>
            </details>
            <details>
              <summary>Who runs Comparison Lab?</summary>
              <p>
                Alhena operates the project. The initial Alhena versus Gorgias
                pilot was commissioned by Alhena, with separate AI judging and
                audit. Sponsorship, methodology and limitations are disclosed
                alongside the evidence.
              </p>
            </details>
            <details>
              <summary>Can I request a different comparison?</summary>
              <p>
                Yes. Enter any two provider names and three customer storefronts
                for each. A verified work email is required to submit. Every
                request is reviewed; approval and successful completion are not
                guaranteed.
              </p>
            </details>
            <details>
              <summary>Do I need to sign up to read a report?</summary>
              <p>
                No. Published reports, conversations and evidence downloads are
                open. Email verification is only required when requesting a new
                comparison.
              </p>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
function providerColor(i: number) {
  return `var(--chart-provider-${(i % 4) + 1})`;
}
function ArrowDownRight() {
  return <ArrowRight size={18} style={{ transform: "rotate(45deg)" }} />;
}
function FeaturedSnapshot({ report: r }: { report: ReportSummary }) {
  const [mode, setMode] = useState<"shopping" | "support">("shopping");
  return (
    <aside className="hero-snapshot" aria-label="Latest report snapshot">
      <div className="snapshot-top">
        <span className="eyebrow">LATEST PUBLISHED REPORT</span>
        <span className="snapshot-badge">Quality pilot</span>
      </div>
      <h2>{r.title}</h2>
      <p className="snapshot-caption">
        The conversations behind the comparison.
      </p>
      <div className="snapshot-toggle" aria-label="Preview score category">
        {(["shopping", "support"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}>
            {m === "shopping" ? (
              <ShoppingBag size={16} />
            ) : (
              <MessagesSquare size={16} />
            )}{" "}
            {m === "shopping" ? "Shopping" : "Support"}
          </button>
        ))}
      </div>
      <div className="snapshot-scores">
        {r.scores.map((v, i) => (
          <div className="snapshot-provider" key={v.vendor}>
            <div className="snapshot-provider-top">
              <span>
                <i style={{ background: providerColor(i) }} />
                {v.vendor}
              </span>
              <strong>
                {score(v[mode])}
                <small>/100</small>
              </strong>
            </div>
            <div className="snapshot-track">
              <div
                style={{ width: `${v[mode]}%`, background: providerColor(i) }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="snapshot-facts">
        <span>
          <b>{r.storeCount}</b> storefronts
        </span>
        <span>
          <b>{r.turnCount}</b> live test turns
        </span>
        <span>
          <b>{r.criterionCount}</b> criteria
        </span>
      </div>
      <Link className="snapshot-link" href={`/reports/${r.slug}`}>
        See every answer <ChevronRight size={18} />
      </Link>
      <p className="snapshot-note">
        Mean quality scores for this sample. Commissioned by{" "}
        {r.commissionedBy || "the Comparison Lab operator"}.
      </p>
    </aside>
  );
}
