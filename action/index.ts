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

function parsePassEnv(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run(): Promise<void> {
  maskSecrets();

  const evalDir = core.getInput('eval-dir') || 'evals';
  const judgeProvider = normalizeProvider(core.getInput('judge-provider') || 'none');
  const failOnRegression = (core.getInput('fail-on-regression') || 'true') !== 'false';
  const commentOnPR = (core.getInput('comment-on-pr') || 'true') !== 'false';
  const timeoutMs = Number(core.getInput('timeout-ms') || '0') || 0;
  const passEnv = parsePassEnv(core.getInput('pass-env') || '');

  core.info(`[goldset] eval-dir=${evalDir} judge-provider=${judgeProvider}`);

  const results = await runEvals({ evalDir, judgeProvider, timeoutMs, passEnv });

  if (results.length === 0) {
    core.warning(`[goldset] no *.eval.ts files found under ${evalDir}/`);
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  core.setOutput('results-path', path.resolve(RESULTS_PATH));

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  core.setOutput('passed', String(passed));
  core.setOutput('failed', String(failed));
  core.setOutput('total', String(total));
  core.setOutput('all-passed', failed === 0 ? 'true' : 'false');

  // Baseline diff + regression, computed independently of the comment.
  // Input wins over the ambient GITHUB_TOKEN so a caller can pass a scoped token.
  const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
  const pr = github.context.payload.pull_request;
  let baseResults: EvalFileResult[] | undefined;
  let regressed = false;

  if (token && pr) {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const baseRef = (pr.base as { ref?: string } | undefined)?.ref;
    baseResults = baseRef ? await fetchBaseResults(octokit, owner, repo, baseRef) : undefined;
    regressed = isRegression(results, baseResults);

    if (commentOnPR) {
      const body = buildCommentBody(results, baseResults);
      const api: CommentApi = {
        listComments: (a) => octokit.rest.issues.listComments(a),
        createComment: (a) => octokit.rest.issues.createComment(a),
        updateComment: (a) => octokit.rest.issues.updateComment(a),
      };
      const action = await postComment(api, { owner, repo, issueNumber: pr.number }, body);
      core.info(`[goldset] PR comment ${action}`);
    }
  } else if (commentOnPR && !pr) {
    core.info('[goldset] not a pull_request event — skipping PR comment');
  } else if (commentOnPR && !token) {
    core.warning('[goldset] GITHUB_TOKEN not available — skipping PR comment');
  }

  // Job summary table.
  const rows: { data: string; header?: boolean }[][] = [
    [
      { data: 'eval', header: true },
      { data: 'status', header: true },
      { data: 'details', header: true },
    ],
    ...results.map((r) => [
      { data: r.file },
      { data: r.passed ? 'PASS' : 'FAIL' },
      { data: r.summary ?? r.error ?? '' },
    ]),
  ];
  if (process.env.GITHUB_STEP_SUMMARY) {
    await core.summary.addHeading('Goldset Eval Results').addTable(rows).write();
  }

  core.info(`[goldset] ${passed}/${total} eval files passed`);

  if (failed > 0) {
    core.setFailed(`Goldset: ${failed}/${total} eval file(s) failed`);
    process.exit(1);
  }
  if (failOnRegression && regressed) {
    core.setFailed('Goldset: regression detected vs base branch');
    process.exit(1);
  }
}

run().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
