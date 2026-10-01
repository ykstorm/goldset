// Assertion vocabulary and validators. The structural() runner in ./api.ts
// consumes applyAssertions from here.

export type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';

/**
 * A single assertion to validate LLM output.
 */
export interface Assertion {
  type: AssertionType;
  schema?: Record<string, unknown>; // JSON Schema for 'json-schema' type
  pattern?: string | RegExp; // Regex pattern for 'regex' type
  flags?: string; // Regex flags for 'regex' type (when pattern is a string)
  substring?: string; // Substring to check for 'contains' type
  toolName?: string; // Tool name to check for 'tool-call-shape' type
  argCount?: number; // Expected arg count for 'tool-call-shape' type
}

/**
 * Description of the first assertion that failed for a given output.
 */
export interface AssertionFailure {
  type: AssertionType;
  reason: string;
}

/**
 * Validates JSON output against a (subset of) JSON Schema — presence of
 * required top-level properties from `schema.properties`.
 */
function validateJsonSchema(
  output: string,
  schema: Record<string, unknown>
): AssertionFailure | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(output) as Record<string, unknown>;
  } catch {
    return { type: 'json-schema', reason: 'output is not valid JSON' };
  }
  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, unknown>;
    for (const key of Object.keys(props)) {
      if (parsed[key] === undefined || parsed[key] === null) {
        return { type: 'json-schema', reason: `missing property "${key}"` };
      }
    }
  }
  return null;
}

/** Cap on the text a regex is tested against, to bound matching work. */
const MAX_REGEX_INPUT = 100_000;

/**
 * Flag a regex at risk of catastrophic backtracking: an unbounded quantifier
 * (`*`, `+`, `{n,}`) applied to a group whose body already contains an unbounded
 * quantifier — the `(a+)+` family. A cheap star-height walk, not a full parser,
 * but it rejects the exponential shapes before they ever run.
 */
function isReDoSRisk(source: string): boolean {
  const groups: { bodyHasQuant: boolean }[] = [];
  const stack: number[] = [];
  let inClass = false;
  const unboundedAt = (i: number): boolean => {
    const c = source[i];
    if (c === '*' || c === '+') return true;
    if (c === '{') return /^\{\d*,\}/.test(source.slice(i));
    return false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '\\') { i += 1; continue; } // skip the escaped char
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') { stack.push(groups.length); groups.push({ bodyHasQuant: false }); continue; }
    if (c === ')') {
      const idx = stack.pop();
      if (idx === undefined) continue;
      const quantified = unboundedAt(i + 1);
      if (quantified && groups[idx].bodyHasQuant) return true;
      if ((groups[idx].bodyHasQuant || quantified) && stack.length) {
        groups[stack[stack.length - 1]].bodyHasQuant = true;
      }
      continue;
    }
    if (unboundedAt(i) && stack.length) {
      groups[stack[stack.length - 1]].bodyHasQuant = true;
    }
  }
  return false;
}

/**
 * Validates output matches regex pattern. The pattern is screened for
 * catastrophic-backtracking shapes, the global/sticky flags are dropped (so the
 * test is stateless), and the tested text is length-capped.
 */
function validateRegex(
  output: string,
  pattern: string | RegExp,
  flags?: string
): AssertionFailure | null {
  const source = typeof pattern === 'string' ? pattern : pattern.source;
  if (isReDoSRisk(source)) {
    return { type: 'regex', reason: `unsafe regex (nested quantifier): ${source}` };
  }
  let regex: RegExp;
  try {
    const rawFlags = typeof pattern === 'string' ? flags ?? '' : pattern.flags;
    regex = new RegExp(source, rawFlags.replace(/[gy]/g, ''));
  } catch {
    return { type: 'regex', reason: `invalid regex: ${source}` };
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
      return assertion.schema
        ? validateJsonSchema(output, assertion.schema)
        : { type: 'json-schema', reason: 'no schema provided' };
    case 'regex':
      return assertion.pattern !== undefined
        ? validateRegex(output, assertion.pattern, assertion.flags)
        : { type: 'regex', reason: 'no pattern provided' };
    case 'contains':
      if (assertion.substring === undefined) {
        return { type: 'contains', reason: 'no substring provided' };
      }
      return output.includes(assertion.substring)
        ? null
        : { type: 'contains', reason: `output did not contain "${assertion.substring}"` };
    case 'tool-call-shape':
      return assertion.toolName
        ? validateToolCallShape(output, assertion.toolName, assertion.argCount)
        : { type: 'tool-call-shape', reason: 'no toolName provided' };
    default:
      return { type: assertion.type, reason: 'unknown assertion type' };
  }
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
