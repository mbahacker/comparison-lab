# Full shopping and support benchmark methodology

**Status: private validation study completed, 21 September 2026; production integration remains separate.** All 110 registered capture records are sealed, all 84 eligible conversations have primary judgments, and the source-selected 24-conversation audit is complete. The reusable renderer verified both final scoring variants against copied, immutable live-study inputs. A user-requested stop and subsequent resumption are preserved in the private execution receipts. The deployed application still runs [`quality-pilot-v1`](../worker/protocol.mjs): three storefronts per tool, one shopping theme and one support theme per storefront, and quality scores only. It does not yet run or publish the full automation, quality and speed benchmark described here. Existing pilot reports and imported evidence must retain their original scope and limitations.

The reusable [`benchmark/` tools](../benchmark/README.md) prepare company-neutral cohort plans, retrieve hash-pinned references, aggregate already validated local evidence and render private evidence reports. The offline renderer verifies hashes, arithmetic and audit consistency of operator-validated inputs; it does not authenticate live captures or model judgments. These tools do not run the production capture/judge workflow, approve requests or publish reports. Their compatibility fingerprint is a preliminary check, not a substitute for verifying immutable captures and actual judge/auditor prompt, schema, model and execution provenance.

This method applies to any provider. The first completed private validation cohort compares Alhena and Gorgias. Its audit addressed 312 criterion decisions, with 97.4% agreement and eight corrections across six conversations; the literal and canonical variants produced identical scores for this cohort. The source's lexical sample selected 24 Alhena conversations and none from Gorgias. Alhena Research Lab commissions the work. A separate model audit is not independent third-party certification, and a selected storefront sample is not evidence about every customer deployment or the whole market.

## Source contract

The reference is Gorgias's published [benchmark repository][repository], pinned to **`19b1420d2520d48baa52be81ac33fc4b9bd0ff8b`**. The primary aggregation path is the homepage's [`runner/gen.js`][gen], which implements the published shopping **40/35/25** and support **50/40/10** component weights. Other report surfaces have different filters; their outputs must not be blended with this path.

Freeze the commit, downloaded source hashes, roster, URLs, questions, run environment, judge configuration and planned exclusions before scoring. Record amendments and their reasons with immutable prior versions. Link upstream source rather than assuming a license to redistribute its executable code. The repository did not declare a source-code license when inspected.

## Identical sampling rule for each provider

1. Source at least **five verified deployed storefronts** per provider, following the [upstream sourcing floor][readme]. Record the provider's website identity, each storefront URL, the attribution source and observation date. A vendor roster plus observable widget/source signatures supports deployment attribution; it does not reveal the actual backend model or configuration.
2. Run every theme below on every storefront. Each theme starts in its own cold browser context. Use the exact questions from [`pools.js`][pools] and the source's [`normalizeUserMessage`][message-style], preserving question order.
3. Run the separate guardrail conversation on each storefront. Keep it out of the core component scores.
4. Apply the same capture, failure, exclusion, scoring and audit rules to every company. Do not select a favorable answer or rerun a poor response.

| Lane | Themes | Questions per theme |
| --- | --- | ---: |
| Shopping | `everyday-value`, `gift`, `problem-solver`, `compare-budget`, `beginner` | 10 |
| Support | `tracking`, `returns`, `damaged`, `order-mgmt`, `policy` | 10 |
| Separate shopping guardrail | `guardrails` | 3 |

At five storefronts, one provider has **50 core conversations and 500 planned core turns**, plus **five guardrail conversations and 15 probes**. Two providers have 100 core conversations plus ten guardrail conversations. Larger studies scale the same recipe. These are planned counts, not claims that all messages were submitted, answered, measured or judged.

The shopper follows a fixed question sequence rather than adapting to the agent's clarifying questions. For example, the specific-need shopping theme never supplies a concrete product need. Preserve that sequence for replication, while disclosing that it can produce clarification loops and does not represent an adaptive customer conversation. Do not fill in missing preferences or order details to improve a provider's result.

The five-storefront sourcing floor and the ranking gate are different requirements. The executable ranking gate requires **at least 15 latency-valid core conversations per lane and non-null quality**; it does not independently enforce five distinct stores. A lane that falls below the gate remains unranked, even if all planned contexts were attempted.

## Capture, outcomes and eligibility

