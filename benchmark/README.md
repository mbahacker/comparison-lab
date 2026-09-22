# Reusable full-benchmark methodology

These tools apply the same planning and aggregation contract to any shopping/support AI provider. They do not contain a preferred company or a two-company limit. The initial Alhena/Gorgias cohort is a validation study, not a special scoring path.

**Status:** the production application still executes `quality-pilot-v1`. This directory supplies reusable full-method planning, pinned reference retrieval, offline aggregation and private evidence rendering. It does not replace the production capture/judge worker, approve requests, publish reports, or assert that an arbitrary storefront adapter works. The private validation study is complete: 110 sealed captures, 84 eligible primary judgments and the literal 24-conversation audit. Both final variants passed this renderer's input, arithmetic and audit checks. The brief user-requested stop and subsequent resumption remain preserved in private execution receipts. See [the complete methodology](../docs/full-benchmark-methodology.md).

## Separation of responsibilities

1. **Tool and deployment inventory:** operator-reviewed company identity, at least five distinct customer storefronts, evidence of the responding deployment, and reviewed adapter IDs. A name entered in a form is not deployment verification.
2. **Frozen protocol:** ten core themes per storefront, ten questions per core conversation, plus a separate three-question guardrail context. The 26 quality checks, deterministic gates, automation classifier, completion timing and scoring weights come from the pinned source.
3. **Capture adapters:** open, send, and read the observed widget, including later cart, navigation and handoff states. A working composer alone does not validate the whole flow. Selectors and recovery steps are evidence-backed and separately versioned; they cannot supply answers, select scores, reset the timer, resend a submitted question, or change scenarios. Natural reopening must preserve the actual current question/history. Unsupported interfaces and genuine lost conversations remain explicit outcomes.
4. **Judging and audit:** the frozen source prompts and schemas, explicit judge model/effort, verified quotes, exact scoring code and published audit selection. The current live study has a separate private judge/auditor implementation; this directory does not claim to expose that execution as a production service.
5. **Aggregation:** consume the sealed capture dataset and the already validated score cache. Execute the pinned homepage aggregation blocks. An arithmetic result does not independently validate its source transcripts or judge decisions.
6. **Library composition:** future integration must validate immutable evidence and audit completion, match protocol/execution fingerprints, and retain original dates. The app's 30-day reuse rule is separate from the source's 90-day leaderboard window. Composing pair reports adds no new evidence or sample size.

## Prepare one tool or a cohort

```sh
npm run benchmark:plan -- INPUT.json ./data/new-full-study
```

The output directory must not already exist. This writes a manifest and roster, marked `prepared-not-executed`; it sends no messages and performs no evaluation.

The JSON input has `runDate`, `executionProfile` and `tools`:

- `executionProfile` explicitly records `browserBuild`, `captureEnvironment`, `timingProfile`; the judge's `judgeTransport`, `judgeModel`, `judgeEffort`, `judgeRuntime`; and the auditor's `auditorModel`, `auditorTransport`, `auditorEffort`, `auditorRuntime`. It also requires `judgeSpecSha256`, `auditorSpecSha256` and `timingSourceSha256`. The spec hashes must cover the actual prompt, rubric/trap text and schemas, and the timing hash must cover the unchanged timing functions. Store-specific selectors are recorded separately. The full contract requires judge `claude-opus-4-8` at `high` effort. Actual execution provenance must later verify these declarations; merely supplying a hash does not verify its contents.
- Each tool has `name`, `website` and at least five `storefronts`.
- Each storefront has `name`, `website`, `adapter`, `deploymentEvidence`, `deploymentVerified: true`, `adapterReviewed: true`, and optional `locale`. The operator sets the true values only after inspecting the actual deployment and adapter. The planner rejects missing reviews and duplicate storefront identities.

One five-storefront tool yields 50 core contexts and five guardrail contexts: 515 **planned** questions. Recorded questions, verified submissions, measured replies, eligible judgments and ranked conversations must be reported separately.

## Retrieve and verify the reference

```sh
npm run benchmark:reference
```

This retrieves hash-pinned public source into ignored private `data/benchmark-reference/<commit>/`. It does not execute downloaded modules or vendor them into this repository. `--cache PATH` chooses another private directory; `--from PATH` verifies and copies an existing source snapshot without network access. Source availability does not imply a license grant; see [attribution](../rubric/ATTRIBUTION.md).

## Aggregate validated evidence

```sh
npm run benchmark:aggregate -- \
  --workspace ./data/new-full-study \
  --source ./data/benchmark-reference/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b \
  --scores ./data/new-full-study/eval-scores.as-published-audit.json \
  --label as-published-audit
```

Input requires a full registered roster, all registered final capture attempts, `study-completion.json`, `raw-manifest.json`, and a validated score cache. The engine verifies capture hashes and pinned aggregation-source hashes. It preserves source eligibility, missing timing, staged rounding and rank thresholds. `--allow-partial` produces an explicitly partial diagnostic; it is not a completed result or a publication approval.

