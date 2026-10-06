# Goldset API Reference

```ts
import {
  goldenDataset,
  llmJudge,
  structural,
  grounding,
  runEval,
  toEvalResult,
} from '@ykstormsorg/goldset'
```

Every runner takes `(cases, config)` and returns a `{ runner, cases, summary }`
result. An `.eval.ts` file composes runners and reports the combined result with
`runEval` (or `toEvalResult`).

## goldenDataset(cases, config)

Compares each LLM output against a canonical answer using normalized Levenshtein
similarity.

```ts
goldenDataset(cases: GoldenCase[], config: GoldenConfig): Promise<GoldenResult>

interface GoldenCase {
  id: string
  input: string
  expected: string
}

interface GoldenConfig {
  llm: (input: string) => Promise<string> | string
  threshold?: number                  // pass if similarity >= threshold; default 0.8
  normalize?: (s: string) => string   // applied to expected and output before comparing
  verbose?: boolean                   // print each case; default false
}

interface GoldenResult {
  runner: 'goldenDataset'
  cases: {
    id: string
    passed: boolean
    similarity: number
    output: string
    threshold: number
  }[]
  summary: { passed: number; failed: number; passRate: number; avgSimilarity: number }
}
```

Throws if `threshold` is outside 0–1. Inputs longer than 20,000 characters are
truncated before the distance is computed.

## llmJudge(cases, config)

Scores each LLM output against a rubric, graded by a second LLM.

```ts
llmJudge(cases: JudgeCase[], config: JudgeConfig): Promise<JudgeResult>

interface JudgeCase {
  id: string
  input: string
  expected?: string   // optional context for the judge, not ground truth
}

interface JudgeConfig {
  llm: (input: string) => Promise<string> | string
  judge: (prompt: string) => Promise<string> | string
  rubric: string
  passThreshold?: number   // minimum score to pass; default 3
  verbose?: boolean
  cache?: JudgeCache       // reuse verdicts; see "Caching judge verdicts"
}

interface JudgeResult {
  runner: 'llmJudge'
  cases: {
    id: string
    passed: boolean
    score: number
    output: string
    reasoning?: string
    passThreshold: number
  }[]
  summary: { passed: number; failed: number; avgScore: number }
}
```

The rubric, input, expected, and output are wrapped in named tags in the judge
prompt, and the closing-tag sequence inside each value is escaped, so untrusted
content cannot inject instructions into the judge. The judge's reply is parsed by
`parseJudgeScore`: the `score` field must be a finite number, which is clamped to
[0, 5] and rounded; anything else scores 0 (an inconclusive verdict fails).

### Writing good rubrics

- Use a 0–5 scale and describe what each score means.
- Be specific to your use case ("Score 5 if it cites the refund policy") rather
  than "Score 5 if good".
- Ask the judge to return `{"score": N, "reason": "..."}`.

## grounding(cases, config)

Checks that an answer is supported by the retrieved context (RAG faithfulness).
Invented claims lower the score.

```ts
grounding(cases: GroundingCase[], config: GroundingConfig): Promise<GroundingResult>

interface GroundingCase {
  id: string
  input: string
  context: string[]   // the retrieved context the answer must stay faithful to
}

interface GroundingConfig {
  llm: (input: string) => Promise<string> | string
  judge: (prompt: string) => Promise<string> | string
  passThreshold?: number   // default 3
  verbose?: boolean
}

interface GroundingResult {
  runner: 'grounding'
  cases: {
    id: string
    passed: boolean
    score: number
    output: string
    reasoning?: string
    passThreshold: number
  }[]
  summary: { passed: number; failed: number; avgScore: number }
}
```

## structural(cases, config)

Validates output shape with assertions: JSON schema, regex, substring, and
tool-call shape.