Preserve the literal timing and classification code in [`run.js`][run], [`classify.js`][classify], [`conversation-outcome.js`][outcomes] and [`reply-clean.js`][reply-clean]. An adapter may locate a different widget, but must not change the questions, timer, response thresholds or outcome rules.

Adapter readiness includes the storefront's observed cart drawers, page navigation, collapsed-chat recovery and handoff forms, as well as opening the composer. A successful opening check alone does not validate those later states. Recovery after a submitted question must preserve the original clock and verify that the current question is still in the actual conversation. Never resend that question, substitute a cached answer, or assume that a recreated chat preserved its history. If the storefront really loses the conversation, retain the incomplete outcome rather than treating it as an implementation defect without evidence.

Validate adapter changes in a real browser against the observed DOM structure as well as isolated control-flow tests. An attached transcript wrapper can have no visible bounding box while its child messages remain readable; a closed offscreen drawer can still satisfy a basic visibility check. Readability and an active, reachable UI control require separate evidence. Offline test markup is software validation, never storefront benchmark evidence.

- DOM polling is every 250 ms. Completion time is the last observed text change minus the send timer's start, confirmed after five seconds of stability. The stability confirmation itself is not added to latency.
- A response requires growth and at least 80 characters of cleaned substance; typing, stall, chip and offline indicators do not qualify. The primary timeout is 120 seconds, with a 135-second outer operation watchdog (15 seconds beyond the primary timer). Eligible timed-out turns without an operation error receive up to 60 seconds of late-flush observation; a late response retains its actual latency.
- Before the next turn, wait for six seconds of quiet, bounded at 30 seconds. The literal late-flush path requires growth over 120 characters, six seconds of quiet and substantive text.
- Four consecutive unmeasurable AI turns stop the conversation and leave unsent placeholders. Handover attribution is sticky; remaining scripted messages are not sent to a human.
- The source stores up to the first 4,000 reply characters plus an ellipsis and a 500-character tail. Preserve full available diagnostic transcript artifacts separately.
- A login wall receives exactly one source-prescribed retry in a fresh context. Retain both raw attempts and their timestamps/hashes; identify which attempt is the canonical context record. This is distinct from diagnosed harness exclusions. Do not bypass authentication or CAPTCHA.

**Unmeasured does not mean no visible answer.** A legitimate short clarifier or refusal can fail the source's length/growth gate. Null timing remains null, not zero or a fabricated 120-second value. The judge packer also supplies an empty reply for a turn with null completion time. Whole-widget DOM text and the pinned chrome cleaner can retain provider-specific footer text. Disclose these source-filter limits; do not silently clean or award credit differently for one provider.

[`gen.js`][gen] excludes quarantined records, separates guardrails, then excludes connectivity failures, login-gated records and provider mismatches. Provider ambiguity metadata is not automatically a mismatch. Latency validity requires at least three measured AI replies and no explicit `valid: false`. Outcome counts and quality collection occur before the latency filter, so the automation, quality and latency populations can differ. Preserve those denominators.

The source classifies zero timed AI replies without a handoff CTA as `no_answer` first. Otherwise, a handover flag produces `handover`, any qualifying directive deflection produces `deflected`, and the remaining engaged conversation is `automated`. Pure handoff-only CTA text has its timing cleared. Optional contact asides and offers to remain in chat have source regex guards. Scripted-turn success rate is a separate diagnostic, not automation.

Automation here measures classified containment. Quality is judged from the captured conversation under cold-session, logged-out constraints. Neither independently verifies catalog facts, policy accuracy against a separate source, or the completion of a refund, cancellation or other order action. Preserve the published scoring rules and describe this evidence boundary; do not add an undisclosed factual-verification score or call containment a verified resolution rate.

The deflection classifier examines the cleaned reply without considering whether the shopper asked for contact details. A direct answer to that question can therefore count as a deflection, as can a warranty explanation that directs the shopper to email a claim. Preserve the classification and distinguish it from a separate judgment that the answer was unhelpful or the escalation inappropriate.

A post-completion diagnostic also reproduced three Alhena support handover labels caused by the generic handover regex spanning an ordinary request to share an order number and the residual footer “AI Agent by Alhena AI.” Removing only that footer from a diagnostic copy of the cleaned text eliminated each match. The original captures, source and scores remain unchanged. This is a classifier/DOM-text interaction, not proof of human takeover. Because the source runner stops after a detected handover, later questions were unsent; a valid completed outcome cannot be reconstructed by relabeling those records. Future provider adapters must inspect which widget labels survive cleaning and how they interact with the frozen classifiers. Any corrected execution must be separately identified and preserve the original replication evidence.

