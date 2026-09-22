# Automated policy evaluations

New submissions default to `policy-resolution-v1`. This is Alhena Research Lab's published policy-compliant resolution method, not Gorgias's automation metric. It uses the same criteria and fixed lane weights for every tool. Historical quality-pilot requests remain on their frozen method.

## From three inputs to a reviewed five-storefront cohort

A verified work-email user supplies one tool and three storefronts. Preparation visits those storefronts without submitting chat messages, verifies provider script/frame hostnames, and looks through published vendor customer stories for two additional deployed customers. Evidence remains private. Research is bounded to 60 pages per tool and one hour; incomplete verification pauses for operator attention. Unknown providers must expose their declared domain, or receive a reviewed domain mapping. A logo or customer-name mention alone is insufficient.

Once five deployments are verified, the operator receives their names and URLs and the full run scope. Only explicit approval starts chat testing. The prepared cohort is frozen; research cannot replace the original three submitted customers. No automated implementation can promise support for every widget or discovery from every vendor website.

## Collection, scoring and publication

Each tool receives 50 core contexts across ten themes and five separate guardrail contexts, at most 515 turns. Guardrails do not enter the headline score. The current collector records its actual timing settings in the evidence. These differ from older manually collected studies; derived comparisons disclose the original source dates and limitations.

Fresh Claude CLI sessions use the fixed policy model and high effort. Quality receives a primary judgment plus an adversarial audit. Policy-resolution receives independent primary and blind audit calls; conservative reconciliation and deterministic arithmetic run on both worker and server. Source merchant policies are captured before testing. Required handover can qualify under the published policy method when supported by evidence; no provider gets a special score rule.

Known partial observations are retained honestly. Unsubmitted turns and unattributed replies are not scored as failures. Confirmed unanswered submissions remain assessable under the method. Unsupported widget discovery or ambiguous provenance pauses a run rather than producing an invented score.

The server binds the entire evidence to the approved roster, fixed questions, source hashes, original captures and model request receipts. It independently checks scoring, audit coverage, public artifact shape and requester/credential privacy. Immutable files are content addressed; database activation, comparisons and notification outbox events commit together. A rollback leaves private unreferenced artifacts, which do not prevent retry.

Publication updates the current library, homepage charts/table, tool profile, score feed, sitemap and agent-readable pages through the same research catalog. Detailed HTML/JSON evidence remains behind work-email verification. Automatic validation receipts describe machine validation and operator-approved run scope; they do not claim a human reviewed the finished report.

## Reuse and comparisons

Only compatible complete automated evidence captured within 30 days is reused for new runs. Original dates remain visible. A three-storefront submission matching an existing fresh five-storefront cohort links that study instead of repeating it. Original manually published studies remain accessible; they are not silently treated as new automated captures.

New single-tool studies create pairwise comparison reports from compatible published cohorts with matching method and rubric-source hashes, captured within 30 days. These reports retain original source evidence and audit limitations, add no model calls, and cannot replace a tool's original capture date in the library.

## Interrupted work and adapters

The worker retains capture intents, complete captures and each model call/response separately. A deliberate retry reuses completed receipts. An intent without a retained outcome pauses for reconciliation; it is never automatically replayed. Expired policy evaluation leases pause for review. Research-only leases may retry up to three times because they submit no chats.

`needs_adapter` means the browser runner could not establish a safe, unambiguous chat surface or AI message attribution. It is a harness failure, not a tool performance score. The bundled Sierra adapter supports the observed Contact Us launcher, shadow-DOM composer and role-assistant messages. Other widgets may still require review.

Server-local operations (use the production Compose configuration):

```sh
node --experimental-strip-types lib/server/admin.ts list
node --experimental-strip-types lib/server/admin.ts retry-research REQUEST_ID
node --experimental-strip-types lib/server/admin.ts retry REQUEST_ID
```

Research retries require a stopped, unapproved three-storefront preparation. Evaluation retries require an approved stopped job and preserve its frozen protocol. Retrying an old pilot does not upgrade it to the full current method. Inspect private worker evidence before retrying. An unresolved capture/model intent needs manual reconciliation; a retry will deliberately stop again.

