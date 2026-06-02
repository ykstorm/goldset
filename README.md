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
