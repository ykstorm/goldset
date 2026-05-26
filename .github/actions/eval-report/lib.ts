import * as github from "@actions/github";

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

export function parseEvalResults(jsonString: string): EvalMetrics {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error}`);
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
  const allMetrics = [...new Set([...Object.keys(headMap), ...Object.keys(baseMap)])];

  allMetrics.forEach((metric) => {
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
  });

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
  } else {
    // Create new comment
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}
