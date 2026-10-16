// Drives action/index.ts end to end with the Actions toolkit faked out, to pin
// how the entry point decides whether to fetch the base results, comment on
// the pull request, and call a failure a regression. The module runs on
// import, so each test imports a fresh copy and waits for the last log line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakePr {
  number: number;
  base?: { ref?: string };
}

const h = vi.hoisted(() => {
  const state = {
    inputs: {} as Record<string, string>,
    pr: undefined as FakePr | undefined,
    results: [] as Array<{ file: string; passed: boolean }>,
  };
  return {
    state,
    core: {
      getInput: vi.fn((name: string) => state.inputs[name] ?? ''),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      setOutput: vi.fn(),
      setFailed: vi.fn(),
      setSecret: vi.fn(),
    },
    getOctokit: vi.fn(),
    getContent: vi.fn(),
    listComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('@actions/core', () => h.core);
vi.mock('@actions/github', () => ({
  context: {
    get payload() {
      return { pull_request: h.state.pr };
    },
    repo: { owner: 'acme', repo: 'app' },
  },
  getOctokit: h.getOctokit,
}));
vi.mock('../action/run-evals', () => ({ runEvals: vi.fn(async () => h.state.results) }));
vi.mock('../action/summary', () => ({ writeSummary: vi.fn(async () => undefined) }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: h.writeFileSync };
});

function baseContent(base: Array<{ file: string; passed: boolean }>): { data: { content: string; encoding: string } } {
  return { data: { content: Buffer.from(JSON.stringify(base)).toString('base64'), encoding: 'base64' } };
}

async function runAction(): Promise<void> {
  vi.resetModules();
  await import('../action/index');
  await vi.waitFor(() => {
    expect(h.core.info).toHaveBeenCalledWith(expect.stringMatching(/eval files passed$/));
  });
}

const infoLines = (): string[] => h.core.info.mock.calls.map((c) => String(c[0]));
const warningLines = (): string[] => h.core.warning.mock.calls.map((c) => String(c[0]));
const failedWith = (): string[] => h.core.setFailed.mock.calls.map((c) => String(c[0]));

const NOT_A_PR = '[goldset] not a pull_request event, skipping PR comment';
const NO_TOKEN = '[goldset] GITHUB_TOKEN not available, skipping PR comment';

let savedExitCode: typeof process.exitCode;

beforeEach(() => {
  vi.clearAllMocks();
  savedExitCode = process.exitCode;
  // A rejected run() calls process.exit(1); keep the test worker alive if that happens.
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  vi.stubEnv('GITHUB_TOKEN', '');
  h.state.inputs = { 'github-token': 'token-for-tests' };
  h.state.pr = undefined;
  h.state.results = [{ file: 'a.eval.ts', passed: false }];
  h.getOctokit.mockImplementation(() => ({
    rest: {
      repos: { getContent: h.getContent },
      issues: { listComments: h.listComments, createComment: h.createComment, updateComment: h.updateComment },
    },
  }));
  h.getContent.mockResolvedValue(baseContent([{ file: 'a.eval.ts', passed: true }]));
  h.listComments.mockResolvedValue({ data: [] });
  h.createComment.mockResolvedValue({});
});

afterEach(() => {
  process.exitCode = savedExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('action entry: when to comment and compare', () => {
  it('notes that it is not a pull request and does not reach GitHub', async () => {
    await runAction();
    expect(infoLines()).toContain(NOT_A_PR);
    expect(warningLines()).not.toContain(NO_TOKEN);
    expect(h.getOctokit).not.toHaveBeenCalled();
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed']);
  });

  it('reports the missing pull request first when the token is missing too', async () => {
    h.state.inputs = {};
    await runAction();
    expect(infoLines()).toContain(NOT_A_PR);
    expect(warningLines()).not.toContain(NO_TOKEN);
    expect(h.getOctokit).not.toHaveBeenCalled();
  });

  it('warns when a pull request run has no token', async () => {
    h.state.inputs = {};
    h.state.pr = { number: 7, base: { ref: 'main' } };
    await runAction();
    expect(warningLines()).toContain(NO_TOKEN);
    expect(infoLines()).not.toContain(NOT_A_PR);
    expect(h.getOctokit).not.toHaveBeenCalled();
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed']);
  });

  it('says nothing about skipping when comments are turned off', async () => {
    h.state.inputs = { 'comment-on-pr': 'false' };
    await runAction();
    h.state.pr = { number: 7 };
    await runAction();
    expect(infoLines()).not.toContain(NOT_A_PR);
    expect(warningLines()).not.toContain(NO_TOKEN);
    expect(h.getOctokit).not.toHaveBeenCalled();
  });

  it('diffs against the base branch, comments, and names the regression', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    await runAction();
    expect(h.getOctokit).toHaveBeenCalledWith('token-for-tests');
    expect(h.getContent).toHaveBeenCalledWith({ owner: 'acme', repo: 'app', path: 'goldset-results.json', ref: 'main' });
    expect(h.listComments).toHaveBeenCalledWith({ owner: 'acme', repo: 'app', issue_number: 7 });
    expect(h.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'app', issue_number: 7, body: expect.stringContaining('Regressed: `a.eval.ts`') })
    );
    expect(infoLines()).toContain('[goldset] PR comment created');
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed (regression vs base branch)']);
  });

  it('updates the existing bot comment instead of adding another', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    h.listComments.mockResolvedValue({
      data: [{ id: 99, user: { type: 'Bot' }, body: '<!-- goldset-eval-comment --> old' }],
    });
    await runAction();
    expect(h.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 99 }));
    expect(h.createComment).not.toHaveBeenCalled();
    expect(infoLines()).toContain('[goldset] PR comment updated');
  });

  it('does not call a failure a regression when it also failed on the base branch', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    h.getContent.mockResolvedValue(baseContent([{ file: 'a.eval.ts', passed: false }]));
    await runAction();
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed']);
  });

  it('skips the base lookup when the pull request carries no base ref', async () => {
    h.state.pr = { number: 7 };
    await runAction();
    expect(h.getContent).not.toHaveBeenCalled();
    expect(h.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('No baseline on the base branch yet') })
    );
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed']);
  });

  it('still compares with the base branch when comments are turned off', async () => {
    h.state.inputs = { 'github-token': 'token-for-tests', 'comment-on-pr': 'false' };
    h.state.pr = { number: 7, base: { ref: 'main' } };
    await runAction();
    expect(h.getContent).toHaveBeenCalled();
    expect(h.listComments).not.toHaveBeenCalled();
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed (regression vs base branch)']);
  });

  it('warns and keeps the gate when the comment cannot be posted', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    h.listComments.mockRejectedValue(new Error('Resource not accessible by integration'));
    await runAction();
    expect(warningLines()).toContain('[goldset] could not post the PR comment: Resource not accessible by integration');
    expect(failedWith()).toEqual(['Goldset: 1/1 eval file(s) failed (regression vs base branch)']);
  });

  it('warns with the thrown value when it is not an Error', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    h.listComments.mockRejectedValue('rate limited');
    await runAction();
    expect(warningLines()).toContain('[goldset] could not post the PR comment: rate limited');
  });

  it('does not fail the step when every eval passes', async () => {
    h.state.pr = { number: 7, base: { ref: 'main' } };
    h.state.results = [{ file: 'a.eval.ts', passed: true }];
    await runAction();
    expect(h.core.setFailed).not.toHaveBeenCalled();
    expect(infoLines()).toContain('[goldset] 1/1 eval files passed');
  });
});
