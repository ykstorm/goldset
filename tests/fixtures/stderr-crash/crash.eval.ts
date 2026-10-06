// Used by tests/run-evals.test.ts. Writes 30 lines to stderr and exits 3
// without printing a result, the way an eval that crashes does.
for (let i = 1; i <= 30; i += 1) console.error(`stderr line ${i}`);
process.exitCode = 3;
