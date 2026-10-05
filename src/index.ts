// Functional runner API
export {
  goldenDataset,
  llmJudge,
  structural,
  grounding,
  runEval,
  toEvalResult,
  parseJudgeScore,
} from './runners/api';
export type {
  LLMFn,
  JudgeFn,
  GoldenCase,
  GoldenConfig,
  GoldenCaseResult,
  GoldenResult,
  JudgeCase,
  JudgeConfig,
  JudgeCaseResult,
  JudgeResult,
  StructuralCase,
  StructuralConfig,
  StructuralCaseResult,
  StructuralResult,
  GroundingCase,
  GroundingConfig,
  GroundingCaseResult,
  GroundingResult,
  EvalResult,
} from './runners/api';

// Structural assertion vocabulary
export { applyAssertions } from './runners/structural';
export type {
  Assertion,
  AssertionType,
  AssertionFailure,
} from './runners/structural';

// Similarity utilities
export { calculateSimilarity, levenshteinDistance } from './runners/golden';
export { memoryCache, layeredCache } from './cache';
export type { JudgeCache } from './cache';
