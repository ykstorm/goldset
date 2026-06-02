# Goldset API Reference

## Installation

```ts
import { goldenDataset, llmJudge, structural } from '@ykstormsorg/goldset'
```

---

## `goldenDataset(cases, config)`

Compares LLM output against canonical answers using Levenshtein distance.

### Parameters

```ts
goldenDataset(
  cases: GoldenCase[],
  config: GoldenConfig
): Promise<GoldenResult>
```

### Types

```ts
interface GoldenCase {
  id: string
  input: string
  expected: string
}

interface GoldenConfig {
  llm: (input: string) => Promise<string>
  threshold?: number              // default: 0.8
  normalize?: (s: string) => string  // custom normalization
  timeout?: number                // ms, default: 30_000
  verbose?: boolean               // print each case, default: false
}

interface GoldenResult {
  runner: 'goldenDataset'
  cases: GoldenCaseResult[]
  summary: {
    passed: number
    failed: number
    passRate: number
    avgSimilarity: number
  }
}

interface GoldenCaseResult {
  id: string
  passed: boolean
  similarity: number
  output: string
  threshold: number
}
```

### Example

```ts
const results = await goldenDataset(
  [
    { id: 'faq-1', input: 'How do I cancel?', expected: 'Email cancel@example.com' },
  ],
  {
    llm: myLLM,
    threshold: 0.85,
    verbose: true,
  }
)
```

---

## `llmJudge(cases, config)`

Scores LLM outputs using a rubric evaluated by a second LLM.

### Parameters

```ts
llmJudge(
  cases: JudgeCase[],
  config: JudgeConfig
): Promise<JudgeResult>
```

### Types

```ts
interface JudgeCase {
  id: string
  input: string
  expected?: string  // optional context for the judge
}

interface JudgeConfig {
  llm: (input: string) => Promise<string>
  judge: (prompt: string) => Promise<string>  // separate judge LLM
  rubric: string         // scoring rubric (e.g. "Score 1-5 for helpfulness...")
  passThreshold?: number // minimum score to pass (default: 3)
  timeout?: number       // ms per call, default: 30_000
  verbose?: boolean      // print each case, default: false
}

interface JudgeResult {
  runner: 'llmJudge'
  cases: JudgeCaseResult[]
  summary: {
    passed: number
    failed: number
    avgScore: number
  }
}

interface JudgeCaseResult {
  id: string
  passed: boolean
  score: number
  reasoning?: string
  passThreshold: number
}
```

### Example

```ts
const results = await llmJudge(
  [
    { id: 'tone-1', input: 'Hello', expected: 'Friendly greeting' },
  ],
  {
    llm: myLLM,
    judge: myJudge,
    rubric: 'Score 1-5: was the response friendly and helpful?',
    passThreshold: 3,
  }
)
```

### Writing good rubrics

A rubric is a prompt for the judge LLM. Best practices:

- **Score 1-5** is the most common scale — gives enough granularity without being tedious
- **Describe each score point** clearly so the judge is consistent
- **Be specific to your use case** — "Score 5 if it mentions the refund policy" is better than "Score 5 if good"
- **Include edge cases** in the rubric description

### Multi-judge rubric example

```ts
const rubric = `
Score the response on four dimensions, each 1-5:
1. Correctness: factual accuracy relative to the expected answer
2. Completeness: covers all parts of the user's question
3. Tone: appropriate for customer support context
4. Conciseness: no unnecessary verbosity

Return JSON: {"correctness": N, "completeness": N, "tone": N, "concise": N, "reasoning": "..."}
Pass if avg score >= 3.
`
```

---

## `structural(cases, config)`

Validates output shape using JSON schema, regex, substrings, and tool-call signatures.

### Parameters

```ts
structural(
  cases: StructuralCase[],
  config: StructuralConfig
): Promise<StructuralResult>
```

### Types

```ts
interface StructuralCase {
  id: string
  input: string
}

type StructuralAssertion =
  | { type: 'json-schema'; schema: object }
  | { type: 'regex'; pattern: string; flags?: string }
  | { type: 'contains'; substring: string }
  | { type: 'tool-call-shape'; toolName: string; argCount?: number }

interface StructuralConfig {
  llm: (input: string) => Promise<string>
  assertions: StructuralAssertion[]
  timeout?: number
  verbose?: boolean
}

interface StructuralResult {
  runner: 'structural'
  cases: StructuralCaseResult[]
  summary: {
    passed: number
    failed: number
  }
}

interface StructuralCaseResult {
  id: string
  passed: boolean
  output: string
  failedAssertion?: {
    type: string
    reason: string
  }
}
```

### Example

```ts
const results = await structural(
  [
    { id: 'tool-1', input: 'lookup order #42' },
  ],
  {
    llm: myLLM,
    assertions: [
      { type: 'json-schema', schema: { type: 'object', properties: { orderId: { type: 'string' } } } },
      { type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 },
    ],
  }
)
```

### Assertion types

| Type | What it checks |
|------|---------------|
| `json-schema` | Output parses as valid JSON and matches the schema |
| `regex` | Output matches the regex pattern |
| `contains` | Output contains the substring |
| `tool-call-shape` | Output is a JSON tool call matching the name + arg count |

---

## Shared result format

All runners return a result compatible with the Goldset GitHub Action's diff engine:

```ts
interface EvalResult {
  version: 1
  timestamp: string      // ISO 8601
  commit: string         // git SHA
  branch: string
  runners: {
    goldenDataset?: GoldenResult
    llmJudge?: JudgeResult
    structural?: StructuralResult
  }
}
```

The GitHub Action writes this to `dist/eval-results.json` and compares it against the base branch's version.

---

## Error handling

All runners throw on:
- LLM timeout (configurable via `timeout`)
- Invalid assertion config (immediate validation error)
- JSON parse failure on output (structural runner marks as failed, not thrown)

```ts
try {
  await goldenDataset(cases, { llm: myLLM, threshold: 0.85 })
} catch (err) {
  if (err instanceof GoldsetTimeoutError) {
    // handle timeout
  }
  // re-throw unexpected errors
  throw err
}
```

---

## Running evals from the CLI

```bash
# Run a specific eval file
npx goldset run evals/my.eval.ts

# Run with verbose output
npx goldset run evals/my.eval.ts --verbose

# Run against a specific baseline commit
npx goldset run evals/my.eval.ts --baseline abc1234

# Help
npx goldset --help
```

The CLI writes results to `dist/eval-results.json` and exits with code 0 on success, 1 on any test failure.

---

## Environment variables

| Variable | What it does |
|----------|--------------|
| `GOLDSET_TIMEOUT` | Default timeout in ms for all LLM calls |
| `GOLDSET_VERBOSE` | Set to `true` to enable verbose output |
| `OPENAI_API_KEY` | Passed to your LLM function (not used directly by Goldset) |