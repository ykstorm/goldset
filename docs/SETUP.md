# Goldset Setup Guide

A step-by-step walkthrough from zero to CI-integrated AI evals.

---

## Before you start

You'll need:
- Node.js 18+ and npm
- A GitHub repo for your AI app
- An API key for your LLM (OpenAI, Anthropic, etc.)

---

## Step 1: Install Goldset

```bash
npm install @ykstormsorg/goldset tsx --save-dev
```

Or if you prefer as a prod dependency:
```bash
npm install @ykstormsorg/goldset tsx
```

---

## Step 2: Create an eval file

```ts
// evals/my-app.eval.ts
import { goldenDataset, llmJudge, structural } from '@ykstormsorg/goldset'

// Your LLM — any provider
const llm = (input) => import('openai').then(o =>
  o.defaults({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: input }],
  }).then(r => r.choices[0].message.content ?? '')
)

// Your judge LLM (can be the same model, different prompt)
const judge = (rubricPrompt) => llm(rubricPrompt)
```

Start with one runner. The simplest is `goldenDataset`:

```ts
// evals/my-app.eval.ts
import { goldenDataset } from '@ykstormsorg/goldset'

const llm = (input) => /* your LLM setup */

await goldenDataset(
  [
    { id: 'test-1', input: 'What is 2+2?', expected: '4' },
    { id: 'test-2', input: 'Capital of France?', expected: 'Paris' },
  ],
  { llm, threshold: 0.8 }
)
```

Run it:
```bash
npx tsx evals/my-app.eval.ts
```

You should see passing results. Iterate on your test cases until they reflect the behavior you care about.

---

## Step 3: Build out your eval suite

Add more cases. Add `llmJudge` for subjective qualities. Add `structural` for output shape.

```ts
// evals/my-app.eval.ts
import { goldenDataset, llmJudge, structural } from '@ykstormsorg/goldset'

const llm = (input) => /* ... */
const judge = (prompt) => /* ... */

const goldenCases = [
  // deterministic Q&A
  { id: 'greeting', input: 'Hi', expected: 'Hello! How can I help?' },
  { id: 'refund', input: 'I want a refund', expected: 'Email: support@example.com' },
  { id: 'goodbye', input: 'bye', expected: 'Goodbye!' },
]

const judgeCases = [
  // tone + helpfulness
  { id: 'angry-user', input: 'THIS IS UNACCEPTABLE', expected: 'calm empathetic response' },
  { id: 'confused', input: 'I dont understand', expected: 'clear explanation' },
]

const structuralCases = [
  // tool calling
  { id: 'lookup-order', input: 'lookup order #42' },
  { id: 'cancel-sub', input: 'cancel my subscription' },
]

await goldenDataset(goldenCases, { llm, threshold: 0.8 })
await llmJudge(judgeCases, {
  llm, judge,
  rubric: 'Score 1-5: Was the response calm, clear, and helpful? 0 if it escalated.',
  passThreshold: 3,
})
await structural(structuralCases, {
  llm,
  assertions: [
    { type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 },
    { type: 'tool-call-shape', toolName: 'cancelSubscription', argCount: 0 },
  ],
})
```

Run locally until you're happy with the suite.

---

## Step 4: Add the GitHub Action

Create `.github/workflows/goldset.yml`:

```yaml
name: AI Eval

on:
  pull_request:
    paths:
      - 'evals/**/*.eval.ts'
      - 'src/**/*.ts'

jobs:
  goldset:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # needed for base branch comparison

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - uses: ykstorm/goldset@v1
        with:
          eval-file: evals/my-app.eval.ts
          fail-on-regression: true
          comment-on-pr: true
```

Commit and push. Open a PR that changes something in `src/`. The Action will run your evals and post a comment.

---

## Step 5: Handle regressions

When a test regresses, you'll see a red row in the PR comment with the delta:

| Test | Base | Head | Δ | Status |
|------|------|------|---|--------|
| `greeting` | 0.95 | 0.72 | **-0.23** | ⚠️ regression |

Fix the root cause in your app code. If the baseline is legitimately wrong (e.g., the canonical answer changed), update the baseline with a commit that explains why:

```bash
git commit -m "docs: update greeting baseline (product renamed 'Hi' to 'Hello')"
```

The Action will pick up the new baseline on the next PR.

---

## Step 6: Iterate

Your eval suite is a living part of your codebase. As your app evolves:

- Add new test cases for new features
- Add new runners as failure modes appear
- Refine rubrics as you learn what "good" means
- Increase coverage as you build confidence

---

## CI configuration options

```yaml
- uses: ykstorm/goldset@v1
  with:
    # Required
    eval-file: evals/my-app.eval.ts

    # Optional
    fail-on-regression: true    # default: true — set false to just comment
    comment-on-pr: true        # default: true — set false for silent mode
    baseline-ref: main         # which branch to compare against (default: base branch)
    timeout: 60000             # ms per LLM call override
```

---

## Troubleshooting

### "Command not found: goldset"

Install the package first: `npm install @ykstormsorg/goldset`

### Evals pass locally but fail in CI

Check that `OPENAI_API_KEY` (or your LLM API key) is set in CI secrets. The Action does not inject it automatically.

### Timeout errors

Increase the timeout: `timeout: 60000` in the Action config, or `timeout: 60_000` in your runner config.

### All tests pass but the check still fails

The Action writes results to `dist/eval-results.json`. Make sure your eval file creates that directory, or run the Action with `comment-on-pr: false` first to debug.

---

For architecture diagrams, see [architecture.md](./architecture.md).
For API details, see [API.md](./API.md).