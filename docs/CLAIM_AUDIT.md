# Claim audit — last verified 2026-06-20

Every public claim Goldset makes (README, docs/API.md, action.yml, marketplace
listing) mapped to the file:line that implements it and the test/run that proves it.

## Library API claims

| Claim | File:line implementing | Verified by |
|---|---|---|
| `goldenDataset(cases, { llm, threshold })` returns `{ runner, cases, summary }` with similarity + passRate | `src/runners/api.ts:52` | `tests/api.test.ts:6` (exact match passes, drift fails, passRate 0.5) |
| `goldenDataset` honors a custom `normalize()` and rejects out-of-range thresholds | `src/runners/api.ts:60`, `src/runners/api.ts:57` | `tests/api.test.ts:35`, `tests/api.test.ts:43` |
| `llmJudge(cases, { llm, judge, rubric, passThreshold })` scores via a second LLM, parses `{score,reason}`, marks malformed JSON as failed | `src/runners/api.ts:127` | `tests/judge.test.ts` (high/low score, malformed JSON, custom threshold, optional `expected`) |
| `structural(cases, { llm, assertions })` validates json-schema / regex / contains / tool-call-shape and reports the failed assertion | `src/runners/api.ts:208`, `src/runners/structural.ts:155` | `tests/structural.test.ts` (12 cases incl. argCount + flags) |
| `tool-call-shape` supports optional `argCount` | `src/runners/structural.ts:95` | `tests/structural.test.ts` "should validate tool-call-shape argCount" |
| `runEval(...)` prints a human summary, emits `EvalResult` JSON under `--output json`, exits 1 on failure | `src/runners/api.ts:283` | live run: `npx tsx evals/golden.eval.ts --output json` prints JSON, exit 0; failing eval exits 1 |
| `toEvalResult(...)` combines runner results into the shared `EvalResult` shape | `src/runners/api.ts:260` | `tests/api.test.ts:55` |

## Packaging claims

| Claim | File:line implementing | Verified by |
|---|---|---|
| `import '@ykstormsorg/goldset'` resolves (ESM) | `package.json:15` → `dist/index.mjs` (emitted by `tsup.config.ts:18`) | tarball test: `npm pack` → fresh install → `node esm.mjs` resolves, exit 0 |
| `require('@ykstormsorg/goldset')` resolves (CJS) | `package.json:16` → `dist/index.cjs` | tarball test: `node cjs.cjs` resolves, `require.resolve` → `dist/index.cjs`, exit 0 |
| `goldset` bin runs | `package.json:10` → `dist/cli.cjs` | `npx goldset` in fresh install, exit 0 |

## GitHub Action claims

| Claim | File:line implementing | Verified by |
|---|---|---|
| Runs the consumer's `*.eval.ts` via `npx tsx <file> --output json` | `action/run-evals.ts:42` | `tests/run-evals.test.ts` (parseEvalOutput) + live fixture run |
| Writes `goldset-results.json` | `action/index.ts:68` | live run produced the file (golden/judge/structural rows) |
| Exits 1 when any eval fails (gates merge) | `action/index.ts:139-140` | live run on a failing fixture eval → exit 1; all-pass run → exit 0 |
| Exits 1 on regression vs base when `fail-on-regression` is true | `action/index.ts:143-144` | `action.yml:13` input; diff computed at `action/index.ts:93` |
| `judge-provider` (openai\|anthropic\|none) threads the key through `process.env` | `action/run-evals.ts:26`, `action/index.ts:23` | `tests/run-evals.test.ts` (judgeEnv sets `GOLDSET_JUDGE_PROVIDER`, preserves keys) |
| PR-comment bot builds a results table | `action/post-comment.ts:62` | `tests/post-comment.test.ts:39` |
| PR-comment bot builds a "delta vs base" section (regressed/fixed) | `action/post-comment.ts:45`, `:80` | `tests/post-comment.test.ts:24`, `:52` |
| PR-comment bot UPDATES an existing comment, else CREATEs one | `action/post-comment.ts:99` | `tests/post-comment.test.ts:95` (create), `:108` (update) |
| Fetches the base branch's results to diff against | `action/index.ts:32` (getContent) | covered by delta logic test + live action wiring |
| `action.yml` declares node20 + the documented inputs/outputs | `action.yml:39`, `:9`, `:13`, `:27` | YAML present; built entry `dist/action.cjs` runs |

## Dogfood

| Claim | File:line implementing | Verified by |
|---|---|---|
| Goldset runs ON ITSELF in CI | `.github/workflows/eval.yml` + `evals/*.eval.ts` | live: built Action on `evals/` → 3/3 files pass, exit 0 |
| Self-eval suite covers all three runners | `evals/golden.eval.ts`, `evals/judge.eval.ts`, `evals/structural.eval.ts` | each runs standalone, exit 0 |
