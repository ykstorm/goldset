/**
 * Configuration for the golden dataset runner
 */
export interface GoldenDatasetConfig {
  threshold: number; // Similarity threshold (0-1)
  verbose?: boolean;
}

/**
 * A single test case in the golden dataset
 */
export interface GoldenTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  description?: string;
}

/**
 * Result of evaluating a single test case
 */
export interface EvaluationResult {
  testCaseId: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  similarity: number; // 0-1
  passed: boolean;
}

/**
 * Summary of evaluation results
 */
export interface EvaluationSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageSimilarity: number;
  results: EvaluationResult[];
}
