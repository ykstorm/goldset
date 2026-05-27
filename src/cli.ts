#!/usr/bin/env node
/**
 * Goldset CLI — run evals from the command line.
 * Usage: goldset --eval ./my.eval.ts
 */
async function main() {
  console.log('[goldset] CLI stub — use as library or GitHub Action');
  process.exit(0);
}

main().catch((err) => {
  console.error('[goldset] Fatal:', err);
  process.exit(1);
});
