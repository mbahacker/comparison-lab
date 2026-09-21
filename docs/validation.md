# Validation record

Validated locally on September 20, 2026 with Node.js 24.19.0.

- `npm run typecheck`: passed.
- `npm test`: 32 tests passed, zero failures. Fixtures and mocked model/email calls only.
- `npm run build`: optimized production build passed.
- Standalone production server: library, methodology, health, report API, evidence JSON and original HTML all returned HTTP 200; the seed library contained exactly one report.
- Browser: local file-delivery OTP, freeform two-provider/six-storefront entry, consent, successful submission, private status page, reviewer page and rejection verified. The fictional request was rejected and never queued for a live run.
- Evidence explorer: selecting a Tatcha score opens its exact conversation and captured first question.
- Responsive library: rendered at 390 pixels without page overflow; desktop controls also inspected.
- Independent code review: confirmed fixes for AI authorship, mail/lease separation, exact quotation and audit validation, and transient transport retries.

## Still requires the deployment environment

Docker is not installed on the development machine, so images and Compose startup were not executed locally. CI builds both images. Actual transactional email delivery, browser sandbox startup on the target host, model calls and live storefront capture must be verified before production launch. No new live evaluation was performed as part of this application build. The supplied September 20 report is imported historical evidence, with its original limitations preserved.

## Brand and report visualization refresh

- 36 tests pass, including four new chart aggregation checks against the unchanged published evidence.
- Production build and standalone HTTP checks pass for the homepage, report, evidence API and both generated social images.
- A separately configured runtime APP_URL correctly appears in homepage and report social metadata; this does not depend on the build machine origin.
- Browser verification covers lane switching, exact conversation drill-down, restored deep links after reload, public provider-name prefill and 390-pixel mobile layouts.
- Original report evidence and rubric JSON are unchanged.
