import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Library entry. Emit .mjs (ESM) + .cjs (CJS) so package.json `exports`
    // resolve to files that exist, and `require` gets real CJS.
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: false,
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
