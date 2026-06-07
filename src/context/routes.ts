import { FastifyInstance } from "fastify";
import {
  ContextSearchInput,
  ContextLinkInput,
  ContextPromoteInput,
} from "../schemas/context.js";
import { getProvider } from "../providers/registry.js";

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.post("/context/repos/:repo_id/onboard", async (req, reply) => {
    const { repo_id } = req.params as { repo_id: string };
    const provider = getProvider("context");
    const existing = await provider.getTree(repo_id);
    if (existing) {
      return { repo_id, status: "already_onboarded" };
    }
    const tree = await provider.onboard(repo_id);
    reply.code(201);
    return { repo_id, status: "onboarded", tree };
  });

  app.get("/context/repos/:repo_id/tree", async (req) => {
    const { repo_id } = req.params as { repo_id: string };
    const tree = await getProvider("context").getTree(repo_id);
    if (!tree) {
      return { error: "repo not onboarded" };
    }
    return { repo_id, tree };
  });

  app.post("/context/search", async (req) => {
    const input = ContextSearchInput.parse(req.body);
    const results = await getProvider("context").search(input.query, input.repo_id);
    const filtered = input.path
      ? results.filter((result) => result.path === input.path || result.path.startsWith(`${input.path}/`))
      : results;
    return { results: filtered };
  });

  app.post("/context/link", async (req, reply) => {
    const input = ContextLinkInput.parse(req.body);
    const link = await getProvider("context").link(
      input.source_repo,
      input.source_path,
      input.target_repo,
      input.target_path,
      input.relation,
    );
    reply.code(201);
    return link;
  });

  app.post("/context/promote", async (req) => {
    const input = ContextPromoteInput.parse(req.body);
    const promoted = await getProvider("context").promote(input.repo_id, input.path, input.content);
    if (!promoted) {
      return { error: "repo not onboarded" };
    }
    return { repo_id: input.repo_id, path: input.path, status: "promoted" };
  });
}
