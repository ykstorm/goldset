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

// src/runners/structural.ts
function validateJsonSchema(output, schema) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { type: "json-schema", reason: "output is not valid JSON" };
  }
  if (schema.type === "object" && schema.properties) {
    const props = schema.properties;
    for (const key of Object.keys(props)) {
      if (parsed[key] === void 0 || parsed[key] === null) {
        return { type: "json-schema", reason: `missing property "${key}"` };
      }
    }
  }
  return null;
}
function validateRegex(output, pattern, flags) {
  let regex;
  try {
    regex = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
  } catch {
    return { type: "regex", reason: `invalid regex: ${String(pattern)}` };
  }
  return regex.test(output) ? null : { type: "regex", reason: `output did not match ${String(regex)}` };
}
function validateToolCallShape(output, toolName, argCount) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { type: "tool-call-shape", reason: "output is not valid JSON" };
  }
  const matches = (call) => {
    if (!call || typeof call !== "object") return false;
    const c = call;
    if (c.toolName !== toolName || c.toolInput === void 0) return false;
    if (argCount !== void 0) {
      const args = c.toolInput;
      const count = args && typeof args === "object" ? Object.keys(args).length : 0;
      if (count !== argCount) return false;
    }
    return true;
  };
  const ok = Array.isArray(parsed) ? parsed.some(matches) : matches(parsed);
  return ok ? null : {
    type: "tool-call-shape",
    reason: `no tool call matching "${toolName}"${argCount !== void 0 ? ` with ${argCount} arg(s)` : ""}`
  };
}
function applyAssertion(output, assertion) {
  switch (assertion.type) {
    case "json-schema":
      return assertion.schema ? validateJsonSchema(output, assertion.schema) : { type: "json-schema", reason: "no schema provided" };
    case "regex":
      return assertion.pattern !== void 0 ? validateRegex(output, assertion.pattern, assertion.flags) : { type: "regex", reason: "no pattern provided" };
    case "contains":
      if (assertion.substring === void 0) {
        return { type: "contains", reason: "no substring provided" };
      }
      return output.includes(assertion.substring) ? null : { type: "contains", reason: `output did not contain "${assertion.substring}"` };
    case "tool-call-shape":
      return assertion.toolName ? validateToolCallShape(output, assertion.toolName, assertion.argCount) : { type: "tool-call-shape", reason: "no toolName provided" };
    default:
      return { type: assertion.type, reason: "unknown assertion type" };
  }
}
function applyAssertions(output, assertions) {
  for (const assertion of assertions) {
    const failure = applyAssertion(output, assertion);
    if (failure) return failure;
  }
  return null;
}

// src/runners/api.ts
var round2 = (n) => Math.round(n * 100) / 100;
async function goldenDataset(cases, config) {
  const threshold = config.threshold ?? 0.8;
  if (threshold < 0 || threshold > 1) {
    throw new Error("goldenDataset: threshold must be between 0 and 1");
  }
  const normalize = config.normalize ?? ((s) => s);
  const results = [];
  for (const tc of cases) {
    const output = await Promise.resolve(config.llm(tc.input));
    const similarity = round2(
      calculateSimilarity(normalize(tc.expected), normalize(output))
    );
    const passed2 = similarity >= threshold;
    if (config.verbose) {
      console.log(`[goldenDataset] ${passed2 ? "\u2713" : "\u2717"} ${tc.id} (similarity ${similarity})`);
    }
    results.push({ id: tc.id, passed: passed2, similarity, output, threshold });
  }
  const passed = results.filter((r) => r.passed).length;
  const avgSimilarity = results.length ? round2(results.reduce((s, r) => s + r.similarity, 0) / results.length) : 0;
  return {
    runner: "goldenDataset",
    cases: results,
    summary: {
      passed,
      failed: results.length - passed,
      passRate: results.length ? round2(passed / results.length) : 0,
      avgSimilarity
    }
  };
}
async function llmJudge(cases, config) {
  const { llm, judge, rubric } = config;
  const passThreshold = config.passThreshold ?? 3;
  const results = [];
  for (const tc of cases) {
    const output = await Promise.resolve(llm(tc.input));
    const judgePrompt = `You are an expert evaluator. Using the following rubric, score the AI's response.

Rubric:
${rubric}

Input: ${tc.input}
${tc.expected !== void 0 ? `Expected: ${tc.expected}
` : ""}Actual Output: ${output}

Respond with a JSON object containing "score" (0-5) and "reason" (string).`;
    const judgeText = await Promise.resolve(judge(judgePrompt));
    let score = 0;
    let reasoning;
    try {
      const parsed = JSON.parse(judgeText);
      score = typeof parsed.score === "number" ? parsed.score : 0;
      reasoning = parsed.reason;
    } catch {
      score = 0;
    }
    const passed2 = score >= passThreshold;
    if (config.verbose) {
      console.log(`[llmJudge] ${passed2 ? "\u2713" : "\u2717"} ${tc.id} (score ${score}/5)`);
    }
    results.push({ id: tc.id, passed: passed2, score, output, reasoning, passThreshold });
  }
  const passed = results.filter((r) => r.passed).length;
  const avgScore = results.length ? round2(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
  return {
    runner: "llmJudge",
    cases: results,
    summary: { passed, failed: results.length - passed, avgScore }
  };
}
async function structural(cases, config) {
  const { llm, assertions } = config;
  const results = [];
  for (const tc of cases) {
    const output = await Promise.resolve(llm(tc.input));
    const failure = applyAssertions(output, assertions);
    const passed2 = failure === null;
    if (config.verbose) {
      console.log(`[structural] ${passed2 ? "\u2713" : "\u2717"} ${tc.id}`);
    }
    results.push({
      id: tc.id,
      passed: passed2,
      output,
      failedAssertion: failure ?? void 0
    });
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    runner: "structural",
    cases: results,
    summary: { passed, failed: results.length - passed }
  };
}
function toEvalResult(...runnerResults) {
  const runners = {};
  let failed = 0;
  for (const r of runnerResults) {
    runners[r.runner] = r;
    failed += r.summary.failed;
  }
  return {
    version: 1,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    commit: process.env.GITHUB_SHA ?? "",
    branch: process.env.GITHUB_REF_NAME ?? "",
    runners,
    passed: failed === 0
  };
}
async function runEval(...runnerResults) {
  const result = toEvalResult(...runnerResults);
  const jsonMode = process.argv.includes("--output") && process.argv[process.argv.indexOf("--output") + 1] === "json";
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result));
  } else {
    for (const r of runnerResults) {
      const total = r.cases.length;
      const mark = r.summary.failed === 0 ? "\u2713" : "\u2717";
      console.log(`${mark} ${r.runner}: ${r.summary.passed}/${total} passed`);
    }
  }
  if (!result.passed) process.exit(1);
  return result;
}
export {
  GoldenDatasetRunner,
  applyAssertions,
  calculateSimilarity,
  goldenDataset,
  levenshteinDistance,
  llmJudge,
  runEval,
  structural,
  toEvalResult
};
//# sourceMappingURL=index.mjs.map