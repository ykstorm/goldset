/**
 * PR-comment delta bot for the Goldset Action.
 *
 * Builds a results table plus a "delta vs base" section, then finds an existing
 * Goldset comment on the PR and UPDATES it (so re-runs don't spam the thread),
 * else CREATES one. The table/delta builder and the diff are pure functions so
 * they can be unit-tested without hitting GitHub.
 */

/** One row of `goldset-results.json` — the per-eval-file result. */
export interface EvalFileResult {
  file: string;
  passed: boolean;
  summary?: string;
  error?: string;
  /** Optional per-runner roll-up, used to enrich the comment. */
  runners?: Record<string, { passed: number; failed: number } | undefined>;
}

/** Minimal octokit surface this module needs — keeps tests honest. */
export interface CommentApi {
  listComments(args: {
    owner: string;
    repo: string;
    issue_number: number;
  }): Promise<{ data: { id: number; body?: string }[] }>;
  createComment(args: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<unknown>;
  updateComment(args: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }): Promise<unknown>;
}

export const COMMENT_MARKER = '<!-- goldset-eval-comment -->';
const HEADING = '## Goldset eval results';

/** Diff this run against the base branch's results. */
export function computeDelta(
  current: EvalFileResult[],
  base: EvalFileResult[]
): { regressed: string[]; fixed: string[] } {
  const baseByFile = new Map(base.map((b) => [b.file, b]));
  const regressed: string[] = [];
  const fixed: string[] = [];
  for (const r of current) {
    const b = baseByFile.get(r.file);
    if (!b) continue; // new eval file — neither a regression nor a fix
    if (!r.passed && b.passed) regressed.push(r.file);
    if (r.passed && !b.passed) fixed.push(r.file);
  }
  return { regressed, fixed };
}

/** Build the full markdown comment body (table + optional delta section). */
export function buildCommentBody(
  results: EvalFileResult[],
  base?: EvalFileResult[]
): string {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  let body = `${COMMENT_MARKER}\n${HEADING}\n\n`;
  body += `**${passed}/${total} eval files passed.**\n\n`;
  body += '| eval | status | details |\n|---|---|---|\n';
  for (const r of results) {
    const detail = (r.summary ?? r.error ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    body += `| \`${r.file}\` | ${r.passed ? '✅ pass' : '❌ fail'} | ${detail} |\n`;
  }

  if (base && base.length) {
    const { regressed, fixed } = computeDelta(results, base);
    body += '\n### Delta vs base\n\n';
    if (!regressed.length && !fixed.length) {
      body += 'No change vs base branch.\n';
    } else {
      if (regressed.length) {
        body += `**🔴 Regressed:** ${regressed.map((f) => `\`${f}\``).join(', ')}\n\n`;
      }
      if (fixed.length) {
        body += `**🟢 Fixed:** ${fixed.map((f) => `\`${f}\``).join(', ')}\n`;
      }
    }
  }

  return body.trimEnd() + '\n';
}

/**
 * Post (or update) the Goldset comment on a PR. Returns the action taken so
 * callers/tests can assert update-vs-create behavior.
 */
export async function postComment(
  api: CommentApi,
  ctx: { owner: string; repo: string; issueNumber: number },
  body: string
): Promise<'created' | 'updated'> {
  const { data: comments } = await api.listComments({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.issueNumber,
  });

  const existing = comments.find(
    (c) => c.body?.includes(COMMENT_MARKER) || c.body?.startsWith(HEADING)
  );

  if (existing) {
    await api.updateComment({
      owner: ctx.owner,
      repo: ctx.repo,
      comment_id: existing.id,
      body,
    });
    return 'updated';
  }

  await api.createComment({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.issueNumber,
    body,
  });
  return 'created';
}
