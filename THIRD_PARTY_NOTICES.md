# Third-party notices

## Gorgias benchmark

The evaluation refers to Gorgias's published AI-agent benchmark, pinned at commit `19b1420d2520d48baa52be81ac33fc4b9bd0ff8b`.

Canonical source: https://github.com/gorgias/ai-agent-benchmark

The rubric and factual scoring definitions are identified and attributed in `rubric/ATTRIBUTION.md`. The initial historical evidence bundle preserves the rubric used in that user-supplied study. Unmodified executable reference files are fetched separately into a Git-ignored runtime cache, with immutable SHA-256 verification. Gorgias source had no license file at the pinned commit; no permission to redistribute or relicense it is asserted here. Gorgias retains its rights. Public source availability of this application does not imply endorsement by Gorgias.

## Fonts

DM Sans and Cormorant Garamond are distributed under the SIL Open Font License1.1. The license notices are included beside the fonts in `public/fonts/`.

## UI and framework

Next.js, React, Radix UI, Shadcn components, Tailwind CSS, Lucide, and other dependencies retain their respective licenses, available in the dependency packages. Some scaffolding and UI primitives were obtained from the bundled Sites/Vinext starter; this application uses standard self-hosted Next.js rather than the Sites hosting service.

## Browser runtime policy

`deploy/chromium-seccomp.json` is from Microsoft's Playwright repository at tag `v1.62.1`, `utils/docker/seccomp_profile.json`. Playwright is Apache2.0 licensed; its license is included in `deploy/PLAYWRIGHT-LICENSE.txt`. The profile supports the Chromium sandbox in the unprivileged worker container.

## Alhena brand assets

The Alhena wordmark and icon in `public/brand/` are Alhena brand assets, reused from its existing website assets at the operator’s request. Source: https://alhena.ai/assets/images/icons/alhena-icon.svg. Alhena trademarks remain the property of their owner. The interface uses the current Alhena website palette, with the existing OFL-licensed DM Sans and Cormorant fonts. No proprietary website fonts were added.
