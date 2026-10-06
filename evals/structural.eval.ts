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

async function main(): Promise<void> {
  // Each case needs different assertions, so run three single-case suites.
  // toEvalResult merges the three structural results into one.
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

  await runEval(jsonCase, greetCase, toolCase);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