```ts
structural(cases: StructuralCase[], config: StructuralConfig): Promise<StructuralResult>

interface StructuralCase {
  id: string
  input: string
}

type Assertion =
  | { type: 'json-schema'; schema: Record<string, unknown> }
  | { type: 'regex'; pattern: string | RegExp; flags?: string }
  | { type: 'contains'; substring: string }
  | { type: 'tool-call-shape'; toolName: string; argCount?: number }

interface StructuralConfig {
  llm: (input: string) => Promise<string> | string
  assertions: Assertion[]
  verbose?: boolean
}

interface StructuralResult {
  runner: 'structural'
  cases: {
    id: string
    passed: boolean
    output: string
    failedAssertion?: { type: string; reason: string }
  }[]
  summary: { passed: number; failed: number }
}
```

Assertion types:

- `json-schema`: output parses as JSON. With `type: 'object'`, or with
  `properties` or `required` and no `type`, it must be an object, every
  property in `required` (or every key of `properties` when `required` is
  absent) must be present and not null, and a property with a `type` must have
  it. Any other top-level `type` is checked on its own. Nested schemas are not
  checked.
- `regex`: output matches the pattern. Before a pattern runs on any output it
  is tried once, in a `node:vm` context with a 200 ms limit, on a few
  1,000-character probe strings: runs of a letter, a digit, a space and the
  literal characters of each group in the pattern. A pattern that does not
  finish is rejected rather than run. This catches exponential backtracking
  such as `(a+)+$`, `(a|aa)+$` and `(\d|\d)+$`. A pattern that is slow only in
  proportion to the square of the input, such as `\s+$`, still runs; the
  100,000-character cap on the tested text bounds that work, though a long
  enough output can still take seconds. The global and sticky flags are
  ignored.
- `contains` — output contains the substring.
- `tool-call-shape` — output is a JSON tool call (or array of calls) with the
  given `toolName` and, optionally, exactly `argCount` arguments.

## runEval(...runnerResults) and toEvalResult(...runnerResults)

`toEvalResult` combines runner results into the shape the GitHub Action consumes.
Two results from the same runner are merged (cases concatenated, summaries
re-aggregated). Pass `{ stable: true }` as the last argument to omit the volatile
`timestamp`/`commit`/`branch` fields for deterministic output. `runEval` does the
same, prints a human summary (or the JSON blob when invoked with `--output json`,
as the Action does), and exits 1 if any runner failed.

```ts
interface EvalResult {
  version: 1
  timestamp: string   // ISO 8601
  commit: string      // from GITHUB_SHA, when set
  branch: string      // from GITHUB_REF_NAME, when set
  runners: {
    goldenDataset?: GoldenResult
    llmJudge?: JudgeResult
    structural?: StructuralResult
    grounding?: GroundingResult
  }
  passed: boolean     // true only if every runner had zero failures
}
```

## parseJudgeScore(text)

Exported helper used by the judge runners. Returns the trustworthy integer score
(0–5) for a judge reply, or 0 when the reply is missing, non-numeric, or
unparseable.

## Caching judge verdicts

`llmJudge` and `grounding` can reuse a judge's verdict for an identical
`(runner, rubric/context, input, expected, output)`, since that is deterministic
input to the judge. Pass a `cache` on the config (`memoryCache()`, or
`layeredCache(...)` over any object with `get(key)` and `set(key, verdict)`, the
`JudgeCache` type), or set `GOLDSET_JUDGE_CACHE` to enable the default cache (a
memory layer over a file at `.goldset-cache/judge.json`; set it to a path to choose
the directory). Only the raw verdict is cached, and only when it carries a numeric
`score`; a reply the scorer cannot read is scored 0 for that run and asked again next
time. Scoring and clamping run every time.

## Environment variables

| Variable | What it does |
|----------|--------------|
| `GOLDSET_JUDGE_PROVIDER` | Set by the Action to `openai`/`anthropic` so an eval can branch to a real provider; unset means `none`. |
| `GOLDSET_JUDGE_CACHE` | Enable the judge verdict cache: `1`/`true` uses `.goldset-cache`, any other value is used as the cache directory. |
| `GITHUB_SHA`, `GITHUB_REF_NAME` | Read by `toEvalResult` to stamp commit/branch into the result. |
