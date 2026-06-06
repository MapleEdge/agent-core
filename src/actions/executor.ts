import fs from "node:fs";
import path from "node:path";

const DEMO_REPO_DIR = path.join(process.cwd(), "examples", "demo_repo");

export function executeMockAction(
  actionName: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  switch (actionName) {
    case "classify_task":
      return {
        intent: "do",
        task_type: (params.task_type as string) ?? "code_edit",
        reasoning: "Mock classification based on input prompt",
      };

    case "read_file": {
      const filePath = params.path as string | undefined;
      if (!filePath) {
        return { error: "Missing path parameter" };
      }
      const safePath = path.join(DEMO_REPO_DIR, path.basename(filePath));
      try {
        const content = fs.readFileSync(safePath, "utf-8");
        return { path: filePath, content };
      } catch {
        return { path: filePath, content: `[mock] File content of ${filePath}` };
      }
    }

    case "grep": {
      const pattern = params.pattern as string | undefined;
      return {
        pattern: pattern ?? "*",
        matches: [
          { file: "src/index.ts", line: 1, content: `[mock] match for "${pattern}"` },
        ],
      };
    }

    case "write_file":
      return {
        path: params.path ?? "unknown",
        status: "mock_written",
        note: "No actual file written — mock execution only",
      };

    case "run_tests":
      return {
        passed: 3,
        failed: 0,
        skipped: 0,
        summary: "[mock] All tests passed",
      };

    case "summarize_diff":
      return {
        files_changed: 2,
        insertions: 15,
        deletions: 3,
        summary: "[mock] Updated login handler and added test",
      };

    case "request_approval":
      return {
        status: "pending",
        note: "Approval request forwarded to mock platform",
      };

    case "commit":
      return {
        status: "mock_committed",
        sha: "abc123def456",
        message: (params.message as string) ?? "[mock] commit",
      };

    case "search_memory":
      return {
        results: [
          { id: "mock-mem-1", content: "[mock] Relevant memory result", score: 0.85 },
        ],
      };

    case "retrieve_context":
      return {
        nodes: [
          { path: "repo/overview", content: "[mock] Repository overview context" },
        ],
      };

    default:
      return {
        action: actionName,
        status: "executed",
        note: `[mock] Generic execution of ${actionName}`,
        params,
      };
  }
}
