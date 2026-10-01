# Contributing to Goldset

## Dev setup

```bash
git clone https://github.com/ykstorm/goldset.git
cd goldset
npm ci
npm run build
npm test
```

## Project structure

```
src/
  index.ts            public exports
  types.ts            shared types for the golden runner
  runners/
    api.ts            goldenDataset, llmJudge, grounding, structural, runEval
    golden.ts         Levenshtein similarity
    structural.ts     assertion vocabulary
action/
  index.ts            GitHub Action entry
  run-evals.ts        discover + run *.eval.ts
  post-comment.ts     PR comment + delta
docs/
  API.md              API reference
  architecture.md     how the pieces fit
  SETUP.md            setup guide
tests/                vitest unit tests
evals/                Goldset's own eval suite (dogfood)
fixtures/evals/       fixture eval used by the public-action workflow
examples/             example eval file
bench/                timing + cost benchmarks
```

## Adding a structural assertion type

1. Add the variant to the `Assertion` union in `src/runners/structural.ts`.
2. Implement its validator in the same file and wire it into `applyAssertion`.
3. Add tests in `tests/structural.test.ts`.

## Adding a runner

1. Implement it in `src/runners/api.ts` returning `{ runner, cases, summary }`.
2. Export it from `src/index.ts` and add its result to `toEvalResult`.
3. Document it in `docs/API.md` and `docs/architecture.md`.
4. Add tests.

## Standards

- TypeScript strict mode.
- `npm run lint`, `npm run typecheck`, and `npm test` must pass.
- `dist/` is committed; run `npm run build` and commit the result when you change
  `src/` or `action/` (CI checks `dist/` is in sync).
- New public APIs get doc comments.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `test:`, `refactor:`, `chore:`.

## Opening a PR

1. Branch from `main`.
2. Make the change and add tests.
3. Run `npm run lint && npm run typecheck && npm test && npm run build`.
4. Open a PR with a clear description.

## Reporting bugs

Include the Goldset version, your Node version, a minimal reproduction (your eval
file plus an `llm` stub), and the expected vs actual behavior.
