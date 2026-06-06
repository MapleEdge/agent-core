import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import {
  RepoOpenInput,
  WorktreeCreateInput,
  ExecutorSelectInput,
  CommitMockInput,
} from "../schemas/mock_platform.js";

export async function mockPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.post("/mock-platform/repos/open", async (req, reply) => {
    const input = RepoOpenInput.parse(req.body);
    const id = `repo-${uuid().slice(0, 8)}`;
    reply.code(201);
    return {
      repo_id: id,
      repo_url: input.repo_url,
      branch: input.branch,
      status: "opened",
      note: "[mock] In production, the platform would create a real worktree checkout",
    };
  });

  app.post("/mock-platform/worktrees/create", async (req, reply) => {
    const input = WorktreeCreateInput.parse(req.body);
    const id = `wt-${uuid().slice(0, 8)}`;
    reply.code(201);
    return {
      worktree_id: id,
      repo_id: input.repo_id,
      branch: input.branch,
      session_id: input.session_id ?? null,
      path: `/mock/worktrees/${id}`,
      status: "created",
      note: "[mock] In production, this would be a real git worktree",
    };
  });

  app.post("/mock-platform/executors/select", async (req) => {
    const input = ExecutorSelectInput.parse(req.body);
    const complexity = input.complexity_score ?? 50;
    const executor =
      complexity > 70
        ? "openhands"
        : complexity > 40
          ? "aider"
          : "direct";
    return {
      executor,
      task_type: input.task_type,
      complexity_score: complexity,
      note: `[mock] Selected ${executor} based on complexity ${complexity}`,
    };
  });

  app.post("/mock-platform/commits/mock", async (req, reply) => {
    const input = CommitMockInput.parse(req.body);
    const sha = uuid().replace(/-/g, "").slice(0, 12);
    reply.code(201);
    return {
      commit_sha: sha,
      session_id: input.session_id,
      repo_id: input.repo_id,
      message: input.message,
      files: input.files,
      status: "mock_committed",
      note: "[mock] In production, the platform would create a real git commit",
    };
  });
}
