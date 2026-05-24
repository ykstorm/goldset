# vercel-ai-eval

**Problem**: Evaluating AI-generated outputs against expected results requires a robust similarity metric.

## Solution

`vercel-ai-eval` is a TypeScript package providing a **Golden Dataset Runner** using Levenshtein distance-based similarity scoring.

### Features

- **Levenshtein Similarity Scoring**: Configurable thresholds (default: 0.85)
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

## Development

```bash
npm install        # Install dependencies
npm test          # Run tests
npm run build     # Build package
npm run lint      # Type check
```

## License

Apache 2.0
