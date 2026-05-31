var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/runners/golden.ts
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  return track[str2.length][str1.length];
}
function calculateSimilarity(str1, str2) {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - distance / maxLength;
}
var GoldenDatasetRunner = class {
  constructor(config = { threshold: 0.85 }) {
    __publicField(this, "config");
    this.config = config;
  }
  /**
   * Evaluate a single test case against expected output
   */
  evaluate(testCase, actualOutput) {
    const similarity = calculateSimilarity(
      testCase.expectedOutput,
      actualOutput
    );
    return {
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      similarity: Math.round(similarity * 100) / 100,
      passed: similarity >= this.config.threshold
    };
  }
  /**
   * Evaluate multiple test cases and return summary
   */
  evaluateMany(testCases, actualOutputs) {
    if (testCases.length !== actualOutputs.length) {
      throw new Error(
        `Mismatch: ${testCases.length} test cases but ${actualOutputs.length} outputs`
      );
    }
    const results = testCases.map(
      (testCase, index) => this.evaluate(testCase, actualOutputs[index])
    );
    const passedTests = results.filter((r) => r.passed).length;
    const averageSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
    return {
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      averageSimilarity: Math.round(averageSimilarity * 100) / 100,
      results
    };
  }
  /**
   * Get the current threshold
   */
  getThreshold() {
    return this.config.threshold;
  }
  /**
   * Set the threshold
   */
  setThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error("Threshold must be between 0 and 1");
    }
    this.config.threshold = threshold;
  }
};

// src/runners/judge.ts
async function llmJudge(cases, opts) {
  const { llm, judge, rubric, passThreshold = 3 } = opts;
  const results = [];
  for (const testCase of cases) {
    const llmOutput = await Promise.resolve(llm(testCase.input));
    const judgePrompt = `You are an expert evaluator. Using the following rubric, score the AI's response.

Rubric:
${rubric}

Input: ${testCase.input}

Expected: ${testCase.expected}

Actual Output: ${llmOutput}

Respond with a JSON object containing "score" (0-5) and "reason" (string).`;
    const judgeResponseText = await Promise.resolve(judge(judgePrompt));
    let score;
    let passed;
    try {
      const judgeResponse = JSON.parse(judgeResponseText);
      score = judgeResponse.score;
      passed = score >= passThreshold;
    } catch {
      score = 0;
      passed = false;
    }
    results.push({
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expected,
      actualOutput: llmOutput,
      similarity: score / 5,
      // Normalize score to 0-1 range
      passed
    });
  }
  return results;
}

// src/runners/structural.ts
function validateJsonSchema(output, schema) {
  try {
    const parsed = JSON.parse(output);
    if (schema.type === "object" && schema.properties) {
      const props = schema.properties;
      for (const key in props) {
        if (!parsed[key]) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
function validateRegex(output, pattern) {
  try {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return regex.test(output);
  } catch {
    return false;
  }
}
function validateContains(output, substring) {
  return output.includes(substring);
}
function validateToolCallShape(output, toolName) {
  try {
    const parsed = JSON.parse(output);
    if (parsed.toolName && parsed.toolName === toolName) {
      if (parsed.toolInput !== void 0) {
        return true;
      }
    }
    if (Array.isArray(parsed)) {
      return parsed.some((call) => call.toolName === toolName && call.toolInput !== void 0);
    }
    return false;
  } catch {
    return false;
  }
}
function applyAssertions(output, assertions) {
  return assertions.every((assertion) => {
    switch (assertion.type) {
      case "json-schema":
        return assertion.schema ? validateJsonSchema(output, assertion.schema) : false;
      case "regex":
        return assertion.pattern ? validateRegex(output, assertion.pattern) : false;
      case "contains":
        return assertion.substring ? validateContains(output, assertion.substring) : false;
      case "tool-call-shape":
        return assertion.toolName ? validateToolCallShape(output, assertion.toolName) : false;
      default:
        return false;
    }
  });
}
async function structural(cases, opts) {
  const { llm, assertions } = opts;
  const results = [];
  for (const testCase of cases) {
    const llmOutput = await Promise.resolve(llm(testCase.input));
    const passed = applyAssertions(llmOutput, assertions);
    results.push({
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: "",
      // Not used for structural assertions
      actualOutput: llmOutput,
      similarity: passed ? 1 : 0,
      // 1 if passed, 0 if failed
      passed
    });
  }
  return results;
}
export {
  GoldenDatasetRunner,
  calculateSimilarity,
  levenshteinDistance,
  llmJudge,
  structural
};
//# sourceMappingURL=index.js.map