import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import { execSync } from "child_process";
import {
  computeDeltas,
  formatCommentBody,
  findOrCreateComment,
  parseEvalResults,
  type EvalMetrics,
} from "./lib";

export interface MetricDelta {
  metric: string;
  base: number | null;
  head: number;
  delta: number | null;
  status: string;
}

// Export for backwards compatibility
export { EvalMetrics } from "./lib";

export async function getResultsFromRef(
  path: string,
  ref: string | null
): Promise<EvalMetrics | null> {
  try {
    if (!ref) {
      return null;
    }

    const command = `git show origin/${ref}:${path}`;
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });

    return parseEvalResults(output);
  } catch (error) {
    core.info(`Could not fetch results from ${ref}: ${error}`);
    return null;
  }
}

export function readHeadResults(path: string): EvalMetrics {
  if (!fs.existsSync(path)) {
    throw new Error(`Results file not found: ${path}`);
  }

  const content = fs.readFileSync(path, "utf-8");
  return parseEvalResults(content);
}

// Re-export pure functions for backwards compatibility
export { computeDeltas, formatCommentBody, findOrCreateComment };

async function run(): Promise<void> {
  try {
    const resultsPath = core.getInput("results-path") || "dist/eval-results.json";
    const baseRef = core.getInput("base-ref");
    const token = core.getInput("token");

    // Ensure we're in a PR context
    const pr = github.context.payload.pull_request;
    if (!pr) {
      throw new Error(
        "This action only works in pull request context (not push)"
      );
    }

    core.info(`Results path: ${resultsPath}`);
    core.info(`Base ref: ${baseRef || "none"}`);

    // Read head results
    const headMetrics = readHeadResults(resultsPath);
    core.info(`Read head metrics: ${Object.keys(headMetrics.metrics).length} metrics`);

    // Fetch base results
    const baseMetrics = await getResultsFromRef(resultsPath, baseRef);

    // Compute deltas
    const deltas = computeDeltas(baseMetrics, headMetrics);
    core.info(`Computed ${deltas.length} metric comparisons`);

    // Format and post comment
    const body = formatCommentBody(deltas);

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    await findOrCreateComment(octokit, owner, repo, pr.number, body);

    core.info("✅ Eval report posted successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

// Only run if this is the main module (not imported for tests)
if (require.main === module) {
  run().catch(err => {
    core.setFailed(err.message);
  });
}
