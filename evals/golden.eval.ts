/**
 * Dogfood eval — exercises Goldset's own `goldenDataset` runner.
 *
 * The "LLM under test" here is a deterministic canned-answer function, so this
 * eval needs no API key and proves the golden-dataset similarity + threshold
 * logic end-to-end. Run with `npx tsx evals/golden.eval.ts` (human output) or
 * `--output json` (machine output, as the Goldset Action does).
 */
import { goldenDataset, runEval } from '../src/index';

const canned: Record<string, string> = {
  'How do I get a refund?': 'Email support@example.com for refunds.',
  'When does my order ship?': 'Check your order status page.',
  'Hello!': 'Hello! How can I help you today?',
};

const llm = (input: string): string => canned[input] ?? '';

const golden = await goldenDataset(
  [
    {
      id: 'refund',
      input: 'How do I get a refund?',
      expected: 'Email support@example.com for refunds.',
    },
    {
      id: 'shipping',
      input: 'When does my order ship?',
      expected: 'Check your order status page.',
    },
    { id: 'greeting', input: 'Hello!', expected: 'Hello! How can I help you today?' },
  ],
  { llm, threshold: 0.85 }
);

await runEval(golden);
