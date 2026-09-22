# Alhena Research Lab

A public evidence library and an approval-gated service for evaluating AI shopping and support tools and composing evidence-backed comparisons. Operated by Alhena; the project does not claim institutional independence or Gorgias endorsement.

## What people can do

1. Browse public comparison summaries and the rubric. Verify a work email address to inspect detailed conversations, scoring decisions and evidence downloads. Detail views and downloads notify the operator with the report title and viewer email; repeated access notifications are limited per viewer, report and action.
2. Enter their name and work email, then verify mailbox ownership with a six-digit OTP.
3. Enter one tool name and website, plus three customer names and live storefront URLs. Entry is freeform; known tools prefill their previously evaluated storefronts. Compatible published analysis captured within the last 30 days is reused with its original dates and limitations. An already evaluated tool opens its profile instead of queuing duplicate work.
4. Submit one tool and three customer storefronts. The worker verifies those deployments and researches two more from published vendor customer stories and live widget fingerprints. Only after all five are verified does `ashu@alhena.ai` receive a private approval link. Opening it has no side effects; explicit approval confirms all five deployments and queues missing work.
5. Receive an approval or rejection email. Approved requests run asynchronously; complete evidence is validated and published automatically. The tool joins the library, and comparison reports are composed against every other compatible recent tool evaluation without extra capture or judging calls. The requester receives the tool and comparison links.

The initial library includes the September 20, 2026 Alhena/Gorgias study, its original scores, full evidence and original session-isolation caveat. It is an imported historical study, not a new run performed by this application.

The detailed-evidence gate is enforced by the web API, including JSON and HTML downloads. It does not erase the initial study's already-public source files or Git history. Historical evidence that was public before this gate may still be available outside the website. Future runtime reports are held in private server storage and served through the authenticated endpoints.

## Evaluation scope

The separate [policy-resolution-v1 methodology](docs/policy-resolution-methodology.md) measures correct answers and merchant-prescribed next steps, including required escalation, alongside answer quality and response speed. Its [reusable judge and arithmetic modules](docs/policy-resolution-engine.md) apply the same rules to every provider. It is an Alhena Research Lab extension, distinct from Gorgias's automation metric. Approved studies have a separate `/studies` library and verified-email evidence access; [publication requires a reviewed, hash-pinned release](docs/policy-study-publication.md). New requests use this method throughout preparation, capture, judging and publication. Previously approved pilot requests retain their frozen protocol; historical scores are not relabeled.

The reusable [full-benchmark methodology](docs/full-benchmark-methodology.md) and [planning, aggregation and private report tools](benchmark/README.md) have been validated on a completed private live-storefront study, separately from the production pilot. They cover all ten themes and the published automation/quality/speed composite for any provider, with five sourced storefronts per tool and no company-specific scoring rules. The offline renderer verifies hashes, arithmetic and audit consistency of operator-validated inputs; it does not authenticate live capture/model provenance or publish reports. New requests use `policy-resolution-v1`: five storefronts, 50 core conversations plus five guardrail conversations, and at most 515 submitted turns per tool. Old quality-pilot requests and scores retain their original scope.

`quality-pilot-v1` evaluates each tool on three storefronts and six ten-turn conversations, using the `everyday-value` shopping theme and the `returns` support theme. All 26 published quality criteria and fixed weights apply. It is not the full five-theme benchmark or composite leaderboard. No speed or automation ranking is produced.

The worker uses fresh browser contexts, records real chat responses, runs separate AI judge and audit calls, and calculates scores deterministically. Unsupported or ambiguous widgets and failed validation pause publication. The current policy method retains partial captures: unknown speakers and unsubmitted questions are excluded explicitly, confirmed unanswered submissions remain in the resolution denominator, and observed AI replies before handover are assessed. Coverage and limitations accompany every score. Generic widget discovery cannot guarantee compatibility with every storefront; reviewed adapters can be configured by the operator.

The published pass conditions and weights are in [`rubric/criteria.json`](rubric/criteria.json). The pinned source commit and SHA-256 manifest are in `rubric/`. Gorgias reference modules are fetched into an ignored runtime cache and verified before execution. The executable reference modules are not vendored or relicensed; declarative questions and quality schemas retain their source attribution. See [`rubric/ATTRIBUTION.md`](rubric/ATTRIBUTION.md).

## Run locally

Requires Node.js 24 or later.

```sh
npm ci
npm ci --prefix worker
cp .env.example .env.local
```

For a local preview, set these values in `.env.local`:

```dotenv
APP_URL=http://127.0.0.1:3100
MAIL_TRANSPORT=file
DATA_DIR=./data
```

Then run:

```sh
npm run dev
```

Open `http://127.0.0.1:3100`. Development verification emails are written to private files under `data/mail/`; they are **not sent**. Read the matching JSON file to retrieve the OTP. The UI explicitly identifies this mode. Never use file delivery in production; the server rejects it there.

Run a separate local mail dispatcher when exercising approval and completion notifications:

```sh
node --env-file=.env.local --experimental-strip-types lib/server/mail-daemon.ts
```

