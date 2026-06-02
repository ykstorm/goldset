# Architecture — Goldset

## Component diagram

```mermaid
graph TD
    subgraph "User code"
        Eval[*.eval.ts<br/>defines cases + runners]
    end

    subgraph "Goldset package"
        Entry[index.ts<br/>exports goldenDataset, llmJudge, structural]
        Golden[runners/golden.ts<br/>Levenshtein similarity]
        Judge[runners/judge.ts<br/>LLM-as-judge scoring]
        Structural[runners/structural.ts<br/>schema + tool call assertions]
        Types[types.ts]
    end

    subgraph "GitHub Action"
        ActionCJS[action.cjs<br/>entry point]
        CliCJS[cli.cjs<br/>runs evals]
    end

    Eval --> Entry
    Entry --> Golden
    Entry --> Judge
    Entry --> Structural

    ActionCJS --> CliCJS
    CliCJS --> Entry
```

## Runner comparison

```mermaid
graph LR
    G[goldenDataset] --> |string match| L[Levenshtein]
    J[llmJudge] --> |rubric score| C[LLM judge]
    S[structural] --> |schema| V[JSON Schema validator]

    G --> |deterministic Q&A| R1[content drift]
    J --> |open-ended| R2[behavior regression]
    S --> |structured output| R3[schema breakage]
```

## Primary eval flow

```mermaid
sequenceDiagram
    participant User as *.eval.ts file
    participant Goldset as @ykstormsorg/goldset
    participant LLM as user-provided llm()
    participant Judge as user-provided judge()

    User->>Goldset: goldenDataset(cases, { llm })
    Goldset->>LLM: llm(input) for each case
    LLM-->>Goldset: actual output
    Goldset->>Goldset: Levenshtein(actual, expected)
    Goldset-->>User: results[] with passed/similarity

    User->>Goldset: llmJudge(cases, { llm, judge, rubric })
    Goldset->>LLM: llm(input) for each case
    LLM-->>Goldset: actual output
    Goldset->>Judge: judge(input, actual, rubric)
    Judge-->>Goldset: { score, reason }
    Goldset-->>User: results[] with passed/score

    User->>Goldset: structural(cases, { llm, assertions })
    Goldset->>LLM: llm(input) for each case
    LLM-->>Goldset: actual output
    Goldset->>Goldset: validate JSON schema + tool calls
    Goldset-->>User: results[] with passed/error
```

## Module map

| Module | File | Exports |
|---|---|---|
| Public entry | `src/index.ts` | `goldenDataset`, `llmJudge`, `structural` |
| Golden runner | `src/runners/golden.ts` | `GoldenDatasetCase`, threshold validation, Levenshtein |
| Judge runner | `src/runners/judge.ts` | `LLMJudgeCase`, rubric scoring |
| Structural runner | `src/runners/structural.ts` | `StructuralCase`, `Assertion` union |
| Shared types | `src/types.ts` | `EvalResult`, `RunnerOptions` |
| CLI | `src/cli.ts` | `runEvals()`, `parseArgs()` |
| GitHub Action | `.github/actions/eval-report/action.cjs` | `core.setFailed()` on regression |
| Action lib | `.github/actions/eval-report/index.cjs` | PR comment posting, baseline diff |

## Type definitions

```typescript
// src/types.ts
interface EvalResult {
  passed: boolean;
  testCaseId: string;
  // runner-specific fields:
  similarity?: number;      // goldenDataset
  score?: number;           // llmJudge
  reason?: string;         // llmJudge
  error?: string;          // structural
}
```

## Design decisions

1. **Provider-agnostic llm interface** — `llm: (input: string) => Promise<string>` means any LLM works: OpenAI, Anthropic, Ollama, local models. No SDK-specific code in Goldset itself.

2. **Levenshtein over embedding similarity** — "hello world" vs "hello  world" should not fail. Normalized edit distance handles whitespace and capitalization noise.

3. **Three separate fail conditions** — `goldenDataset` fail, `llmJudge` fail, and `structural` fail are independent. A PR that passes content but breaks JSON schema is still blocked. This is intentional — each runner catches a distinct failure mode.