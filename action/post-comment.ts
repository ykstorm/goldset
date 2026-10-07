// Builds the PR results table and delta-vs-base section, and upserts a single
// Goldset comment. The builders and diff are pure so they unit-test without
// GitHub. Eval-supplied text is sanitized before it reaches the table.

/** One row of `goldset-results.json` — the result for a single eval file. */
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
  }): Promise<{ data: { id: number; body?: string; user?: { type?: string } | null }[] }>;
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

/**
 * Sanitize eval-supplied text before it is placed in a markdown table cell:
 * strip control characters, neutralize the characters that could break the
 * table or inject markup/mentions, and cap the length.
 */
export function escapeCell(value: string): string {
  const stripped = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  const capped = stripped.length > 200 ? stripped.slice(0, 200) : stripped;
  return capped.replace(/[`|<>@]/g, (c) => `\\${c}`);
}

/**
 * The text a table shows for a row: its summary, or the first line of its
 * error. Later error lines hold the eval's stderr, which belongs in the step
 * log, not in a comment anyone can read.
 */
export function rowDetail(r: EvalFileResult): string {
  return r.summary ?? r.error?.split('\n')[0] ?? '';
}

/** True if any eval that passed on the base branch now fails. */
export function isRegression(
  current: EvalFileResult[],
  base?: EvalFileResult[]
): boolean {
  if (!base || base.length === 0) return false;
  const baseByFile = new Map(base.map((b) => [b.file, b]));
  return current.some((r) => {
    const b = baseByFile.get(r.file);
    return !!b && b.passed && !r.passed;
  });
}

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

/**
 * The markdown results table, one row per eval file. The PR comment and the job
 * summary both render it, so eval-supplied text is escaped the same way in both.
 */
export function buildResultsTable(results: EvalFileResult[]): string {
  let table = '| eval | status | details |\n|---|---|---|\n';
  for (const r of results) {
    const detail = escapeCell(rowDetail(r));
    table += `| \`${escapeCell(r.file)}\` | ${r.passed ? 'PASS' : 'FAIL'} | ${detail} |\n`;
  }
  return table;
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
  body += buildResultsTable(results);

  if (base && base.length) {
    const { regressed, fixed } = computeDelta(results, base);
    body += '\n### Delta vs base\n\n';
    if (!regressed.length && !fixed.length) {
      body += 'No change vs base branch.\n';
    } else {
      if (regressed.length) {
        body += `Regressed: ${regressed.map((f) => `\`${escapeCell(f)}\``).join(', ')}\n\n`;
      }
      if (fixed.length) {
        body += `Fixed: ${fixed.map((f) => `\`${escapeCell(f)}\``).join(', ')}\n`;
      }
    }
  } else {
    body += '\n_No baseline on the base branch yet — commit `goldset-results.json` to enable delta checks._\n';
  }

  return body.trimEnd() + '\n';
}

/**
 * Post (or update) the Goldset comment on a PR. An existing comment is matched
 * only by the hidden marker AND a Bot author, so a human quoting the marker
 * can't hijack the bot's comment. Returns the action taken for tests.
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
    (c) => c.user?.type === 'Bot' && c.body?.includes(COMMENT_MARKER)
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