To run the browser worker, configure `worker/env.example`, install Chromium, then start it in a suitable sandboxed environment. Set `MODEL_PROVIDER` explicitly to `openai`, `anthropic` or `claude-cli`, and choose supported `JUDGE_MODEL` and `AUDITOR_MODEL` IDs. Direct API providers need their matching key; `claude-cli` uses the isolated judge service described below. The server's `WORKER_SECRET` must equal the worker's `WORKER_API_KEY`. A running worker rejects incomplete configuration; it never chooses a provider based on available credentials or falls back to another provider.

All providers use structured JSON outputs with the same fixed rubric, separate judge/auditor calls and deterministic scoring. Published evidence records the provider, requested and returned model IDs, and response IDs. Direct Anthropic support uses its [Messages API structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), authenticated with an Anthropic API key.

For an existing Claude setup-token, add `compose.claude.yml` last after the shared-host overlay. Only a separate judge container receives a token-only secret file. It invokes the unmodified Claude Code CLI pinned to `2.1.198`; no application code sends raw OAuth requests. Each call has a fresh temporary home/session, exact JSON schema, disabled tools/MCP/hooks/skills and no saved session. The browser worker receives only a private transport secret, never Claude credentials or the Jarvis home directory. See the [CLI deployment and smoke-test instructions](docs/deployment.md#isolated-claude-cli-judge). This mode shares the token's subscription limits with Jarvis.

## Deploy on a web server

See [`docs/deployment.md`](docs/deployment.md). The repository includes a standalone Next.js container, a durable email dispatcher, an isolated browser worker, Docker Compose, and a sample Caddy TLS reverse proxy.

Deployment needs:

- A Linux host with Docker Compose and Chromium sandbox support.
- A domain and HTTPS origin matching `APP_URL`.
- A SendGrid API key with Mail Send access and an authenticated sender domain (`MAIL_TRANSPORT=sendgrid`). Resend remains available as an alternative. The default sender `reports@alhena.ai` is a configuration suggestion; this repository does not verify DNS or provision that mailbox.
- To run new evaluations: a random shared worker secret of at least 32 characters, explicit provider and model IDs, plus either the selected API key or the isolated Claude CLI judge configuration.

The report library, onboarding and mail dispatcher can run without worker or model credentials:

```sh
docker compose -f compose.yml -f compose.https.yml up -d --build web mailer caddy
```

The worker is behind the `worker` Compose profile. After configuring its required values, enable it with:

```sh
docker compose -f compose.yml -f compose.https.yml --profile worker up -d --build
```

Approved requests remain queued until a configured worker runs. The `workerConfigured` flag in `/api/health` reports only whether the shared worker secret is present and long enough; it does not establish that an evaluator is configured or running. Web-only startup does not claim evaluation readiness. See the deployment guide for shared-host build and resource limits.

No production credentials are committed. No actual storefront evaluation starts until the operator approves a submitted comparison and the worker is running.

## Validate

```sh
npm run typecheck
npm test
npm run build
```

Tests cover OTP expiry/reuse/lockout, request privacy, scanner-safe approvals, replay prevention, job leases and fencing, report validation, email retries, network restrictions and original-score regressions. Tests use fixtures and mocked model/email calls. They are not evidence of a successful live storefront run.

## Operations

Persistent web state is in `DATA_DIR`: SQLite stores accounts, requests, jobs, review capabilities, report metadata and the email outbox; immutable report JSON is stored beside it. The worker has a separate volume for incremental captures and pinned source caches. Never serve either data volume as static content.

```sh
npm run admin -- list
npm run admin -- outbox
npm run admin -- reissue-review REQUEST_ID
npm run admin -- retry REQUEST_ID
npm run admin -- correct-roster REQUEST_ID
```

Use the container equivalents in the deployment guide. Retry only after investigating the failed capture or configuration. A stale worker lease cannot publish. Mail delivery failure does not rerun an evaluation or unpublish a report.

This release targets a single-host SQLite deployment. Do not run multiple independent web replicas with separate SQLite files. Back up the database and report files together, and retain private worker evidence according to your operating policy.

## Source and privacy

Published evidence excludes requester contact information, OTPs, approval links and private operational notes. Contact details are used for verification, review, transactional updates and private report-access notifications to the operator. See the application's `/privacy` page.

Public source availability is for inspection. No project-wide license is granted to third-party Gorgias material. Third-party assets and dependencies remain under their own licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Tool library and discovery

The homepage has All tools and Comparison reports views, with public tables, charts and original capture dates. `/tools/[id]` profiles use stable canonical website identities and select one complete three-storefront cohort, rather than blending arbitrary stores across past runs. Single-tool evidence is stored as an immutable report. Derived pair reports retain hashes and provenance; their rows, the source evaluation, completion state and email events commit together. Existing pair reports and private request URLs remain valid.

Public tool and report summaries are server-rendered for search and agent readers. Canonical metadata, JSON-LD, `/sitemap.xml`, `/robots.txt`, `/llms.txt` and `/tool-scores.json` expose only public summaries and source links. No detailed transcripts or reader/requester identities are embedded in structured data. This enables discovery; it does not guarantee search ranking or inclusion in agent answers.

## Automated current-method pipeline

See [automated policy evaluations](docs/automated-policy-evaluations.md) for preparation, approved scope, adapter recovery, source reuse, publication validation and operational limits. Offline regression tests validate the software; they do not constitute a completed live tool evaluation.
