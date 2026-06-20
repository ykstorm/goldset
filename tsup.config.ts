import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Library + CLI entries. Emit .mjs (ESM) + .cjs (CJS) so package.json
    // `exports` resolve to files that actually exist. Previously
    // `exports.import` / `module` pointed at dist/index.mjs which tsup never
    // emitted, so a bare `import '@ykstormsorg/goldset'` threw
    // ERR_MODULE_NOT_FOUND, and `require` pointed at dist/index.js which was
    // actually ESM (the package is `"type": "module"`).
    entry: ['src/index.ts', 'src/cli.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' };
    },
  },
  {
    // Public GitHub Action entry — bundled CJS for `runs.using: node20`.
    entry: { action: 'action/index.ts' },
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
    outExtension() {
      return { js: '.cjs' };
    },
  },
]);
