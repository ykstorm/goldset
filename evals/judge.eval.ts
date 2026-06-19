/**
 * Dogfood eval — exercises Goldset's own `llmJudge` runner.
 *
 * Uses a deterministic local "judge" so this runs in CI with no API key. When a
 * real judge provider is wanted, the Goldset Action sets GOLDSET_JUDGE_PROVIDER
 * (openai|anthropic) and forwards the matching API key; an eval can branch on it
 * to call the provider instead of the local judge. We keep the local judge here
 * so the dogfood suite is hermetic.
 */
import { llmJudge, runEval } from '../src/index';

// "AI under test": echoes the language family of the input.
const llm = (input: string): string =>
  /[ऀ-ॿ]/.test(input) ? 'नमस्ते, मैं मदद कर सकता हूँ' : 'Hello, I can help';

// Local judge: scores 5 if the response language matches the input language.
const localJudge = (prompt: string): string => {
  const inputLine = prompt.split('\n').find((l) => l.startsWith('Input:')) ?? '';
  const outputLine = prompt.split('\n').find((l) => l.startsWith('Actual Output:')) ?? '';
  const inputIsHindi = /[ऀ-ॿ]/.test(inputLine);
  const outputIsHindi = /[ऀ-ॿ]/.test(outputLine);
  const score = inputIsHindi === outputIsHindi ? 5 : 1;
  return JSON.stringify({ score, reason: 'language match check' });
};

const provider = process.env.GOLDSET_JUDGE_PROVIDER;
if (provider) {
  // Demonstrates the wiring is observable to the eval; real provider calls
  // would go here. We still use the hermetic judge so CI stays deterministic.
  // eslint-disable-next-line no-console
  console.error(`[judge.eval] GOLDSET_JUDGE_PROVIDER=${provider} (using local judge for CI)`);
}

const judged = await llmJudge(
  [
    { id: 'english', input: 'How does this work?' },
    { id: 'hindi', input: 'यह कैसे काम करता है?' },
  ],
  { llm, judge: localJudge, rubric: 'Score 5 if response language matches input.', passThreshold: 3 }
);

await runEval(judged);
