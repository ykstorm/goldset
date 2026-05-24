import { describe, it, expect, vi } from 'vitest';
import { structural } from '../src/runners/structural';
import type { StructuralCase, Assertion } from '../src/runners/structural';

describe('structural', () => {
  it('should pass when json-schema assertion is valid', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      name: 'John',
      age: 30,
    }));

    const cases: StructuralCase[] = [
      {
        id: 'test-1',
        input: 'Generate a person object',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'json-schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].similarity).toBe(1);
  });

  it('should fail when json-schema assertion is invalid', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      age: 30,
      // missing 'name' property
    }));

    const cases: StructuralCase[] = [
      {
        id: 'test-2',
        input: 'Generate a person object',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'json-schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].similarity).toBe(0);
  });

  it('should pass when regex assertion matches', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The answer is 42');

    const cases: StructuralCase[] = [
      {
        id: 'test-3',
        input: 'What is the answer?',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'regex',
        pattern: /answer is \d+/,
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('should fail when regex assertion does not match', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The response is unclear');

    const cases: StructuralCase[] = [
      {
        id: 'test-4',
        input: 'What is the answer?',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'regex',
        pattern: /answer is \d+/,
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('should pass when contains assertion finds substring', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The capital of France is Paris');

    const cases: StructuralCase[] = [
      {
        id: 'test-5',
        input: 'What is the capital of France?',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'contains',
        substring: 'Paris',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('should fail when contains assertion does not find substring', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The capital of Germany is Berlin');

    const cases: StructuralCase[] = [
      {
        id: 'test-6',
        input: 'What is the capital of France?',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'contains',
        substring: 'Paris',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('should pass when tool-call-shape assertion is valid', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      toolName: 'search',
      toolInput: { query: 'weather in Paris' },
    }));

    const cases: StructuralCase[] = [
      {
        id: 'test-7',
        input: 'Call the search tool',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'tool-call-shape',
        toolName: 'search',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('should fail when tool-call-shape assertion has wrong tool name', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      toolName: 'calculate',
      toolInput: { expression: '2+2' },
    }));

    const cases: StructuralCase[] = [
      {
        id: 'test-8',
        input: 'Call the search tool',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'tool-call-shape',
        toolName: 'search',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('should pass for tool-call-shape with array of calls', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify([
      { toolName: 'search', toolInput: { query: 'weather' } },
      { toolName: 'calculate', toolInput: { expression: '2+2' } },
    ]));

    const cases: StructuralCase[] = [
      {
        id: 'test-9',
        input: 'Call multiple tools',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'tool-call-shape',
        toolName: 'search',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('should require ALL assertions to pass (edge case)', async () => {
    const mockLLM = vi.fn().mockResolvedValue('The answer is {"result": 42}');

    const cases: StructuralCase[] = [
      {
        id: 'test-10',
        input: 'Test multiple assertions',
      },
    ];

    // First test: both assertions pass
    const assertionsPass: Assertion[] = [
      {
        type: 'contains',
        substring: 'answer',
      },
      {
        type: 'regex',
        pattern: /\d+/,
      },
    ];

    const resultsBoth = await structural(cases, { llm: mockLLM, assertions: assertionsPass });
    expect(resultsBoth[0].passed).toBe(true);

    // Second test: one assertion fails
    const assertionsFail: Assertion[] = [
      {
        type: 'contains',
        substring: 'answer',
      },
      {
        type: 'contains',
        substring: 'nonexistent',
      },
    ];

    const resultsOne = await structural(cases, { llm: mockLLM, assertions: assertionsFail });
    expect(resultsOne[0].passed).toBe(false);
  });

  it('should handle invalid JSON gracefully for json-schema', async () => {
    const mockLLM = vi.fn().mockResolvedValue('This is not JSON {]');

    const cases: StructuralCase[] = [
      {
        id: 'test-11',
        input: 'Generate JSON',
      },
    ];

    const assertions: Assertion[] = [
      {
        type: 'json-schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('should evaluate multiple cases in order', async () => {
    const mockLLM = vi.fn()
      .mockResolvedValueOnce('Result 1')
      .mockResolvedValueOnce('Result 2')
      .mockResolvedValueOnce('Result 3');

    const cases: StructuralCase[] = [
      { id: 'case-1', input: 'input 1' },
      { id: 'case-2', input: 'input 2' },
      { id: 'case-3', input: 'input 3' },
    ];

    const assertions: Assertion[] = [
      {
        type: 'contains',
        substring: 'Result',
      },
    ];

    const results = await structural(cases, { llm: mockLLM, assertions });

    expect(results).toHaveLength(3);
    expect(results[0].testCaseId).toBe('case-1');
    expect(results[0].passed).toBe(true);
    expect(results[1].testCaseId).toBe('case-2');
    expect(results[1].passed).toBe(true);
    expect(results[2].testCaseId).toBe('case-3');
    expect(results[2].passed).toBe(true);
  });
});
