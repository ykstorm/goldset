# Goldset setup guide

From zero to AI evals that run on every pull request and fail the check when
they fail.

## Before you start

- Node.js 20+ and npm
- A GitHub repo for your AI app
- An API key for your LLM, if your evals call a real provider

## 1. Install

```bash
npm install --save-dev @ykstormsorg/goldset tsx
```

`tsx` is required. It runs your `*.eval.ts` files locally and in the Action,
and the Action stops with "tsx is not installed" when your project lacks it.

npm `latest` is 0.2.4. The `grounding` runner, `parseJudgeScore`, the judge
cache helpers and the Action inputs `timeout-ms` and `pass-env` arrive with
0.3.0.

## 2. Write an eval file

```ts
// evals/my-app.eval.ts
import { goldenDataset, runEval } from '@ykstormsorg/goldset'

// Your LLM: any provider behind (input: string) => Promise<string>.
const llm = async (input: string): Promise<string> => {
  // call your model here
  return 'some answer'
}

async function main() {
  const golden = await goldenDataset(
    [
      { id: 'math', input: 'What is 2+2?', expected: '4' },
      { id: 'capital', input: 'Capital of France?', expected: 'Paris' },
    ],
    { llm, threshold: 0.8 }
  )

  await runEval(golden)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

The awaits sit inside `main()` because tsx refuses top-level `await` in a
CommonJS project. This form works in both module systems.

Run it locally:

```bash
npx tsx evals/my-app.eval.ts
```

## 3. Build out the suite

Add more cases and runners as failure modes appear: `llmJudge` for tone and
helpfulness, `grounding` for RAG faithfulness, `structural` for output shape.

```ts
import { goldenDataset, llmJudge, structural, runEval } from '@ykstormsorg/goldset'

const llm = async (input: string): Promise<string> => { /* ... */ return '' }
const judge = async (prompt: string): Promise<string> => { /* ... */ return '' }

async function main() {
  const golden = await goldenDataset(
    [{ id: 'refund', input: 'I want a refund', expected: 'Email support@example.com' }],
    { llm, threshold: 0.8 }
  )

  const judged = await llmJudge(
    [{ id: 'calm', input: 'THIS IS UNACCEPTABLE' }],
    { llm, judge, rubric: 'Score 1-5: was the reply calm and helpful? 0 if it escalated.', passThreshold: 3 }
  )

  const shape = await structural(
    [{ id: 'lookup', input: 'lookup order 42' }],
    { llm, assertions: [{ type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 }] }
  )

  await runEval(golden, judged, shape)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
```

## 4. Add the GitHub Action

```yaml
# .github/workflows/goldset.yml
name: AI Eval

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write   # only needed when comment-on-pr is true

jobs:
  goldset:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - uses: ykstorm/goldset@v0.2.4   # the latest release tag; pin to a commit SHA in production
        with:
          eval-dir: evals
          judge-provider: none        # or openai | anthropic
          comment-on-pr: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}   # if judge-provider: openai
```

Inputs, as of v0.3.0, the first release with `timeout-ms` and `pass-env`
(the v0.2.4 tag has neither):

| Input | Default | Description |
|-------|---------|-------------|
| `eval-dir` | `evals` | Directory of `*.eval.ts` files (must be inside the workspace) |
| `judge-provider` | `none` | `openai` \| `anthropic` \| `none`; sets `GOLDSET_JUDGE_PROVIDER` and forwards that provider's key |
| `comment-on-pr` | `true` | Post/update a results + delta comment on the PR |
| `github-token` | `${{ github.token }}` | Token for the PR comment (wins over `GITHUB_TOKEN`) |
| `timeout-ms` | `0` | Per-eval wall-clock limit in ms; 0, the default, means no limit |
| `pass-env` | empty | Extra env var names to forward into each eval process |

The Action fails the check; it does not block the merge by itself. To block a
merge on a failing eval, add the job as a required status check in the branch
protection rules for your default branch.

## 5. Enable the baseline

Commit a `goldset-results.json` on your default branch so the Action has a
baseline to diff against. The Action writes this file on every run; commit the
one produced on `main`. Until a baseline exists, the comment says "No baseline".

## 6. Handle regressions

When an eval regresses, the PR comment marks it in the "Delta vs base" section and
the check fails. Fix the root cause in your app, or, if the canonical answer
legitimately changed, update the eval and commit the new `goldset-results.json`
with an explanation.

## Troubleshooting

- "tsx is not installed": add it with `npm install -D tsx`.
- An eval that crashes shows `eval exited N` in the PR comment. The step log
  has the same line followed by the last 20 lines of the eval's stderr.
- "no *.eval.ts files found under ..." means the `eval-dir` input points at a
  folder with no eval files. Fix the path or add an eval file.
- Evals pass locally but fail in CI: make sure the LLM or judge API key is set
  in CI secrets and referenced under `env:`. The Action forwards only the key of
  the selected `judge-provider`; any other variable your eval reads must be named
  in `pass-env`, because the Action drops everything outside its allowlist.
- No PR comment: the event must be a pull request and a token must be
  available; `permissions: pull-requests: write` is required to post.

See [API.md](./API.md) for the full API and [architecture.md](./architecture.md)
for how the pieces fit together.
