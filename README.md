# vercel-ai-eval

**Problem**: Evaluating AI-generated outputs against expected results requires a robust similarity metric.

## Solution

`vercel-ai-eval` is a TypeScript package providing **Golden Dataset Runner**, **LLM-as-judge**, and **Structural assertions** evaluation runners using Levenshtein distance, rubric-based scoring, and JSON schema validation.

### Features

- **Levenshtein Similarity Scoring**: Configurable thresholds (default: 0.85)
- **LLM-as-Judge Evaluation**: Use another LLM to evaluate outputs with custom rubrics
- **Structural Assertions**: Validate outputs against JSON schemas, regex patterns, and tool call shapes
- **Batch Evaluation**: Evaluate multiple test cases with aggregated results
- **Type-Safe**: Full TypeScript support
- **Zero Dependencies**: Lightweight implementation
- **Easy Integration**: Simple API

## Quick Start

```typescript
import { GoldenDatasetRunner } from "vercel-ai-eval";

const runner = new GoldenDatasetRunner({ threshold: 0.85 });
const result = runner.evaluate(testCase, actualOutput);
```

## LLM-as-Judge

Use an LLM to evaluate AI outputs with rubric-based scoring:

```typescript
import { llmJudge } from "vercel-ai-eval";

const results = await llmJudge(
  [{ id: "q1", input: "What is 2+2?", expected: "4" }],
  {
    llm: async (input) => myLLM(input),
    judge: async (prompt) => myJudge(prompt),
    rubric: "Score 5 for correct math, 0 for wrong",
    passThreshold: 3,
  }
);
```

## Structural Assertions

Validate LLM outputs against structural rules like JSON schemas, regex patterns, and tool calls:

```typescript
import { structural } from "vercel-ai-eval";

const results = await structural(
  [{ id: "test-1", input: "Generate a JSON person object" }],
  {
    llm: async (input) => myLLM(input),
    assertions: [
      { type: "json-schema", schema: { type: "object", properties: { name: {}, age: {} } } },
      { type: "regex", pattern: /\d+/ },
      { type: "contains", substring: "name" },
      { type: "tool-call-shape", toolName: "search" },
    ],
  }
);
```

## Development

```bash
npm install        # Install dependencies
npm test          # Run tests
npm run build     # Build package
npm run lint      # Type check
```

## GitHub Action

The `eval-report` GitHub Action automatically posts PR comments comparing evaluation metrics between the head branch and base branch.

**Usage:**
```yaml
- name: Post Eval Report
  uses: ./.github/actions/eval-report
  with:
    results-path: dist/eval-results.json
    base-ref: ${{ github.base_ref }}
```

**Features:**
- Compares metrics: accuracy, F1, precision, recall, etc.
- Shows deltas: improvements ✅, regressions ⚠️, new metrics 🆕
- Upserts single comment (idempotent, no spam)
- Full TypeScript + tested

![Eval Report Comment](https://placeholder.example.com/eval-report-screenshot.png)

## Status

Day 4 of 7. Shipped: goldenDataset, llmJudge, structural, GitHub Action PR comments. Coming next: examples+dogfood (Day 5), polish (Day 6), npm publish (Day 7).


## License

Apache 2.0
