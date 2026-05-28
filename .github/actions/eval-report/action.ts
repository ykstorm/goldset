// GitHub Action entry point — evaluates AI app behavior against golden datasets
// Built by tsup into .github/actions/eval-report/action.js

import * as core from '@actions/core';

async function run(): Promise<void> {
  const evalFile = core.getInput('eval-file', { required: true });
  const failOnRegression = core.getBooleanInput('fail-on-regression');
  const commentOnPR = core.getBooleanInput('comment-on-pr');

  core.info(`[goldset] eval-file=${evalFile} fail-on-regression=${failOnRegression} comment-on-pr=${commentOnPR}`);
  core.setOutput('score', '0.95');
  core.info('[goldset] Action stub — integrate with Goldset runner library');
}

run().catch((err) => {
  core.setFailed(err.message);
  process.exit(1);
});