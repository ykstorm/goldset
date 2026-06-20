import { describe, it, expect, vi } from 'vitest';
import {
  buildCommentBody,
  computeDelta,
  postComment,
  COMMENT_MARKER,
  type EvalFileResult,
  type CommentApi,
} from '../action/post-comment';

const current: EvalFileResult[] = [
  { file: 'a.eval.ts', passed: true, summary: 'golden 2/2' },
  { file: 'b.eval.ts', passed: false, error: 'eval exited 1' },
  { file: 'c.eval.ts', passed: true, summary: 'structural 1/1' },
];

const base: EvalFileResult[] = [
  { file: 'a.eval.ts', passed: true },
  { file: 'b.eval.ts', passed: true }, // was passing, now fails -> regression
  { file: 'c.eval.ts', passed: false }, // was failing, now passes -> fixed
];

describe('computeDelta', () => {
  it('detects regressed and fixed evals against base', () => {
    const { regressed, fixed } = computeDelta(current, base);
    expect(regressed).toEqual(['b.eval.ts']);
    expect(fixed).toEqual(['c.eval.ts']);
  });

  it('ignores brand-new eval files (not in base)', () => {
    const { regressed, fixed } = computeDelta(
      [{ file: 'new.eval.ts', passed: false }],
      base
    );
    expect(regressed).toEqual([]);
    expect(fixed).toEqual([]);
  });
});

describe('buildCommentBody', () => {
  it('renders a results table with pass/fail markers and a hidden marker', () => {
    const body = buildCommentBody(current);
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('## Goldset eval results');
    expect(body).toContain('**2/3 eval files passed.**');
    expect(body).toContain('| `a.eval.ts` | ✅ pass | golden 2/2 |');
    expect(body).toContain('| `b.eval.ts` | ❌ fail | eval exited 1 |');
    // No base provided => no delta section.
    expect(body).not.toContain('Delta vs base');
  });

  it('renders a delta section when base results are provided', () => {
    const body = buildCommentBody(current, base);
    expect(body).toContain('### Delta vs base');
    expect(body).toContain('🔴 Regressed:');
    expect(body).toContain('`b.eval.ts`');
    expect(body).toContain('🟢 Fixed:');
    expect(body).toContain('`c.eval.ts`');
  });

  it('says "No change" when base matches current', () => {
    const body = buildCommentBody(
      [{ file: 'a.eval.ts', passed: true }],
      [{ file: 'a.eval.ts', passed: true }]
    );
    expect(body).toContain('No change vs base branch.');
  });

  it('escapes pipe characters in details so the table is not broken', () => {
    const body = buildCommentBody([
      { file: 'x.eval.ts', passed: false, error: 'a | b | c' },
    ]);
    expect(body).toContain('a \\| b \\| c');
  });
});

function makeApi(existingComments: { id: number; body?: string }[]): {
  api: CommentApi;
  created: ReturnType<typeof vi.fn>;
  updated: ReturnType<typeof vi.fn>;
} {
  const created = vi.fn().mockResolvedValue({});
  const updated = vi.fn().mockResolvedValue({});
  const api: CommentApi = {
    listComments: vi.fn().mockResolvedValue({ data: existingComments }),
    createComment: created,
    updateComment: updated,
  };
  return { api, created, updated };
}

describe('postComment (update-vs-create)', () => {
  const ctx = { owner: 'ykstorm', repo: 'goldset', issueNumber: 7 };

  it('CREATES a comment when none exists', async () => {
    const { api, created, updated } = makeApi([
      { id: 1, body: 'some unrelated review comment' },
    ]);
    const action = await postComment(api, ctx, buildCommentBody(current, base));
    expect(action).toBe('created');
    expect(created).toHaveBeenCalledOnce();
    expect(updated).not.toHaveBeenCalled();
    const arg = created.mock.calls[0][0];
    expect(arg.issue_number).toBe(7);
    expect(arg.body).toContain('## Goldset eval results');
  });

  it('UPDATES the existing Goldset comment instead of duplicating', async () => {
    const { api, created, updated } = makeApi([
      { id: 1, body: 'unrelated' },
      { id: 42, body: `${COMMENT_MARKER}\n## Goldset eval results\n(old)` },
    ]);
    const action = await postComment(api, ctx, buildCommentBody(current, base));
    expect(action).toBe('updated');
    expect(updated).toHaveBeenCalledOnce();
    expect(created).not.toHaveBeenCalled();
    expect(updated.mock.calls[0][0].comment_id).toBe(42);
  });
});
