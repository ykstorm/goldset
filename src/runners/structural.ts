// Assertion vocabulary and validators. The structural() runner in ./api.ts
// consumes applyAssertions from here.
import { createContext, Script } from 'node:vm';

export type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';

/** A single assertion to validate LLM output, discriminated by `type`. */
export type Assertion =
  | { type: 'json-schema'; schema: Record<string, unknown> }
  | { type: 'regex'; pattern: string | RegExp; flags?: string }
  | { type: 'contains'; substring: string }
  | { type: 'tool-call-shape'; toolName: string; argCount?: number };

/**
 * Description of the first assertion that failed for a given output.
 */
export interface AssertionFailure {
  type: AssertionType;
  reason: string;
}

function isJsonObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The JSON Schema type names and how to recognise a value of each. A Map, so
 * a name such as `toString` is not found on Object.prototype.
 */
const JSON_TYPE_CHECKS = new Map<string, (value: unknown) => boolean>([
  ['string', (v) => typeof v === 'string'],
  ['number', (v) => typeof v === 'number'],
  ['integer', (v) => Number.isInteger(v)],
  ['boolean', (v) => typeof v === 'boolean'],
  ['null', (v) => v === null],
  ['array', (v) => Array.isArray(v)],
  ['object', isJsonObject],
]);

/** Does `value` have the JSON Schema `type`? Only the names above are known; any other name matches. */
function jsonTypeMatches(value: unknown, type: string): boolean {
  const check = JSON_TYPE_CHECKS.get(type);
  return check ? check(value) : true;
}

/**
 * Does the schema describe an object? Yes for `type: 'object'`, and for a
 * schema with no `type` that has `properties` or `required`.
 */
function describesObject(schema: Record<string, unknown>): boolean {
  if (schema.type !== undefined) return schema.type === 'object';
  return schema.properties !== undefined || schema.required !== undefined;
}

/**
 * Validates JSON output against a small subset of JSON Schema: the top-level
 * `type`; for objects, every property in `required` (or every key of
 * `properties` when `required` is absent) must be present and not null, and a
 * property with a `type` must have it. Nested schemas are not checked.
 */
function validateJsonSchema(
  output: string,
  schema: Record<string, unknown>
): AssertionFailure | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { type: 'json-schema', reason: 'output is not valid JSON' };
  }
  if (!describesObject(schema)) {
    if (typeof schema.type === 'string' && !jsonTypeMatches(parsed, schema.type)) {
      return { type: 'json-schema', reason: `output is not of type ${schema.type}` };
    }
    return null;
  }
  if (!jsonTypeMatches(parsed, 'object')) {
    return { type: 'json-schema', reason: 'output is not a JSON object' };
  }
  const reason = objectSchemaProblem(parsed as Record<string, unknown>, schema);
  return reason ? { type: 'json-schema', reason } : null;
}

/** First problem with `obj` against an object schema's required list and property types, or null. */
function objectSchemaProblem(obj: Record<string, unknown>, schema: Record<string, unknown>): string | null {
  const props = (schema.properties ?? {}) as Record<string, { type?: unknown } | undefined>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : Object.keys(props);
  const missing = required.find((key) => obj[key] === undefined || obj[key] === null);
  if (missing !== undefined) return `missing property "${missing}"`;
  for (const [key, def] of Object.entries(props)) {
    const value = obj[key];
    if (value === undefined || value === null || typeof def?.type !== 'string') continue;
    if (!jsonTypeMatches(value, def.type)) return `property "${key}" is not of type ${def.type}`;
  }
  return null;
}

/** Cap on the text a regex is tested against, to bound matching work. */
const MAX_REGEX_INPUT = 100_000;

/**
 * Length of each probe string. Exponential backtracking never finishes at this
 * length, while an ordinary pattern that is slow only in proportion to the
 * square of the input finishes in about a millisecond.
 */
const PROBE_LENGTH = 1_000;

/** A probe still running after this is stopped and the pattern rejected. */
const PROBE_TIMEOUT_MS = 200;

// A timer cannot interrupt a test() that never returns, but a vm script's
// timeout can, so each probe runs as a script in its own context.
const PROBE_SCRIPT = new Script('pattern.test(probe)');

/** Verdicts by pattern and flags, so each pattern is probed once per process. */
const probeVerdicts = new Map<string, boolean>();

/**
 * Inputs where backtracking blows up: long runs of a letter, a digit and a
 * space, and of the literal characters inside each innermost group of the
 * pattern, each followed by a character that makes the match fail.
 */
function probeInputs(source: string): string[] {
  const groupChars = [...source.matchAll(/\(([^()]*)\)/g)].map((m) =>
    m[1]
      .replace(/^\?(?:[:=!]|<[=!]|<[^>]*>)/, '')
      .replace(/\\./g, '')
      .replace(/[|[\]{}?*+^$.]/g, '')
  );
  const units = [...new Set(['a', '1', ' ', ...groupChars])].filter(Boolean);
  return units.map((unit) => unit.repeat(Math.ceil(PROBE_LENGTH / unit.length)) + '!');
}

