# Interview Report — Goldset

## What I built

Goldset is an AI eval framework with three orthogonal runners — `goldenDataset`, `llmJudge`, and `structural` — designed to run in CI and block bad merges. Ships as an npm package (`@ykstormsorg/goldset`) and a GitHub Action listed on the GitHub Marketplace.

The key insight: most AI eval tools are dashboards that tell you something went wrong after it shipped. Goldset is the opposite — eval runs live inside the PR, and a failure blocks the merge. The PR author sees exactly which test case failed and why before it reaches main.

## Two non-obvious decisions

**1. Levenshtein distance instead of embedding similarity for goldenDataset**

Most RAG eval tools embed both the expected and actual output and compare cosine similarity. That works for semantic similarity but fails on trivial formatting differences ("Hello world" vs "hello world"). A 5% difference in whitespace or capitalization would trigger a false failure.

I used Levenshtein distance — character-level edit distance normalized by the longer string. "hello world" and "hello  world" (double space) score 0.952, not 0.0. This lets goldenDataset catch real drift without failing on the noise that doesn't matter.

The normalization in `src/runners/golden.ts:26-34` lowercases and trims both strings, then collapses multiple spaces to single. This means "  Hello   World  " and "hello world" score 1.0.

**2. Three orthogonal runners instead of one unified eval**

I could have built one "eval score" that combines correctness, style, and structure into a single number. That's what most tools do. But a single score hides failure modes — if your JSON schema broke, a combined score might still pass if the content was good.

Three separate runners are better for CI:
- `goldenDataset` catches content drift on deterministic outputs (FAQ, refusals)
- `llmJudge` catches behavioral regression on open-ended outputs (tone, language, helpfulness)
- `structural` catches schema breakage — `core.setFailed()` fires immediately if JSON output doesn't match the schema

Each runner is independently configurable and can fail independently. A PR that passes goldenDataset but breaks structural is still blocked.

## What I'd change

**The GitHub Action bundling** — The action uses a bundled `action.cjs` (938 KB) that imports the npm package via `require('@ykstormsorg/goldset')`. This requires the action to run `npm install` before the eval, which slows down CI. A true standalone action would bundle the eval logic directly without a runtime install step. I'd look at using `@vercel/ncc` to produce a single-file action that doesn't need `npm ci`.

**The judge rubric design** — `llmJudge` passes a `rubric` string to the judge LLM. This works but is fragile — if the judge prompt changes slightly between runs, scores aren't comparable. A structured rubric format (JSON with explicit dimensions) would be more reproducible. Right now the rubric is just a natural language string, which means "helpful response" can mean different things across runs.

## What I learned

**GitHub Actions have a 6-hour timeout** — The action runs in a standard GitHub-hosted runner. Long eval suites (hundreds of cases against paid LLM APIs) can hit the timeout. For production use, I'd want a way to run the eval in the background and post results asynchronously, rather than blocking the PR workflow for 30+ minutes.

**ESLint flat config ignores patterns work differently than globs** — Adding `'.github/actions'` to the `ignores` array in `eslint.config.mjs` treats it as a glob pattern, not a directory path. This correctly excludes the bundled `.cjs` files from lint checks without needing a full `.eslintignore` file.

## Source reference

- Golden runner: `src/runners/golden.ts` (110 lines)
- Judge runner: `src/runners/judge.ts` (80 lines)
- Structural runner: `src/runners/structural.ts` (90 lines)
- Action entry: `.github/actions/eval-report/action.cjs:103-110`
- CLI entry: `src/cli.ts`