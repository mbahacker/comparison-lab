# Rubric source and boundaries

The evaluation rubric and fixed questions were published by **Gorgias** in `gorgias/ai-agent-benchmark`. Comparison Lab applies the pinned quality criteria to submitted storefronts; it is not endorsed by Gorgias or an official Gorgias leaderboard.

- Canonical commit: `19b1420d2520d48baa52be81ac33fc4b9bd0ff8b`
- [Canonical rubric](https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-rubric.md)
- [Published scoring source](https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/eval-score.js)
- [Published question pools](https://github.com/gorgias/ai-agent-benchmark/blob/19b1420d2520d48baa52be81ac33fc4b9bd0ff8b/runner/pools.js)

`criteria.json` and `questions.json` are declarative benchmark material transcribed from the study evidence supplied by the repository owner. Source attribution is retained. The support `no_deflect` gate is explicitly represented for `s_answered`, `s_outcome`, and `s_no_deflect`, matching the pinned scorer. This does not change any score in the original report.

At implementation, the pinned GitHub tree had no `LICENSE`, `COPYING`, or `NOTICE` file, and GitHub's license endpoint returned 404. No permissive license is asserted for the upstream materials. This repository's application-code license, if any, does not relicense the rubric, questions, third-party transcripts, or fetched upstream files. Attribution alone is not a grant of copyright permission.

Unmodified executable Gorgias scoring and transcript-processing modules are downloaded on the operator's server into a gitignored cache and checked against `upstream-manifest.json` before import. They are not vendored into this public source repository. Operators should confirm appropriate rights for their use and distribution of third-party material.
