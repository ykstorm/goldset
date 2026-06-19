/**
 * Structural assertion primitives.
 *
 * The public `structural()` runner lives in `./api.ts` and consumes
 * {@link applyAssertions}. This module owns the assertion vocabulary and the
 * per-assertion validators.
 */
/**
 * Assertion type for structural validation
 */
type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';
/**
 * A single assertion to validate LLM output.
 */
interface Assertion {
    type: AssertionType;
    schema?: Record<string, unknown>;
    pattern?: string | RegExp;
    flags?: string;
    substring?: string;
    toolName?: string;
    argCount?: number;
}
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
declare function goldenDataset(cases: GoldenCase[], config: GoldenConfig): Promise<GoldenResult>;
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
}
interface JudgeCaseResult {
    id: string;
    passed: boolean;
    score: number;
    output: string;
    reasoning?: string;
    passThreshold: number;
}
interface JudgeResult {
    runner: 'llmJudge';
    cases: JudgeCaseResult[];
    summary: {
        passed: number;
        failed: number;
        avgScore: number;
    };
}
declare function llmJudge(cases: JudgeCase[], config: JudgeConfig): Promise<JudgeResult>;
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
    };
    passed: boolean;
}
type AnyRunnerResult = GoldenResult | JudgeResult | StructuralResult;
/**
 * Combine one or more runner results into the shared `EvalResult` shape that
 * the GitHub Action's diff engine consumes. `passed` is true only if every
 * runner had zero failures.
 */
declare function toEvalResult(...runnerResults: AnyRunnerResult[]): EvalResult;
/**
 * Convenience harness for an `.eval.ts` file. Runs the provided runners,
 * prints a human summary, and — when invoked with `--output json` (as the
 * Goldset Action does) — prints the `EvalResult` JSON to stdout. Calls
 * `process.exit(1)` if any runner failed so the Action can gate the merge.
 */
declare function runEval(...runnerResults: AnyRunnerResult[]): Promise<EvalResult>;

/**
 * Configuration for the golden dataset runner
 */
interface GoldenDatasetConfig {
    threshold: number;
    verbose?: boolean;
}
/**
 * A single test case in the golden dataset
 */
interface GoldenTestCase {
    id: string;
    input: string;
    expectedOutput: string;
    description?: string;
}
/**
 * Result of evaluating a single test case
 */
interface EvaluationResult {
    testCaseId: string;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    similarity: number;
    passed: boolean;
}
/**
 * Summary of evaluation results
 */
interface EvaluationSummary {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    averageSimilarity: number;
    results: EvaluationResult[];
}

/**
 * Calculate Levenshtein distance between two strings
 */
declare function levenshteinDistance(str1: string, str2: string): number;
/**
 * Calculate similarity score as 1 - (distance / maxLength)
 */
declare function calculateSimilarity(str1: string, str2: string): number;
/**
 * Golden dataset runner for evaluating AI outputs
 */
declare class GoldenDatasetRunner {
    private config;
    constructor(config?: GoldenDatasetConfig);
    /**
     * Evaluate a single test case against expected output
     */
    evaluate(testCase: GoldenTestCase, actualOutput: string): EvaluationResult;
    /**
     * Evaluate multiple test cases and return summary
     */
    evaluateMany(testCases: GoldenTestCase[], actualOutputs: string[]): EvaluationSummary;
    /**
     * Get the current threshold
     */
    getThreshold(): number;
    /**
     * Set the threshold
     */
    setThreshold(threshold: number): void;
}

export { type Assertion, type AssertionFailure, type AssertionType, type EvalResult, type EvaluationResult, type EvaluationSummary, type GoldenCase, type GoldenCaseResult, type GoldenConfig, type GoldenDatasetConfig, GoldenDatasetRunner, type GoldenResult, type GoldenTestCase, type JudgeCase, type JudgeCaseResult, type JudgeConfig, type JudgeFn, type JudgeResult, type LLMFn, type StructuralCase, type StructuralCaseResult, type StructuralConfig, type StructuralResult, applyAssertions, calculateSimilarity, goldenDataset, levenshteinDistance, llmJudge, runEval, structural, toEvalResult };
