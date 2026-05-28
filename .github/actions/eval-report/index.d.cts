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

/**
 * Options for llmJudge runner
 */
interface LLMJudgeOptions {
    llm: (input: string) => Promise<string> | string;
    judge: (prompt: string) => Promise<string> | string;
    rubric: string;
    passThreshold?: number;
}
/**
 * A test case for LLM judge evaluation
 */
interface LLMJudgeCase {
    id: string;
    input: string;
    expected: string;
    description?: string;
}
/**
 * Evaluates LLM outputs using another LLM as a judge with rubric-based scoring
 * @param cases - Array of test cases
 * @param opts - Options including llm, judge, rubric, and passThreshold
 * @returns Array of evaluation results
 */
declare function llmJudge(cases: LLMJudgeCase[], opts: LLMJudgeOptions): Promise<EvaluationResult[]>;

/**
 * Assertion type for structural validation
 */
type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';
/**
 * A single assertion to validate LLM output
 */
interface Assertion {
    type: AssertionType;
    schema?: Record<string, unknown>;
    pattern?: string | RegExp;
    substring?: string;
    toolName?: string;
}
/**
 * Options for structural runner
 */
interface StructuralOptions {
    llm: (input: string) => Promise<string> | string;
    assertions: Assertion[];
}
/**
 * A test case for structural assertion evaluation
 */
interface StructuralCase {
    id: string;
    input: string;
    description?: string;
}
/**
 * Evaluates LLM outputs using structural assertions
 * @param cases - Array of test cases
 * @param opts - Options including llm and assertions
 * @returns Array of evaluation results
 */
declare function structural(cases: StructuralCase[], opts: StructuralOptions): Promise<EvaluationResult[]>;

export { type Assertion, type AssertionType, type EvaluationResult, type EvaluationSummary, type GoldenDatasetConfig, GoldenDatasetRunner, type GoldenTestCase, type LLMJudgeCase, type LLMJudgeOptions, type StructuralCase, type StructuralOptions, calculateSimilarity, levenshteinDistance, llmJudge, structural };
