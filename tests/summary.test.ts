import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeSummary } from '../action/summary';
import type { EvalFileResult } from '../action/post-comment';

// The real core.summary writes to the file GITHUB_STEP_SUMMARY names, so these
// tests read back what a job summary would hold.
let dir: string;
let file: string;
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.GITHUB_STEP_SUMMARY;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldset-summary-'));
  file = path.join(dir, 'summary.md');
  process.env.GITHUB_STEP_SUMMARY = file;
});

beforeEach(() => {
  fs.writeFileSync(file, '');
});

afterAll(() => {
  if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
  else process.env.GITHUB_STEP_SUMMARY = previous;
  fs.rmSync(dir, { recursive: true, force: true });
});

const hostile: EvalFileResult[] = [
  {
    file: 'evil|<img src=https://example.test/x.png>.eval.ts',
    passed: true,
    summary: 'ok | <img src=https://example.test/y.png>',
  },
  {
    file: 'b.eval.ts',
    passed: false,
    error: 'boom <b>bold</b> | `x` @someone\nstderr line that stays in the log',
  },
];

describe('writeSummary', () => {
  it('escapes markup and pipes in an eval name, summary and error', async () => {
    await writeSummary(hostile);
    const out = fs.readFileSync(file, 'utf8');

    // Outside the heading, a "<" is only allowed after a backslash, which is
    // how escapeCell writes it.
    expect(out.replace('<h1>Goldset Eval Results</h1>', '')).not.toMatch(/(?<!\\)</);
    expect(out).toContain('\\<img');
    expect(out).toContain('\\<b\\>bold');
    expect(out).toContain('\\|');
    expect(out).toContain('\\@someone');
    expect(out).not.toContain('stderr line');
  });

  it('keeps one row per eval, with three cells in each', async () => {
    await writeSummary(hostile);
    const rows = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('| '));

    // The header and the two evals; the separator row starts with "|-".
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // Cells are split on pipes that are not escaped: "| a | b | c |" has four.
      expect(row.split(/(?<!\\)\|/)).toHaveLength(5);
    }
  });

  it('puts a blank line between the heading and the table', async () => {
    await writeSummary([{ file: 'a.eval.ts', passed: true, summary: 'ok' }]);
    const out = fs.readFileSync(file, 'utf8');

    expect(out).toMatch(/<h1>Goldset Eval Results<\/h1>\r?\n\r?\n\| eval \| status \| details \|/);
    expect(out).toContain('| `a.eval.ts` | PASS | ok |');
  });

  it('writes nothing when there is no summary file', async () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    try {
      await writeSummary(hostile);
    } finally {
      process.env.GITHUB_STEP_SUMMARY = file;
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('');
  });
});
