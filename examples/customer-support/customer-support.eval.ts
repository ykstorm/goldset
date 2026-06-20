/**
 * Customer support eval — Goldset usage example.
 *
 * Composes all three runners against a deterministic local LLM + judge so it
 * runs with no API key (`npx tsx examples/customer-support/customer-support.eval.ts`).
 * Swap `localLLM` / `localJudge` for real provider calls in your own repo.
 */
import { goldenDataset, llmJudge, structural, runEval } from '../../src/index';

const localLLM = (input: string): string => {
  if (input.includes('refund')) return 'Email support@example.com for refunds.';
  if (input.includes('order')) {
    return JSON.stringify({ toolName: 'lookupOrder', toolInput: { id: '42' } });
  }
  return 'Hello! How can I help you today?';
};

const localJudge = (): string => JSON.stringify({ score: 5, reason: 'meets rubric' });

const golden = await goldenDataset(
  [
    {
      id: 'refund-q',
      input: 'How do I get a refund?',
      expected: 'Email support@example.com for refunds.',
    },
  ],
  { llm: localLLM, threshold: 0.85 }
);

const judged = await llmJudge(
  [{ id: 'greeting', input: 'hi there' }],
  {
    llm: localLLM,
    judge: localJudge,
    rubric: 'Score 5 if the greeting is friendly.',
    passThreshold: 3,
  }
);

const shape = await structural(
  [{ id: 'tool-q', input: 'lookup order #42' }],
  {
    llm: localLLM,
    assertions: [{ type: 'tool-call-shape', toolName: 'lookupOrder', argCount: 1 }],
  }
);

await runEval(golden, judged, shape);
