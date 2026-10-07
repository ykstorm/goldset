import * as core from '@actions/core';
import { buildResultsTable, type EvalFileResult } from './post-comment';

/**
 * Write the results to the job summary. core.summary.addTable would put each
 * cell into HTML as it is, so the table is built as markdown instead, with the
 * same escaping as the PR comment. The blank line after the heading ends its
 * HTML block, so the table that follows is read as a table.
 */
export async function writeSummary(results: EvalFileResult[]): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await core.summary
    .addHeading('Goldset Eval Results')
    .addEOL()
    .addRaw(buildResultsTable(results), true)
    .write();
}
