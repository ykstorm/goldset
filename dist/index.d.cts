type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';
/** A single assertion to validate LLM output, discriminated by `type`. */
type Assertion = {
    type: 'json-schema';
    schema: Record<string, unknown>;
} | {
    type: 'regex';
    pattern: string | RegExp;
    flags?: string;
} | {
    type: 'contains';
    substring: string;
} | {
    type: 'tool-call-shape';
    toolName: string;
    argCount?: number;
};
/**
 * Description of the first assertion that failed for a given output.
 */
interface AssertionFailure {
    type: AssertionType;
    reason: string;
}
/**
 * Applies all assertions; returns the first failure, or null if all passed.
 */
declare function applyAssertions(output: string, assertions: Assertion[]): AssertionFailure | null;

interface JudgeCache {
    get(key: string): string | undefined;
    set(key: string, verdict: string): void;
}
/** In-process cache; lives for one run. */
declare function memoryCache(): JudgeCache;
/** Read layers in order; write to all. Put the fast layer first. */
declare function layeredCache(...layers: JudgeCache[]): JudgeCache;

type LLMFn = (input: string) => Promise<string> | string;
type JudgeFn = (prompt: string) => Promise<string> | string;
interface GoldenCase {
    id: string;
    input: string;
    expected: string;
}
interface GoldenConfig {
    llm: LLMFn;
    threshold?: number;
    normalize?: (s: string) => string;
    verbose?: boolean;
}
interface GoldenCaseResult {
    id: string;
    passed: boolean;
    similarity: number;
    output: string;
    threshold: number;
}
interface GoldenResult {
    runner: 'goldenDataset';
    cases: GoldenCaseResult[];
    summary: {
        passed: number;
        failed: number;
        passRate: number;
        avgSimilarity: number;
    };
}
/**
 * Parse a judge verdict into a trustworthy score: the JSON `score` must be a
 * finite number, which is then clamped to [0, 5] and rounded to an integer.
 * Anything else (missing, non-numeric, NaN, a string, unparseable) scores 0.
 */
declare function parseJudgeScore(text: string): number;
declare function goldenDataset(cases: GoldenCase[], config: GoldenConfig): Promise<GoldenResult>;
interface JudgeScoredCaseResult {
    id: string;
    passed: boolean;
    score: number;
    output: string;
    reasoning?: string;
    passThreshold: number;
}
interface JudgeScoredSummary {
    passed: number;
    failed: number;
    avgScore: number;
}
interface JudgeCase {
    id: string;
    input: string;
    expected?: string;
}
interface JudgeConfig {
    llm: LLMFn;
    judge: JudgeFn;
    rubric: string;
    passThreshold?: number;
    verbose?: boolean;
    cache?: JudgeCache;
}
type JudgeCaseResult = JudgeScoredCaseResult;
interface JudgeResult {
    runner: 'llmJudge';
    cases: JudgeCaseResult[];
    summary: JudgeScoredSummary;
}
declare function llmJudge(cases: JudgeCase[], config: JudgeConfig): Promise<JudgeResult>;
interface GroundingCase {
    id: string;
    input: string;
    /** The retrieved context the answer must stay faithful to. */
    context: string[];
}
interface GroundingConfig {
    llm: LLMFn;
    judge: JudgeFn;
    passThreshold?: number;
    verbose?: boolean;
    cache?: JudgeCache;
}
type GroundingCaseResult = JudgeScoredCaseResult;
interface GroundingResult {
    runner: 'grounding';
    cases: GroundingCaseResult[];
    summary: JudgeScoredSummary;
}
declare function grounding(cases: GroundingCase[], config: GroundingConfig): Promise<GroundingResult>;
interface StructuralCase {
    id: string;
    input: string;
}
interface StructuralConfig {
    llm: LLMFn;
    assertions: Assertion[];
    verbose?: boolean;
}
interface StructuralCaseResult {
    id: string;
    passed: boolean;
    output: string;
    failedAssertion?: AssertionFailure;
}
interface StructuralResult {
    runner: 'structural';
    cases: StructuralCaseResult[];
    summary: {
        passed: number;
        failed: number;
    };
}
declare function structural(cases: StructuralCase[], config: StructuralConfig): Promise<StructuralResult>;
interface EvalResult {
    version: 1;
    timestamp: string;
    commit: string;
    branch: string;
    runners: {
        goldenDataset?: GoldenResult;
        llmJudge?: JudgeResult;
        structural?: StructuralResult;
        grounding?: GroundingResult;
    };
    passed: boolean;
}
type AnyRunnerResult = GoldenResult | JudgeResult | StructuralResult | GroundingResult;
/** Options object `toEvalResult` accepts as a trailing argument. `runEval` takes runner results only. */
interface ToEvalResultOptions {
    /** Omit the volatile timestamp/commit/branch fields for deterministic output. */
    stable?: boolean;
}
/**
 * Combine runner results into the shared `EvalResult` shape the Action consumes.
 * Two results from the same runner are merged. `passed` is true only if every
 * runner had zero failures. Pass `{ stable: true }` as the last argument to omit
 * the volatile timestamp/commit/branch fields.
 */
declare function toEvalResult(...args: (AnyRunnerResult | ToEvalResultOptions)[]): EvalResult;
/**
 * Convenience harness for an `.eval.ts` file. Combines the runner results,
 * prints a human summary, or, when invoked with `--output json` as the Goldset
 * Action does, prints the `EvalResult` JSON line to stdout. Sets
 * `process.exitCode` to 1 if any runner failed, so the Action fails the check.
 * Takes runner results only; call `toEvalResult` for the `{ stable: true }`
 * option.
 */
declare function runEval(...runnerResults: AnyRunnerResult[]): Promise<EvalResult>;

/**
 * Levenshtein distance with a two-row dynamic program. The rows are sized by
 * the shorter string, so memory is O(min(m, n)); time is O(m * n).
 */
declare function levenshteinDistance(str1: string, str2: string): number;
/**
 * Similarity as 1 - distance / maxLength, computed on the capped strings so
 * text past the cap neither counts as matching nor as differing.
 */
declare function calculateSimilarity(str1: string, str2: string): number;

export { type Assertion, type AssertionFailure, type AssertionType, type EvalResult, type GoldenCase, type GoldenCaseResult, type GoldenConfig, type GoldenResult, type GroundingCase, type GroundingCaseResult, type GroundingConfig, type GroundingResult, type JudgeCache, type JudgeCase, type JudgeCaseResult, type JudgeConfig, type JudgeFn, type JudgeResult, type LLMFn, type StructuralCase, type StructuralCaseResult, type StructuralConfig, type StructuralResult, applyAssertions, calculateSimilarity, goldenDataset, grounding, layeredCache, levenshteinDistance, llmJudge, memoryCache, parseJudgeScore, runEval, structural, toEvalResult };
