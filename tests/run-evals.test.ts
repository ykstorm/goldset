import { describe, it, expect } from 'vitest';
import { parseEvalOutput, judgeEnv } from '../action/run-evals';

describe('parseEvalOutput', () => {
  it('parses a passing eval JSON blob into a result row', () => {
    const json = JSON.stringify({
      version: 1,
      passed: true,
      runners: {
        goldenDataset: { summary: { passed: 2, failed: 0 } },
        structural: { summary: { passed: 1, failed: 0 } },
      },
    });
    const r = parseEvalOutput('/abs/path/foo.eval.ts', json, 0);
    expect(r.file).toBe('foo.eval.ts');
    expect(r.passed).toBe(true);
    expect(r.summary).toContain('goldenDataset 2/2');
    expect(r.summary).toContain('structural 1/1');
    expect(r.runners?.goldenDataset).toEqual({ passed: 2, failed: 0 });
  });

  it('marks failed when the eval JSON says passed:false', () => {
    const json = JSON.stringify({
      passed: false,
      runners: { llmJudge: { summary: { passed: 0, failed: 1 } } },
    });
    const r = parseEvalOutput('bar.eval.ts', json, 1);
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('llmJudge 0/1');
  });

  it('tolerates leading log noise before the JSON blob', () => {
    const out = 'some warning line\n{"passed":true,"runners":{}}';
    const r = parseEvalOutput('baz.eval.ts', out, 0);
    expect(r.passed).toBe(true);
  });

  it('reports an error row when stdout has no parseable JSON', () => {
    const r = parseEvalOutput('bad.eval.ts', 'boom, threw an error', 1);
    expect(r.passed).toBe(false);
    expect(r.error).toContain('exited 1');
  });
});

describe('judgeEnv', () => {
  it('sets GOLDSET_JUDGE_PROVIDER for openai/anthropic and not for none', () => {
    expect(judgeEnv('openai', {}).GOLDSET_JUDGE_PROVIDER).toBe('openai');
    expect(judgeEnv('anthropic', {}).GOLDSET_JUDGE_PROVIDER).toBe('anthropic');
    expect(judgeEnv('none', {}).GOLDSET_JUDGE_PROVIDER).toBeUndefined();
  });

  it('preserves existing env (e.g. forwarded API keys)', () => {
    const env = judgeEnv('openai', { OPENAI_API_KEY: 'sk-test' });
    expect(env.OPENAI_API_KEY).toBe('sk-test');
  });
});
