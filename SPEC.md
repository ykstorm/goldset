# SPEC.md — Goldset

> Verify every claim against actual code before committing.

## What it is

**Goldset** is an AI eval framework for CI. Three orthogonal runners catch three completely different failure modes. Ships as an npm package (`@ykstormsorg/goldset`) and a GitHub Action (`ykstorm/goldset`).

## Three runners

| Runner | File | What it catches |
|---|---|---|
| `goldenDataset` | `src/runners/golden.ts` | Output drifted from canonical answer |
| `llmJudge` | `src/runners/judge.ts` | Behavior regression on open-ended outputs |
| `structural` | `src/runners/structural.ts` | Output shape broke |

### goldenDataset

Uses Levenshtein distance (string similarity) to compare actual output vs expected. Threshold configurable.

```
goldenDataset(cases, { llm, threshold: 0.85 })
```

- Cases: `{ id, input, expected }[]`
- Returns: `{ passed, similarity, actual, expected }[]`
- Threshold 0.0–1.0. Below threshold = fail. Default: 0.8.

**Hardest part**: `src/runners/golden.ts:40` — normalized Levenshtein. "hello" vs "helo" should be treated as close, not dead. The normalize function lowercases, trims, collapses spaces. Direct string comparison would fail on trivial formatting differences.

### llmJudge

Second LLM scores first LLM's output against a rubric. OpenAI/Anthropic-compatible.

```
llmJudge(cases, { llm, judge, rubric, passThreshold: 3 })
```

- Cases: `{ id, input, expected }[]` — `expected` is context for judge, not ground truth
- Judge LLM returns `{ score: number, reason: string }`
- `passThreshold`: minimum score to count as pass (e.g., 3 out of 5)

### structural

Schema validation + tool call shape assertion.

```
structural(cases, { llm, assertions })
```

Assertion types:
- `json-schema` — output must match given JSON Schema
- `tool-call-shape` — output must contain a tool call with given name and arg count

## Verified in code

| Feature | Location |
|---|---|
| Levenshtein similarity | `src/runners/golden.ts:26-45` |
| Threshold validation | `src/runners/golden.ts:48-55` |
| LLM judge scoring | `src/runners/judge.ts` |
| JSON schema assertion | `src/runners/structural.ts` |
| Tool call shape assertion | `src/runners/structural.ts` |
| GitHub Action PR comment | `.github/actions/eval-report/index.cjs:243` |
| GitHub Action merge block | `.github/actions/eval-report/action.cjs:189-190` |
| CLI runner | `src/cli.ts` |

## GitHub Action flow

1. Action runs `npx @ykstormsorg/goldset` on `.eval.ts` files
2. Each runner produces a result array
3. `action.cjs` posts a PR comment with delta summary (new vs baseline)
4. If any runner has failures, `core.setFailed()` fires → PR blocked from merging

## Out of scope

- Dashboard / web UI — evals are code-only
- Multi-model evaluation in a single run (you can call any LLM via the `llm` function you pass in)
- Automated test case generation — write your own golden cases
- Regression detection without a baseline run