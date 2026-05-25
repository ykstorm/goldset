import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(),
  context: {
    payload: { pull_request: { number: 1 } },
    repo: { owner: "owner", repo: "repo" },
  },
}));

import {
  readHeadResults,
  computeDeltas,
  formatCommentBody,
  findOrCreateComment,
  type EvalMetrics,
  type MetricDelta,
} from "./action";

describe("eval-report action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readHeadResults", () => {
    it("should read valid JSON file", () => {
      const tempFile = "/tmp/test-results.json";
      const data = { metrics: { accuracy: 0.95, precision: 0.92 } };
      fs.writeFileSync(tempFile, JSON.stringify(data));

      const result = readHeadResults(tempFile);
      expect(result).toEqual(data);

      fs.unlinkSync(tempFile);
    });

    it("should throw on missing file", () => {
      expect(() => readHeadResults("/tmp/nonexistent.json")).toThrow(
        /not found/
      );
    });

    it("should throw on malformed JSON", () => {
      const tempFile = "/tmp/bad.json";
      fs.writeFileSync(tempFile, "{ invalid json }");

      expect(() => readHeadResults(tempFile)).toThrow(/Invalid JSON/);

      fs.unlinkSync(tempFile);
    });

    it("should handle empty metrics object", () => {
      const tempFile = "/tmp/empty.json";
      fs.writeFileSync(tempFile, JSON.stringify({ metrics: {} }));

      const result = readHeadResults(tempFile);
      expect(result.metrics).toEqual({});

      fs.unlinkSync(tempFile);
    });
  });

  describe("computeDeltas", () => {
    it("test case 1: should compute improvement (positive delta)", () => {
      const base = { metrics: { accuracy: 0.9 } };
      const head = { metrics: { accuracy: 0.95 } };

      const deltas = computeDeltas(base, head);

      expect(deltas).toHaveLength(1);
      expect(deltas[0].metric).toBe("accuracy");
      expect(deltas[0].base).toBe(0.9);
      expect(deltas[0].head).toBe(0.95);
      expect(deltas[0].delta).toBeCloseTo(0.05, 5);
      expect(deltas[0].status).toBe("✅ pass");
    });

    it("test case 2: should detect regression (negative delta)", () => {
      const base = { metrics: { f1_score: 0.88 } };
      const head = { metrics: { f1_score: 0.85 } };

      const deltas = computeDeltas(base, head);

      expect(deltas).toHaveLength(1);
      expect(deltas[0].status).toBe("⚠️ regression");
      expect(deltas[0].delta).toBeCloseTo(-0.03, 5);
    });

    it("test case 3: should mark new metrics as new", () => {
      const base = { metrics: { accuracy: 0.9 } };
      const head = { metrics: { accuracy: 0.9, recall: 0.88 } };

      const deltas = computeDeltas(base, head);

      expect(deltas).toHaveLength(2);
      const recallDelta = deltas.find((d) => d.metric === "recall");
      expect(recallDelta?.status).toBe("🆕 new");
      expect(recallDelta?.delta).toBeNull();
    });

    it("test case 4: should handle null base metrics (no base branch)", () => {
      const head = { metrics: { accuracy: 0.95, precision: 0.92 } };

      const deltas = computeDeltas(null, head);

      expect(deltas).toHaveLength(2);
      deltas.forEach((d) => {
        expect(d.base).toBeNull();
        expect(d.status).toBe("🆕 new");
      });
    });

    it("test case 5: should handle mixed improvements and regressions", () => {
      const base = { metrics: { acc: 0.9, f1: 0.88, recall: 0.85 } };
      const head = { metrics: { acc: 0.95, f1: 0.85, recall: 0.9 } };

      const deltas = computeDeltas(base, head);

      expect(deltas).toHaveLength(3);
      expect(deltas[0].status).toBe("✅ pass");
      expect(deltas[1].status).toBe("⚠️ regression");
      expect(deltas[2].status).toBe("✅ pass");
    });

    it("test case 6: should sort metrics alphabetically", () => {
      const base = { metrics: { zebra: 1, apple: 2, banana: 3 } };
      const head = { metrics: { zebra: 2, apple: 3, banana: 4 } };

      const deltas = computeDeltas(base, head);

      expect(deltas.map((d) => d.metric)).toEqual(["apple", "banana", "zebra"]);
    });

    it("test case 7: should handle zero delta (no change)", () => {
      const base = { metrics: { score: 0.75 } };
      const head = { metrics: { score: 0.75 } };

      const deltas = computeDeltas(base, head);

      expect(deltas[0].delta).toBe(0);
      expect(deltas[0].status).toBe("✅ pass");
    });
  });

  describe("formatCommentBody", () => {
    it("test case 8: should format table with marker comment", () => {
      const deltas = [
        {
          metric: "accuracy",
          base: 0.9,
          head: 0.95,
          delta: 0.05,
          status: "✅ pass",
        },
      ];

      const body = formatCommentBody(deltas);

      expect(body).toContain("<!-- vercel-ai-eval-report -->");
      expect(body).toContain("## 📊 Eval Report");
      expect(body).toContain("| Metric | Base | Head | Delta | Status |");
      expect(body).toContain("| accuracy | 0.900 | 0.950 | +0.050 | ✅ pass |");
    });

    it("test case 9: should format null base as —", () => {
      const deltas = [
        {
          metric: "new_metric",
          base: null,
          head: 0.88,
          delta: null,
          status: "🆕 new",
        },
      ];

      const body = formatCommentBody(deltas);

      expect(body).toContain("| new_metric | — | 0.880 | — | 🆕 new |");
    });

    it("test case 10: should format negative delta with minus sign", () => {
      const deltas = [
        {
          metric: "f1",
          base: 0.88,
          head: 0.85,
          delta: -0.03,
          status: "⚠️ regression",
        },
      ];

      const body = formatCommentBody(deltas);

      expect(body).toContain("| f1 | 0.880 | 0.850 | -0.030 | ⚠️ regression |");
    });

    it("test case 11: should handle multiple metrics", () => {
      const deltas = [
        {
          metric: "accuracy",
          base: 0.9,
          head: 0.95,
          delta: 0.05,
          status: "✅ pass",
        },
        {
          metric: "precision",
          base: 0.88,
          head: 0.9,
          delta: 0.02,
          status: "✅ pass",
        },
      ];

      const body = formatCommentBody(deltas);

      expect(body).toContain("| accuracy |");
      expect(body).toContain("| precision |");
    });
  });

  describe("findOrCreateComment", () => {
    it("test case 12: should create new comment if none exists", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listComments: vi.fn().mockResolvedValue({ data: [] }),
            createComment: vi
              .fn()
              .mockResolvedValue({ data: { id: 123 } }),
          },
        },
      };

      await findOrCreateComment(
        mockOctokit as any,
        "owner",
        "repo",
        42,
        "# Test"
      );

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        body: "# Test",
      });
    });

    it("test case 13: should update existing comment with marker", async () => {
      const mockCreateComment = vi.fn();
      const mockUpdateComment = vi.fn().mockResolvedValue({ data: { id: 123 } });
      const mockListComments = vi.fn().mockResolvedValue({
        data: [
          { id: 123, body: "<!-- vercel-ai-eval-report -->\nOld content" },
        ],
      });

      const mockOctokit = {
        rest: {
          issues: {
            listComments: mockListComments,
            updateComment: mockUpdateComment,
            createComment: mockCreateComment,
          },
        },
      };

      await findOrCreateComment(
        mockOctokit as any,
        "owner",
        "repo",
        42,
        "# New content"
      );

      expect(mockUpdateComment).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        comment_id: 123,
        body: "# New content",
      });
      expect(mockCreateComment).not.toHaveBeenCalled();
    });

    it("test case 14: should find comment by marker among multiple comments", async () => {
      const mockOctokit = {
        rest: {
          issues: {
            listComments: vi.fn().mockResolvedValue({
              data: [
                { id: 111, body: "Random comment 1" },
                {
                  id: 222,
                  body: "<!-- vercel-ai-eval-report -->\nEval report",
                },
                { id: 333, body: "Random comment 2" },
              ],
            }),
            updateComment: vi.fn().mockResolvedValue({ data: { id: 222 } }),
          },
        },
      };

      await findOrCreateComment(
        mockOctokit as any,
        "owner",
        "repo",
        42,
        "# Updated"
      );

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 222 })
      );
    });

    it("test case 15: should handle empty metrics", () => {
      const base = { metrics: {} };
      const head = { metrics: {} };

      const deltas = computeDeltas(base, head);
      const body = formatCommentBody(deltas);

      expect(body).toContain("<!-- vercel-ai-eval-report -->");
      expect(body).toContain("## 📊 Eval Report");
    });
  });
});