Only a documented, diagnosed implementation failure can justify a harness exclusion or protocol amendment. Arbitrary runtime errors are not automatically excluded. Archive excluded bytes and reasons before replay; preserve unaffected captures under their original source hashes with an explicit compatibility record. Record dispatch boundaries only when observed. A question string in a raw record is not proof of successful submission.

The upstream [widget adapters][vendors] include send paths that suppress input interaction errors and a reader that can return empty text when a chat frame is absent. Zero measured replies therefore do not establish vendor nonresponse when submission is unconfirmed. Preserve the literal numeric classification, but disclose that uncertainty and inspect the actual UI before deciding whether an adapter defect justifies replay. An article/feedback flow without a composer is a different state from a functioning conversational agent. Platform attribution alone does not confirm generative AI capability, and an escalation button must not be used to send the remaining script to a human.

## Components, rounding and scores

These formulas follow [`lane-weights.js`][weights] and the ranked path in [`gen.js`][gen]. `round` means the source's JavaScript `Math.round`; `round1` rounds to one decimal.

| Component | Exact aggregation rule |
| --- | --- |
| Automation, **A** | `round(100 × automated / (automated + handover + deflected))`. Pool counts over included storefront/lane/run-date rows. `no_answer` is outside this denominator. |
| Quality, **Q** | Score each conversation with the fixed binary checks. Round the conversation mean within each storefront/lane/run-date row, then round the equal-weight mean of those row scores. Do not replace this with a pooled conversation mean. |
| Completion latency, **L** | Within each row, pool eligible AI completion timings, round the mean to integer milliseconds, then serialize seconds to one decimal. Take the equal-weight mean of those parsed row latencies and round to one decimal again. |
| Speed, **S** | `clamp(100 × (22 − L) / 19, 0, 100)`, with L in seconds: 100 at or below 3 seconds and 0 at or above 22 seconds. |
| Shopping composite | `round(0.40 × A + 0.35 × Q + 0.25 × S)` |
| Support composite | `round(0.50 × A + 0.40 × Q + 0.10 × S)` |
| Overall | Only when both lanes are ranked: mean of the two rounded lane composites, displayed as a rounded integer. Source sorting retains the underlying half-point mean. |

TTFT and p75 are diagnostics, not composite inputs. The generic weights helper can renormalize missing components, but the homepage's ranked path uses the full weights after its eligibility gate. Do not use the helper alone to manufacture an eligible rank.

The source's [`composite-ci.js`][ci] computes a 95% t interval over storefront composites, requiring at least three stores with all components. Storefronts, not conversations, are the uncertainty unit. Lane intervals round to one decimal. The homepage combines lane intervals as `round1(sqrt(shoppingCI² + supportCI²))`, without dividing by two. Preserve and disclose that implementation; do not silently substitute another interval. Equal displayed scores and overlapping intervals do not establish a resolved superiority claim.

## All 26 quality criteria

[`rubric/criteria.json`](../rubric/criteria.json) contains the complete pass definitions, source commit and provenance. The following IDs, weights and gates match the pinned canonical [`eval-score.js`][score] and [`eval-rubric.md`][rubric]. Shopping has 16 checks totaling 100; support has ten totaling 100. A model judges pass/fail evidence, never a numeric grade.

| Lane | Dimension | Check ID | Points | Signal gate |
| --- | --- | --- | ---: | --- |
| shopping | answer | `a_direct` | 14 | — |
| shopping | answer | `a_consistent` | 9 | — |
| shopping | answer | `a_no_ignored` | 7 | — |
| shopping | discovery | `d_clarify` | 8 | — |
| shopping | discovery | `d_progressive` | 7 | — |
| shopping | discovery | `d_not_dump` | 5 | — |
| shopping | recommendation | `r_named` | 9 | — |
| shopping | recommendation | `r_fit` | 8 | — |
| shopping | recommendation | `r_plausible` | 5 | — |
| shopping | rich | `e_price` | 6 | `has_price` |
| shopping | rich | `e_link` | 7 | `has_link` |
| shopping | rich | `e_reviews` | 3 | `has_reviews` |
| shopping | rich | `e_options` | 2 | `has_options` |
| shopping | close | `c_cta` | 5 | — |
| shopping | close | `c_cart` | 3 | — |
| shopping | close | `c_clean` | 2 | — |
| support | resolution | `s_answered` | 18 | `no_deflect` |
| support | resolution | `s_outcome` | 12 | `no_deflect` |
| support | resolution | `s_no_deflect` | 10 | `no_deflect` |
| support | accuracy | `g_specific` | 13 | — |
| support | accuracy | `g_consistent` | 5 | — |
| support | accuracy | `g_grounded` | 7 | — |
| support | actionability | `t_steps` | 12 | — |
| support | actionability | `t_complete` | 8 | — |
| support | close | `k_expectations` | 8 | — |
| support | close | `k_clean` | 7 | — |

