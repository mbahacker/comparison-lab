# Policy-study publication scaffold

This is unpublished integration scaffolding, not completed scoring or a production worker upgrade. The catalog is empty unless an operator deliberately installs an approved release. No existing study, pilot score or private evidence is copied by this code.

`/studies` lists approved policy-resolution studies; `/studies/policy-resolution-v1` describes the versioned methodology, with study completion and publication status kept separate. `/studies/[slug]` exposes only the whitelisted public summary and JSON-LD. `/study-scores.json` exposes that same summary contract for machines. The homepage, sitemap and llms.txt discover this separate namespace. Existing `/reports`, tool-library, quality-pilot jobs, 30-day reuse and automatic publication are unchanged.

## Release input

Install a reviewed `DATA_DIR/published-studies/catalog.json` with schema `alhena-research-lab/policy-catalog-v1` and `studies: [{path, sha256}]`. Each entry pins a manifest with schema `alhena-research-lab/policy-publication-v1`, `status: "approved"`, and a unique `slug`. Its `summary`, `evidence`, `method` and `validation` fields are `{path, sha256}` pins. Optional `html` and `bundle` pins provide a self-contained interactive HTML report and ZIP evidence bundle. Relative paths must stay inside the private published-studies directory, including after symlink resolution. Do not put these files under `public/`.

The exact public schema is `PolicyStudySummary` in `lib/policy-study.ts`, validated by `lib/server/policy-studies.ts`. Dimensions are separate: policy-compliant resolution (PCR), quality, full-answer speed score, lane composite and overall composite. Missing eligibility is `null`, never zero. Coverage distinguishes planned, attempted, observed, recorded-submitted, assessed and unassessable checkpoints, attained/unverified checkpoints, included/excluded contexts and storefronts, quality eligibility and original/repaired captures. Counts are diagnostic denominators; they do not replace the equal-conversation-then-store aggregation.

The validation receipt has schema `alhena-research-lab/policy-publication-validation-v1`, protocol `policy-resolution-v1`, `status: "complete"`, and `approvedForPublication: true`. It pins `summarySha256`, `evidenceSha256`, `methodSha256` and any `htmlSha256`/`bundleSha256`; records `plannedCoreContexts`, `capturedCoreContexts`, `pcrDecisions`, `auditedPcrDecisions`, and `approvedAt`; and requires each of these booleans to be true: `captureComplete`, `scoringComplete`, `pcrAuditComplete`, `provenanceReviewed`, `publicSummaryReviewed`, `evidencePrivacyReviewed`, `thirdPartyExcerptsReviewed`.

These declarations must come from the completed scoring/provenance review and Ashu's publication approval. The viewer checks hash binding, dates, complete counts and basic coverage consistency. It does **not** authenticate judgments, reconstruct PCR arithmetic, independently verify policy sources, or grant publication approval. The exporter must run the frozen policy-resolution module's complete-cohort and arithmetic checks, validate capture/judgment lineage and all independent audits, and bind their receipts before creating the release. No upload/publish API is provided.

## Private evidence boundary

Detailed JSON, HTML, ZIP, the frozen method and validation receipt use `/api/studies/[slug]/{details,evidence,html,bundle,method,validation}`. The existing verified-work-email session, origin checks, private/no-store cache headers, and view/download notifications apply. Access keys are namespaced `study:<slug>`; repeated notifications retain the existing 24-hour deduplication. The unchanged OTP form is shared with the pilot. React renders JSON as escaped text and expands evidence lazily; no private evidence enters SSR, structured data or the public catalog.

Only publication-reviewed evidence belongs in the package. Keep full third-party policy pages/snapshots private; publish source URLs, hashes and brief excerpts totaling at most 25 quoted words per individual page. Do not include raw runtime/SSH metadata, session tokens, keys, reader data or private infrastructure receipts. Captured research transcripts may be included after the same privacy review. HTML must be self-contained and include an in-document Content Security Policy because HTTP response headers are not retained when a saved file is reopened; include referenced evidence downloads in the ZIP rather than relying on private filesystem paths. Hash verification is not a privacy sanitizer.

The public projection removes private cart/session/customer links from displayed replies and quotations after source validation and scoring. Redaction locations and reasons are retained; original capture hashes still identify the private evidence. Judgments and scores are not recomputed from the redacted text. Inspect the final artifacts for other identifiers and private data before marking the privacy review complete.

