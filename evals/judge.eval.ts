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
// Reads the tagged <input>/<output> sections of the judge prompt.
const section = (prompt: string, name: string): string =>
  prompt.match(new RegExp(`<${name}>\\n([\\s\\S]*?)\\n</${name}>`))?.[1] ?? '';

const localJudge = (prompt: string): string => {
  const inputIsHindi = /[ऀ-ॿ]/.test(section(prompt, 'input'));
  const outputIsHindi = /[ऀ-ॿ]/.test(section(prompt, 'output'));
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

async function main(): Promise<void> {
  const judged = await llmJudge(
    [
      { id: 'english', input: 'How does this work?' },
      { id: 'hindi', input: 'यह कैसे काम करता है?' },
    ],
    { llm, judge: localJudge, rubric: 'Score 5 if response language matches input.', passThreshold: 3 }
  );

  await runEval(judged);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
