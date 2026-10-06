import { describe, it, expect, vi } from 'vitest';
import { structural } from '../src/index';
import type { StructuralCase, Assertion } from '../src/index';

const run = (output: string, assertions: Assertion[], id = 'c') =>
  structural([{ id, input: 'x' }] as StructuralCase[], {
    llm: vi.fn().mockResolvedValue(output),
    assertions,
  });

describe('structural', () => {
  it('should pass when json-schema assertion is valid', async () => {
    const r = await run(JSON.stringify({ name: 'John', age: 30 }), [
      { type: 'json-schema', schema: { type: 'object', properties: { name: {}, age: {} } } },
    ]);
    expect(r.runner).toBe('structural');
    expect(r.cases[0].passed).toBe(true);
    expect(r.cases[0].failedAssertion).toBeUndefined();
  });

  it('should fail when json-schema assertion is invalid and report the reason', async () => {
    const r = await run(JSON.stringify({ age: 30 }), [
      { type: 'json-schema', schema: { type: 'object', properties: { name: {}, age: {} } } },
    ]);
    expect(r.cases[0].passed).toBe(false);
    expect(r.cases[0].failedAssertion?.type).toBe('json-schema');
    expect(r.cases[0].failedAssertion?.reason).toContain('name');
  });

  it('fails a json-schema assertion when the output is JSON but not an object', async () => {
    const r = await run('null', [
      { type: 'json-schema', schema: { type: 'object', properties: { name: {} } } },
    ]);
    expect(r.cases[0].passed).toBe(false);
    expect(r.cases[0].failedAssertion?.reason).toContain('not a JSON object');
  });

  it('honours required and property types in a json-schema assertion', async () => {
    const schema = { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } }, required: ['name'] };
    const ok = await run(JSON.stringify({ name: 'Ann' }), [{ type: 'json-schema', schema }]);
    expect(ok.cases[0].passed).toBe(true);
    const wrongType = await run(JSON.stringify({ name: 'Ann', age: 'thirty' }), [{ type: 'json-schema', schema }]);
    expect(wrongType.cases[0].passed).toBe(false);
    expect(wrongType.cases[0].failedAssertion?.reason).toContain('age');
    const missing = await run(JSON.stringify({ age: 30 }), [{ type: 'json-schema', schema }]);
    expect(missing.cases[0].passed).toBe(false);
    expect(missing.cases[0].failedAssertion?.reason).toContain('name');
  });

  it('reads required even when the schema has no type or properties', async () => {
    const schema = { required: ['name'] };
    const empty = await run('{}', [{ type: 'json-schema', schema }]);
    expect(empty.cases[0].passed).toBe(false);
    expect(empty.cases[0].failedAssertion?.reason).toBe('missing property "name"');
    const ok = await run(JSON.stringify({ name: 'Ann' }), [{ type: 'json-schema', schema }]);
    expect(ok.cases[0].passed).toBe(true);
  });

  it('should pass/fail on regex', async () => {
    expect((await run('The answer is 42', [{ type: 'regex', pattern: /answer is \d+/ }])).cases[0].passed).toBe(true);
    expect((await run('unclear', [{ type: 'regex', pattern: /answer is \d+/ }])).cases[0].passed).toBe(false);
  });

  it('should support regex flags on string patterns', async () => {
    const r = await run('HELLO', [{ type: 'regex', pattern: 'hello', flags: 'i' }]);
    expect(r.cases[0].passed).toBe(true);
  });

  it('should pass/fail on contains', async () => {
    expect((await run('The capital of France is Paris', [{ type: 'contains', substring: 'Paris' }])).cases[0].passed).toBe(true);
    expect((await run('Berlin', [{ type: 'contains', substring: 'Paris' }])).cases[0].passed).toBe(false);
  });

  it('should validate tool-call-shape by name', async () => {
    expect(
      (await run(JSON.stringify({ toolName: 'search', toolInput: { query: 'x' } }), [
        { type: 'tool-call-shape', toolName: 'search' },
      ])).cases[0].passed
    ).toBe(true);
    expect(
      (await run(JSON.stringify({ toolName: 'calculate', toolInput: { e: '2+2' } }), [
        { type: 'tool-call-shape', toolName: 'search' },
      ])).cases[0].passed
    ).toBe(false);
  });

  it('should validate tool-call-shape argCount', async () => {
    const r1 = await run(JSON.stringify({ toolName: 'search', toolInput: { query: 'x' } }), [
      { type: 'tool-call-shape', toolName: 'search', argCount: 1 },
    ]);
    expect(r1.cases[0].passed).toBe(true);
    const r2 = await run(JSON.stringify({ toolName: 'search', toolInput: { query: 'x', n: 2 } }), [
      { type: 'tool-call-shape', toolName: 'search', argCount: 1 },
    ]);
    expect(r2.cases[0].passed).toBe(false);
  });

  it('should pass for tool-call-shape with array of calls', async () => {
    const r = await run(
      JSON.stringify([
        { toolName: 'search', toolInput: { query: 'weather' } },
        { toolName: 'calculate', toolInput: { expression: '2+2' } },
      ]),
      [{ type: 'tool-call-shape', toolName: 'search' }]
    );
    expect(r.cases[0].passed).toBe(true);
  });

  it('should require ALL assertions to pass', async () => {
    const both = await run('The answer is {"result": 42}', [
      { type: 'contains', substring: 'answer' },
      { type: 'regex', pattern: /\d+/ },
    ]);
    expect(both.cases[0].passed).toBe(true);

    const oneFails = await run('The answer is {"result": 42}', [
      { type: 'contains', substring: 'answer' },
      { type: 'contains', substring: 'nonexistent' },
    ]);
    expect(oneFails.cases[0].passed).toBe(false);
    expect(oneFails.cases[0].failedAssertion?.reason).toContain('nonexistent');
  });

  it('rejects a catastrophic-backtracking regex quickly instead of running it', async () => {
    const t0 = performance.now();
    const r = await run('a'.repeat(30_000) + '!', [{ type: 'regex', pattern: '(a+)+$' }]);
    const elapsed = performance.now() - t0;
    expect(r.cases[0].passed).toBe(false);
    expect(r.cases[0].failedAssertion?.reason).toContain('unsafe regex');
    expect(elapsed).toBeLessThan(100);
  });

  it('still runs safe regexes with repetition that is not nested', async () => {
    expect((await run('abcabc123', [{ type: 'regex', pattern: '(abc)+\\d+' }])).cases[0].passed).toBe(true);
  });

  it('should handle invalid JSON gracefully for json-schema', async () => {
    const r = await run('This is not JSON {]', [
      { type: 'json-schema', schema: { type: 'object', properties: { name: {} } } },
    ]);
    expect(r.cases[0].passed).toBe(false);
    expect(r.cases[0].failedAssertion?.reason).toContain('valid JSON');
  });

  it('should evaluate multiple cases in order and summarize', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce('Result 1')
      .mockResolvedValueOnce('nope')
      .mockResolvedValueOnce('Result 3');
    const r = await structural(
      [
        { id: 'case-1', input: 'a' },
        { id: 'case-2', input: 'b' },
        { id: 'case-3', input: 'c' },
      ],
      { llm, assertions: [{ type: 'contains', substring: 'Result' }] }
    );
    expect(r.cases.map((c) => c.id)).toEqual(['case-1', 'case-2', 'case-3']);
    expect(r.cases.map((c) => c.passed)).toEqual([true, false, true]);
    expect(r.summary.passed).toBe(2);
    expect(r.summary.failed).toBe(1);
  });
});
