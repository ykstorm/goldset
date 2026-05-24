import { describe, it, expect, vi } from 'vitest';
import { llmJudge } from '../src/runners/judge';
import type { LLMJudgeCase } from '../src/runners/judge';

describe('llmJudge', () => {
  it('should pass when score is high (above threshold)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The capital of France is Paris');
    const mockJudge = vi.fn().mockResolvedValue(JSON.stringify({
      score: 5,
      reason: 'Perfect answer, completely correct',
    }));

    const cases: LLMJudgeCase[] = [
      {
        id: 'test-1',
        input: 'What is the capital of France?',
        expected: 'Paris',
      },
    ];

    const results = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Score 5 for correct answers, 0 for incorrect.',
      passThreshold: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].testCaseId).toBe('test-1');
  });

  it('should fail when score is low (below threshold)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('London is a city in England');
    const mockJudge = vi.fn().mockResolvedValue(JSON.stringify({
      score: 1,
      reason: 'Incorrect, did not answer the question properly',
    }));

    const cases: LLMJudgeCase[] = [
      {
        id: 'test-2',
        input: 'What is the capital of France?',
        expected: 'Paris',
      },
    ];

    const results = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Score 5 for correct answers, 0 for incorrect.',
      passThreshold: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('should handle malformed JSON gracefully (inconclusive)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('Some response');
    const mockJudge = vi.fn().mockResolvedValue('This is not valid JSON {]');

    const cases: LLMJudgeCase[] = [
      {
        id: 'test-3',
        input: 'Test input',
        expected: 'Test expected',
      },
    ];

    const results = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Some rubric',
      passThreshold: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].similarity).toBe(0);
  });

  it('should respect custom threshold', async () => {
    const mockLLM = vi.fn().mockResolvedValue('Response with score 2');
    const mockJudge = vi.fn().mockResolvedValue(JSON.stringify({
      score: 2,
      reason: 'Below default threshold, above custom',
    }));

    const cases: LLMJudgeCase[] = [
      {
        id: 'test-4',
        input: 'Test input',
        expected: 'Expected output',
      },
    ];

    // With default threshold (3), this should fail
    const resultsDefault = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Some rubric',
      passThreshold: 3,
    });

    expect(resultsDefault[0].passed).toBe(false);

    // With custom threshold (1), this should pass
    const resultsCustom = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Some rubric',
      passThreshold: 1,
    });

    expect(resultsCustom[0].passed).toBe(true);
  });

  it('should evaluate multiple cases in order', async () => {
    const mockLLM = vi.fn()
      .mockResolvedValueOnce('Response 1')
      .mockResolvedValueOnce('Response 2')
      .mockResolvedValueOnce('Response 3');

    const mockJudge = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ score: 5, reason: 'Good' }))
      .mockResolvedValueOnce(JSON.stringify({ score: 2, reason: 'Poor' }))
      .mockResolvedValueOnce(JSON.stringify({ score: 4, reason: 'Very good' }));

    const cases: LLMJudgeCase[] = [
      { id: 'case-1', input: 'input 1', expected: 'expected 1' },
      { id: 'case-2', input: 'input 2', expected: 'expected 2' },
      { id: 'case-3', input: 'input 3', expected: 'expected 3' },
    ];

    const results = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Some rubric',
      passThreshold: 3,
    });

    expect(results).toHaveLength(3);
    expect(results[0].testCaseId).toBe('case-1');
    expect(results[0].passed).toBe(true);
    expect(results[1].testCaseId).toBe('case-2');
    expect(results[1].passed).toBe(false);
    expect(results[2].testCaseId).toBe('case-3');
    expect(results[2].passed).toBe(true);
  });
});