## Validation scope

The offline tests cover preparation leases, five-storefront approval, attribution and question tampering, independent call provenance, partial observations, recovery without replay, publication rollback/retry, fresh reuse, derived comparisons, email outbox idempotency and protected evidence. They use explicitly labeled software fixtures, never presented as research findings. Live runs still depend on supported storefronts, model availability and successful policy retrieval.

To continue a stopped legacy pilot using the current method, run `admin.ts prepare-current REQUEST_ID`. This creates one idempotent continuation for the same verified requester and original three storefronts, preserves the old request/job unchanged, and queues only read-only research. Approval of the original pilot does not authorize the larger run: a fresh five-storefront approval is required after preparation. The normal receipt and approval emails describe the new scope.

Sun & Ski requires cookie consent before loading Sierra. Its reviewed setup dismisses the account promotion and selects the cookie banner's exact `I agree` control, as authorized by the operator. This runs before deployment verification and in every fresh capture context, with hostname checks and an action receipt in the private source evidence. It does not accept generic agreement buttons, subscribe, sign in, or change scores. The same storefront setup applies regardless of the provider being evaluated. Other consent flows require separate review rather than silently broadening this choice.

### Corrected research and retained work

Additional candidates must be retail customer stories with merchant identity evidence and a live commerce surface, as well as the tool fingerprint. Vendor-owned domains and subdomains, customer indexes, navigation/footer links, and non-retail case studies cannot qualify. Reviewed source-to-merchant pairs may bridge a story that omits an outbound shop link; these are discovery hints, not proof of a current deployment. Each preparation rechecks the live source and storefront.

For an approved but stopped, unpublished policy run with an incorrect researched roster, use `admin.ts correct-roster REQUEST_ID`. This archives the complete old approval and research receipt, revokes the old review link, and researches replacements for the last two storefronts. The existing evaluation job stays blocked until the corrected five-storefront roster is approved. It then resumes the same job/cache. Prior evidence is authorized only for exactly unchanged original storefronts, under the same protocol, within the original approval window and 30 days. New evidence captured during the unapproved gap is rejected. Original evidence and dates are never rewritten.

Explicit private-judge rejections now retain only an allowlisted error code and HTTP status. The production worker automatically retries eligible transient judge rejections at most twice, after 2 and 5 seconds, with the identical input, model and execution profile. The limit survives job restarts. Append-only receipts retain all failed attempts and successful results. Configuration, model-identity and ambiguous transport failures do not receive automatic replay. Missing/malformed error bodies, timeouts, cancellations and interrupted connections remain ambiguous and require operator reconciliation. A historical request with only a bare HTTP status must not be relabeled as a known rejection; any one-off recovery must separately preserve and bind the original request and failure hashes, use the identical model/profile/input, and validate the new receipt before storing it.

The reviewed retail adapters also cover melin and Chubbies. Setup dismisses only their observed benign overlays; it does not subscribe or accept marketing. Gap opens its published same-merchant Contact Us entry before chat and policy collection because its homepage does not reliably mount the chat launcher. The navigation is recorded in capture setup evidence. All three entry points were verified by opening the live chat without submitting benchmark questions; this verifies harness readiness, not a tool score.

### Automatic browser recovery

Detached advertising or analytics frames are skipped during chat discovery. Attached-frame navigation races receive at most three fresh scans, preserving composer ambiguity and attribution checks. Each capture writes a private submission journal before navigation and durably marks every attempted Enter before dispatch; latency timing begins after these writes. A narrow browser lifecycle failure before any send can retry in a fresh isolated context, at most twice, with separate attempt artifacts and a hash-bound zero-submission receipt. The limit survives process restarts. A failed or uncertain send is never automatically replayed. Access gates and human handovers retain their existing evidence semantics.

The worker resumes completed captures and scoring receipts byte-for-byte. A legacy setup failure without a send journal requires explicit operator reconciliation bound to the original capture and intent; it cannot simply be labeled safe. Hard-stop alerts use the monotonic lease fence so administrative retry counters cannot hide a later failure.
