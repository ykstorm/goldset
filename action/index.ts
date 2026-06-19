/**
 * Goldset public GitHub Action entrypoint.
 *
 * Runs the consumer's `*.eval.ts` suite (each composes Goldset's runners
 * against the consumer's own LLM + judge), collects results to
 * `goldset-results.json`, posts/updates a PR comment with a results table and a
 * delta-vs-base section, and exits non-zero when an eval fails (or regresses)
 * so the merge is gated.
 */
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runEvals } from './run-evals';
import {
  buildCommentBody,
  postComment,
  type EvalFileResult,
  type CommentApi,
} from './post-comment';

const RESULTS_PATH = 'goldset-results.json';

type JudgeProvider = 'openai' | 'anthropic' | 'none';

function normalizeProvider(v: string): JudgeProvider {
  const p = v.trim().toLowerCase();
  return p === 'openai' || p === 'anthropic' ? p : 'none';
}

/** Fetch the base branch's goldset-results.json via the contents API (best effort). */
async function fetchBaseResults(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  ref: string
): Promise<EvalFileResult[] | undefined> {
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: RESULTS_PATH,
      ref,
    });
    const data = res.data as { content?: string; encoding?: string };
    if (!data.content) return undefined;
    const decoded = Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf-8');
    return JSON.parse(decoded) as EvalFileResult[];
  } catch {
    return undefined;
  }
}

async function run(): Promise<void> {
  const evalDir = core.getInput('eval-dir') || 'evals';
  const judgeProvider = normalizeProvider(core.getInput('judge-provider') || 'none');
  const failOnRegression = (core.getInput('fail-on-regression') || 'true') !== 'false';
  const commentOnPR =
    (core.getInput('comment-on-pr') || 'true') !== 'false';

  core.info(`[goldset] eval-dir=${evalDir} judge-provider=${judgeProvider}`);

  const results = await runEvals({ evalDir, judgeProvider });

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

  // ── PR comment (table + delta vs base, update-or-create) ───────────────────
  const token = process.env.GITHUB_TOKEN ?? core.getInput('github-token');
  const pr = github.context.payload.pull_request;
  let regressed = false;

  if (commentOnPR && token && pr) {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const baseRef = (pr.base as { ref?: string } | undefined)?.ref;
    const baseResults = baseRef
      ? await fetchBaseResults(octokit, owner, repo, baseRef)
      : undefined;

    if (baseResults) {
      const baseByFile = new Map(baseResults.map((b) => [b.file, b]));
      regressed = results.some((r) => {
        const b = baseByFile.get(r.file);
        return b && b.passed && !r.passed;
      });
    }

    const body = buildCommentBody(results, baseResults);
    const api: CommentApi = {
      listComments: (a) => octokit.rest.issues.listComments(a),
      createComment: (a) => octokit.rest.issues.createComment(a),
      updateComment: (a) => octokit.rest.issues.updateComment(a),
    };
    const action = await postComment(
      api,
      { owner, repo, issueNumber: pr.number },
      body
    );
    core.info(`[goldset] PR comment ${action}`);
  } else if (commentOnPR && !pr) {
    core.info('[goldset] not a pull_request event — skipping PR comment');
  } else if (commentOnPR && !token) {
    core.warning('[goldset] GITHUB_TOKEN not available — skipping PR comment');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const rows: { data: string; header?: boolean }[][] = [
    [
      { data: 'eval', header: true },
      { data: 'status', header: true },
      { data: 'details', header: true },
    ],
    ...results.map((r) => [
      { data: r.file },
      { data: r.passed ? '✅ pass' : '❌ fail' },
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
