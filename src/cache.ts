// Optional cache for judge verdicts. A judge call costs money and is the slow
// part of a suite, so when enabled we remember the raw verdict text keyed by the
// content that produced it. We cache the verdict only; scoring/clamping still runs
// on every call, so a parser change takes effect without clearing the cache.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Bumped when the judge prompt template changes, to invalidate stale verdicts. */
const PROMPT_VERSION = 1;

export interface JudgeCache {
  get(key: string): string | undefined;
  set(key: string, verdict: string): void;
}

/** Fields that determine a verdict; the same fields always hash to the same key. */
export interface CacheKeyParts {
  runner: string;
  /** The rubric (llmJudge) or joined context (grounding). */
  rubric: string;
  input: string;
  expected?: string;
  output: string;
}

export function cacheKey(parts: CacheKeyParts): string {
  const payload = {
    v: PROMPT_VERSION,
    runner: parts.runner,
    rubric: parts.rubric,
    input: parts.input,
    expected: parts.expected ?? null,
    output: parts.output,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** In-process cache; lives for one run. */
export function memoryCache(): JudgeCache {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
  };
}

/** On-disk cache under `dir`, so verdicts survive across runs. Best-effort. */
function fileCache(dir = '.goldset-cache'): JudgeCache {
  const file = path.join(dir, 'judge.json');
  let store: Record<string, string> = {};
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>;
  } catch {
    store = {};
  }
  return {
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(store));
      } catch {
        // A read-only or unwritable cache dir must not fail the eval.
      }
    },
  };
}

/** Read layers in order; write to all. Put the fast layer first. */
export function layeredCache(...layers: JudgeCache[]): JudgeCache {
  return {
    get: (k) => {
      for (const layer of layers) {
        const v = layer.get(k);
        if (v !== undefined) return v;
      }
      return undefined;
    },
    set: (k, v) => {
      for (const layer of layers) layer.set(k, v);
    },
  };
}

/**
 * Build the default cache from `GOLDSET_JUDGE_CACHE`: unset/`0`/`false` disables
 * it; `1`/`true` uses `.goldset-cache`; any other value is used as the cache dir.
 * Returns a memory layer in front of a file layer, or undefined when disabled.
 */
export function cacheFromEnv(env: NodeJS.ProcessEnv = process.env): JudgeCache | undefined {
  const flag = env.GOLDSET_JUDGE_CACHE;
  if (!flag || flag === '0' || flag === 'false') return undefined;
  const dir = flag === '1' || flag === 'true' ? '.goldset-cache' : flag;
  return layeredCache(memoryCache(), fileCache(dir));
}