Canonical scoring requires every boolean verdict and at least three trimmed evidence characters for a passed check. Deterministic signals cap credit; they never grant it. The four shopping gates detect rich elements. Support's `no_deflect` signal is false when at least half of attempted AI replies contain a qualifying directive deflection. That majority rule is different from automation's any-deflection rule. Apply [`eval-signals.js`][signals] unchanged.

Rich-element signals are regular-expression checks over captured reply text, not an independent test of clickable controls or completed cart actions. Describe a missed criterion as missing qualifying captured evidence; it does not, by itself, prove that a provider lacks that capability.

## Primary judge and audit

[`eval-pack.js`][pack] masks provider/store names, including the first store-name token, and uses opaque IDs with a separate private map. It omits unsent turns and exposes only the first 2,400 cleaned, masked reply characters for measured answers. It requires conversation validity but does not duplicate every aggregation exclusion. Report packed, judged and aggregated counts separately.

The official [`judge-api.mjs`][judge] defaults to **`claude-opus-4-8`, effort `high`**, native Anthropic Messages streaming, adaptive thinking, 8,000 maximum output tokens and strict structured JSON. It runs one conversation per call, with concurrency four. Preserve its rubric, instructions, schema and quote validation. Refusals and truncated outputs fail validation. Passing quotes are checked against normalized transcript text; unsupported quotes are demoted by the source validator. [`eval-merge.js`][merge] derives numeric totals, limits saved evidence to 160 characters and learning to 300. Save the actual model, prompt/schema/request hashes, transport and output provenance separately.

The literal [`eval-audit.js`][audit] default selects up to **24 scored conversations**, sorting IDs lexically within each lane and alternating lanes. Despite a source comment, it does not hash IDs. It is not provider-stratified. Eligible scored guardrails can enter the audit even though guardrails are excluded from composites. Retain the selected sample and report provider, lane and core/guardrail coverage; do not resample for balance.

The auditor receives primary verdicts, unblinded IDs and the raw last 450 characters of each reply tail, rather than the primary judge's masked 2,400-character packet. Use a fresh auditor context and preserve the rubric's audit/trap instructions. `AGREE` keeps a check; `FALSE_POSITIVE` fails it; `FALSE_NEGATIVE` passes it with evidence. Agreement rounds to one decimal; the source labels it trusted at 90% or higher. That label is not itself a hard publication gate in [`verify-data.js`][verify]. The verifier's rounded judge-coverage threshold is 90%, including valid guardrails, although prose describes every valid conversation as judged. Attempt every eligible judgment and expose missing coverage.

### Source inconsistencies that must remain visible

- **Audit versus canonical scoring:** the audit merger's embedded scorer omits all three support `no_deflect` gates and canonical minimum-evidence validation. It rederives changed conversations only. Keep the immutable pre-audit cache, literal post-audit output, and a separately named canonical rederivation with a difference ledger. The published-pipeline replication uses the literal path; never silently choose whichever score looks better.
- **Different public report paths:** the detailed report widget adds eight-timed-turn and 30%-timing-coverage filters and differs in latency/CI rounding. This method follows the homepage generator; any secondary reconstruction must be labeled separately.
- **Documentation drift:** upstream prose includes older quality weights and a 3.5-second settling description. The pinned executable modules govern this specification.
- **Model calibration:** upstream [server guidance][server] calls for calibration when judge/model/prompt behavior changes. Matching the model name and prompt does not prove equivalent behavior across transports.

## Date windows, reuse and evidence publication

The source's [`ranking-window.js`][window] uses **90 inclusive calendar days ending on the latest run-directory date**, with cutoff at latest minus 89 days. Its separately baked 30/60/90-day views are distinct populations. Record the chosen view.

