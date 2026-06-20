/**
 * Structural assertion primitives.
 *
 * The public `structural()` runner lives in `./api.ts` and consumes
 * {@link applyAssertions}. This module owns the assertion vocabulary and the
 * per-assertion validators.
 */

/**
 * Assertion type for structural validation
 */
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

/**
 * Validates output matches regex pattern.
 */
function validateRegex(
  output: string,
  pattern: string | RegExp,
  flags?: string
): AssertionFailure | null {
  let regex: RegExp;
  try {
    regex = typeof pattern === 'string' ? new RegExp(pattern, flags) : pattern;
  } catch {
    return { type: 'regex', reason: `invalid regex: ${String(pattern)}` };
  }
  return regex.test(output)
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
