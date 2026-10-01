import type {
  GoldenDatasetConfig,
  GoldenTestCase,
  EvaluationResult,
  EvaluationSummary,
} from '../types';

/** Cap on each string's length, to bound the O(m*n) distance computation. */
const MAX_LEVENSHTEIN_LEN = 20_000;

/**
 * Calculate Levenshtein distance between two strings using a two-row dynamic
 * program (O(min(m,n)) memory). Inputs longer than MAX_LEVENSHTEIN_LEN are
 * truncated first so a pathological pair can't blow up time or memory.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const a = str1.length > MAX_LEVENSHTEIN_LEN ? str1.slice(0, MAX_LEVENSHTEIN_LEN) : str1;
  const b = str2.length > MAX_LEVENSHTEIN_LEN ? str2.slice(0, MAX_LEVENSHTEIN_LEN) : str2;
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
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
