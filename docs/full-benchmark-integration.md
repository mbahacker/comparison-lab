# Full benchmark production integration plan

**Historical integration plan.** This records the quality-pilot starting point and proposed full Gorgias automation benchmark. Production now uses the distinct policy-resolution method; see [the implemented workflow](automated-policy-evaluations.md). Statements about the production pilot and missing protocol fields below describe the planning baseline, not current runtime behavior.

**Implementation plan, not shipped functionality. Updated 21 September 2026.**

The production application still runs `quality-pilot-v1`. The private full-method validation study is complete, including its literal audit and both scoring variants. Nothing in this plan changes that study's frozen source, captures, judgments or audit selection, and no production rollout is implied.

The proposed upgrade adds a separate, versioned `full-benchmark-v1` execution path for any provider. Existing pilot requests, jobs, reports and imported seed evidence retain their original protocol and limitations. See [the methodology](full-benchmark-methodology.md) for the exact scoring contract and documented source inconsistencies.

## Completed foundation versus remaining work

The [`benchmark/` tools](../benchmark/README.md) already provide company-neutral planning, hash-pinned reference retrieval, offline aggregation of validated evidence, private evidence rendering, compatibility fingerprints and deterministic fixture verification. They support arbitrary provider names and cohort sizes under one common method. The renderer verifies input hashes, arithmetic and audit consistency; it does not authenticate operator-provided live capture or model provenance. The initial Alhena/Gorgias study is a validation case, not a privileged scoring path.

These tools do **not** upgrade the public request form, approval workflow, production capture/judge worker, evidence validator, reuse library or automatic publication path. The aggregation tool consumes already validated inputs; its arithmetic checks are not transcript, judgment or publication validation. Declared execution hashes must later be checked against actual execution provenance.

## Unresolved onboarding choice

**Recommendation: require five storefronts up front.** This makes the proposed sample and workload explicit before operator review and avoids an additional sourcing workflow. The user's preference remains unresolved; do not silently implement this recommendation as an accepted decision.

The alternative is to accept three storefronts, enter a `needs_sourcing` stage, and source two more verified deployments before approval. That alternative requires an operator workflow to record the added storefronts, attribution evidence and revised scope. It must not silently convert a three-storefront submission into authorization for a larger run.

Either option must reach a frozen, reviewed roster of at least five sourced storefronts before a full-method job starts. At five storefronts, one tool has 50 core contexts and five guardrail contexts: 500 planned core questions plus 15 guardrail probes. Planned questions are not counts of messages actually submitted or answers measured.

## 1. Pin request intent and approved execution

Relevant files: [`lib/server/api.ts`](../lib/server/api.ts), [`lib/server/db.ts`](../lib/server/db.ts), [`lib/server/security.ts`](../lib/server/security.ts), [`lib/server/model.ts`](../lib/server/model.ts), [`components/lab/request-flow.tsx`](../components/lab/request-flow.tsx), [`components/lab/admin-review.tsx`](../components/lab/admin-review.tsx).

Requests currently have no protocol field, and approval calls the current `protocol()` function. Add request protocol/version metadata at submission. Backfill existing requests, including pending ones, as `quality-pilot-v1`; changing the default must not reinterpret an earlier request.

Retain `jobs.protocol_json` as the immutable approved snapshot. The full snapshot must include the reviewed roster, attribution and adapter references, normalized question/source hashes, execution fingerprint, protocol limits and approval scope. Generate review text and workload counts from that snapshot instead of the current three-storefront/60-turn constants.

If sourcing changes the roster before approval, preserve the submitted and final proposed roster separately. Approval authorizes the reviewed final roster. Edits after approval require a new approval or versioned amendment, not mutation of an active snapshot.

## 2. Dispatch workers by protocol and make full runs resumable

Relevant files: [`lib/server/api.ts`](../lib/server/api.ts), [`worker/index.mjs`](../worker/index.mjs), [`worker/protocol.mjs`](../worker/protocol.mjs), [`benchmark/protocol.mjs`](../benchmark/protocol.mjs), [`benchmark/plan.mjs`](../benchmark/plan.mjs).

The claim endpoint is currently protocol-blind. Add supported-protocol capability filtering so an old or pilot-only worker cannot claim a full-method job. Keep pilot capture, judge and validation behavior behind the existing protocol ID; add a separate full runner rather than increasing the pilot's loop counts.

The current worker writes under `attempt-<fencingToken>` and applies a four-hour job budget. A full run needs explicit protocol budgets and durable checkpoints for each context and model judgment across leases. Use immutable content-addressed artifacts with a server-authorized manifest or checkpoint index, tied to job ID, approved snapshot and fencing token. Preserve finished outcomes, original source hashes and model receipts on resume. Do not resend completed conversations or rejudge completed evidence merely because a lease changed.

