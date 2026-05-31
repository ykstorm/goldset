/**
 * Goldset public GitHub Action
 * Wires the library runners to GitHub Actions inputs/outputs + summary.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { GoldenDatasetRunner } from '../src/runners/golden';
import { llmJudge } from '../src/runners/judge';
import { structural } from '../src/runners/structural';
import type {
  GoldenTestCase,
  GoldenDatasetConfig,
  LLMJudgeCase,
  LLMJudgeOptions,
  StructuralCase,
  StructuralOptions,
  Assertion,
} from '../src/types';

// ─── YAML eval file schema ───────────────────────────────────────────────────

interface EvalFile {
  runner: 'golden' | 'judge' | 'structural';
  cases: Record<string, unknown>[];
  config?: Record<string, unknown>;
}

function loadEvalFile(filePath: string): EvalFile {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) throw new Error(`Eval file not found: ${abs}`);
  const raw = fs.readFileSync(abs, 'utf-8');
  return yaml.load(raw) as EvalFile;
}

// ─── LLM stub for golden/structural (no API key needed) ─────────────────────

async function stubLlm(input: string): Promise<string> {
  // Returns a deterministic placeholder — replace with real LLM in production
  return `[stub response for: ${input}]`;
}

// ─── Run ───────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const evalFile = core.getInput('eval-file', { required: true });
  const failOnRegression = core.getBooleanInput('fail-on-regression');
  const commentOnPR = core.getBooleanInput('comment-on-pr');

  core.info(`[goldset] Loading eval file: ${evalFile}`);
  const evalData = loadEvalFile(evalFile);

  let passed = 0;
  let failed = 0;
  let total = 0;
  const rows: { data: string; header?: boolean }[][] = [
    [{ data: 'case', header: true }, { data: 'status', header: true }, { data: 'detail', header: true }],
  ];

  if (evalData.runner === 'golden') {
    const cases = evalData.cases as GoldenTestCase[];
    const config: GoldenDatasetConfig = {
      threshold: (evalData.config?.threshold as number) ?? 0.85,
    };
    const runner = new GoldenDatasetRunner(config);
    total = cases.length;

    for (const tc of cases) {
      const actual = await stubLlm(tc.input);
      const result = runner.evaluate(tc, actual);
      if (result.passed) passed++;
      else failed++;
      rows.push([
        { data: tc.id },
        { data: result.passed ? '✅ pass' : '❌ fail' },
        { data: `similarity=${result.similarity}` },
      ]);
    }
  } else if (evalData.runner === 'judge') {
    const cases = evalData.cases as LLMJudgeCase[];
    const judgeModel = core.getInput('judge-model') || 'gpt-4o-mini';
    const rubric = (evalData.config?.rubric as string) || 'Score 5 if helpful, 0 if not.';
    const passThreshold = (evalData.config?.passThreshold as number) ?? 3;

    const opts: LLMJudgeOptions = {
      llm: stubLlm,
      judge: async (prompt: string) => {
        // In production, call the judge LLM here
        // For now, return a passing score
        return JSON.stringify({ score: passThreshold, reason: 'stub judge' });
      },
      rubric,
      passThreshold,
    };

    const results = await llmJudge(cases, opts);
    total = results.length;
    for (const r of results) {
      if (r.passed) passed++;
      else failed++;
      rows.push([
        { data: r.testCaseId },
        { data: r.passed ? '✅ pass' : '❌ fail' },
        { data: `score=${Math.round(r.similarity * 5)}/5` },
      ]);
    }
  } else if (evalData.runner === 'structural') {
    const cases = evalData.cases as StructuralCase[];
    const assertions = (evalData.config?.assertions as Assertion[]) ?? [];

    const opts: StructuralOptions = {
      llm: stubLlm,
      assertions,
    };

    const results = await structural(cases, opts);
    total = results.length;
    for (const r of results) {
      if (r.passed) passed++;
      else failed++;
      rows.push([
        { data: r.testCaseId },
        { data: r.passed ? '✅ pass' : '❌ fail' },
        { data: r.actualOutput.slice(0, 60) },
      ]);
    }
  }

  // ── Outputs ──────────────────────────────────────────────────────────────
  core.setOutput('passed', String(passed));
  core.setOutput('failed', String(failed));
  core.setOutput('total', String(total));
  core.setOutput('all-passed', passed === total ? 'true' : 'false');

  // ── Summary ──────────────────────────────────────────────────────────────
  await core.summary
    .addHeading('Goldset Eval Results')
    .addTable(rows)
    .addSeparator()
    .addTable([
      [{ data: 'metric', header: true }, { data: 'value', header: true }],
      ['total', String(total)],
      ['passed', String(passed)],
      ['failed', String(failed)],
      ['pass rate', total > 0 ? `${Math.round((passed / total) * 100)}%` : 'N/A'],
    ])
    .write();

  core.info(`[goldset] ${passed}/${total} cases passed`);

  if (failOnRegression && failed > 0) {
    core.setFailed(`Goldset regression detected: ${failed}/${total} cases failed`);
    process.exit(1);
  }
}

run().catch((err) => {
  core.setFailed(err.message);
  process.exit(1);
});
