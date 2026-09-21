# Evaluation worker

The worker performs real browser conversations. It does not generate shopper or assistant conversation content, fabricate completion, or assign a score when a capture is unsupported. Only the 20 fixed published shopper questions are typed into the storefronts. The two themes are `everyday-value` and `returns`, repeated across three deployments for each of two providers: 12 conversations, 120 turns, 156 scored decisions across 26 distinct criteria.

## Setup

Run the web service and this worker as separate containers. The worker uses Node 24, Playwright Chromium, and an OpenAI-compatible Responses API. Set:

```text
APP_BASE_URL=http://web:3100
WORKER_API_KEY=<at-least-32-random-characters, also configured on web>
OPENAI_API_KEY=<model service key>
JUDGE_MODEL=<enabled structured-output model>
AUDITOR_MODEL=<enabled structured-output model>
WORKER_DATA_DIR=/data
RUBRIC_CACHE_DIR=/data/reference-cache
```

`OPENAI_BASE_URL` optionally selects an HTTPS Responses endpoint; default is `https://api.openai.com/v1/`. A distinct auditor model can be configured; at minimum the auditor is a fresh request without shared conversational state. No model is silently selected. Neither requester email addresses nor administrator mail credentials are passed to this worker. Browser subprocesses receive only a minimal nonsecret environment.

From the repository root:

```sh
docker build -f worker/Dockerfile -t comparison-lab-worker .
cd worker
npm ci
npm test
npm run fetch-rubric
```

The container runs as UID 1001. Mount `/data` with that ownership. Chromium's sandbox is on by default and must be supported by the host's user-namespace/seccomp configuration. Do not expose debugging ports. `CHROMIUM_SANDBOX=false` exists for controlled development only; production should retain the sandbox. The app must not mount its database, SMTP credentials, or administrative secrets into the worker. Limit worker CPU, memory and PIDs. Retain one worker initially; database leases fence retries across multiple workers.

## Discovery and supported behavior

The generic adapter finds uniquely visible chat composers and narrowly named chat launchers in the main page, open shadow DOM (Playwright locators), and frames. It does not click arbitrary suggestions, provide identities, log in, complete CAPTCHAs, or choose products for the assistant. Known Alhena and Gorgias deployments require a matching live script/frame fingerprint. Other names retain the operator-approved provider attribution with an explicit unverified-automation note.

Transcript extraction uses the visible chat container and an exact, unique echo of the just-sent fixed shopper question. Every complete response also requires positively identified AI message nodes: explicit DOM assistant/bot/AI author attributes from the fixed allowlist, or an operator-reviewed `assistantMessages` selector. The extracted substantive reply must exactly match those AI nodes after whitespace normalization. Unknown, human, system, or mixed authors stop the capture. Provider fingerprint, question echo and a missing handover notice are never accepted as author proof. Every turn retains `author_verified` and the captured `author_evidence` markers, selector, adapter and message count. Five seconds of stable substantive text and no busy indicator are required before advancing. Newly rendered links are preserved without being followed. Actual send/completion timestamps are captured, but this protocol only publishes quality scores. It does not claim to reproduce the full upstream latency, automation or composite leaderboard.

Discovery is intentionally bounded. Multiple composers, missing message echoes, disappearing transcript containers, inaccessible/closed shadow roots, human handovers, access gates, provider mismatches and timeouts fail the run. A zero or guessed answer is never substituted. Site layouts change; the six pilot storefronts have **not** been live-tested by this new unattended worker during development.

For a reviewed site with nonstandard markup, set `WORKER_ADAPTERS_FILE` to a JSON array following `worker/adapters.example.json`. Selectors must be reviewed by the operator and are never accepted from public submissions. Only launcher, transcript, and assistant-message selectors can be supplied; arbitrary code and shopper prompt overrides are not supported. A failure retains private transcripts in `/data/<job-id>/attempt-<fencing-token>/` and needs operator review before retry. Do not automatically retry live chat failures, which could create repeated conversations/tickets.

