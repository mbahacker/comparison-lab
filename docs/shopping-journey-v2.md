# Shopping journey v2

This Alhena Research Lab methodology measures shopping outcomes and usable interface breadth separately. It is not the Gorgias methodology. It has an executable evidence scorer and a public methodology page. Automated multi-interface capture and production publication are not enabled. Existing jobs, public scores, support scoring and pair reports continue to use their frozen v1 methods.

## Contract

`rubric/shopping-journey-v2.json` is the canonical versioned contract, including six equally weighted tasks, five equally weighted interface types, five storefronts and observation rules. `benchmark/shopping-journey.mjs` hashes that complete contract. Changing its content changes compatibility. The same method applies to every vendor.

- **Shopping outcomes:** discovery, product grounding, comparison, variant selection, verified cart action, continuity. Each task receives 1 only if both primary judge and independent blind auditor confirm all success conditions; an observed failure or success disagreement receives 0. Mean the six tasks in each storefront, then mean the five stores, multiply by 100. No speed or historic quality score is blended into this new metric.
- **Usable shopping reach:** chat, product-page Q&A, embedded recommendations, search/discovery, cart assistance. Each type receives 1 per storefront only when deployment attribution and a usable interaction are evidenced and confirmed by both reviewers. Mean five types per store, then five stores, multiply by 100. Duplicate launchers count once. Ordinary product pages, static merchant FAQ copy, native search and standard cart UI do not count as provider-powered interfaces.
- **Unknowns:** no denominator reduction. Outcomes require all 30 cells observed for a headline; `verifiedOutcomeLowerBound` always uses all 30 planned cells. Reach requires all 25 cells resolved for a headline. Blocked, present-but-untested and missing reach cells yield a null headline and a clearly labeled verified lower bound using the full 25-cell denominator. Auditors disagreeing with a surface observation make it unresolved. An audited `not-observed` cell contributes zero to the sampled reach score, not a vendor-wide absence claim.
- **No overall score:** outcomes and reach appear side by side. Existing support results can be shown with their original version and capture dates, but must not be averaged with v2 shopping results.

Breadth describes opportunities to encounter usable shopping help. Record page placement, initial visibility, navigation effort and activation steps. It does not establish vendor intent, customer usage or conversion lift.

## Collection plan

Before testing, save an immutable plan with five verified customer domains and all six task scenarios per store. Each scenario declares shopper constraints, expected evidence, the page URL and the primary interface to use. Route choices must not depend on which attempt scored best. The plan hash binds the scoring bundle. Preserve its registration record outside the bundle; a self-reported timestamp/hash does not independently prove preregistration.

Use public desktop sessions in English. Record viewport, browser version, locale, cookie consent and any accessibility or login blockers. Inspect homepage, relevant search/category, representative product page and a cart containing a test item. Document the path taken for each surface. Provider attribution must come from the actual deployment, such as the captured widget source/network origin or verified integration record, not a marketing customer list. Preserve original screenshots, DOM/network records and response text alongside the manifest. Record any redirected destination domains explicitly for review; the initial scorer accepts only the registered storefront hostname (with www normalized), not arbitrary third-party destinations.

Run the six pre-registered tasks through their primary routes. A task may succeed entirely in chat except where product/cart state is part of the success condition. Continuity can be chat-to-native-product/cart and does not require extra provider widgets. Capture ordinary failures as observed failures. If the site or capture fails before a task can be assessed, mark blocked/unknown. Record fallbacks separately; do not silently replace the primary result with a better one. Do not place orders or contact human support as part of shopping tests.

## Evidence bundle and CLI

Use Node 24 or newer:

```sh
npm run benchmark:shopping -- /private/path/evidence.json /private/path/scored.json
```

The command only writes a new local output file, with owner-only permissions. It refuses to overwrite an existing file and never queues a job, sends mail, or publishes a study. `tests/shopping-journey.test.mjs` contains a synthetic **test fixture only**, demonstrating the complete schema; it is not storefront evidence.

Bundle fields:

- `plan`: `protocol`, `protocolHash`, `provider`, `executionProfile`, `registeredAt`, `stores`. Import the current id/hash from the scorer. Each store has `id`, `url`, and `tasks`; each task has its defined `id`, `scenario`, `constraints`, `expectedEvidence`, `primaryInterface`, and `url`.
- `planHash`: SHA-256 from exported `digest(plan)`; `evaluatedAt`: ISO timestamp.
- `artifacts`: unique `id`, `store`, `cell`, `role`, `url`, `capturedAt`, `content`, `sha256`. `content` is a preserved textual capture or manifest entry for a retained original artifact; hash it with `digest(content)`. Do not substitute invented content or a screenshot filename alone for evidence. Attach originals for independent review. All artifacts must match the registered store/cell, follow registration, precede evaluation and be at most 30 days old at evaluation.
- `cells`: one per `store`/`key`; keys use `task:<task-id>` or `surface:<interface-id>`. Include `status`, `reason` and, for observed tasks, `interface` matching the registered route. Resolved cells require `primary` and `audit`, with distinct `reviewer` identifiers, `verdict` (`pass` or `fail`), `reason`, and `evidenceRefs`. Audit requires `blind: true`. For surface reviews, pass means the claimed observation is confirmed; for task reviews, pass means the whole task succeeded.

Required roles for every observed task: `interaction`, `attribution`. Successful tasks additionally require the roles in the JSON contract. Cart action needs `cart-before` and `cart-after`; continuity needs `transition-before` and `transition-after`, strictly ordered in time. Usable interfaces need `attribution`, `interaction`, `placement`; not-observed interfaces need `discovery-path`. Both reviewers must cite the relevant evidence.

The scorer validates structure, hashes, timestamps, references and arithmetic. It cannot establish that a screenshot is authentic, that an arbitrary artifact text proves a claim, that reviewer identities are distinct people/processes, or that a reported audit was genuinely blind. Those require retained-source review and runner/auditor provenance. Retain the complete input bundle; `sourceEvidenceSha256` in the output binds the summary to that exact input. Outputs deliberately say `requires-evidence-review`, including perfect scores. Review disagreements and missing cells remain visible in the output matrix.

## Compatibility and rollout

Reused evidence must have the exact protocol hash and execution profile, be within 30 days of original capture, and satisfy the same registered tasks/conditions. A new study may reference the original frozen plan for a reused cohort; it must not backdate a new plan. `isShoppingMetricCompatible` checks one named metric for arithmetic compatibility, not publication authorization. Reach comparisons also require non-null reach scores on both sides. Each report retains both original and current dates. Do not use publication time to refresh evidence age.

Before enabling v2 submissions or publishing scores:

1. Implement and review browser collectors for every supported surface, source attribution, ordered DOM/cart state and full discovery-path capture.
2. Retain registration and primary/blind audit provenance outside the submitted evidence bundle. Add server-side revalidation, artifact privacy checks, completion/retry rules and installation tests.
3. Partition library selection, cached reuse, pair generation, machine-readable feeds and SEO by shopping protocol/hash and execution profile. Never compare the new outcome score directly with a v1 resolution/quality/speed composite.
4. Run fresh shopping studies for all compared providers under the same task contract, inspect evidence, then activate automated capture/publication explicitly.

The current worker already rejects unknown protocols instead of falling through into the pilot. This change intentionally does not repoint live requests or in-flight jobs to an unsupported collector.