An interrupted dispatch with uncertain submission is not automatically safe to replay. Retain the attempt and require the documented recovery policy. Ordinary poor responses, handovers and blocked outcomes are evidence, not retry triggers. Keep the source-prescribed single cold login-wall retry separate from diagnosed harness repairs.

## 3. Add a full-method evidence schema and validator

Relevant files: [`lib/server/evidence.ts`](../lib/server/evidence.ts), [`worker/evidence.mjs`](../worker/evidence.mjs), [`worker/protocol.mjs`](../worker/protocol.mjs).

The pilot schema requires two themes, a complete AI answer on every turn and an audit of every criterion. Reusing it for the full method would reject legitimate handovers, unsent placeholders, login walls and unmeasured replies. Preserve that validator for pilot evidence; add a separately versioned full schema and protocol-dispatched validation.

Full evidence must contain or hash-reference:

- The complete registered context set and the sealed completion manifest.
- Every raw attempt, selected canonical capture, original capture date, source version and documented exclusion.
- Recorded turns, observed dispatch boundaries where available, unsent placeholders, raw timing and attribution evidence.
- Exact primary packets and verdicts, model/prompt/schema/runtime provenance and quote checks.
- The literal sampled audit, actual provider/lane/core-versus-guardrail coverage, pre-audit cache, literal post-audit cache and canonical rederivation/difference ledger.
- Independently verified eligibility, denominators, staged aggregation, confidence intervals and limitations.

Validation must derive the source's eligibility and arithmetic from verified artifacts rather than trust worker-supplied totals or `passed` flags. Every registered attempt must be accounted for; every attempt need not be eligible or answer all questions. A completed but ineligible lane remains explicitly unranked.

If the Lab retains an additional automatic-publication review threshold, identify it as application governance rather than an upstream scoring rule. Do not silently import the pilot's all-criteria audit requirements into the full method or change the literal audit-merger behavior.

## 4. Extend the isolated judge service through an explicit contract

Relevant files: [`judge/server.mjs`](../judge/server.mjs), [`judge/cli.mjs`](../judge/cli.mjs), [`worker/judge.mjs`](../worker/judge.mjs), [`worker/claude-client.mjs`](../worker/claude-client.mjs), [`worker/model-provider.mjs`](../worker/model-provider.mjs).

The HTTP judge service currently accepts only pilot schemas. The CLI wrapper defaults to 180 seconds and 10,000 output tokens; the pilot judge uses its own prompts and audits every conversation. The full method therefore needs an allowlisted versioned request contract, not reuse of the pilot request with a different model name.

The contract should bind the pinned primary prompt/schema, declared auditor specification, explicit model and effort, bounded timeout/output settings and runtime hashes. Preserve fresh sessions, queue limits, process-group cleanup, disabled tools/MCP/hooks/skills/session persistence, and the separate credential-bearing container. Browser subprocesses must remain credential-free.

Do not port the private study's SSH and `docker exec` bridge into the production worker. Reuse the isolated service transport with recorded full-method provenance. Runtime/model changes must invalidate compatibility; declared hashes must match what actually executed.

## 5. Partition reuse and comparison composition by protocol

Relevant files: [`lib/server/reuse.ts`](../lib/server/reuse.ts), [`worker/reuse.mjs`](../worker/reuse.mjs), [`benchmark/protocol.mjs`](../benchmark/protocol.mjs).

Current reuse assumes three stores, six conversations and one conversation per lane. Add a full-cohort path instead of extending that two-lane selector. Reuse only immutable, compatible full evidence captured within 30 days of its original timestamps, checked again during planning, approval, claim and completion. Republishing never refreshes age. Pilot and seed evidence remains historical and must never supply full-method timing or scores.

Whole-cohort reuse is the safest initial integration. Partial reuse additionally needs scenario keys including theme, original source references, complete cohort reconstruction and an explicitly sealed evaluation/audit. Selecting arbitrary latest shopping/support lanes is insufficient.

Automatic library comparisons must inherit each separately completed tool evaluation's **unchanged scores and audit decisions**. Disclose each source study, capture dates and coverage. Combining primary caches and selecting a new joint sample of 24 can change which audit corrections apply; inherited audits must not be described as a newly sampled joint audit. Derived comparisons add no observations or model judgments.

This composition rule does not modify the completed private joint study, which retains its own frozen cohort and literal 24-conversation audit. The source's 90-day ranking window and the application's 30-day reuse rule remain separate concepts.

## 6. Preserve atomic publication and private evidence access

