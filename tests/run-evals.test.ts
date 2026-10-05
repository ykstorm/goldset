import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
  parseEvalOutput,
  buildChildEnv,
  resolveEvalDir,
} from '../action/run-evals';

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

  it('ignores a brace printed by the eval before the result line', () => {
    const out = 'config { verbose: true }\n{"passed":true,"runners":{}}\n';
    const r = parseEvalOutput('noisy.eval.ts', out, 0);
    expect(r.passed).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('reports an error row when stdout has no parseable JSON', () => {
    const r = parseEvalOutput('bad.eval.ts', 'boom, threw an error', 1);
    expect(r.passed).toBe(false);
    expect(r.error).toContain('exited 1');
  });

  it('truncates the error row to 200 characters', () => {
    const r = parseEvalOutput('bad.eval.ts', 'x'.repeat(5000), 0);
    expect(r.passed).toBe(false);
    expect((r.error ?? '').length).toBeLessThanOrEqual(200);
  });

  it('reports a timeout row when the eval was killed', () => {
    const r = parseEvalOutput('slow.eval.ts', '', 1, true);
    expect(r.passed).toBe(false);
    expect(r.error).toBe('eval timed out');
  });

  it('drops runner names that are not on the allowlist', () => {
    const json = JSON.stringify({
      passed: true,
      runners: {
        goldenDataset: { summary: { passed: 1, failed: 0 } },
        '<script>evil': { summary: { passed: 9, failed: 0 } },
      },
    });
    const r = parseEvalOutput('x.eval.ts', json, 0);
    expect(r.runners?.goldenDataset).toBeDefined();
    expect(r.summary).not.toContain('script');
    expect(r.summary).not.toContain('evil');
  });
});

describe('buildChildEnv', () => {
  it('sets GOLDSET_JUDGE_PROVIDER for openai/anthropic and not for none', () => {
    expect(buildChildEnv('openai', [], {}).GOLDSET_JUDGE_PROVIDER).toBe('openai');
    expect(buildChildEnv('anthropic', [], {}).GOLDSET_JUDGE_PROVIDER).toBe('anthropic');
    expect(buildChildEnv('none', [], {}).GOLDSET_JUDGE_PROVIDER).toBeUndefined();
  });

  it('forwards only the selected provider key', () => {
    const base = { OPENAI_API_KEY: 'sk-openai', ANTHROPIC_API_KEY: 'sk-anthropic' };
    const env = buildChildEnv('openai', [], base);
    expect(env.OPENAI_API_KEY).toBe('sk-openai');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('drops secrets not on the allowlist', () => {
    const env = buildChildEnv('none', [], { AWS_SECRET_ACCESS_KEY: 'super-secret', PATH: '/usr/bin' });
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });

  it('forwards GOLDSET_* config and consumer pass-env names', () => {
    const base = { GOLDSET_JUDGE_CACHE: '1', MY_FLAG: 'on', OTHER: 'no' };
    const env = buildChildEnv('none', ['MY_FLAG'], base);
    expect(env.GOLDSET_JUDGE_CACHE).toBe('1');
    expect(env.MY_FLAG).toBe('on');
    expect(env.OTHER).toBeUndefined();
  });
});

describe('resolveEvalDir', () => {
  const cwd = process.platform === 'win32' ? 'C:\\work\\repo' : '/work/repo';

  it('resolves a normal subdirectory under cwd', () => {
    expect(resolveEvalDir(cwd, 'evals')).toBe(path.resolve(cwd, 'evals'));
    expect(resolveEvalDir(cwd, 'fixtures/evals')).toBe(path.resolve(cwd, 'fixtures/evals'));
  });

  it('rejects a traversal that escapes cwd', () => {
    expect(() => resolveEvalDir(cwd, '../secrets')).toThrow(/escapes/);
    expect(() => resolveEvalDir(cwd, 'a/../../b')).toThrow(/escapes/);
  });

  it('rejects an absolute path outside cwd', () => {
    const outside = process.platform === 'win32' ? 'C:\\etc' : '/etc';
    expect(() => resolveEvalDir(cwd, outside)).toThrow(/escapes/);
  });
});