Run a second aggregation with the canonical audit cache and label `canonical-audit`. Retain both outputs, the pre-audit cache, audit packets and source-defined corrections. The published audit merger and canonical quality scorer differ; choosing the more favorable variant is not permitted. The declared primary path is the as-published audit variant.

The CLI is an operator tool for private, locally validated inputs. It is not an HTTP ingestion endpoint. Production integration still needs capture/judge provenance validation, evidence-access controls, leases, approval and publication gates.

## Render a private evidence report

All five paths are explicit. The output parent must exist; the output directory must be new and outside the workspace and reference directory. Rendering never alters captures or score caches and makes no network, browser, model or publication calls.

```sh
npm run benchmark:report -- \
  --workspace ./data/new-full-study \
  --source ./data/benchmark-reference/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b \
  --aggregate ./data/new-full-study/aggregation/primary-progress/aggregation.json \
  --scores ./data/new-full-study/eval-scores.json \
  --out ../document-output/full-study-private-snapshot
```

The default output is **partial**, even if its input aggregate is complete. Provider component headlines, composites and overall scores are suppressed in both `report.html` and `evidence.json`. Per-conversation scores and evidence remain inspectable. The explorer filters arbitrary company cohorts, storefronts and lanes, and loads detailed turns/criteria only when opened. Recorded questions are not counted as verified submissions; unsent placeholders and measured AI replies remain distinct.

For complete inputs add `--complete --audit PATH_TO_AUDIT_RECEIPT.json`, with matching final aggregate/cache. The output status is `complete-inputs-verified`, not independent certification or permission to publish. The renderer verifies the full registered cohort and unique raw seal, recomputes the pinned aggregate, checks criterion arithmetic, and verifies the exact source audit sample and deterministic corrections. It does not authenticate model calls, deployment attribution, browser behavior or judgment-lineage claims.

The audit receipt is operator-supplied JSON:

```json
{
  "schema": "full-benchmark-report-audit/v1",
  "complete": true,
  "variant": "as-published-audit",
  "studyManifestSha256": "SHA256_OF_STUDY_MANIFEST",
  "rawManifestSha256": "SHA256_OF_RAW_MANIFEST",
  "scoresSha256": "SHA256_OF_FINAL_SCORE_CACHE",
  "aggregateSha256": "SHA256_OF_AGGREGATE",
  "preAuditScores": { "path": "eval-scores.pre-audit.json", "sha256": "SHA256" },
  "auditedFiles": [{ "path": "audit/audited-01.json", "sha256": "SHA256" }],
  "auditSummary": { "path": "eval-audit.json", "sha256": "SHA256" },
  "judgmentProvenance": [{ "path": "operator-validated-judgments.json", "sha256": "SHA256" }]
}
```

`variant` is `as-published-audit` or `canonical-audit` and matches the aggregate label. Hashes are lowercase 64-character SHA-256 values. Pin paths are workspace-relative; directory traversal and symlink escapes are rejected. Audited files contain the literal source arrays of `{id, audit: {criterionId: {classification, evidence, ...}}}` with `AGREE`, `FALSE_POSITIVE` or `FALSE_NEGATIVE`. The source's default lexical lane-alternating sample is preserved, including its potentially uneven provider coverage. The renderer runs the hash-pinned audit merger in disposable storage and compares its cache and summary; the canonical variant additionally uses the pinned canonical scorer. A source `trusted:false` label remains visible, not silently converted into another publication gate.

At least one operator-validated `judgmentProvenance` JSON pin is required. Its bytes are verified and copied, but its claims are not authenticated. Supply only private evidence appropriate for the report, never credentials. Exact plan, roster, raw captures, aggregate, score cache, seals and audit/provenance JSON files are copied to the output with download paths and hashes. Reference source code remains external and is identified by commit and hash. Custom archive exclusions, source amendments and session-independence validation remain responsibilities of separate validators; the renderer never infers exclusions or compatibility from filenames. Production APIs and access controls are unchanged.

## Verify without storefront or model calls

For Alhena Research Lab's separate policy-compliant-resolution extension, see the [frozen methodology](../docs/policy-resolution-methodology.md), [reusable engine](../docs/policy-resolution-engine.md) and [publication contract](../docs/policy-study-publication.md). The policy judge, aggregation, evidence projection and report modules are separate from the source automation benchmark described above. Their tests run with `npm test` and make no storefront or model calls. Installing a reviewed study does not upgrade the production three-storefront request worker.

```sh
node --test tests/full-protocol.test.mjs
npm run benchmark:verify -- --source ./data/benchmark-reference/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b
npm run benchmark:verify-report -- --source ./data/benchmark-reference/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b
```

The first tests planning, protocol immutability, complete scenarios and reuse compatibility. The second checks all 26 criteria, points, signal gates, minimum evidence and lane weights against the hash-pinned executable source, then creates temporary arithmetic fixtures for four arbitrary providers. It verifies staged rounding, separate guardrails, no-answer treatment, rank eligibility and rejection of changed sealed evidence. Fixtures are deleted and never counted as live study evidence.