## Network boundary

Browser HTTP and HTTPS use the in-process public-network proxy. Each connection resolves all A/AAAA records, rejects the whole result if any address is private/reserved, and opens a socket to the validated literal address. This prevents a second DNS lookup from rebinding to internal services. HTTP CONNECT is limited to port 443, ordinary HTTP to port 80, and Playwright routes reject private names, credentials, non-HTTP(S) URLs, and unusual ports. Proxy bypass for loopback is explicitly disabled; QUIC and nonproxied WebRTC UDP are disabled. Service workers, downloads and popups are blocked. This is browser-network isolation, not a replacement for the Chromium sandbox or a host firewall.

## Rubric, judging, audit and publication

`rubric/criteria.json` and `rubric/questions.json` contain the declarative protocol transcribed from the user-supplied pilot evidence. The canonical publisher is Gorgias, commit `19b1420d2520d48baa52be81ac33fc4b9bd0ff8b`. The pinned repository had no declared source-code license at implementation time. No Gorgias executable code is redistributed here or relicensed as application code.

`worker/upstream.mjs` downloads six exact reference files from immutable raw GitHub URLs into the ignored runtime cache, verifies SHA-256 hashes before import, and never trusts an unverified cache entry. These include the canonical full rubric, scorer, signal detection and transcript cleaning. A failed download/hash check stops execution. Attribution and hashes are preserved in the evidence report. Deployment operators remain responsible for permitted use of those upstream materials.

The judge receives opaque IDs, limited name masking and at most 2,400 characters per cleaned assistant reply, matching the original quality pilot. This is limited masking: domains or products may identify a vendor. The separate auditor sees the same packet and primary verdict, and classifies every check AGREE/FP/FN. Both use [strict Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), with no model tools. Transcript instructions cannot change browser behavior. Each passing quote must exist in the judged packet; invalid evidence stops the run rather than silently changing the rubric.

Boolean corrections follow the audit. Scores come from the unmodified, verified upstream function and are reconciled against independently authored arithmetic. Rich-element and support deflection signal gates remain intact. A score of 100 is not a claim of verified factual perfection: this worker does not independently inspect product/policy truth or cart state. Those limits appear in every report.

All twelve conversations must contain positively attributed AI responses and be complete, cover the exact approved storefronts and questions, use all fixed checks, reconcile scores, and meet the upstream 90% judge/auditor agreement threshold before submission to the API. A basic individualized coupon/credential gate holds potentially sensitive evidence for review. Server-side validation independently repeats structural and arithmetic checks before publishing and notifying the submitter.

## Job API

All requests are `POST /api/worker/<operation>` with `Authorization: Bearer WORKER_API_KEY`:

- `claim` returns `{job:null}` or an approved job with `id`, `leaseToken`, `fencingToken`, `leaseExpiresAt`, `requestId`, `providers`, and `protocol`.
- `heartbeat` receives `{jobId,leaseToken,fencingToken}` every 20 seconds. Loss of heartbeat aborts the browser and model work.
- `complete` receives those lease fields plus `evidence` in `comparison-lab-evidence/v1` shape.
- `fail` receives those lease fields plus `{code,message,retryable}`. Only recognized transient worker/model transport errors (429 or 5xx) set `retryable:true`; capture, authorship, privacy and audit failures remain terminal. The public message contains no captured site text or credentials.

Every attempt has private incremental evidence. The worker has a four-hour time budget, bounded turn timeouts and bounded model requests. It never changes an approved target or question set. Interrupted or low-agreement runs require review, not automatic publication.

## Verification status

Unit tests cover canonical score regression, fixed question/count integrity, audit flip and quote validation, deterministic gates, SSRF addresses, actual local proxy rejection, transcript boundaries and bounded Responses request shape. These use supplied evidence and local/mocked servers only. Model connectivity, Chromium container startup and live storefront capture require deployment configuration and a controlled smoke run before enabling unattended production jobs.