/**
 * Flag a regex at risk of catastrophic backtracking by running it on the probe
 * inputs with a time limit. Any probe that does not finish within
 * PROBE_TIMEOUT_MS, or throws, marks the pattern as unsafe.
 */
function isReDoSRisk(regex: RegExp): boolean {
  const key = String(regex);
  const known = probeVerdicts.get(key);
  if (known !== undefined) return known;
  const context = createContext({ pattern: regex, probe: '' });
  const risky = probeInputs(regex.source).some((probe) => {
    context.probe = probe;
    try {
      PROBE_SCRIPT.runInContext(context, { timeout: PROBE_TIMEOUT_MS });
      return false;
    } catch {
      return true;
    }
  });
  probeVerdicts.set(key, risky);
  return risky;
}

/**
 * Validates output matches regex pattern. The global/sticky flags are dropped
 * (so the test is stateless), the pattern is probed for catastrophic
 * backtracking before it runs, and the tested text is length-capped.
 */
function validateRegex(
  output: string,
  pattern: string | RegExp,
  flags?: string
): AssertionFailure | null {
  const source = typeof pattern === 'string' ? pattern : pattern.source;
  let regex: RegExp;
  try {
    const rawFlags = typeof pattern === 'string' ? flags ?? '' : pattern.flags;
    regex = new RegExp(source, rawFlags.replace(/[gy]/g, ''));
  } catch {
    return { type: 'regex', reason: `invalid regex: ${source}` };
  }
  if (isReDoSRisk(regex)) {
    return {
      type: 'regex',
      reason: `unsafe regex (a ${PROBE_LENGTH}-character probe did not finish within ${PROBE_TIMEOUT_MS} ms): ${source}`,
    };
  }
  const text = output.length > MAX_REGEX_INPUT ? output.slice(0, MAX_REGEX_INPUT) : output;
  return regex.test(text)
    ? null
    : { type: 'regex', reason: `output did not match ${String(regex)}` };
}

/**
 * Validates output contains a tool call with the given name (and optional arg count).
 */
function validateToolCallShape(
  output: string,
  toolName: string,
  argCount?: number
): AssertionFailure | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { type: 'tool-call-shape', reason: 'output is not valid JSON' };
  }

  const matches = (call: unknown): boolean => {
    if (!call || typeof call !== 'object') return false;
    const c = call as { toolName?: string; toolInput?: unknown };
    if (c.toolName !== toolName || c.toolInput === undefined) return false;
    if (argCount !== undefined) {
      const args = c.toolInput;
      const count =
        args && typeof args === 'object' ? Object.keys(args as object).length : 0;
      if (count !== argCount) return false;
    }
    return true;
  };

  const ok = Array.isArray(parsed) ? parsed.some(matches) : matches(parsed);
  return ok
    ? null
    : {
        type: 'tool-call-shape',
        reason: `no tool call matching "${toolName}"${
          argCount !== undefined ? ` with ${argCount} arg(s)` : ''
        }`,
      };
}

/**
 * Applies a single assertion, returning a failure or null if it passed.
 */
function applyAssertion(output: string, assertion: Assertion): AssertionFailure | null {
  switch (assertion.type) {
    case 'json-schema':
      return applyJsonSchema(output, assertion);
    case 'regex':
      return applyRegex(output, assertion);
    case 'contains':
      return applyContains(output, assertion);
    case 'tool-call-shape':
      return applyToolCallShape(output, assertion);
    default:
      return {
        type: (assertion as { type: AssertionType }).type,
        reason: 'unknown assertion type',
      };
  }
}

type AssertionOf<T extends AssertionType> = Extract<Assertion, { type: T }>;

// Each check below first rejects an assertion that is missing its argument:
// an eval file can pass an object its types do not describe, so the field can
// be absent at run time.

function applyJsonSchema(output: string, assertion: AssertionOf<'json-schema'>): AssertionFailure | null {
  if (!assertion.schema) return { type: 'json-schema', reason: 'no schema provided' };
  return validateJsonSchema(output, assertion.schema);
}

function applyRegex(output: string, assertion: AssertionOf<'regex'>): AssertionFailure | null {
  if (assertion.pattern === undefined) return { type: 'regex', reason: 'no pattern provided' };
  return validateRegex(output, assertion.pattern, assertion.flags);
}

function applyContains(output: string, assertion: AssertionOf<'contains'>): AssertionFailure | null {
  if (assertion.substring === undefined) return { type: 'contains', reason: 'no substring provided' };
  if (output.includes(assertion.substring)) return null;
  return { type: 'contains', reason: `output did not contain "${assertion.substring}"` };
}

function applyToolCallShape(output: string, assertion: AssertionOf<'tool-call-shape'>): AssertionFailure | null {
  if (!assertion.toolName) return { type: 'tool-call-shape', reason: 'no toolName provided' };
  return validateToolCallShape(output, assertion.toolName, assertion.argCount);
}

/**
 * Applies all assertions; returns the first failure, or null if all passed.
 */
export function applyAssertions(
  output: string,
  assertions: Assertion[]
): AssertionFailure | null {
  for (const assertion of assertions) {
    const failure = applyAssertion(output, assertion);
    if (failure) return failure;
  }
  return null;
}
