import { RubricWeights } from "@/components/lab/rubric-weights";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
export const metadata = { title: "Quality-pilot-v1 rubric and historical scope", alternates: { canonical: '/methodology/quality-pilot-v1' } };
export default function Page() {
  const seed = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "content/reports/alhena-vs-gorgias-2026-09-20/evidence.json",
      ),
      "utf8",
    ),
  );
  const criteria = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "rubric/criteria.json"), "utf8"),
  ).criteria as {
    id: string;
    mode: string;
    dimension: string;
    points: number;
    passes_when: string;
    signal_gate: string | null;
  }[];
  return (
    <main id="main" className="shell method-page">
      <p className="eyebrow">QUALITY-PILOT-V1 · ORIGINAL QUALITY EVALUATION</p>
      <p className="notice">This page describes the three-storefront quality pilot and the original quality criteria. <Link href="/methodology">Read the current research methodology</Link> for policy-compliant resolution, quality, speed and composite scores.</p>
      <h1>
        A fixed rubric.
        <br />
        An open evidence record.
      </h1>
      <p className="intro">
        Alhena Research Lab applies Gorgias’s published shopping and support quality
        criteria. The weights stay fixed, and every decision is backed by a
        captured response.
      </p>
      <div className="method-grid">
        <div className="method-card">
          <h3>One tool at a time</h3>
          <p>
            One tool, three selected customer storefronts. One ten-turn shopping
            conversation and one ten-turn returns conversation per storefront:
            six conversations, 60 turns and 78 criterion decisions per tool.
          </p>
        </div>
        <div className="method-card">
          <h3>Separate judging and audit</h3>
          <p>
            An AI judge scores each criterion. A separate AI audit reviews those
            decisions. Code calculates the points using the published weights
            and signal requirements.
          </p>
        </div>
        <div className="method-card">
          <h3>Fresh browser sessions</h3>
          <p>
            Newly captured conversations use a fresh browser
            context. An unsupported widget, a human takeover or incomplete
            evidence stops the run. The original pilot’s session limitations
            remain disclosed.
          </p>
        </div>
        <div className="method-card">
          <h3>Validation before publication</h3>
          <p>
            Approved runs publish automatically only after checking
            completeness, evidence references, score calculations and audit
            coverage. Failed runs remain private; missing answers do not become
            invented scores.
          </p>
        </div>
      </div>
      <p className="method-note">
        This is a quality pilot, not the full Gorgias benchmark or its composite
        leaderboard. It uses the everyday-value and returns themes. No
        automation or speed ranking is claimed. Three conversations per provider
        per lane do not meet the original benchmark’s 15-conversation threshold.
        Selected storefronts and deployment configurations limit generalization.
      </p>
      <RubricWeights criteria={criteria} />
      {["shopping", "support"].map((mode) => (
        <section key={mode}>
          <h2>
            {mode === "shopping"
              ? "Shopping · 16 criteria"
              : "Support · 10 criteria"}{" "}
            · 100 points
          </h2>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th>Points</th>
                  <th>Published pass condition</th>
                </tr>
              </thead>
              <tbody>
                {criteria
                  .filter((c) => c.mode === mode)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.id}</strong>
                        <br />
                        <small>{c.dimension}</small>
                      </td>
                      <td>{c.points}</td>
                      <td className="rubric-condition">
                        {c.passes_when}
                        {c.signal_gate && (
                          <p className="private-note">
                            Required signal: {c.signal_gate}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <h2>Source and version</h2>
      <p className="method-note">
        The source rubric is published by Gorgias. Alhena Research Lab is an
        Alhena-operated project and is not endorsed or certified by Gorgias.{" "}
        <a href={seed.study.rubric_url} target="_blank" rel="noreferrer">
          Read the canonical rubric
        </a>
        .
      </p>
      <p className="private-note">
        Pinned source commit: <code>{seed.study.source_commit}</code>. Protocol:{" "}
        <code>quality-pilot-v1</code>.
      </p>
      <h2>What a score does not prove</h2>
      <div className="prose-content">
        <p>
          The tool library shows one complete three-storefront evaluation for each
          tool. After a new evaluation passes validation, comparison reports are
          assembled against other compatible, recent tool evaluations. Each pair
          contains 12 source conversations and 120 captured turns; composing the
          report does not run new conversations or judge them again. Repeated use
          in comparison reports does not increase a tool’s sample size.
        </p>
        <p>
          Compatible analysis may be reused for 30 days from its original capture
          date. Reused conversations link to their source report and retain their
          original dates and limitations. Republishing does not reset this window.
          Only missing or expired conversations are evaluated again.
        </p>
        <p>
          The imported September 20 study did not record per-turn AI-author proof.
          Its attribution is inherited from the original report when reused;
          no new author verification is performed. New automated captures require
          positive AI-author evidence before publication.
        </p>
        <p>
          A high score describes how these captured conversations satisfied the
          specified rubric. It does not establish that a provider is universally
          better, that all factual claims are correct, or that a storefront will
          produce the same responses every time.
        </p>
        <p>
          Separate AI judging and auditing are parts of this commissioned
          evaluation. They do not make Alhena Research Lab an independent research
          institution. Full transcripts, scoring details, source checks and
          limitations accompany each completed report. Summaries and this rubric
          are public; detailed evidence requires a verified work email.
        </p>
      </div>
    </main>
  );
}
