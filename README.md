# Goldset

Run behavioral checks on your AI app in CI: golden datasets, an LLM judge,
grounding, and structural assertions. Goldset posts a delta-vs-base comment on the
pull request and fails the check when behavior regresses, so the merge is gated.

[![npm](https://img.shields.io/npm/v/@ykstormsorg/goldset.svg)](https://npmjs.com/package/@ykstormsorg/goldset)
[![CI](https://github.com/ykstorm/goldset/actions/workflows/ci.yml/badge.svg)](https://github.com/ykstorm/goldset/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

## Contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [Install](#install)
- [Quickstart](#quickstart)
- [Four runners](#four-runners)
- [GitHub Action](#github-action)
- [API reference](docs/API.md)
- [Architecture](docs/architecture.md)
- [Setup guide](docs/SETUP.md)
- [Contributing](CONTRIBUTING.md)

## Why this exists

A prompt edit has no compiler. Changing the wording in one part of a system prompt
can shift behavior somewhere unrelated, and nothing fails until a user notices.
Goldset gates prompt-adjacent merges on behavioral evals the same way type checks
gate code. The runners execute in CI, post a delta-vs-base comment on the pull
request, and fail the check when a golden case drifts, a judge rubric fails, an
answer is unsupported by its context, or an output shape breaks. It is a check
that fails, not a dashboard someone has to remember to open.

## What you get

- Evals as code, living in the same repo as your app.
- A GitHub Action with PR diff comments and merge-blocking on regression.
- Provider independence: plug in any `llm: (input) => Promise<string>`.
- Four runners that catch four different failure modes.

| Runner | What it catches | Best for |
|--------|-----------------|----------|
| `goldenDataset` | Output drifted from a canonical answer | FAQ, refusal correctness, deterministic Q&A |
| `llmJudge` | Behavior regression on open-ended outputs | Tone, helpfulness, brand voice, language matching |
| `structural` | Output shape broke | Function calling, structured generation, JSON schema |
| `grounding` | Answer not supported by context | RAG faithfulness, citation checks |

## Install

```bash
npm install @ykstormsorg/goldset
npm install -D tsx   # optional peer dep, used to run .eval.ts files directly
```

## Quickstart

### 1. Create an eval file

```ts
// evals/customer-support.eval.ts
import { goldenDataset, llmJudge, structural, runEval } from '@ykstormsorg/goldset'
import { myLLM, myJudge } from '../src/llm'

async function main() {
  const golden = await goldenDataset(
    [
      { id: 'refund-q', input: 'How do I get a refund?', expected: 'Email support@...' },
      { id: 'shipping-q', input: 'Where is my order?', expected: 'Track at track.example.com/...' },
    ],
    { llm: myLLM, threshold: 0.85 }
  )

  const judged = await llmJudge(
    [
      { id: 'es-q', input: '¿Cómo funciona esto?', expected: 'Spanish response' },
      { id: 'fr-q', input: 'Comment ça marche ?', expected: 'French response' },
    ],
    {
      llm: myLLM,
      judge: myJudge,
      rubric: 'Score 5 if the response is in the same language as the input, 0 if not.',
      passThreshold: 3,
    }
  )

  const shape = await structural(
    [{ id: 'tool-q', input: 'lookup order 42' }],
    {
      llm: myLLM,
      assertions: [
        { type: 'json-schema', schema: { type: 'object', required: ['toolName', 'toolInput'] } },
        { type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 },
      ],
    }
  )

  // runEval prints a human summary (or JSON with --output json, as the GitHub
  // Action does) and sets a non-zero exit code if any runner failed.
  await runEval(golden, judged, shape)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

The awaits sit inside `main()` because tsx refuses top-level `await` in a
CommonJS project. Written this way, an eval file runs in both module systems,
whether or not your `package.json` says `"type": "module"`.

### 2. Run locally

```bash
npx tsx evals/customer-support.eval.ts
```

Output:

```
PASS goldenDataset: 2/2 passed
PASS llmJudge: 2/2 passed
PASS structural: 1/1 passed
```

Goldset has two interfaces: the library API that an eval file calls, and the
GitHub Action that runs every eval file in CI. There is no `goldset` command.
Locally you run an eval file with tsx, and `--output json` prints the result
line the Action reads. The `goldset` command that npm 0.2.4 installs only prints
a stub message, and 0.3.0 does not ship it.

### 3. Add to CI

```yaml
# .github/workflows/eval.yml
name: Goldset Eval

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - uses: ykstorm/goldset@v0.2.4
        with:
          eval-dir: evals
          judge-provider: none   # or openai | anthropic
          comment-on-pr: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}   # if judge-provider: openai
```

For a supply-chain-hardened pin, reference the Action by commit SHA rather than a
moving tag, for example `uses: ykstorm/goldset@<sha>  # v0.2.4`.

The Action runs every `*.eval.ts` under `eval-dir` with the pinned `tsx` CLI
(`--output json`), writes a combined `goldset-results.json`, posts or updates a PR
comment with a results table and a delta-vs-base section, and fails the check if
any eval fails or regresses against the base branch. It also fails when `eval-dir`
holds no `*.eval.ts` file, so a typo in the path cannot give a green check.

## GitHub Action

| Input | Default | Description |
|-------|---------|-------------|
| `eval-dir` | `evals` | Directory containing `*.eval.ts` files |
| `judge-provider` | `none` | `openai` \| `anthropic` \| `none`. Sets `GOLDSET_JUDGE_PROVIDER` and forwards that provider's key to your eval |
| `comment-on-pr` | `true` | Post or update a results + delta comment on the PR |
| `github-token` | `${{ github.token }}` | Token for the PR comment; wins over `GITHUB_TOKEN` |
| `timeout-ms` | `0` | Per-eval wall-clock limit in ms; 0 disables it |
| `pass-env` | empty | Extra env var names to forward into each eval process |

Outputs: `results-path`, `passed`, `failed`, `total`, `all-passed`.

## Four runners

| Runner | Function | Catches |
|--------|----------|---------|
| Golden dataset | `goldenDataset(cases, { llm, threshold })` | Output drifted from the canonical answer (Levenshtein similarity vs a threshold) |
| LLM-as-judge | `llmJudge(cases, { llm, judge, rubric })` | Behavior regression on open-ended outputs (a second LLM scores against a rubric) |
| Structural | `structural(cases, { llm, assertions })` | Output shape broke (JSON schema, regex, substring, tool-call shape) |
| Grounding | `grounding(cases, { llm, judge })` | Answer makes claims the provided context does not support |

See the full [API reference](docs/API.md).

## Performance

The golden and structural runners are pure CPU and run on every PR, so they have
to be fast enough never to block one. Numbers below are one run on Node 24 with
1000 synthetic cases and a stub `llm` (no provider call), measured 2026-10-01:

| Runner | 1000 cases | per case |
|---|---|---|
| Structural (json-schema + regex + contains) | 3.3 ms | ~3.3 µs |
| Golden (Levenshtein similarity) | 29.8 ms | ~30 µs |

A full PR's worth of deterministic checks is milliseconds, so the eval gate does
not become the slow step. Reproduce with `node bench/runners.mjs` (no API key).

### LLM-judge cost

The judge is the one runner that spends money, because it calls a model to score
each case. `bench/judge.mjs` prices exactly that: the real `llmJudge` runner with
a free stub `llm` and a real Claude Haiku judge. One run in CI against
`claude-haiku-4-5` over 8 cases (workflow_dispatch, one call per case), measured
2026-10-01:

| Metric | Result |
|---|---|
| Cost per judged case | $0.00047 (about $0.47 per 1,000 cases) |
| Judge latency p50 / avg | 1410 ms / 1305 ms |
| Tokens (8 cases) | 1,659 in / 413 out, $0.0037 total |

A 200-case judged suite runs about 9 cents. Reproduce with
`ANTHROPIC_API_KEY=… node bench/judge.mjs`, or trigger the `judge-cost` job in
[`benchmark.yml`](.github/workflows/benchmark.yml). It is manual dispatch only, so
fork PRs cannot touch the key and every paid run is deliberate.

## License

Apache-2.0
