import type { EvaluationResult } from '../types';

/**
 * Assertion type for structural validation
 */
export type AssertionType = 'json-schema' | 'regex' | 'contains' | 'tool-call-shape';

/**
 * A single assertion to validate LLM output
 */
export interface Assertion {
  type: AssertionType;
  schema?: Record<string, unknown>; // JSON Schema for 'json-schema' type
  pattern?: string | RegExp; // Regex pattern for 'regex' type
  substring?: string; // Substring to check for 'contains' type
  toolName?: string; // Tool name to check for 'tool-call-shape' type
}

/**
 * Options for structural runner
 */
export interface StructuralOptions {
  llm: (input: string) => Promise<string> | string;
  assertions: Assertion[];
}

/**
 * A test case for structural assertion evaluation
 */
export interface StructuralCase {
  id: string;
  input: string;
  description?: string;
}

/**
 * Validates JSON output against a JSON Schema
 */
function validateJsonSchema(output: string, schema: Record<string, unknown>): boolean {
  try {
    const parsed = JSON.parse(output);
    // Basic schema validation - check required properties
    if (schema.type === 'object' && schema.properties) {
      const props = schema.properties as Record<string, unknown>;
      for (const key in props) {
        if (!parsed[key]) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates output matches regex pattern
 */
function validateRegex(output: string, pattern: string | RegExp): boolean {
  try {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return regex.test(output);
  } catch {
    return false;
  }
}

/**
 * Validates output contains substring
 */
function validateContains(output: string, substring: string): boolean {
  return output.includes(substring);
}

/**
 * Validates output contains tool call with given tool name
 */
function validateToolCallShape(output: string, toolName: string): boolean {
  try {
    const parsed = JSON.parse(output);
    // Check if output is a tool call object with the specified tool name
    if (parsed.toolName && parsed.toolName === toolName) {
      // Validate basic tool call shape (toolName and toolInput)
      if (parsed.toolInput !== undefined) {
        return true;
      }
    }
    // Also check for array of calls (batch)
    if (Array.isArray(parsed)) {
      return parsed.some((call) => call.toolName === toolName && call.toolInput !== undefined);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Applies all assertions to the LLM output
 */
function applyAssertions(output: string, assertions: Assertion[]): boolean {
  // All assertions must pass
  return assertions.every((assertion) => {
    switch (assertion.type) {
      case 'json-schema':
        return assertion.schema ? validateJsonSchema(output, assertion.schema) : false;
      case 'regex':
        return assertion.pattern ? validateRegex(output, assertion.pattern) : false;
      case 'contains':
        return assertion.substring ? validateContains(output, assertion.substring) : false;
      case 'tool-call-shape':
        return assertion.toolName ? validateToolCallShape(output, assertion.toolName) : false;
      default:
        return false;
    }
  });
}

/**
 * Evaluates LLM outputs using structural assertions
 * @param cases - Array of test cases
 * @param opts - Options including llm and assertions
 * @returns Array of evaluation results
 */
export async function structural(
  cases: StructuralCase[],
  opts: StructuralOptions
): Promise<EvaluationResult[]> {
  const { llm, assertions } = opts;
  const results: EvaluationResult[] = [];

  for (const testCase of cases) {
    // Call the LLM to get the output
    const llmOutput = await Promise.resolve(llm(testCase.input));

    // Apply all assertions
    const passed = applyAssertions(llmOutput, assertions);

    results.push({
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: '', // Not used for structural assertions
      actualOutput: llmOutput,
      similarity: passed ? 1 : 0, // 1 if passed, 0 if failed
      passed,
    });
  }

  return results;
}
