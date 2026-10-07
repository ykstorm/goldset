import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// tsx refuses top-level await in a project whose package.json does not say
// "type": "module", so every eval file and doc snippet a user may copy keeps
// its awaits inside a function.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Number of awaits outside any function in a piece of TypeScript. */
function topLevelAwaits(code: string, name: string): number {
  const source = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isAwaitExpression(node)) count += 1;
    if (ts.isForOfStatement(node) && node.awaitModifier) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

function evalFiles(dir: string): string[] {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.eval.ts'))
    .map((f) => path.join(dir, f));
}

function docSnippets(file: string): { name: string; code: string }[] {
  const text = fs.readFileSync(path.join(root, file), 'utf-8');
  return [...text.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m, i) => ({ name: `${file} snippet ${i + 1}`, code: m[1] }));
}

const files = ['examples', 'evals', 'fixtures', 'tests/fixtures'].flatMap(evalFiles);
const snippets = ['README.md', 'docs/SETUP.md', 'docs/API.md'].flatMap(docSnippets);

describe('examples run in a CommonJS project', () => {
  it('finds top-level await when it is there', () => {
    expect(topLevelAwaits("const x = await f('a')", 'probe.ts')).toBe(1);
    expect(topLevelAwaits('async function main() { await f() }', 'probe.ts')).toBe(0);
    expect(files.length).toBeGreaterThan(3);
    expect(snippets.length).toBeGreaterThan(2);
  });

  it.each(files)('%s has no top-level await', (file) => {
    expect(topLevelAwaits(fs.readFileSync(path.join(root, file), 'utf-8'), file)).toBe(0);
  });

  it.each(snippets.map((s) => [s.name, s.code]))('%s has no top-level await', (name, code) => {
    expect(topLevelAwaits(code, name)).toBe(0);
  });
});
