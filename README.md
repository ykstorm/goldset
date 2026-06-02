# Goldset

**Lock your AI app's behavior — golden datasets, LLM-as-judge, and structural assertions in CI.**

[![npm](https://img.shields.io/npm/v/@ykstormsorg/goldset.svg)](https://npmjs.com/package/@ykstormsorg/goldset)
[![CI](https://github.com/ykstorm/goldset/actions/workflows/ci.yml/badge.svg)](https://github.com/ykstorm/goldset/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-goldset.lakshyaraj.dev-blue)](https://goldset.lakshyaraj.dev)

---

## Contents

- [Why Goldset?](#why-goldset)
- [Install](#install)
- [Quickstart](#quickstart)
- [Three runners](#three-runners)
- [GitHub Action](#github-action)
- [API reference](docs/API.md)
- [Architecture](docs/architecture.md)
- [Setup guide](docs/SETUP.md)
- [Contributing](CONTRIBUTING.md)

---

## Why Goldset?

Most AI eval tools are dashboards with no CI integration. Goldset is the opposite:

- **Evals as code** — sit next to your app in the same repo
- **GitHub Action native** — PR diff comments, merge-blocking on regression
- **Provider agnostic** — plug in any `llm: (input) => Promise<string>`
- **Three orthogonal runners** — catch three completely different failure modes

| Runner | What it catches | Best for |
|--------|-----------------|----------|
| `goldenDataset` | Output drifted from canonical answer | FAQ, refusal correctness, deterministic Q&A |
| `llmJudge` | Behavior regression on open-ended outputs | Tone, helpfulness, brand voice, language matching |
| `structural` | Output shape broke | Function calling, structured generation, JSON schema |

---

## Install

```bash
npm install @ykstormsorg/goldset
```

Peer dependency (not installed automatically):
```bash
npm install tsx   # for running .eval.ts files directly
```

---

## Quickstart

### 1. Create an eval file

```ts
// evals/customer-support.eval.ts
import { goldenDataset, llmJudge, structural } from '@ykstormsorg/goldset'
import { myLLM, myJudge } from '../src/llm'

const goldenCases = [
  { id: 'refund-q', input: 'How do I get a refund?', expected: 'Email support@...' },
  { id: 'shipping-q', input: 'Where is my order?', expected: 'Track at track.example.com/...' },
]

const judgeCases = [
  { id: 'hindi-q', input: 'Bopal mein 2BHK?', expected: 'Hindi response' },
  { id: 'french-q', input: 'Comment ça marche?', expected: 'French response' },
]

const structuralCases = [
  { id: 'tool-q', input: 'lookup order #42' },
]

// Run all three
await goldenDataset(goldenCases, {
  llm: myLLM,
  threshold: 0.85,
})

await llmJudge(judgeCases, {
  llm: myLLM,
  judge: myJudge,
  rubric: 'Score 5 if response is in the same language as the input. 0 if not.',
  passThreshold: 3,
})

await structural(structuralCases, {
  llm: myLLM,
  assertions: [
    { type: 'json-schema', schema: { type: 'object', properties: { orderId: { type: 'string' } } } },
    { type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 },
  ],
})
```

### 2. Run locally

```bash
npx tsx evals/customer-support.eval.ts
```

Output:
```
✓ goldenDataset: 2/2 passed (avg similarity 0.91)
✓ llmJudge: 2/2 passed (avg score 4.5/5)
✓ structural: 1/1 passed
```

### 3. Add to CI

```yaml
# .github/workflows/eval.yml
name: Goldset Eval

on:
  pull_request:
    paths:
      - 'evals/**/*.eval.ts'
      - 'src/**/*.ts'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # needed for base branch comparison

      - uses: ykstorm/goldset@v1
        with:
          eval-file: evals/customer-support.eval.ts
          fail-on-regression: true
          comment-on-pr: true
```

The Action posts a diff comment on your PR:

| Test | Base | Head | Δ | Status |
|------|------|------|---|--------|
| `refund-q` (golden) | 0.93 | 0.94 | +0.01 | ✅ pass |
| `hindi-q` (judge) | 4.2/5 | 1.8/5 | **-2.4** | ⚠️ regression |
| `tool-q` (structural) | pass | pass | — | ✅ pass |

Regression blocks the merge. Fix the cause or update the baseline with a commit explaining why.

---

## Three runners

### `goldenDataset` — exact answer matching

Levenshtein distance between normalized output and expected. Tunable threshold.

```ts
await goldenDataset(cases, {
  llm: myLLM,
  threshold: 0.85,       // similarity floor to pass (default: 0.8)
  normalize?: (s: string) => string,  // override normalization
})
```

Best for: FAQ answers, refusal correctness, deterministic outputs where the canonical answer is known.

### `llmJudge` — rubric scoring

A second LLM scores the output against a rubric. The rubric IS the eval — write it like you write tests.

```ts
await llmJudge(cases, {
  llm: myLLM,
  judge: myJudge,
  rubric: 'Score 1-5: response correctly refuses for dangerous requests. 0 if it complies.',
  passThreshold: 3,
})
```

Best for: tone, helpfulness, brand voice, language matching, open-ended generation quality.

### `structural` — output shape validation

JSON schema, regex, substring contains, tool-call signature — all without an LLM call.

```ts
await structural(cases, {
  llm: myLLM,
  assertions: [
    { type: 'json-schema', schema: mySchema },
    { type: 'regex', pattern: /^Order ID: [A-Z0-9]+$/ },
    { type: 'contains', substring: 'orderId' },
    { type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 },
  ],
})
```

Best for: function calling, structured tool use, any output where shape matters more than content.

---

## Configuration

All runners accept a shared config object:

```ts
{
  llm: (input: string) => Promise<string>,   // required — your AI function
  timeout?: number,                            // ms per call (default: 30_000)
  verbose?: boolean,                           // print each case result (default: false)
}
```

Runner-specific options are in the runner sections above.

---

## Limits

| Limit | Detail |
|-------|--------|
| `goldenDataset` | Character-level Levenshtein. For semantic similarity, pass a custom `normalize` or swap in embedding cosine via the runner hook. |
| `llmJudge` | Rubric quality is the ceiling. Iterate your rubric like you iterate code — that's the whole job. |
| `structural` | No multi-step state machine assertions (yet). File a feature request if you need it. |
| UI | None. If PMs need a labeling queue, use Braintrust or Vercel Eval instead. |

---

## When NOT to use this

Goldset is for engineers who want AI assertions in CI. If you need:
- A web dashboard → Vercel Eval or Braintrust
- A labeling queue for PMs → use a dedicated data platform
- Multi-turn conversation testing → file a feature request

Goldset's UI is the PR comment.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

---

## Links

- [Full architecture docs](docs/architecture.md)
- [API reference](docs/API.md)
- [Setup guide](docs/SETUP.md)
- [GitHub Action](action.yml)
- [NPM package](https://npmjs.com/package/@ykstormsorg/goldset)