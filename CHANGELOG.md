# Changelog

All notable changes to `@ykstormsorg/goldset` and the `ykstorm/goldset` Action.
Dates are UTC and are the days npm published each version. Goldset is 0.x, so a
minor version can break things; items that can break an existing setup are
marked Breaking.

## 0.3.0 - unreleased

Everything below is relative to 0.2.4, meaning npm 0.2.4 and the Action tag
`v0.2.4`, both built from commit `63fd95e`. That commit shares no history with
`main`, so this list compares the two trees, not a range of commits.

### Added

- `grounding(cases, { llm, judge })`, a judge-scored runner that checks that an
  answer only claims what the supplied context supports. Its result sits under
  `runners.grounding`, and the Action counts it like the other runners.
- A judge verdict cache for `llmJudge` and `grounding`. Pass
  `cache: memoryCache()` or `layeredCache(...)`, or set `GOLDSET_JUDGE_CACHE` to
  use a memory layer over `.goldset-cache/judge.json`. Only replies with a
  numeric score are stored. `memoryCache`, `layeredCache` and the `JudgeCache`
  type are exported.
- `parseJudgeScore(text)` is exported.
- `toEvalResult(..., { stable: true })` empties `timestamp`, `commit` and
  `branch` for output that is the same on every run.
- Action inputs `timeout-ms`, a per-eval wall-clock limit in milliseconds whose
  default, 0, means no limit, and `pass-env`, extra variable names to forward
  into each eval process.
- tsx is declared as a peer dependency (`>=4.0.0`).

### Changed behaviour

- Breaking: each eval process gets a fresh environment: a fixed allowlist of
  system variables, the names in `pass-env`, every `GOLDSET_*` variable and only
  the selected `judge-provider`'s key. 0.2.4 passed the runner's whole
  environment through, so an eval that reads any other variable, including a
  provider key under `judge-provider: none`, must now name it in `pass-env`.
- Breaking: the Action runs eval files with the tsx from your own install, on
  the Action's Node, instead of `npx tsx`, which could download and run
  whichever tsx version was newest. A project without tsx installed now fails
  with "tsx is not installed".
- Breaking: the Action fails when `eval-dir` holds no `*.eval.ts` file, and the
  message names the directory it searched. 0.2.4 warned and passed.
- Breaking: `eval-dir` must resolve inside the workspace; a path that escapes
  it, such as `../other`, is rejected.
- Breaking: a judge score is clamped to [0, 5] and rounded to an integer, and a
  reply without a finite numeric `score` scores 0. In 0.2.4 a reply of 99
  counted as 99.
- Breaking for a custom judge that reads the prompt: the prompt wraps the
  rubric, input, expected answer and output in `<rubric>`, `<input>`,
  `<expected>` and `<output>` tags, with closing tags inside the values escaped,
  and tells the judge that tagged text is data. 0.2.4 wrote `Rubric:`,
  `Expected:` and `Actual Output:` lines.
- Breaking: `json-schema` assertions check more. `required` and property `type`
  are honoured, a top-level `type` is checked, a schema with `properties` or
  `required` and no `type` must match an object, and an output that is not an
  object fails instead of throwing. 0.2.4 checked only that the keys of
  `properties` were present, and only when `type: 'object'` was also set.
- Breaking: regex assertions drop the `g` and `y` flags, test at most 100,000
  characters of output, and reject a pattern that does not finish a
  1,000-character probe within 200 ms, which catches exponential backtracking
  such as `(a+)+$` and `(a|aa)+$`. 0.2.4 ran any pattern as given.
- Golden similarity compares at most the first 20,000 characters of each string,
  with a two-row table. 0.2.4 built a full table of both lengths, so two long
  outputs could exhaust memory. Text past 20,000 characters no longer changes
  the score.
- `runEval` sets `process.exitCode` instead of calling `process.exit(1)`, so
  output still in the pipe is written before the process ends. It prints the
  JSON result on a line of its own, and the Action reads the last JSON line of
  stdout instead of everything from the first `{`.
- Two results from the same runner are merged by `toEvalResult` and `runEval`.
  0.2.4 kept only the last one in `runners` while counting both in `passed`.
- `verbose` progress lines go to stderr instead of stdout, and the human summary
  prints `PASS` and `FAIL` instead of check marks.
- The `github-token` input wins over the `GITHUB_TOKEN` variable; in 0.2.4 the
  variable won.
- The PR comment is matched by its hidden marker and a Bot author, so a person
  quoting the marker cannot get their comment overwritten. File names, summaries
  and errors are escaped before they reach the table, only the four known runner
  names are shown, and provider keys and the token are masked in logs.
- A row for an eval that printed no result keeps `eval exited N` or
  `eval timed out` on its first line and the last 20 lines of the eval's stderr
  after it. The step log shows all of it; the PR comment and the job summary
  show only the first line.
- The failure message says when a failed file is a regression against the base
  branch.

### Removed

- Breaking: the `goldset` command. In 0.2.4 it only printed a stub message. Run
  an eval file with `npx tsx <file>`.
- Breaking: `GoldenDatasetRunner` and the types `GoldenDatasetConfig`,
  `GoldenTestCase`, `EvaluationResult` and `EvaluationSummary`. Use
  `goldenDataset`, `calculateSimilarity` or `levenshteinDistance`.
- The `fail-on-regression` input. It could never change the result, because a
  regression is a failed file and any failed file fails the step. A workflow
  that still passes it gets an "Unexpected input" warning, not an error.

### Docs

- Every example and doc snippet awaits inside `async function main()`, so it
  runs in a CommonJS project too; tsx rejects top-level await there.
- The README describes the two interfaces, the library API and the Action, and
  has a Limits section. The docs say the Action fails the check, and that
  blocking a merge needs the check to be required in branch protection.
- The docs pin `ykstorm/goldset@v0.3.0`.

## 0.2.4 - 2026-06-24

- Action metadata only: the Marketplace name "Goldset AI Eval Gate" and a
  description under 125 characters (commit `63fd95e`, tag `v0.2.4`).

## 0.2.3 - 2026-06-24

- Published to npm a minute before 0.2.4. No commit in the repository carries
  this version.

## 0.2.2 - 2026-06-24

- Action metadata only: an `author` field for the Marketplace (commit `2fc5fd1`).

## 0.2.1 - 2026-06-23

- The Action runs the consumer's own `*.eval.ts` files with
  `npx tsx <file> --output json`, writes `goldset-results.json`, posts or
  updates a results and delta-vs-base comment on the pull request, and fails
  when an eval fails. It no longer uses a stub model.
- The package builds real ESM and CommonJS files, so both `import` and `require`
  resolve.
- `goldenDataset`, `llmJudge`, `structural`, `runEval` and `toEvalResult` are
  exported functions.
- Releases are published from CI on a tag, with provenance.

## 0.2.0 - 2026-05-31

- The first public GitHub Action. It read a YAML eval file and ran the golden,
  judge and structural runners against a stub model. The built `dist/` is
  committed so the Action runs without an install step.

## 0.1.2 - 2026-05-30

- First version on npm, under the `@ykstormsorg` scope.
