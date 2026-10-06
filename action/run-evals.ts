import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type { EvalFileResult } from './post-comment';

export type JudgeProvider = 'openai' | 'anthropic' | 'none';

export interface RunOptions {
  evalDir: string;
  judgeProvider: JudgeProvider;
  cwd?: string;
  /** Per-eval wall-clock limit in ms. 0 or undefined disables the limit. */
  timeoutMs?: number;
  /** Extra env var names the consumer allows into each eval process. */
  passEnv?: string[];
  /** Injectable for tests — defaults to spawning the pinned tsx CLI on Node. */
  runFile?: (file: string) => FileRun;
}

/** What one eval process left behind. */
export interface FileRun {
  stdout: string;
  stderr?: string;
  exitCode: number;
  timedOut: boolean;
}

/** How much of an eval's stderr a failed row keeps. */
const STDERR_TAIL_LINES = 20;
const STDERR_TAIL_MAX_CHARS = 4_000;

/**
 * Env var names always forwarded to an eval process. Anything else (secrets,
 * tokens, unrelated config) is dropped unless the consumer opts in via
 * `pass-env`. The judge provider key is added separately, only for the
 * selected provider.
 */
const BASE_ENV_ALLOWLIST = [
  'PATH',
  'Path',
  'HOME',
  'HOMEPATH',
  'USERPROFILE',
  'SystemRoot',
  'SystemDrive',
  'ComSpec',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TZ',
  'NODE_PATH',
  'NODE_OPTIONS',
  'APPDATA',
  'LOCALAPPDATA',
  'PATHEXT',
  'CI',
  // Needed by toEvalResult() to stamp commit/branch into the result.
  'GITHUB_SHA',
  'GITHUB_REF',
  'GITHUB_REF_NAME',
  'GITHUB_RUN_ID',
  'GITHUB_WORKSPACE',
];

const PROVIDER_KEY: Record<Exclude<JudgeProvider, 'none'>, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/** The only runner names rendered into results/comments — others are dropped. */
const KNOWN_RUNNERS = new Set(['goldenDataset', 'llmJudge', 'structural', 'grounding']);

/**
 * Resolve `evalDir` under `cwd` and reject any path that escapes the working
 * directory (path traversal). Returns the absolute directory path.
 */
export function resolveEvalDir(cwd: string, evalDir: string): string {
  const resolved = path.resolve(cwd, evalDir);
  const rel = path.relative(cwd, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`eval-dir escapes the working directory: ${evalDir}`);
  }
  return resolved;
}

/**
 * Build the env handed to each eval process: an allowlist plus any names the
 * consumer passed via `pass-env`, plus the selected provider's key and the
 * provider selection itself. Everything else on the parent env is dropped.
 */
export function buildChildEnv(
  provider: JudgeProvider,
  passEnv: string[] = [],
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const allow = new Set([...BASE_ENV_ALLOWLIST, ...passEnv]);
  for (const name of allow) {
    if (base[name] !== undefined) env[name] = base[name];
  }
  // Forward GOLDSET_* config the consumer set on the runner.
  for (const [name, value] of Object.entries(base)) {
    if (name.startsWith('GOLDSET_') && value !== undefined) env[name] = value;
  }
  if (provider !== 'none') {
    const key = PROVIDER_KEY[provider];
    if (base[key] !== undefined) env[key] = base[key];
    env.GOLDSET_JUDGE_PROVIDER = provider;
  }
  return env;
}

/** Locate the pinned tsx CLI next to the consumer's install — never `npx`. */
function resolveTsxCli(cwd: string): string | null {
  try {
    // Anchor the resolver at a path inside the consumer project instead of at
    // import.meta.url: the Action bundles to CommonJS, where import.meta.url
    // is undefined and createRequire(undefined) throws at module load.
    return createRequire(path.join(cwd, 'noop.js')).resolve('tsx/cli');
  } catch {
    return null;
  }
}

function defaultRunFile(
  file: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  tsxCli: string,
  timeoutMs?: number
): FileRun {
  const res = spawnSync(process.execPath, [tsxCli, file, '--output', 'json'], {
    cwd,
    env,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: timeoutMs && timeoutMs > 0 ? timeoutMs : undefined,
    killSignal: 'SIGTERM',
  });
  const errCode = (res.error as NodeJS.ErrnoException | undefined)?.code;
  const timedOut = res.signal === 'SIGTERM' || errCode === 'ETIMEDOUT';
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status ?? 1, timedOut };
}

