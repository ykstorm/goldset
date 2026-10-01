# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Run eval files with the pinned, locally resolved `tsx` CLI on Node instead of
  `npx tsx`, which fetched and executed `tsx@latest` at runtime.
- Contain `eval-dir` under the workspace and reject path traversal; add a
  per-eval timeout.
- Build each eval process env from an allowlist plus a `pass-env` input and the
  selected provider key only; mask provider keys and the token.
- Wrap untrusted judge-prompt content in escaped named tags, and clamp the parsed
  judge score to an integer in [0, 5] so an embedded score cannot raise a verdict.
- Reject catastrophic-backtracking regexes, drop the global/sticky flags, and cap
  tested text; use a length-capped two-row Levenshtein for similarity.
- Sanitize eval-supplied cells and allowlist runner names in the PR comment, and
  match the bot comment by marker and Bot author.

### Changed

- Compute regression independently of `comment-on-pr`; `github-token` input now
  wins over the ambient `GITHUB_TOKEN`.
- Removed the unimplemented CLI stub and `goldset` bin. Rewrote the docs to match
  the shipped API; removed stale design docs.

### Added

- Full Apache-2.0 `LICENSE` text and a `NOTICE` file.
- `timeout-ms` and `pass-env` Action inputs; `tsx` declared as an optional peer
  dependency.

## [0.2.x]

### Added

- Four runners: `goldenDataset`, `llmJudge`, `structural`, and `grounding`.
- GitHub Action that runs `*.eval.ts` files, posts a results + delta-vs-base PR
  comment, and fails the check on failure or regression.
- npm package `@ykstormsorg/goldset` with ESM and CJS builds.
