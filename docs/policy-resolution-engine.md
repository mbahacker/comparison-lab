# Reusing the policy-resolution method

The reusable scoring code is provider-neutral:

- `benchmark/policy-judge.mjs` defines the fixed model instructions, output schema, response and merchant-policy quote checks, and conservative reconciliation of two blind judgments. It is a byte-identical copy of the frozen judge core used by the September 2026 study. It makes no model or network calls.
- `benchmark/policy-resolution.mjs` defines the method, equal-conversation and equal-store arithmetic, coverage floors, quality/speed weights, and complete-cohort validation.
- `benchmark/policy-export.mjs` projects collector-verified evidence into a public summary and an evidence document. It checks merchant identities and observation masks, and excludes private runtime fields. It does not authenticate raw captures or grant publication approval.
- `benchmark/policy-report.mjs` renders a standalone interactive evidence report. The default output is marked as an unpublished review copy.
- `benchmark/policy-privacy.mjs` removes private cart, session and customer links from the display projection after judgments and arithmetic. It preserves source captures and scores, records each redacted field and is not a substitute for the final privacy review.

A future study must register at least five storefronts per provider and all ten core themes per store, independently document the merchant policies, preserve actual capture dates and observation limits, and freeze its inputs before judging. Each included checkpoint needs a fresh primary judgment and a fresh blind audit. Neither run may see the other's decision. Full-name anonymity is not assumed. Apply identical evidence rules to every provider and keep exclusions in the published coverage.

The transport and study collector must bind every capture, prompt, model response, audit and runtime amendment to immutable content hashes. The pure modules cannot prove that a transcript was observed live or that a declared audit is independent. A completed publication needs that lineage review and the separately approved publication manifest described in `policy-study-publication.md`.

New submissions run the five-storefront policy-resolution workflow described in [automated policy evaluations](automated-policy-evaluations.md). Existing quality-pilot jobs retain their frozen protocol; publishing a policy-resolution study does not migrate those jobs, reuse their scores as PCR, or mix the two methods in the library.
