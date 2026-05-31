# Goldset

**Lock your AI app's behavior. Golden datasets + LLM-as-judge + structural assertions, as a GitHub Action.**

![npm](https://img.shields.io/npm/v/@ykstormsorg/goldset.svg)
[![CI](https://github.com/ykstorm/goldset/actions/workflows/ci.yml/badge.svg)](https://github.com/ykstorm/goldset/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## What it is

Three runners — golden dataset, LLM-as-judge, structural — that you call from an eval file in your repo. A GitHub Action that runs the eval file on every PR, posts a diff comment, and blocks the merge on regression.

| Runner | Catches | Best for |
|---|---|---|
| `goldenDataset` | Output drifted from canonical answer (Levenshtein) | FAQ, refusal correctness, deterministic Q&A |
| `llmJudge` | Behavior regression on open-ended outputs (rubric scoring) | Tone, helpfulness, brand voice, language matching |
| `structural` | Output shape broke (JSON schema, regex, contains, tool-call) | Function calling, structured generation |

Pass it your LLM function — `llm: (input) => Promise<string>`. Goldset doesn't care if it's OpenAI, Anthropic, Bedrock, Llama on Ollama, or a stub.

---

## 60-second quickstart

```bash
npm install @ykstormsorg/goldset
```

```ts
// evals/customer-support.eval.ts
import { goldenDataset, llmJudge, structural } from '@ykstormsorg/goldset'
import { myLLM, myJudge } from '../src/llm'

const cases = [
  { id: 'refund-q', input: 'How do I get a refund?', expected: 'Email support@…' },
  { id: 'hindi-q',  input: 'Bopal mein 2BHK?',       expected: 'language: hi' },
]

await goldenDataset(cases.slice(0, 1), { llm: myLLM, threshold: 0.85 })

await llmJudge(cases.slice(1), {
  llm: myLLM,
  judge: myJudge,
  rubric: 'Score 5 if response is in the same language as the input. 0 if not.',
  passThreshold: 3,
})

await structural([{ id: 'tool-q', input: 'lookup order #42' }], {
  llm: myLLM,
  assertions: [{ type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 }],
})
```

```bash
npx tsx evals/customer-support.eval.ts
```

---

## GitHub Action

```yaml
# .github/workflows/eval.yml
- uses: ykstorm/goldset@v1
  with:
    eval-file: evals/customer-support.eval.ts
    fail-on-regression: true
    comment-on-pr: true
```

The Action posts a diff table on the PR:

| Test | Base | Head | Δ | Status |
|---|---|---|---|---|
| `refund-q` (golden) | 0.93 | 0.94 | +0.01 | ✅ pass |
| `hindi-q` (judge) | 4.2/5 | 1.8/5 | **-2.4** | ⚠️ regression |
| `tool-q` (structural) | pass | pass | — | ✅ pass |

Regression blocks the merge. Fix the cause or update the baseline with a commit explaining why.

Full sequence diagrams: [docs/architecture.md](docs/architecture.md).

---

## When NOT to use this

Goldset is for engineers who want AI assertions in CI. If you need a web dashboard, labeling queue, and PM workflows — use Vercel Eval or Braintrust. Goldset's UI is the PR comment.

---

## Limits

- `goldenDataset` Levenshtein is character-level. For semantic match, swap in your own distance function via the runner hook.
- `llmJudge` is only as good as your rubric. Iterate the rubric like you iterate the code.
- No labeling UI. If PMs need to label data, this isn't the right tool.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
