# Goldset architecture

Goldset is two things in one repo: an npm library of eval runners, and a GitHub
Action that runs a consumer's `*.eval.ts` files and fails the check when one
fails. Blocking the merge on that check is a branch protection setting in the
consumer's repository.

## Library

`src/index.ts` exports four runners and a small harness:

- `goldenDataset` (`src/runners/api.ts`, similarity in `src/runners/golden.ts`)
- `llmJudge` (`src/runners/api.ts`)
- `grounding` (`src/runners/api.ts`)
- `structural` (`src/runners/api.ts`, assertions in `src/runners/structural.ts`)
- `runEval` and `toEvalResult`, which combine runner results into one `EvalResult`

Each runner takes `(cases, config)`, calls the consumer-supplied `llm` (and, for
`llmJudge`/`grounding`, a `judge`), and returns `{ runner, cases, summary }`. The
`llm` interface is just `(input: string) => Promise<string> | string`, so any
provider works.

An eval file (`evals/*.eval.ts`) calls any of the four runners in
`@ykstormsorg/goldset`: `goldenDataset` (Levenshtein similarity), `llmJudge` (a
judge's 0 to 5 score against a rubric), `grounding` (a judge's 0 to 5 score for
faithfulness to the supplied context) and `structural` (JSON schema, regex,
substring and tool-call shape assertions). Their results go to `toEvalResult`
or `runEval`, which combine them into one `EvalResult`.

## GitHub Action

The Action entry is `action/index.ts` (bundled to `dist/action.cjs`). It:

1. Discovers `*.eval.ts` under `eval-dir` (`action/run-evals.ts`), after
   resolving the directory under the workspace and rejecting path traversal.
   It fails if the directory holds no eval file.
2. Runs each file on the consumer's own `tsx` CLI (`node <tsx> <file> --output
   json`) with an allowlisted child environment. A per-eval time limit applies
   only when the workflow sets `timeout-ms`; the default, 0, means no limit.
3. Parses each eval's JSON into a per-file row and writes the array to
   `goldset-results.json`. When an eval prints no result, the row's error is
   the exit code followed by the last 20 lines of the eval's stderr; the step
   log shows all of it, and the PR comment shows only the first line.
4. If the event is a pull request and a token is present, fetches the base
   branch's committed `goldset-results.json`, computes the delta, and posts or
   updates one PR comment (`action/post-comment.ts`).
5. Fails the check when any eval file fails. The failure message says when one
   of them is a regression, meaning it passed on the base branch.

Between the Action, each eval process and the GitHub API:

1. For each eval file the Action runs `node <tsx> <file> --output json` and
   reads the `EvalResult` JSON the eval prints on stdout.
2. It writes `goldset-results.json`.
3. On a pull request with a token, it fetches the base branch's
   `goldset-results.json` through the GitHub API and checks for a regression.
4. With `comment-on-pr` on (the default), it creates or updates its one PR
   comment, which carries the delta against the base, through the same API.
5. It calls `setFailed` when any eval file failed. A regression, an eval that
   passed on the base branch and fails now, is always one of those.

## Result files

Each eval prints an `EvalResult` (see [API.md](./API.md)) on stdout. The Action
collects a per-file summary array and writes it to `goldset-results.json`:

```json
[
  {
    "file": "customer-support.eval.ts",
    "passed": false,
    "summary": "goldenDataset 1/2, structural 1/1",
    "runners": {
      "goldenDataset": { "passed": 1, "failed": 1 },
      "structural": { "passed": 1, "failed": 0 }
    }
  }
]
```

The baseline is the `goldset-results.json` a consumer commits (it is tracked, not
git-ignored). The Action diffs this run against that file on the base branch.

## Design notes

- Four runners, not one. Drifted facts, drifted tone, unsupported claims, and
  broken output shape are different failures; each runner catches one.
- Levenshtein, not embeddings, for `goldenDataset`. It is deterministic and
  dependency-free, and the drift it catches is character-level. A `normalize`
  hook lets you fold in your own comparison.
- The Action brings no model. Each `.eval.ts` supplies its own `llm`/`judge`,
  so Goldset stays provider-agnostic.
