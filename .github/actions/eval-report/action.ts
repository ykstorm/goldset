import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import { execSync } from "child_process";

export interface EvalMetrics {
  metrics: Record<string, number>;
}

export interface MetricDelta {
  metric: string;
  base: number | null;
  head: number;
  delta: number | null;
  status: string;
}

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

    return JSON.parse(output);
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
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error}`);
  }
}

export function computeDeltas(
  baseMetrics: EvalMetrics | null,
  headMetrics: EvalMetrics
): MetricDelta[] {
  const deltas: MetricDelta[] = [];
  const baseMap = baseMetrics?.metrics || {};
  const headMap = headMetrics.metrics || {};

  // Track all metrics from head
  const allMetrics = new Set([...Object.keys(headMap), ...Object.keys(baseMap)]);

  for (const metric of allMetrics) {
    const baseValue = baseMap[metric];
    const headValue = headMap[metric];

    let delta: number | null = null;
    let status = "🆕 new";

    if (baseValue !== undefined && headValue !== undefined) {
      delta = headValue - baseValue;
      status = delta >= 0 ? "✅ pass" : "⚠️ regression";
    } else if (baseValue === undefined && headValue !== undefined) {
      status = "🆕 new";
    } else if (baseValue !== undefined && headValue === undefined) {
      status = "⚠️ regression";
    }

    deltas.push({
      metric,
      base: baseValue ?? null,
      head: headValue ?? 0,
      delta,
      status,
    });
  }

  return deltas.sort((a, b) => a.metric.localeCompare(b.metric));
}

export function formatCommentBody(deltas: MetricDelta[]): string {
  const tableRows = deltas
    .map((d) => {
      const baseStr = d.base !== null ? d.base.toFixed(3) : "—";
      const headStr = d.head.toFixed(3);
      const deltaStr =
        d.delta !== null
          ? `${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(3)}`
          : "—";

      return `| ${d.metric} | ${baseStr} | ${headStr} | ${deltaStr} | ${d.status} |`;
    })
    .join("\n");

  return (
    `<!-- vercel-ai-eval-report -->\n` +
    `## 📊 Eval Report\n\n` +
    `| Metric | Base | Head | Delta | Status |\n` +
    `|--------|------|------|-------|--------|\n` +
    `${tableRows}\n`
  );
}

export async function findOrCreateComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  const marker = "<!-- vercel-ai-eval-report -->";

  // List existing comments
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  const existing = comments.data.find((c) => c.body?.includes(marker));

  if (existing) {
    // Update existing comment
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated comment #${existing.id}`);
  } else {
    // Create new comment
    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    core.info(`Created comment #${response.data.id}`);
  }
}

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

run();
