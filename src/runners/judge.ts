import type { EvaluationResult } from '../types';

/**
 * Options for llmJudge runner
 */
export interface LLMJudgeOptions {
  llm: (input: string) => Promise<string> | string;
  judge: (prompt: string) => Promise<string> | string;
  rubric: string;
  passThreshold?: number;
}

/**
 * A test case for LLM judge evaluation
 */
export interface LLMJudgeCase {
  id: string;
  input: string;
  expected: string;
  description?: string;
}

/**
 * Judge response structure
 */
interface JudgeResponse {
  score: number;
  reason: string;
}

/**
 * Evaluates LLM outputs using another LLM as a judge with rubric-based scoring
 * @param cases - Array of test cases
 * @param opts - Options including llm, judge, rubric, and passThreshold
 * @returns Array of evaluation results
 */
export async function llmJudge(
  cases: LLMJudgeCase[],
  opts: LLMJudgeOptions
): Promise<EvaluationResult[]> {
  const { llm, judge, rubric, passThreshold = 3 } = opts;
  const results: EvaluationResult[] = [];

  for (const testCase of cases) {
    // Call the LLM to get the output
    const llmOutput = await Promise.resolve(llm(testCase.input));

    // Create the judge prompt
    const judgePrompt = `You are an expert evaluator. Using the following rubric, score the AI's response.

Rubric:
${rubric}

Input: ${testCase.input}

Expected: ${testCase.expected}

Actual Output: ${llmOutput}

Respond with a JSON object containing "score" (0-5) and "reason" (string).`;

    // Call the judge to get the evaluation
    const judgeResponseText = await Promise.resolve(judge(judgePrompt));

    // Parse the judge's response
    let score: number;
    let passed: boolean;

    try {
      const judgeResponse: JudgeResponse = JSON.parse(judgeResponseText);
      score = judgeResponse.score;
      passed = score >= passThreshold;
    } catch {
      // Handle JSON parse failures gracefully - mark as inconclusive
      score = 0;
      passed = false;
    }

    results.push({
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expected,
      actualOutput: llmOutput,
      similarity: score / 5, // Normalize score to 0-1 range
      passed,
    });
  }

  return results;
}
