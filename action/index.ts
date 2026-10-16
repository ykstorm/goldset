import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runEvals, type JudgeProvider } from './run-evals';
import {
  buildCommentBody,
  postComment,
  isRegression,
  type EvalFileResult,
  type CommentApi,
} from './post-comment';
import { writeSummary } from './summary';

const RESULTS_PATH = 'goldset-results.json';

function normalizeProvider(v: string): JudgeProvider {
  const p = v.trim().toLowerCase();
  return p === 'openai' || p === 'anthropic' ? p : 'none';
}

/** Mask any provider key present on the env so it never lands in a log line. */
function maskSecrets(): void {
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN']) {
    const v = process.env[name];
    if (v) core.setSecret(v);
  }
}

/** Narrow unknown JSON to the per-file result array the diff engine expects. */
function isEvalFileResultArray(v: unknown): v is EvalFileResult[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as EvalFileResult).file === 'string' &&
        typeof (r as EvalFileResult).passed === 'boolean'
    )
  );
}

/**
 * Fetch the base branch's committed goldset-results.json via the contents API.
 * The baseline is the `goldset-results.json` a consumer commits (it is tracked,
 * not git-ignored); this run is diffed against that file on the base branch.
 */
async function fetchBaseResults(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  ref: string
): Promise<EvalFileResult[] | undefined> {
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path: RESULTS_PATH, ref });
    const data = res.data as { content?: string; encoding?: string };
    if (!data.content) return undefined;
    const decoded = Buffer.from(
      data.content,
      (data.encoding as BufferEncoding) ?? 'base64'
    ).toString('utf-8');
    const parsed: unknown = JSON.parse(decoded);
    return isEvalFileResultArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

interface Inputs {
  evalDir: string;
  judgeProvider: JudgeProvider;
  commentOnPR: boolean;
  timeoutMs: number;
  passEnv: string[];
  token: string;
}

function readInputs(): Inputs {
  const passEnv = (core.getInput('pass-env') || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    evalDir: core.getInput('eval-dir') || 'evals',
    judgeProvider: normalizeProvider(core.getInput('judge-provider') || 'none'),
    commentOnPR: (core.getInput('comment-on-pr') || 'true') !== 'false',
    timeoutMs: Number(core.getInput('timeout-ms') || '0') || 0,
    passEnv,
    // Input wins over the ambient GITHUB_TOKEN so a caller can pass a scoped token.
    token: core.getInput('github-token') || process.env.GITHUB_TOKEN || '',
  };
}

function writeResults(results: EvalFileResult[]): { total: number; passed: number; failed: number } {
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  core.setOutput('results-path', path.resolve(RESULTS_PATH));
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  core.setOutput('passed', String(passed));
  core.setOutput('failed', String(failed));
  core.setOutput('total', String(total));
  core.setOutput('all-passed', failed === 0 ? 'true' : 'false');
  return { total, passed, failed };
}

type Octokit = ReturnType<typeof github.getOctokit>;
type PullRequest = NonNullable<typeof github.context.payload.pull_request>;

/** Say why no PR comment is posted, when comments are on; called only when the PR or the token is missing. */
function reportSkippedComment(inputs: Inputs, hasPullRequest: boolean): void {
  if (!inputs.commentOnPR) return;
  if (!hasPullRequest) {
    core.info('[goldset] not a pull_request event, skipping PR comment');
  } else if (!inputs.token) {
    core.warning('[goldset] GITHUB_TOKEN not available, skipping PR comment');
  }
}

/** The base branch's committed results, or undefined when the PR names no base ref. */
async function baseResultsFor(
  octokit: Octokit,
  owner: string,
  repo: string,
  pr: PullRequest
): Promise<EvalFileResult[] | undefined> {
  const baseRef = (pr.base as { ref?: string } | undefined)?.ref;
  return baseRef ? fetchBaseResults(octokit, owner, repo, baseRef) : undefined;
}

/** Post or update the results comment. A fork's token cannot write comments; the results and the gate still stand. */
async function commentOnPullRequest(
  octokit: Octokit,
  target: { owner: string; repo: string; issueNumber: number },
  results: EvalFileResult[],
  baseResults: EvalFileResult[] | undefined
): Promise<void> {
  const api: CommentApi = {
    listComments: (a) => octokit.rest.issues.listComments(a),
    createComment: (a) => octokit.rest.issues.createComment(a),
    updateComment: (a) => octokit.rest.issues.updateComment(a),
  };
  try {
    const action = await postComment(api, target, buildCommentBody(results, baseResults));
    core.info(`[goldset] PR comment ${action}`);
  } catch (err) {
    core.warning(`[goldset] could not post the PR comment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Fetch the base results, compute regression, and (optionally) post the comment. */
async function computeRegressionAndComment(
  results: EvalFileResult[],
  inputs: Inputs
): Promise<boolean> {
  const pr = github.context.payload.pull_request;
  if (!inputs.token || !pr) {
    reportSkippedComment(inputs, Boolean(pr));
    return false;
  }

  const octokit = github.getOctokit(inputs.token);
  const { owner, repo } = github.context.repo;
  const baseResults = await baseResultsFor(octokit, owner, repo, pr);
  const regressed = isRegression(results, baseResults);

  if (inputs.commentOnPR) {
    await commentOnPullRequest(octokit, { owner, repo, issueNumber: pr.number }, results, baseResults);
  }
  return regressed;
}

async function run(): Promise<void> {
  maskSecrets();
  const inputs = readInputs();
  core.info(`[goldset] eval-dir=${inputs.evalDir} judge-provider=${inputs.judgeProvider}`);

  const results = await runEvals({
    evalDir: inputs.evalDir,
    judgeProvider: inputs.judgeProvider,
    timeoutMs: inputs.timeoutMs,
    passEnv: inputs.passEnv,
  });

  // The full error, stderr tail included, goes to the step log only.
  for (const r of results) {
    if (r.error) core.error(`${r.file}: ${r.error}`);
  }

  const { total, passed, failed } = writeResults(results);
  const regressed = await computeRegressionAndComment(results, inputs);
  await writeSummary(results);

  core.info(`[goldset] ${passed}/${total} eval files passed`);

  // A regression is a file that passed on the base branch and fails here, so
  // it is always among the failed files; one gate covers both.
  if (failed > 0) {
    const why = regressed ? ' (regression vs base branch)' : '';
    core.setFailed(`Goldset: ${failed}/${total} eval file(s) failed${why}`);
    process.exitCode = 1;
  }
}

run().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
