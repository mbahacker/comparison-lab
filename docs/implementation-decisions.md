# Implementation decisions

- Public GitHub repository requested by Ashu; no private customer or requester data belongs in source.
- Self-hosted Next.js app and isolated browser worker, as confirmed by Ashu. The initial Sites template is reused for available UI dependencies; this is not a Sites-hosted project and has no Sites project ID.
- Persistent SQLite on a single host plus an append-only artifact directory. Containers use separate volumes; browser worker cannot read application data or mail credentials.
- Work-email OTP precedes submission; approval goes to ashu@alhena.ai.
- Approval authorizes one bounded 120-turn run. Complete, validated reports publish automatically; failed captures remain private.
- Sender domain and model API credentials remain deployment configuration; no production email or live evaluation is sent during development.
