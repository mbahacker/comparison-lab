# Deploy and operate Alhena Research Lab

## Launch at evals.alhena.ai

Use Docker Compose v2 on a dedicated Linux host with at least 4 GB RAM, or use the shared-host configuration below for a larger host running Jarvis alongside Alhena Research Lab. This app requires persistent storage; a static website host alone is insufficient. New evaluations also require a long-running browser worker, which can be enabled separately after the public report library and onboarding are running.

1. Clone `https://github.com/mbahacker/comparison-lab.git` onto the selected host and use a reviewed commit. Create a fresh production data volume; do not copy the local preview database, accounts, or queued test requests.
2. Copy `.env.example` to `.env`, restrict its permissions (`chmod 600 .env`), and configure all required values. `APP_URL` is `https://evals.alhena.ai`; approval emails go to `ashu@alhena.ai`. Set `MAIL_TRANSPORT=sendgrid` and configure `SENDGRID_API_KEY`. Confirm that `MAIL_FROM` is authorized by the authenticated SendGrid sender domain. Enter secrets on the host or through its secret manager, never in Git or chat.
3. In the `alhena.ai` Cloudflare zone, create an `A` record named `evals` pointing to the host's public IPv4 address. Initially use DNS-only mode for straightforward certificate provisioning. Do not change the apex or other subdomains. Only add an `AAAA` record if IPv6 reaches this same server.
4. Permit inbound TCP 80 and 443, and optionally UDP 443 for HTTP/3, in the cloud firewall. Limit SSH access to the operator. Port 3100 remains loopback-only.
5. On a dedicated host without another web server, start the bundled HTTPS proxy, application and mail dispatcher. This command needs no model credentials or worker secret:

```sh
docker compose -f compose.yml -f compose.https.yml config --quiet
docker compose -f compose.yml -f compose.https.yml up -d --build web mailer caddy
docker compose -f compose.yml -f compose.https.yml ps
curl --fail https://evals.alhena.ai/api/health
```

