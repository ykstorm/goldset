import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// The runner only warns about an input the Action does not declare, so a
// stale `with:` key in a workflow passes CI unnoticed. This keeps the repo's
// own workflows in step with action.yml.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string[] => fs.readFileSync(path.join(root, file), 'utf-8').split(/\r?\n/);
const indent = (line: string): number => line.length - line.trimStart().length;

/** Input names declared under `inputs:` in action.yml. */
function declaredInputs(): Set<string> {
  const names = new Set<string>();
  let inInputs = false;
  for (const line of read('action.yml')) {
    if (/^\S/.test(line)) inInputs = line.startsWith('inputs:');
    const m = inInputs ? /^ {2}([\w-]+):/.exec(line) : null;
    if (m) names.add(m[1]);
  }
  return names;
}

/** Keys under `with:` for every step that runs the local Action (`uses: ./`). */
function inputsPassed(lines: string[]): string[] {
  const keys: string[] = [];
  lines.forEach((line, i) => {
    if (!/^\s*(- )?uses: \.\/\s*$/.test(line)) return;
    const stepIndent = indent(line.replace('- ', '  '));
    const withAt = lines.findIndex((l, j) => j > i && indent(l) === stepIndent && l.trim() === 'with:');
    if (withAt < 0) return;
    for (const l of lines.slice(withAt + 1)) {
      if (l.trim() === '' || l.trim().startsWith('#')) continue;
      if (indent(l) <= stepIndent) break;
      const m = /^\s*([\w-]+):/.exec(l);
      if (m) keys.push(m[1]);
    }
  });
  return keys;
}

const workflows = fs
  .readdirSync(path.join(root, '.github/workflows'))
  .filter((f) => f.endsWith('.yml'))
  .map((f) => path.join('.github/workflows', f));

describe('workflows that run the local Action', () => {
  it('reads the declared inputs', () => {
    expect([...declaredInputs()]).toEqual(
      expect.arrayContaining(['eval-dir', 'judge-provider', 'comment-on-pr', 'github-token', 'timeout-ms', 'pass-env'])
    );
    expect(inputsPassed(read('.github/workflows/ci.yml'))).toEqual(expect.arrayContaining(['eval-dir', 'comment-on-pr']));
  });

  it.each(workflows)('%s passes only inputs that action.yml declares', (file) => {
    const declared = declaredInputs();
    const unknown = inputsPassed(read(file)).filter((k) => !declared.has(k));
    expect(unknown).toEqual([]);
  });
});