/**
 * A failed row whose error is `message` on the first line, followed by the
 * last lines of the eval's stderr when it wrote any. The first line alone is
 * what the PR comment and job summary show.
 */
function errorRow(file: string, message: string, stderr: string): EvalFileResult {
  const tail = stderr
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(-STDERR_TAIL_LINES)
    .join('\n')
    .slice(-STDERR_TAIL_MAX_CHARS);
  const error = tail ? `${message}\nstderr, last ${STDERR_TAIL_LINES} lines:\n${tail}` : message;
  return { file, passed: false, error };
}

type RunnerSummaries = Record<string, { summary?: { passed: number; failed: number } }>;

/** Per-runner counts for the known runner names, and the summary text built from them. */
function readRunners(raw: RunnerSummaries = {}): { runners: NonNullable<EvalFileResult['runners']>; parts: string[] } {
  const runners: NonNullable<EvalFileResult['runners']> = {};
  const parts: string[] = [];
  for (const [name, r] of Object.entries(raw)) {
    if (!KNOWN_RUNNERS.has(name)) continue;
    const s = r?.summary;
    if (s && Number.isFinite(s.passed) && Number.isFinite(s.failed)) {
      runners[name] = { passed: s.passed, failed: s.failed };
      parts.push(`${name} ${s.passed}/${s.passed + s.failed}`);
    }
  }
  return { runners, parts };
}

/** Parse one eval process's stdout, exit code and stderr into a result row. */
export function parseEvalOutput(
  file: string,
  stdout: string,
  exitCode: number,
  timedOut = false,
  stderr = ''
): EvalFileResult {
  const base = path.basename(file);
  if (timedOut) return errorRow(base, 'eval timed out', stderr);
  // runEval prints the result as the last JSON line on stdout; anything an
  // eval printed before it (including a stray brace) is ignored.
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const jsonText = [...lines].reverse().find((l) => l.startsWith('{') && l.endsWith('}')) ?? '';
  try {
    const parsed = JSON.parse(jsonText) as { passed?: boolean; runners?: RunnerSummaries };
    const { runners, parts } = readRunners(parsed.runners);
    const passed = parsed.passed ?? exitCode === 0;
    return {
      file: base,
      passed,
      summary: parts.join(', ') || (passed ? 'passed' : 'failed'),
      runners,
    };
  } catch {
    const message = exitCode === 0 ? 'eval produced no parseable JSON on stdout' : `eval exited ${exitCode}`;
    return errorRow(base, message, stderr);
  }
}

/** Recursively collect `*.eval.ts` files under an absolute directory, sorted. */
function findEvalFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findEvalFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.eval.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Run all eval files under `evalDir`. Returns the collected results; the caller
 * writes them to disk and decides on the exit code. Throws when the directory
 * holds no `*.eval.ts` file.
 */
export async function runEvals(opts: RunOptions): Promise<EvalFileResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const dir = resolveEvalDir(cwd, opts.evalDir);
  const env = buildChildEnv(opts.judgeProvider, opts.passEnv);
  const files = findEvalFiles(dir);
  // A run that tests nothing must not pass: a typo in eval-dir would
  // otherwise give a green check.
  if (files.length === 0) {
    throw new Error(`no *.eval.ts files found under ${dir} (eval-dir: ${opts.evalDir}). Check the eval-dir input.`);
  }

  let run = opts.runFile;
  if (!run) {
    const tsxCli = resolveTsxCli(cwd);
    if (!tsxCli) {
      throw new Error(
        'tsx is not installed. Add it as a dev dependency (npm install -D tsx) so the Action can run your *.eval.ts files.'
      );
    }
    run = (file: string) => defaultRunFile(file, cwd, env, tsxCli, opts.timeoutMs);
  }

  const results: EvalFileResult[] = [];
  for (const file of files) {
    const { stdout, stderr, exitCode, timedOut } = run(file);
    results.push(parseEvalOutput(file, stdout, exitCode, timedOut, stderr));
  }
  return results;
}
