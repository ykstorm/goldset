# Contributing to Goldset

Thank you for your interest in contributing!

## Dev setup

```bash
git clone https://github.com/ykstorm/goldset.git
cd goldset
npm install
npm run build
npm test
```

## Project structure

```
src/
  index.ts          # public exports
  cli.ts            # CLI entrypoint
  types.ts          # shared TypeScript types
  runners/
    golden.ts       # goldenDataset runner
    judge.ts        # llmJudge runner
    structural.ts   # structural runner
action/
  index.ts          # GitHub Action entrypoint
docs/
  architecture.md   # system diagrams
  API.md            # full API reference
  SETUP.md          # step-by-step setup guide
tests/
  *.test.ts         # unit + integration tests
fixtures/
  *.yaml            # test case fixtures
examples/
  customer-support/ # example eval file
```

## Adding a new assertion type to `structural`

1. Add the assertion type to `src/types.ts` under `StructuralAssertion`
2. Implement the assertion logic in `src/runners/structural.ts`
3. Add test cases in `tests/structural.test.ts`
4. Add fixture cases in `fixtures/structural-test.yaml` if applicable

## Adding a new runner

1. Create `src/runners/<name>.ts` — implement `RunnerResult` interface
2. Export from `src/index.ts`
3. Document in `docs/API.md` and `docs/architecture.md`
4. Add tests

## Code standards

- TypeScript strict mode
- ESLint must pass (`npm run lint`)
- Vitest for all tests
- New public APIs need doc comments

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `test:` test only
- `refactor:` code change that neither fixes a bug nor adds a feature

## Opening a PR

1. Fork the repo
2. Create a feature branch from `main`
3. Make your changes + add tests
4. Ensure `npm run lint && npm test` passes
5. Open a PR with a clear description

## Reporting bugs

Please include:
- Goldset version (`npm list @ykstormsorg/goldset`)
- Node version (`node --version`)
- A minimal reproduction (your eval file + LLM function stub)
- Expected vs actual behavior

## Suggesting features

Open an issue with:
- The problem you're solving
- Why existing tools don't solve it
- A rough sketch of the API you'd want

We'll discuss before any implementation.

---

For deployment docs (npm publish, Action release, docs deploy), see [DEPLOY.md](./DEPLOY.md).