The application's **30-day reuse policy** is separate: age is measured from the original capture timestamp, not publication or reuse time. Republishing never refreshes evidence. Current pilot reuse does not make a capture compatible with this full method. A future full-method reuse implementation must additionally verify the whole cohort's questions, source/scoring contract, timing data, judge configuration and capture-environment compatibility. The current private full-method validation uses fresh captures and does not import quality-only seed scores or missing timings.

Automatic library comparisons should compare separately completed, compatible tool evaluations while inheriting each source's unchanged scores and audit decisions. Disclose the source study, capture dates and audit coverage for each tool. Combining their score caches does not create a newly sampled joint audit: the source's 24-conversation selection over a combined cohort can differ from either original sample and therefore change which corrections apply. A derived comparison adds no new observations or model judgments. The frozen two-provider validation remains one joint study with its own literal 24-conversation audit; this composition rule does not alter that selection. The literal sample contains 24 Alhena conversations and none from Gorgias, which must remain explicit rather than being described as a balanced cross-provider audit.

A final evidence report must include the frozen roster and question source, capture starts, actual attempts/retries, raw outcomes, exclusions and reasons, component denominators, timing, criteria, audit corrections, model/source hashes and limitations. `capturedAt` records a context start. Report its observed range and the completion seal separately; do not invent an exact last-response timestamp where upstream does not save one. Keep private raw evidence behind the work-email gate if this method is integrated into the application; public summaries must still show scope, capture dates, eligibility and limitations.

Partial artifacts show progress and raw evidence with **no provider headline composite or comparative conclusion**. Full report assembly requires the sealed planned cohort, verified source/raw hashes, resolved grading status, completed literal audit, coverage checks and reconciled arithmetic. A fully attempted but ineligible lane remains unranked. Historical leaderboard arithmetic checked from published rows is a separate validation, not fresh capture, independent transcript rejudging or reproduction of historical scores.

## Current validation departures

The private first validation keeps the pinned timing, classification, packing, scoring and homepage aggregation logic, with these disclosed differences:

- Reviewed DOM adapters support additional providers. Known UI controls can reopen the same conversation; recovery after sending stays on the original clock and requires visible question continuity. No cached reply, private response API, timer reset or favorable-response retry substitutes for observation.
- Browser capture omits upstream stealth patches and runs nonroot, sandboxed and read-only through a public-destination proxy with a credential-free environment. The frozen primary profile is three CPUs, 4 GiB RAM and two concurrent contexts. Geography, browser build, network and CPU contention can affect speed. Resource calibration and diagnosed adapter failures are separately archived under amendments, not scored as primary conversations.
- Existing account authentication invokes unmodified, pinned **Claude CLI 2.1.198** with explicit **Opus 4.8/high** in fresh sessions. The primary prompt and both packet formats follow the pinned source. Upstream delegates auditor invocation; the current study separately records its fresh auditor prompt/schema, drawn from the upstream rubric and trap instructions, rather than claiming an official byte-identical auditor prompt. Calls are serialized in a separate private 1 GiB/0.25-CPU container; tools, MCP, hooks, skills and session persistence are disabled. Browser processes receive no judge credentials. The CLI transport, system envelope and token-budget semantics differ from the official native API. No historical API-versus-CLI calibration has established equivalence.
- Known consent/recording notices require operator authorization; adapters do not generically accept new terms. Provider attribution and AI/human classification retain the limitations of observed DOM and source heuristics.

These differences prevent claiming an exact reproduction of the historical leaderboard or an independently certified provider ranking. The completed private validation does not upgrade the live application. Explicit product integration and separate rollout validation remain required before the application can describe itself as executing this full method.

[repository]: https://github.com/gorgias/ai-agent-benchmark/tree/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b
[readme]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/README.md#L66
[gen]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/gen.js
[pools]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/pools.js
[message-style]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/message-style.js
[run]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/run.js
[vendors]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/vendors.js
[classify]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/classify.js
[outcomes]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/conversation-outcome.js
[reply-clean]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/reply-clean.js
[weights]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/lane-weights.js
[ci]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/composite-ci.js
[score]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-score.js
[rubric]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-rubric.md
[signals]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-signals.js
[pack]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-pack.js
[judge]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/judge-api.mjs
[merge]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-merge.js
[audit]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-audit.js
[verify]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/verify-data.js
[server]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/server/README.md
[window]: https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/ranking-window.js
