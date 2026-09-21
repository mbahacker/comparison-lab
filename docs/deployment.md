# Deploy and operate Comparison Lab

## Launch at evals.alhena.ai

Use Docker Compose v2 on a dedicated Linux host with at least 4 GB RAM, or use the shared-host configuration below for a larger host running Jarvis alongside Comparison Lab. This app requires persistent storage and a long-running browser worker; a static website host alone is insufficient.

1. Clone `https://github.com/mbahacker/comparison-lab.git` onto the selected host and use a reviewed commit. Create a fresh production data volume; do not copy the local preview database, accounts, or queued test requests.
2. Copy `.env.example` to `.env`, restrict its permissions (`chmod 600 .env`), and configure all required values. `APP_URL` is `https://evals.alhena.ai`; approval emails go to `ashu@alhena.ai`. Set `MAIL_TRANSPORT=sendgrid` and configure `SENDGRID_API_KEY`. Confirm that `MAIL_FROM` is authorized by the authenticated SendGrid sender domain. Enter secrets on the host or through its secret manager, never in Git or chat.
3. In the `alhena.ai` Cloudflare zone, create an `A` record named `evals` pointing to the host's public IPv4 address. Initially use DNS-only mode for straightforward certificate provisioning. Do not change the apex or other subdomains. Only add an `AAAA` record if IPv6 reaches this same server.
4. Permit inbound TCP 80 and 443, and optionally UDP 443 for HTTP/3, in the cloud firewall. Limit SSH access to the operator. Port 3100 remains loopback-only.
5. On a dedicated host without another web server, start the bundled HTTPS proxy and application:

```sh
docker compose -f compose.yml -f compose.https.yml config --quiet
docker compose -f compose.yml -f compose.https.yml up -d --build
docker compose -f compose.yml -f compose.https.yml ps
curl --fail https://evals.alhena.ai/api/health
```

The HTTPS overlay adds Caddy with persistent certificate storage. Caddy obtains and renews the certificate automatically once DNS and inbound ports are reachable. If the host already has an HTTPS reverse proxy, use the base Compose file and adapt `deploy/Caddyfile` instead; do not bind a second proxy to the same ports. See the [Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https) and [official container guidance](https://hub.docker.com/_/caddy).

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

With `.env` configured, validate the merged configuration without printing secrets, build during a quiet period, then start:

```sh
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml config --quiet
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml --parallel 1 build
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml up -d --no-build
docker compose -f compose.yml -f compose.https.yml -f compose.shared.yml stats --no-stream
```

Runtime limits do not cap Docker/BuildKit image builds. Build on the replacement host before cutting Jarvis over to it. For later updates, serial builds reduce overlapping work, but an individual build can still use additional CPU and memory. Leave build headroom, avoid Jarvis cron peaks, and watch host memory and load; build off-host for the matching CPU architecture if adequate headroom is unavailable. Do not infer that the runtime ceilings make `up --build` safe under peak load. Monitor disk growth from images and evidence; the 100 GB starting disk is not a retention guarantee.

This overlay expects both base files above because Caddy is defined in `compose.https.yml`. If the host already has a reverse proxy on ports 80/443, configure that proxy for `evals.alhena.ai` and start only `web mailer worker` with the same three files; do not start a second Caddy. Check existing listeners before launch. Retain the three-file invocation for future restarts and updates so the resource ceilings remain applied. Confirm actual container limits with `docker inspect` and observe `docker stats`, host free memory, and Jarvis responsiveness during a controlled evaluation before raising limits. Configuration validation alone does not prove engine enforcement or sufficient capacity.

## Before first launch

1. Use a Linux web server with Docker Engine, Compose v2, at least 4 GB RAM, adequate disk space for evidence, and unprivileged Chromium sandbox support.
2. Point a domain to the server and install Caddy or an equivalent HTTPS reverse proxy.
3. Create `.env` from `.env.example`. Set the public HTTPS URL, approved sender, SendGrid API key, shared worker secret, model API key and two explicit model IDs. Keep `.env` permission-restricted and out of Git. The selected email transport needs its matching key; the website can start without one, but email verification will be unavailable.
4. Verify the sender domain with the email service. The approval recipient is `ashu@alhena.ai` by default.
5. Ensure outbound access to the selected model API, email API, GitHub pinned-reference downloads and the public storefronts. The worker's browser proxy rejects private and reserved networks, including cloud metadata addresses.

Generate a worker secret locally with `openssl rand -hex 32`; do not paste it into issues, reports or client-side code. The Compose file maps it into the app and worker only. The worker has no app-data volume or email-provider credentials.

## Start

```sh
docker compose build
docker compose up -d
```

The app listens only on host loopback port 3100. Adapt `deploy/Caddyfile` to your domain and reload Caddy. Use exactly the same HTTPS origin in `APP_URL`; origin checks and secure cookies depend on it.

```sh
curl --fail https://YOUR_DOMAIN/api/health
docker compose ps
docker compose logs --tail=100 web mailer worker
```

The health endpoint reports configuration presence, not delivery success or live storefront compatibility. Never expose internal container ports or SQLite volumes publicly. The worker uses Microsoft's versioned Playwright seccomp profile with Chromium's sandbox enabled; do not solve startup failures with privileged mode or `--no-sandbox`.

## First production verification

- Request an OTP using an operator-controlled work mailbox. Confirm real delivery and expiry.
- Submit a deliberate comparison with six verified deployments. Inspect the approval email and confirm opening it alone starts nothing.
- Approve that specific request. Confirm requester notification, queue claim, heartbeat and a complete capture.
- Inspect all evidence, authorship metadata, judge and auditor decisions, publication, and report-ready email.
- If a storefront lacks unambiguous AI message-author markers, the worker stops with `needs_adapter`. Configure and review its adapter rather than weakening evidence requirements.

The test suite does not substitute for this live deployment check. No production emails or live storefront chats were executed while building this repository.

## Email delivery

The `mailer` service owns a durable retry loop. Approval, status and report emails are inserted transactionally into SQLite. Worker lease and publication endpoints do not wait for mail delivery. A provider failure leaves an outbox entry to retry; it does not invalidate published evidence.

For SendGrid, authenticate the sender domain and create a restricted API key with Mail Send access. Set `MAIL_FROM` to a sender under that authenticated domain, for example `Comparison Lab <reports@alhena.ai>`. Add only the domain-authentication records provided by SendGrid, with Cloudflare proxying disabled on those records; do not replace existing MX records. See [SendGrid domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication). Verify actual receipt in an operator-controlled mailbox before launch; API acceptance alone is not delivery confirmation.

SendGrid receives the outbox ID as a correlation value, not an idempotency guarantee. If a request succeeds at the provider but its response is lost, a retry can produce a duplicate notification. Resend is retained as an alternative (`MAIL_TRANSPORT=resend`, `RESEND_API_KEY`) and receives a stable provider idempotency key. Neither mail retry path reruns an evaluation.

```sh
docker compose exec web node --experimental-strip-types lib/server/admin.ts outbox
docker compose exec web node --experimental-strip-types lib/server/admin.ts flush-mail
```

OTP requests may attempt their own bounded immediate delivery. Development file delivery is disabled when `NODE_ENV=production`.

## Review and recovery

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
