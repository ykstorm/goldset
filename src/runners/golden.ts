import type {
  GoldenDatasetConfig,
  GoldenTestCase,
  EvaluationResult,
  EvaluationSummary,
} from '../types';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(0));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  return track[str2.length][str1.length];
}

/**
 * Calculate similarity score as 1 - (distance / maxLength)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) {
    return 1.0; // Both strings are empty
  }
  
  return 1 - distance / maxLength;
}

/**
 * Golden dataset runner for evaluating AI outputs
 */
export class GoldenDatasetRunner {
  private config: GoldenDatasetConfig;

  constructor(config: GoldenDatasetConfig = { threshold: 0.85 }) {
    this.config = config;
  }

  /**
   * Evaluate a single test case against expected output
   */
  evaluate(
    testCase: GoldenTestCase,
    actualOutput: string
  ): EvaluationResult {
    const similarity = calculateSimilarity(
      testCase.expectedOutput,
      actualOutput
    );
    
    return {
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      similarity: Math.round(similarity * 100) / 100,
      passed: similarity >= this.config.threshold,
    };
  }

  /**
   * Evaluate multiple test cases and return summary
   */
  evaluateMany(
    testCases: GoldenTestCase[],
    actualOutputs: string[]
  ): EvaluationSummary {
    if (testCases.length !== actualOutputs.length) {
      throw new Error(
        `Mismatch: ${testCases.length} test cases but ${actualOutputs.length} outputs`
      );
    }

    const results: EvaluationResult[] = testCases.map((testCase, index) =>
      this.evaluate(testCase, actualOutputs[index])
    );

    const passedTests = results.filter((r) => r.passed).length;
    const averageSimilarity =
      results.reduce((sum, r) => sum + r.similarity, 0) / results.length;

    return {
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      averageSimilarity: Math.round(averageSimilarity * 100) / 100,
      results,
    };
  }

  /**
   * Get the current threshold
   */
  getThreshold(): number {
    return this.config.threshold;
  }

  /**
   * Set the threshold
   */
  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.config.threshold = threshold;
  }
}

export { calculateSimilarity, levenshteinDistance };
