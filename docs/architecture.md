# Goldset — Architecture

## 1. Component overview

```mermaid
graph TB
    subgraph "User repo"
        Eval[evals/*.eval.ts]
        Cases[Test cases]
        LLM[llm function]
    end

    subgraph "Goldset core"
        Gold[goldenDataset runner<br/>Levenshtein]
        Judge[llmJudge runner<br/>rubric scoring]
        Struct[structural runner<br/>schema + regex + contains]
        Agg[Aggregator]
    end

    subgraph "GitHub Action"
        Run[Run eval]
        Compare[Compare to base branch]
        Comment[Post PR comment]
        Gate[Fail check on regression]
    end

    Eval --> Cases
    Cases --> Gold
    Cases --> Judge
    Cases --> Struct
    LLM --> Gold
    LLM --> Judge
    LLM --> Struct
    Gold --> Agg
    Judge --> Agg
    Struct --> Agg

    Agg --> Run
    Run --> Compare
    Compare --> Comment
    Compare --> Gate

    classDef core fill:#dcfce7,stroke:#16a34a
    classDef action fill:#dbeafe,stroke:#2563eb
    class Gold,Judge,Struct,Agg core
    class Run,Compare,Comment,Gate action
```

---

## 2. Eval run sequence (in CI)

```mermaid
sequenceDiagram
    autonumber
    participant PR as Pull Request
    participant GHA as GitHub Action
    participant G as Goldset CLI
    participant LLM as Your LLM
    participant Judge as Judge LLM
    participant Cmt as PR Comment

    PR->>GHA: open / push
    GHA->>G: npx goldset run evals/*.eval.ts
    G->>LLM: invoke for each test case
    LLM-->>G: outputs
    G->>Judge: score outputs (llmJudge runner only)
    Judge-->>G: rubric scores
    G->>G: aggregate results
    G-->>GHA: dist/eval-results.json

    GHA->>GHA: download base branch results
    GHA->>GHA: compute delta
    alt regression detected
        GHA->>Cmt: upsert PR comment with red row
        GHA->>PR: fail check
    else clean or improvement
        GHA->>Cmt: upsert PR comment with green status
        GHA->>PR: pass check
    end
```

---

## 3. Runner internals

### goldenDataset
```mermaid
graph LR
    Input[Test case<br/>input + expected] --> LLMCall[Call your LLM]
    LLMCall --> Output[Actual output]
    Output --> Norm[Normalize<br/>lowercase, trim, etc.]
    Expected[Expected] --> Norm2[Normalize]
    Norm --> Distance[Levenshtein distance]
    Norm2 --> Distance
    Distance --> Sim[Similarity = 1 - dist / max_len]
    Sim --> Compare{≥ threshold?}
    Compare -->|yes| Pass[pass]
    Compare -->|no| Fail[fail + report similarity]
```

### llmJudge
```mermaid
graph LR
    Input[Test case<br/>input] --> LLMCall[Call your LLM]
    LLMCall --> Output[Actual output]
    Output --> Prompt[Compose judge prompt<br/>rubric + input + output]
    Prompt --> JudgeCall[Call judge LLM]
    JudgeCall --> Parse[Parse score 0-5]
    Parse --> Compare{≥ passThreshold?}
    Compare -->|yes| Pass[pass + record score]
    Compare -->|no| Fail[fail + record score]
```

### structural
```mermaid
graph LR
    Input[Test case<br/>input] --> LLMCall[Call your LLM]
    LLMCall --> Output[Actual output]
    Output --> Loop{For each assertion}
    Loop --> JSON[json-schema?]
    Loop --> Regex[regex match?]
    Loop --> Contains[contains substring?]
    Loop --> Tool[tool-call-shape?]
    JSON --> Result[true/false]
    Regex --> Result
    Contains --> Result
    Tool --> Result
    Result --> All{All true?}
    All -->|yes| Pass[pass]
    All -->|no| Fail[fail + first failing assertion]
```

---

## 4. Result format

`dist/eval-results.json`:
```json
{
  "version": 1,
  "timestamp": "2026-05-26T17:00:00Z",
  "commit": "abc123",
  "branch": "feat/refund-flow",
  "runners": {
    "goldenDataset": {
      "cases": [
        {"id":"refund-q","passed":true,"similarity":0.93},
        {"id":"shipping-q","passed":false,"similarity":0.61,"threshold":0.85}
      ],
      "summary": {"passed":1,"failed":1,"passRate":0.5}
    },
    "llmJudge": {
      "cases": [
        {"id":"tone-helpful","passed":true,"score":4.2,"passThreshold":3}
      ],
      "summary": {"passed":1,"failed":0,"avgScore":4.2}
    },
    "structural": {
      "cases": [
        {"id":"output-shape","passed":false,"failedAssertion":"json-schema","reason":"missing 'intent'"}
      ],
      "summary": {"passed":0,"failed":1}
    }
  }
}
```

The GitHub Action diffs this file against the base branch's same-named file and renders the PR comment.

---

## 5. Design decisions

**Why three runners, not one?**
Because real AI apps fail in three orthogonal ways: drifted facts (golden), drifted tone (judge), drifted shape (structural). One runner that does all three would be a god-object. Three small runners compose.

**Why Levenshtein over embedding similarity for goldenDataset?**
Levenshtein is deterministic, dependency-free, and the failure mode it catches (canonical-answer drift) is character-level. Embedding similarity adds a model dependency and makes the threshold harder to reason about. We expose a hook to swap it in for cases where you need semantic match.

**Why call it `llmJudge` and not `aiScore`?**
Because "judge" makes the LLM-grading-LLM pattern explicit. Engineers reading this for the first time should immediately know what they're looking at.

**Why no UI?**
A UI is a different product. Goldset is for engineers who want evals next to their code. The PR comment IS the UI.

**Why provider-agnostic?**
Locking you to OpenAI was Vercel Eval's mistake. Your `llm: (input) => Promise<string>` is the only interface. Goldset doesn't care if it's GPT-4o, Claude, Llama 3 on Ollama, or a stub function.