The HTTPS overlay adds Caddy with persistent certificate storage. Caddy obtains and renews the certificate automatically once DNS and inbound ports are reachable. If the host already has an HTTPS reverse proxy, use the base Compose file and adapt `deploy/Caddyfile` instead; do not bind a second proxy to the same ports. See the [Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https) and [official container guidance](https://hub.docker.com/_/caddy).

The `worker` service uses an opt-in Compose profile. Configure the evaluator as described below, then enable the full stack with `docker compose -f compose.yml -f compose.https.yml --profile worker up -d --build`. Without a worker, approved comparisons stay queued and `/api/health` reports whether the worker secret is configured. A configured secret alone does not prove a worker is running.

Open the homepage, initial report, conversation deep links, `/request`, and social preview images at the public URL. Inspect all `/api/health` JSON flags: HTTP 200 alone does not prove readiness. Complete the production verification steps below before claiming that new evaluations work end to end. Public report browsing can be verified separately.

Do not enable a Cloudflare "Cache Everything" rule for this application: authentication, request status, and approval routes are private and dynamic. If enabling the Cloudflare proxy after origin verification, retain strict origin TLS validation. Never log or share full approval URLs.

For later updates, use both Compose files consistently, preserve `app-data`, `worker-data`, `caddy-data`, and `caddy-config`, and take a consistent backup first. Never use `docker compose down --volumes` on production.

## Sharing a replacement host with Jarvis

For an initial 4-vCPU host with at least 16 GiB RAM and a 100 GB disk, add `compose.shared.yml` last. These starting limits are estimates for modest traffic and one sequential evaluation worker, not measured production peaks or a capacity guarantee. The overlay applies the following runtime ceilings to one instance of each service while retaining the base users, capabilities, seccomp profile, private volumes, and loopback-only web port:

| Service | CPU ceiling | Memory ceiling | Optional `.env` overrides |
| --- | ---: | ---: | --- |
| Web | 0.5 | 1 GiB | `LAB_WEB_CPUS`, `LAB_WEB_MEMORY` |
| Mailer | 0.125 | 512 MiB | `LAB_MAILER_CPUS`, `LAB_MAILER_MEMORY` |
| Browser worker | 1 | 4 GiB | `LAB_WORKER_CPUS`, `LAB_WORKER_MEMORY` |
| Caddy | 0.125 | 256 MiB | `LAB_CADDY_CPUS`, `LAB_CADDY_MEMORY` |

The defaults total 1.75 CPUs and 5.75 GiB. These are ceilings, not reserved capacity. An initial 16 GiB host budget can allocate 6 GiB to Jarvis and 2 GiB to its separate cron processes, leaving 2.25 GiB for the OS, Docker, and headroom; those Jarvis allocations require separate configuration and are not enforced by this overlay. Validate the combined budget under controlled concurrent load before relying on it. The mailer handles one message at a time and does not run Next.js or a browser. Memory includes the worker's shared-memory use. Each service's `memswap_limit` equals its `mem_limit`, preventing these containers from consuming host swap. Use positive CPU limits and Docker memory units such as `4g` or `512m` for overrides; `0` removes a CPU limit. See the [Compose CPU and memory settings](https://docs.docker.com/reference/compose-file/services/#cpus).

With `.env` configured for evaluations, validate the merged configuration without printing secrets, build during a quiet period, then start the full stack:

```sh
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml --profile worker config --quiet
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml --profile worker --parallel 1 build
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml --profile worker up -d --no-build
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml stats --no-stream
```

For web-only startup on this shared host, omit `--profile worker` and name `web mailer caddy` in the serial `build` and `up -d --no-build` commands. No model key, model ID, provider selection or worker secret is required for those services. Keep the same three Compose files so resource ceilings still apply.

Runtime limits do not cap Docker/BuildKit image builds. Build on the replacement host before cutting Jarvis over to it. For later updates, serial builds reduce overlapping work, but an individual build can still use additional CPU and memory. Leave build headroom, avoid Jarvis cron peaks, and watch host memory and load; build off-host for the matching CPU architecture if adequate headroom is unavailable. Do not infer that the runtime ceilings make `up --build` safe under peak load. Monitor disk growth from images and evidence; the 100 GB starting disk is not a retention guarantee.

This overlay expects both base files above because Caddy is defined in `compose.https.yml`. If the host already has a reverse proxy on ports 80/443, configure that proxy for `evals.alhena.ai` and start only `web mailer worker` with the same three files; do not start a second Caddy. Check existing listeners before launch. Retain the three-file invocation for future restarts and updates so the resource ceilings remain applied. Confirm actual container limits with `docker inspect` and observe `docker stats`, host free memory, and Jarvis responsiveness during a controlled evaluation before raising limits. Configuration validation alone does not prove engine enforcement or sufficient capacity.

## Before first launch

1. Use a Linux web server with Docker Engine, Compose v2, at least 4 GB RAM, adequate disk space for evidence, and unprivileged Chromium sandbox support.
2. Point a domain to the server and install Caddy or an equivalent HTTPS reverse proxy.
3. Create `.env` from `.env.example`. Set the public HTTPS URL, approved sender and SendGrid API key. Before enabling the worker, also set the shared worker secret, explicit model provider, its matching model API key and two explicit model IDs. Keep `.env` permission-restricted and out of Git. The selected email transport needs its matching key; the website can start without one, but email verification will be unavailable.
4. Verify the sender domain with the email service. The approval recipient is `ashu@alhena.ai` by default.
5. Ensure outbound access to the selected model API, email API, GitHub pinned-reference downloads and the public storefronts. The worker's browser proxy rejects private and reserved networks, including cloud metadata addresses.

Generate a worker secret locally with `openssl rand -hex 32`; do not paste it into issues, reports or client-side code. The Compose file maps it into the app and worker only. The worker has no app-data volume or email-provider credentials.

## Evaluator provider

Choose exactly one provider with `MODEL_PROVIDER=openai`, `MODEL_PROVIDER=anthropic` or `MODEL_PROVIDER=claude-cli`. OpenAI requires `OPENAI_API_KEY`; direct Anthropic requires `ANTHROPIC_API_KEY`; Claude CLI uses the isolated service below. Set explicit `JUDGE_MODEL` and `AUDITOR_MODEL` IDs supported by that provider and account. No model ID is selected by the application. Leave unused provider keys unset. Startup fails if required provider credentials, either model ID or the worker API secret is missing. There is no automatic provider fallback.

Direct Anthropic uses the Messages API's [native structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), with `output_config.format` and an API key. All providers receive the same pinned rubric and masked conversation packet in separate judge and auditor calls. Provider, requested and returned model IDs, and response IDs are included in evaluation provenance. Incomplete output, refusal, malformed JSON or failed evidence validation stops publication; switching providers does not change criteria, weights or deterministic scoring.

Optional `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` overrides must be trusted HTTPS API endpoints. A selected API key is sent to the selected endpoint; do not accept endpoint overrides from comparison submitters. The browser subprocess receives a narrow environment allowlist and does not inherit either model API key.

## Isolated Claude CLI judge

The optional `compose.claude.yml` overlay uses an existing `CLAUDE_CODE_OAUTH_TOKEN` through the unmodified official Claude Code CLI pinned to `2.1.198`. [Claude documents setup-token authentication for CLI scripts](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token). The application never sends raw OAuth API requests. Do not use `--bare`: that mode ignores subscription tokens. Calls instead use an empty temporary home/config/working directory, no setting sources, hooks disabled, no tools or MCP servers, skills disabled and `--no-session-persistence`. The exact rubric is the system prompt; `--json-schema` supplies the fixed verdict schema. See [programmatic CLI output](https://code.claude.com/docs/en/headless) and [CLI flags](https://code.claude.com/docs/en/cli-reference).

Provision only the existing token value into a protected token-only file on the host, default `.secrets/claude_oauth_token`. Do not mount Jarvis's home, `.env`, configuration or credential directories. `.secrets/` is excluded from Git and Docker build contexts. The file must be readable by the container's UID/GID 1001; for local Compose secrets, host file ownership and permissions apply. Keep it owner/group-readable only (for example root:1001, mode 0640) and restrict its parent directory. Set `CLAUDE_TOKEN_FILE` to its host path and a separate random `JUDGE_SERVICE_SECRET` of at least 32 characters. The transport secret authenticates the worker to the private service; it is not a model credential. Never copy the token into `.env`, CLI arguments or logs.

Set `JUDGE_MODEL` and `AUDITOR_MODEL` explicitly; account access must be verified. No advisor model, settings, hooks or API credentials are inherited from Jarvis. The judge starts one CLI process at a time, rejects additional work with 429, limits request/output size and allows 180 seconds per call. Errors return sanitized codes. Every result must be successful, schema-valid and tied to its fresh session. Temporary session files are removed after each call. This mode shares subscription usage with Jarvis; timeout, refusal or unavailable models stop the evaluation without publication.

On a shared host, add the CLI overlay **last**. It splits the existing evaluator allocation into worker 3 GiB / 0.75 CPU and judge 1 GiB / 0.25 CPU, keeping the full Lab ceilings at 5.75 GiB / 1.75 CPU. Both disable host swap. These limits need host verification; they are not proof of sufficient capacity.

```sh
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml -f compose.claude.yml --profile worker config --quiet
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml -f compose.claude.yml --profile worker --parallel 1 build judge worker
# Two minimal schema-only model calls under the judge's limits; starts no worker or report job.
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml -f compose.claude.yml --profile worker run --rm --no-deps judge node judge/smoke.mjs
# After the smoke succeeds and during an approved launch:
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml -f compose.claude.yml --profile worker up -d --no-build judge worker
```

The smoke verifies the pinned CLI, both selected models, distinct session IDs, structured results and cleanup, and reports cgroup memory peak when available. It does not prove a live storefront evaluation or sustained capacity. The judge has no published port, no application/worker data volume, and no network shared with the web service. Its private worker-facing network is internal; a separate network permits Claude API egress. Keep all four Compose files for later CLI-mode updates. The browser's public-only proxy blocks access to the judge's private address.

On September 20, 2026, the operator's host smoke passed with CLI `2.1.198`, `claude-sonnet-5` and `claude-opus-4-8` in a non-root, read-only container with no capabilities and a 1 GiB / 0.25 CPU ceiling. Both calls returned schema-valid results in distinct sessions, with no temporary sessions left. Cgroup memory peak was 146,984,960 bytes (about 140 MiB). This was a minimal JSON/authentication test, not a full evaluation or combined load test.

## Start with an existing HTTPS reverse proxy

```sh
docker compose build web mailer
docker compose up -d web mailer
```

After configuring the evaluator and worker secret, enable execution with `docker compose --profile worker up -d --build`. Compose deliberately defers evaluator validation until worker startup so web-only operation needs no dummy credentials. A worker started with incomplete configuration exits before claiming work.

The app listens only on host loopback port 3100. Adapt `deploy/Caddyfile` to your domain and reload Caddy. Use exactly the same HTTPS origin in `APP_URL`; origin checks and secure cookies depend on it.

```sh
curl --fail https://YOUR_DOMAIN/api/health
docker compose ps
docker compose logs --tail=100 web mailer worker
```

The health endpoint reports configuration presence, not delivery success or live storefront compatibility. Never expose internal container ports or SQLite volumes publicly. The worker uses a profile derived from Microsoft's versioned Playwright seccomp profile with Chromium's sandbox enabled; do not solve startup failures with privileged mode or `--no-sandbox`.

The profile explicitly allows `chroot`, which Chromium needs inside its sandbox user namespace. The upstream profile permits this syscall only when the container has `CAP_SYS_CHROOT`; that conflicts with this worker's `cap_drop: [ALL]` and causes sandbox startup to fail. Allowing the syscall retains the non-root user and empty container capability sets; kernel namespace permission checks still apply. A local-HTML smoke test on the Ubuntu 22.04 x86-64 deployment host passed with the sandbox enabled, the updated seccomp profile, all capabilities dropped, and the shared-host limits. This verifies browser startup, not live storefront compatibility or production capacity.

## First production verification

- Request an OTP using an operator-controlled work mailbox. Confirm real delivery and expiry.
- Submit a deliberate comparison with one tool and three verified customer deployments, with at least one storefront requiring new analysis. Inspect the approval email and confirm opening it alone starts nothing.
- Approve that specific request. Confirm requester notification, queue claim, heartbeat and a complete capture.
- Inspect all evidence, authorship metadata, judge and auditor decisions, tool profile, automatically composed pair reports, and report-ready email.
- If a storefront lacks unambiguous AI message-author markers, the worker stops with `needs_adapter`. Configure and review its adapter rather than weakening evidence requirements.

The test suite does not substitute for this live deployment check. On the deployment host, a production OTP was sent through the dedicated SendGrid key, confirmed in the operator's inbox, and successfully exchanged for a verified session (HTTP 200). This verifies delivery and code consumption, not expiry, public HTTPS, approval notifications or report-ready delivery. No new live storefront comparison was run as part of this deployment verification.

## Email delivery

The `mailer` service owns a durable retry loop. Approval, status and report emails are inserted transactionally into SQLite. Worker lease and publication endpoints do not wait for mail delivery. A provider failure leaves an outbox entry to retry; it does not invalidate published evidence.

For SendGrid, use an existing verified sender when available and create a dedicated restricted API key with Mail Send access. Set `MAIL_FROM` to that verified address with the application's display name. This deployment reuses an existing verified sender and leaves all other account keys, senders, domains and settings unchanged. If a different installation needs new sender authentication, follow [SendGrid domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication) within its operator-approved scope. Verify actual receipt in an operator-controlled mailbox before launch; API acceptance alone is not delivery confirmation.

SendGrid receives the outbox ID as a correlation value, not an idempotency guarantee. If a request succeeds at the provider but its response is lost, a retry can produce a duplicate notification. Resend is retained as an alternative (`MAIL_TRANSPORT=resend`, `RESEND_API_KEY`) and receives a stable provider idempotency key. Neither mail retry path reruns an evaluation.

```sh
docker compose exec web node --experimental-strip-types lib/server/admin.ts outbox
docker compose exec web node --experimental-strip-types lib/server/admin.ts flush-mail
```

OTP requests may attempt their own bounded immediate delivery. Development file delivery is disabled when `NODE_ENV=production`.

## Report access and recent analysis

Summaries and the rubric are public. Full report details, JSON downloads and available HTML downloads require a verified work-email session. Personal email addresses are rejected for both report access and comparison submission. Detail views and downloads create private access records and notify `ADMIN_EMAIL` with the report title and viewer email in the subject. Repeated notifications are limited to once per viewer, report and action in a rolling 24-hour window; access counts still increase. Page previews and summary requests do not trigger notifications.

Known provider websites can prefill prior customer storefronts. Reuse requires the same protocol and pinned, compatible evidence captured within 30 days. The server checks original capture age when planning, claiming and validating a run. Reused results retain source hashes, dates and limitations; publication never resets their age. Exact fresh matches open an existing report without creating evaluation work. Older matches remain visible but require fresh testing. The imported seed has an explicit historical attribution exception: its immutable source did not record per-turn AI-author proof, and reuse does not claim new verification.

The initial evidence was public in this repository before access gating, so those historical copies cannot be made private by the web gate. Newly generated reports live in private runtime storage. Do not copy them into `public/` or Git.

## Request recovery

```sh
docker compose exec web node --experimental-strip-types lib/server/admin.ts list
docker compose exec web node --experimental-strip-types lib/server/admin.ts reissue-review REQUEST_ID
docker compose exec web node --experimental-strip-types lib/server/admin.ts retry REQUEST_ID
```

Review URLs are expiring bearer capabilities. Do not share them, log their full URL, or put third-party analytics on the review page. If a link expires, reissue it using the CLI. Retry a failed run only after its cause is addressed. Transient worker failures use bounded retries; evidence or attribution failures require operator attention.

## Persistence, backups and updates

- `app-data`: SQLite plus published evidence. Keep private, back up both, and test restoring to an isolated host.
- `worker-data`: per-job private captures and hash-verified source cache. Preserve interrupted evidence for diagnosis. Apply a retention policy appropriate to your use.
- For a consistent simple backup, stop web and mailer, copy the complete app-data volume including SQLite sidecars, then restart. Do not copy just the main SQLite file while writers are running.
- Before an update, back up state, pull the reviewed Git commit, rebuild and restart. Schema initialization is additive and idempotent; future destructive migrations need a separate migration plan.
- SQLite is intended for one web-server host. A multi-host rollout requires a shared database implementation and shared artifact storage.

## Credential separation

The browser worker receives only its limited worker API secret and evaluator model key. Do not mount SSH keys, home directories, application data, email credentials or cloud metadata credentials into it. Browser connections go through a public-only DNS-pinning proxy. Submitted URLs and storefront messages are treated as data, never operator instructions.

## Single-tool publication

The public onboarding submits one tool with three customer storefronts to `/api/tools/requests`. Legacy two-provider request URLs and worker jobs remain supported. Approval queues at most60newturns for a single tool. Publication validates6conversations and78criteriondecisions before adding it to the library. Comparisons are assembled from two complete compatible cohorts within30days, with source hashes and capture dates retained. Composition adds no browser or model calls. Single-tool completion, all generated comparison rows and notifications commit atomically; immutable files left by a rollback are unreferenced and safe to retain. Duplicate completion is idempotent only for the identical successful single-tool payload and original lease.

Verify `/tool-scores.json`, `/llms.txt`, `/sitemap.xml` and anonymous server-rendered `/tools/[id]` and `/reports/[slug]` summaries after deployment. None may expose detailed conversations or private account/request information. Existing public historical source files remain public.
