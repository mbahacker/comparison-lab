# Deploy and operate Comparison Lab

## Before first launch

1. Use a Linux web server with Docker Engine, Compose v2, at least 4 GB RAM, adequate disk space for evidence, and unprivileged Chromium sandbox support.
2. Point a domain to the server and install Caddy or an equivalent HTTPS reverse proxy.
3. Create `.env` from `.env.example`. Set the public HTTPS URL, approved sender, Resend API key, shared worker secret, model API key and two explicit model IDs. Keep `.env` permission-restricted and out of Git.
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

The `mailer` service owns a durable retry loop. Approval, status and report emails are inserted transactionally into SQLite and use stable provider idempotency keys. Worker lease and publication endpoints do not wait for mail delivery. A provider failure leaves an outbox entry to retry; it does not invalidate published evidence.

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
