/**
 * Eval runner for the Goldset Action.
 *
 * Discovers the consumer's `*.eval.ts` files, runs each one with
 * `npx tsx <file> --output json`, and collects the per-file result into the
 * `goldset-results.json` shape the PR-comment bot consumes. The Action does NOT
 * bring its own LLM — each `.eval.ts` composes Goldset's runners against the
 * consumer's own `llm`/`judge` functions. When `judgeProvider` is openai|
 * anthropic the relevant API key is threaded through `process.env` so those
 * `.eval.ts` judges can call the provider.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { glob } from 'glob';
import type { EvalFileResult } from './post-comment';

export interface RunOptions {
  evalDir: string;
  judgeProvider: 'openai' | 'anthropic' | 'none';
  cwd?: string;
  /** Injectable for tests — defaults to spawning `npx tsx <file> --output json`. */
  runFile?: (file: string) => { stdout: string; exitCode: number };
}

/** Build the env handed to each eval process, threading the judge key through. */
export function judgeEnv(
  provider: 'openai' | 'anthropic' | 'none',
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  // Keys are already on process.env when the consumer sets them via `env:`.
  // We simply make the provider selection explicit for the eval to read.
  if (provider !== 'none') env.GOLDSET_JUDGE_PROVIDER = provider;
  return env;
}

function defaultRunFile(
  file: string,
  cwd: string,
  env: NodeJS.ProcessEnv
): { stdout: string; exitCode: number } {
  const res = spawnSync('npx', ['tsx', file, '--output', 'json'], {
    cwd,
    env,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  });
  return { stdout: res.stdout ?? '', exitCode: res.status ?? 1 };
}

/** Parse one eval process's stdout + exit code into a result row. */
export function parseEvalOutput(
  file: string,
  stdout: string,
  exitCode: number
): EvalFileResult {
  const base = path.basename(file);
  // The eval prints a single JSON blob on stdout in --output json mode.
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const jsonText = start >= 0 ? trimmed.slice(start) : '';
  try {
    const parsed = JSON.parse(jsonText) as {
      passed?: boolean;
      runners?: Record<string, { summary?: { passed: number; failed: number } }>;
    };
    const runners: EvalFileResult['runners'] = {};
    const summaryParts: string[] = [];
    for (const [name, r] of Object.entries(parsed.runners ?? {})) {
      const s = r?.summary;
      if (s) {
        runners[name] = { passed: s.passed, failed: s.failed };
        summaryParts.push(`${name} ${s.passed}/${s.passed + s.failed}`);
      }
    }
    const passed = parsed.passed ?? exitCode === 0;
    return {
      file: base,
      passed,
      summary: summaryParts.join(', ') || (passed ? 'passed' : 'failed'),
      runners,
    };
  } catch {
    return {
      file: base,
      passed: false,
      error:
        exitCode === 0
          ? 'eval produced no parseable JSON on stdout'
          : `eval exited ${exitCode}`,
    };
  }
}

/**
 * Run all eval files under `evalDir`. Returns the collected results; the caller
 * writes them to disk and decides on the exit code.
 */
export async function runEvals(opts: RunOptions): Promise<EvalFileResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const env = judgeEnv(opts.judgeProvider);
  const pattern = `${opts.evalDir.replace(/\/$/, '')}/**/*.eval.ts`;
  const files = (await glob(pattern, { absolute: true, cwd })).sort();

  const run = opts.runFile ?? ((file: string) => defaultRunFile(file, cwd, env));

  const results: EvalFileResult[] = [];
  for (const file of files) {
    const { stdout, exitCode } = run(file);
    results.push(parseEvalOutput(file, stdout, exitCode));
  }
  return results;
}
