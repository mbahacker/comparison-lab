# Alhena Research Lab: policy-compliant resolution

Protocol `policy-resolution-v1`. This is a Lab-authored extension, not Gorgias's published automation metric. Each study freezes this method before new judgments and identifies its own completion and publication status separately.

## What the metric means

We test whether the assistant provides the correct answer or the correct next step for the request made in a public storefront session. A merchant-prescribed escalation can be a successful response. It is not evidence that a refund was issued, an order changed, or a human finished the case. Actual in-chat automation and policy-compliant resolution are different measurements.

Each submitted question is a checkpoint. Before judging, the question's expected outcome is specified without looking at the assistant's answer. A checkpoint earns one point when the response does one of these things:

- Substantively answers the request, without a material contradiction or unsupported completion claim.
- Provides the actionable next step prescribed by the merchant's published procedure, including the correct destination and information needed where those are specified.
- Requests information or authentication genuinely necessary to answer that particular request. It must advance the request; asking for order details instead of answering a general return-policy question does not qualify.

A generic contact pointer, an optional offer to connect someone, an unanswered request, or a claim that an action succeeded without evidence earns no verified credit. A published contact option alone does not prove that all requests require human handling. An unavailable or ambiguous policy produces an `unverified` decision, not an invented policy violation or assumed compliance. This distinction remains visible in the evidence.

The same rule applies to every provider. Provider capabilities and merchant configuration are not interchangeable: this study observes selected deployments. Alhena's statement that its handoffs follow merchant instructions is recorded as a vendor attestation; the comparative scoring uses each merchant's published guidelines as the common reference.

## Evidence and observation boundaries

The reference corpus identifies the merchant, URL, retrieval time, applicable region, source hash, relevant excerpts, and any conflicting provisions. An assistant's own answer is not its independent policy reference. Conflicts are retained; we do not choose a convenient provision to improve a score. Merchant facts outside the gathered reference corpus cannot receive a claim of independent factual verification.

Every decision identifies the actual response and relevant policy references. Attainment requires a quote present in that response. Evidence of necessary verification or an appropriate route does not establish downstream action completion. Product recommendations are assessed for the requested observable response; the study does not independently test product efficacy, customer-review authenticity, or conversion.

Only attempted questions enter the conditional resolution denominator. A confirmed submission with no answer earns zero; an explicitly unsent placeholder is not a failed response or a successful one. Unknown submission/actor state is unassessable. We publish submitted, assessed, unverified, unassessable and planned counts alongside the score, plus verified attainment as a fraction of all planned checkpoints. Short or stopped conversations are never presented as fully observed ten-turn tests.

Guardrail probes remain a separate result and do not enter the composite. Wrong-provider, unconfirmed-AI, inaccessible and unresolved harness-failure records are identified separately; FAQ text is not silently counted as successful AI resolution. A completed study accounts for every registered context, including exclusions and failures.

## Capture repairs and retained evidence

The original study and its scores remain immutable. A separate repair register is selected by a company-neutral cause rule: a conversation stopped solely because ordinary AI text was mistaken for a human takeover, without independent evidence of actual transfer. Every selected repair is retained even if its result is worse. Poor answers, legitimate handoffs, login requirements and ordinary unavailability are not reasons to retry.

The corrected capture process records a referral separately from actual human takeover. It does not send messages to a human, submit a ticket, invent order credentials, or infer human authorship from a footer, a policy instruction, or an optional connection offer. Original questions, browser timing and resource settings are retained. Repaired captures have new timestamps and hashes; they do not replace the old study's raw files.

## Scores and audit

Checkpoint attainment is binary. `attained` earns one; `not_attained` and `unverified` earn zero verified credit. Unassessable observations are reported separately. We average checkpoint scores within each conversation, conversations within each storefront, and storefronts within each provider. This prevents a storefront with more observed turns from dominating the result. We also expose raw numerator/denominator counts and the conservative fraction of planned checkpoints with verified attainment.

The 26 original answer-quality criteria and their weights remain separate. Quality judgments for unchanged captures retain their original provenance; repaired captures require fresh quality judgment and audit. Full-answer completion timing remains separate from policy resolution. Shopping combines resolution 40%, quality 35%, and speed 25%; support combines resolution 50%, quality 40%, and speed 10%. Speed is bounded from 100 at three seconds to zero at 22 seconds. These weights are retained for continuity, but replacing automation changes what the composite measures.

Every policy-resolution checkpoint receives a fresh primary judgment and a separate fresh audit which does not see the primary decision. Names are masked where practicable; complete anonymity is not claimed. Verified attainment requires both judgments to award credit with valid evidence. Disagreement over attainment remains visible as unverified and receives zero verified credit; no favorable tie-break or selective third judgment is used. If both agree that the request was attained but label its handling differently (for example, an answer versus a required next step), verified credit remains and the classification difference is disclosed. Quotes, references, model/runtime provenance and all corrections are retained. Arithmetic is deterministic. A missing judgment, unresolved capture repair, invalid evidence reference or incomplete audit blocks a final result.

Resolution and composite scores are rounded to one decimal only for display. For continuity, answer quality retains the original staged rounding (store means, then provider mean, to whole points), and completion time retains the original staged rounding (store pooled means to milliseconds, then seconds to one decimal, then the equal-store mean to one decimal). Speed and composites use the resulting components without an additional intermediate display-rounding step. The overall composite is the mean of the two unrounded lane composites, displayed to one decimal.

At least five storefronts must be registered for each provider and all ten core themes accounted for at each store. A headline lane composite requires at least 15 scorable conversations, 15 quality-eligible conversations, 15 timing-eligible conversations and three storefronts with resolution observations. Individual component scores can still be inspected when a lane is ineligible; a missing or ineligible lane prevents an overall composite. These are coverage floors, not proof of representativeness. The report identifies the exact source dates and method hash. This is an Alhena-operated study of selected storefronts, not an independent certification or a universal vendor ranking. Old quality-only pilot reports retain their original labels and are not silently combined with this protocol. Compatible evidence reuse retains its original capture date and is limited to 30 days.

## Publication

Public summaries and the methodology are readable without registration. Detailed evidence retains the site's verified-work-email requirement. The first revised results are presented to Ashu for review before publication. No partial score is promoted as a completed result.
