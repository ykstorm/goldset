/**
 * Dogfood eval — exercises Goldset's own `structural` runner.
 *
 * Verifies json-schema, contains, and tool-call-shape assertions against
 * deterministic outputs. No API key required. Run with
 * `npx tsx evals/structural.eval.ts [--output json]`.
 */
import { structural, runEval } from '../src/index';

const responses: Record<string, string> = {
  'emit a user object': JSON.stringify({ name: 'Ada', age: 36 }),
  'greet the user': 'Hello there, friend!',
  'lookup order #42': JSON.stringify({
    toolName: 'lookupOrder',
    toolInput: { orderId: '42' },
  }),
};

const llm = (input: string): string => responses[input] ?? '';

// Each case needs different assertions, so run three single-case suites and
// fold them into one structural result for reporting.
const jsonCase = await structural([{ id: 'json-shape', input: 'emit a user object' }], {
  llm,
  assertions: [
    { type: 'json-schema', schema: { type: 'object', properties: { name: {}, age: {} } } },
  ],
});
const greetCase = await structural([{ id: 'contains', input: 'greet the user' }], {
  llm,
  assertions: [{ type: 'contains', substring: 'Hello' }],
});
const toolCase = await structural([{ id: 'tool-call', input: 'lookup order #42' }], {
  llm,
  assertions: [{ type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 }],
});

const combined = {
  runner: 'structural' as const,
  cases: [...jsonCase.cases, ...greetCase.cases, ...toolCase.cases],
  summary: {
    passed:
      jsonCase.summary.passed + greetCase.summary.passed + toolCase.summary.passed,
    failed:
      jsonCase.summary.failed + greetCase.summary.failed + toolCase.summary.failed,
  },
};

await runEval(combined);