Relevant files: [`lib/server/publication.ts`](../lib/server/publication.ts), [`lib/server/api.ts`](../lib/server/api.ts), [`lib/server/db.ts`](../lib/server/db.ts).

Retain content-addressed immutable report files, the publication transaction, unique comparison generation keys, idempotent completion receipts and transactional notification outbox. Dispatch summary generation, validation and comparison composition by protocol.

Larger raw artifacts need immutable manifests and authenticated download routes. Do not place them under public static paths or inline screenshots into unrestricted summaries. Associate artifact access with the source report's existing work-email gate and audit policy. Keep requester data, review tokens, credentials and private runtime details outside public summaries.

Existing mailbox verification, owner-only request status, operator approval links, report access logging and notification deduplication remain applicable. Source acquisition, validation and artifact preparation should occur outside long database transactions; final publication remains atomic and must recheck the active lease and source integrity.

## 7. Version public score semantics and presentation

Relevant files: [`lib/client.ts`](../lib/client.ts), [`lib/server/public-data.ts`](../lib/server/public-data.ts), [`components/lab/report-access.tsx`](../components/lab/report-access.tsx), [`components/lab/report-explorer.tsx`](../components/lab/report-explorer.tsx), [`components/lab/tool-profile.tsx`](../components/lab/tool-profile.tsx), [`components/lab/report-library.tsx`](../components/lab/report-library.tsx), and the report/tool, methodology, JSON-data and SEO routes under `app/`.

Current numeric shopping/support fields mean **quality**. Full summaries need distinct automation, quality, completion latency, speed, composite, confidence interval, eligibility and denominator fields. Do not replace a quality number with a composite under the same label. Public metadata and structured data must use the same semantics as the visible report.

Partition the library by protocol and retain pilot pages and seed disclosures. A newer pilot report must not silently replace a tool's full-method score, or vice versa. Keep provider identity stable while selecting the explicitly requested compatible cohort. Counts must distinguish planned questions, recorded rows, unsent placeholders, measured replies, scored conversations and audited conversations.

Partial working artifacts have no provider headline composite or comparative conclusion. A final fully attempted report can still contain an unranked lane and must show why.

## Private-study components that can inform implementation

No private evidence should be copied into public source, and the sealed study must not be edited to support this integration.

- The private capture ledger, capture finalizer, immutable source/compatibility manifests, packet verification, quote validation and grading journals offer reusable patterns.
- The private grader currently hardcodes 100 core, ten guardrail and 110 total contexts. Replace such assumptions with a validated protocol plan in a separate production implementation.
- The private bridge hardcodes SSH, host/container identity, image and private-study readiness checks. These are operational study scaffolding, not a reusable production service.
- Provider-specific DOM adapters can share the same timing/classification contract. Each adapter still requires deployment verification and reviewed selectors; arbitrary provider names do not establish that an interface is supported.
- The original private study renderer still contains study names, source-filter examples and historical arithmetic material. The separate reusable [`benchmark/report.mjs`](../benchmark/report.mjs) now renders arbitrary operator-validated cohorts, with partial headline suppression and complete-input hash/arithmetic/audit checks. Production integration must still authenticate lineage, enforce evidence access controls and preserve each report's limitations; local rendering is not a deployed worker or publication gate.
- `benchmark/aggregate.mjs` already supplies reusable pinned arithmetic. It does not replace capture/judgment lineage validation or publication authorization.

## Test and rollout boundary

Before making the full method the default, test:

1. Existing pending/running pilot requests across migration, mixed worker capabilities, unknown protocol rejection and immutable approval snapshots.
2. The selected onboarding path, required final storefront count, source evidence and approval scope.
3. Restart/lease loss without repeated finished captures or judgments; uncertain dispatch, prescribed login retry and diagnosed harness failures remain distinct.
4. Literal handover, login-wall, null-timing, guardrail, eligibility, audit selection and both audit-scoring variants.
5. Thirty-day boundaries, future/invalid dates, changed source/runtime/prompt hashes, pilot/full rejection and immutable derived comparisons.
6. Completion replay, transaction rollback, comparison deduplication and exactly-once notification enqueueing.
7. Public summary/SEO semantics versus protected raw evidence, artifact authorization, private-data exclusion and safe transcript rendering.

Keep deterministic arbitrary-provider fixtures separate from real evidence. After the private validation and cold review, perform a bounded operator-approved full-tool run through the integrated path before changing the default. Resource limits, concurrency and coexistence with other services need explicit validation; the current pilot allocation must not silently be enlarged or described as equivalent to the private capture profile.

Until those boundaries are implemented and verified, production remains the quality pilot. This document records the required work, not authorization to alter the active study, deploy services or publish unfinished results.