## Before any deployment or publication

Freeze and hash the final method, verify the public methodology matches that method, finish all scoring/audits, create the sanitized evidence package and summary, review the exact final scores/coverage/claims with Ashu, then prepare the approved manifest/catalog. Cold-review the actual release and access routes before deployment. No result from the original source-automation study may be relabeled as PCR without the new decisions and audit.

## Operator installer

`lib/server/install-policy-study.ts` is a filesystem-only operator CLI included in the web image. It shares the production reader's schemas, complete-count/date checks, approval declarations and all artifact hash validation. It does not create approval, sign receipts, infer privacy clearance, change scores/timestamps/HTML, send email, or call a model. The approval receipt must already come from the completed review and Ashu's publication approval. Its declarations remain operator assertions, not cryptographic proof that a person approved them.

Prepare a package directory containing `releases/<slug>/<release-id>/manifest.json` and its known pinned artifacts. The release ID uses lowercase letters/digits/underscores/hyphens, starts with a letter/digit and is at most120 characters. Every artifact pin must be a unique path within that same release prefix, relative to the package root. Preserve those exact paths after installation. Source catalog files and other unpinned package files are ignored. Source artifacts are limited to64MiB each/128MiB total, with a1MiB manifest limit. The destination data directory must already exist; `published-studies` is created only by an explicit install.

Validate first (no destination writes):

```sh
node --experimental-strip-types lib/server/install-policy-study.ts \
  --source /absolute/private/approved-package \
  --manifest releases/APPROVED-SLUG/RELEASE-ID/manifest.json \
  --sha256 EXACT_MANIFEST_SHA256 \
  --data-dir /absolute/private/data
```

In the deployed image, an approved package can be staged privately in the existing data volume, outside `published-studies`. A host upload owned by `ubuntu` (UID1000) with0700 permissions is not readable by the app (UID1001). Give only the approved staged package tree UID/GID1001 ownership and0700-directory/0600-file modes before running the CLI; preserve the destination data volume's existing ownership. If using `docker cp`, its newly copied files can be root-owned, so correct that narrowly staged tree first. Do not run the installer as root or recursively change the existing data volume's owner. The Dockerfile copies the CLI, actual reader, its `lib/policy-study.ts` dependency and Zod. Use the same command inside the existing web container, first without `--install`, then with it only after approval and successful validation:

```sh
sudo -n docker exec --user 1001:1001 comparison-lab-web-1 \
  node --experimental-strip-types lib/server/install-policy-study.ts \
  --source /data/operator-staging/APPROVED-PACKAGE \
  --manifest releases/APPROVED-SLUG/RELEASE-ID/manifest.json \
  --sha256 EXACT_MANIFEST_SHA256 --data-dir /data --install
```

The installer rejects symlinks below the explicitly selected source/data roots, traversal, wrong hashes, missing approval, inconsistent dates/counts, a different release for an already-published slug, or different bytes at an existing release path. A previously installed identical release returns `already-installed` without rewriting the catalog. It copies only pinned bytes, uses0700 directories/0600 files, takes an exclusive `.install.lock`, validates the staged snapshot through the production reader, adds immutable files first and atomically activates the merged catalog last. Prior catalog entries and unrelated data remain intact. Run it as the data-volume owner (the production web image uses UID1001); do not make the data tree writable to untrusted users.

Each attempted installation retains a private `.installations/<transaction-id>/` directory with an absent-catalog marker or exact previous catalog bytes, the proposed catalog and a completion/failure receipt. A failure before catalog activation leaves the old catalog live; unpublished copied files remain available for an exact-byte retry. If failure occurs after rename (for example a final receipt/directory-sync failure), inspect the actual live catalog before deciding whether to retry; an identical completed install is idempotent. A crash can leave `.install.lock`; do not automatically remove it until the recorded owner is confirmed stopped. The CLI does not implement destructive rollback. To withdraw a bad release, restore the exact prior catalog atomically (or move the catalog out of the live path if the prior state was absent), preserving all release bytes and current database/user/mail state. Changing an already-published study requires a separately reviewed release-management action; this initial installer intentionally rejects replacement.
