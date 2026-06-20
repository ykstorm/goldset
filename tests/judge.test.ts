import { describe, it, expect, vi } from 'vitest';
import { llmJudge } from '../src/index';
import type { JudgeCase } from '../src/index';

describe('llmJudge', () => {
  it('should pass when score is high (above threshold)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The capital of France is Paris');
    const mockJudge = vi.fn().mockResolvedValue(
      JSON.stringify({ score: 5, reason: 'Perfect answer, completely correct' })
    );

    const cases: JudgeCase[] = [
      { id: 'test-1', input: 'What is the capital of France?', expected: 'Paris' },
    ];

    const result = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'Score 5 for correct answers, 0 for incorrect.',
      passThreshold: 3,
    });

    expect(result.runner).toBe('llmJudge');
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].passed).toBe(true);
    expect(result.cases[0].id).toBe('test-1');
    expect(result.cases[0].score).toBe(5);
    expect(result.cases[0].reasoning).toContain('Perfect');
    expect(result.summary.passed).toBe(1);
    expect(result.summary.avgScore).toBe(5);
  });

  it('should fail when score is low (below threshold)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('London is a city in England');
    const mockJudge = vi.fn().mockResolvedValue(
      JSON.stringify({ score: 1, reason: 'Incorrect' })
    );

    const result = await llmJudge(
      [{ id: 'test-2', input: 'What is the capital of France?', expected: 'Paris' }],
      { llm: mockLLM, judge: mockJudge, rubric: 'rubric', passThreshold: 3 }
    );

    expect(result.cases[0].passed).toBe(false);
    expect(result.summary.failed).toBe(1);
  });

  it('should handle malformed JSON gracefully (inconclusive => failed)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('Some response');
    const mockJudge = vi.fn().mockResolvedValue('This is not valid JSON {]');

    const result = await llmJudge(
      [{ id: 'test-3', input: 'Test input', expected: 'Test expected' }],
      { llm: mockLLM, judge: mockJudge, rubric: 'rubric', passThreshold: 3 }
    );

    expect(result.cases[0].passed).toBe(false);
    expect(result.cases[0].score).toBe(0);
  });

  it('should respect custom threshold', async () => {
    const mockLLM = vi.fn().mockResolvedValue('Response with score 2');
    const mockJudge = vi.fn().mockResolvedValue(
      JSON.stringify({ score: 2, reason: 'Below default threshold' })
    );
    const cases: JudgeCase[] = [
      { id: 'test-4', input: 'Test input', expected: 'Expected output' },
    ];

    const resultsDefault = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'rubric',
      passThreshold: 3,
    });
    expect(resultsDefault.cases[0].passed).toBe(false);

    const resultsCustom = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'rubric',
      passThreshold: 1,
    });
    expect(resultsCustom.cases[0].passed).toBe(true);
  });

  it('should work without an `expected` field (optional context)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('Friendly hello!');
    const mockJudge = vi.fn().mockResolvedValue(JSON.stringify({ score: 4, reason: 'ok' }));

    const result = await llmJudge(
      [{ id: 'no-expected', input: 'Hello' }],
      { llm: mockLLM, judge: mockJudge, rubric: 'Score friendliness 1-5' }
    );

    expect(result.cases[0].passed).toBe(true);
    // The judge prompt must not contain an "Expected:" line when omitted.
    const prompt = mockJudge.mock.calls[0][0] as string;
    expect(prompt).not.toContain('Expected:');
  });

  it('should evaluate multiple cases in order', async () => {
    const mockLLM = vi
      .fn()
      .mockResolvedValueOnce('Response 1')
      .mockResolvedValueOnce('Response 2')
      .mockResolvedValueOnce('Response 3');
    const mockJudge = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ score: 5, reason: 'Good' }))
      .mockResolvedValueOnce(JSON.stringify({ score: 2, reason: 'Poor' }))
      .mockResolvedValueOnce(JSON.stringify({ score: 4, reason: 'Very good' }));

    const cases: JudgeCase[] = [
      { id: 'case-1', input: 'input 1', expected: 'expected 1' },
      { id: 'case-2', input: 'input 2', expected: 'expected 2' },
      { id: 'case-3', input: 'input 3', expected: 'expected 3' },
    ];

    const result = await llmJudge(cases, {
      llm: mockLLM,
      judge: mockJudge,
      rubric: 'rubric',
      passThreshold: 3,
    });

    expect(result.cases.map((c) => c.id)).toEqual(['case-1', 'case-2', 'case-3']);
    expect(result.cases.map((c) => c.passed)).toEqual([true, false, true]);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(1);
  });
});
