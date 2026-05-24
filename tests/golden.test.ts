import { describe, it, expect } from 'vitest';
import {
  GoldenDatasetRunner,
  calculateSimilarity,
  levenshteinDistance,
} from '../src/index';
import type { GoldenTestCase } from '../src/types';

describe('GoldenDatasetRunner', () => {
  it('should evaluate a single test case and pass with high similarity', () => {
    const runner = new GoldenDatasetRunner({ threshold: 0.85 });
    const testCase: GoldenTestCase = {
      id: 'test-1',
      input: 'What is 2+2?',
      expectedOutput: 'The answer is 4',
      description: 'Basic math question',
    };

    const result = runner.evaluate(testCase, 'The answer is 4');

    expect(result.testCaseId).toBe('test-1');
    expect(result.passed).toBe(true);
    expect(result.similarity).toBe(1.0);
  });

  it('should evaluate a single test case and fail with low similarity', () => {
    const runner = new GoldenDatasetRunner({ threshold: 0.85 });
    const testCase: GoldenTestCase = {
      id: 'test-2',
      input: 'What is the capital of France?',
      expectedOutput: 'The capital of France is Paris',
    };

    const result = runner.evaluate(testCase, 'London is the capital');

    expect(result.passed).toBe(false);
    expect(result.similarity).toBeLessThan(0.85);
  });

  it('should evaluate multiple test cases and return summary', () => {
    const runner = new GoldenDatasetRunner({ threshold: 0.85 });
    const testCases: GoldenTestCase[] = [
      {
        id: 'test-1',
        input: 'What is 2+2?',
        expectedOutput: 'The answer is 4',
      },
      {
        id: 'test-2',
        input: 'What is 3+3?',
        expectedOutput: 'The answer is 6',
      },
      {
        id: 'test-3',
        input: 'What is 5+5?',
        expectedOutput: 'The answer is 10',
      },
    ];

    const outputs = [
      'The answer is 4',
      'The answer is 6',
      'The answer is 11', // Slightly different
    ];

    const summary = runner.evaluateMany(testCases, outputs);

    expect(summary.totalTests).toBe(3);
    expect(summary.passedTests).toBeGreaterThanOrEqual(2);
    expect(summary.failedTests).toBeLessThanOrEqual(1);
    expect(summary.averageSimilarity).toBeGreaterThan(0.8);
  });

  it('should handle empty strings in similarity calculation', () => {
    const similarity = calculateSimilarity('', '');
    expect(similarity).toBe(1.0);
  });

  it('should calculate levenshtein distance correctly', () => {
    const distance = levenshteinDistance('kitten', 'sitting');
    expect(distance).toBe(3);
  });

  it('should throw error on mismatched input/output lengths', () => {
    const runner = new GoldenDatasetRunner();
    const testCases: GoldenTestCase[] = [
      {
        id: 'test-1',
        input: 'Test',
        expectedOutput: 'Expected',
      },
    ];

    expect(() => runner.evaluateMany(testCases, ['a', 'b'])).toThrow();
  });

  it('should update threshold correctly', () => {
    const runner = new GoldenDatasetRunner({ threshold: 0.85 });
    expect(runner.getThreshold()).toBe(0.85);

    runner.setThreshold(0.9);
    expect(runner.getThreshold()).toBe(0.9);
  });

  it('should reject invalid threshold values', () => {
    const runner = new GoldenDatasetRunner();
    expect(() => runner.setThreshold(1.5)).toThrow();
    expect(() => runner.setThreshold(-0.1)).toThrow();
  });
});
