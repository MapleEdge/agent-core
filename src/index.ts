import Fastify from "fastify";
import cors from "@fastify/cors";
import { memoryRoutes } from "./memory/routes.js";
import { contextRoutes } from "./context/routes.js";
import { sessionRoutes, traceRoutes } from "./traces/routes.js";
import { actionRoutes } from "./actions/routes.js";
import { rulesRoutes, seedDefaultRules } from "./rules/routes.js";
import { classifyRoutes } from "./api/classify.js";
import { policyRoutes, seedDefaultPolicies } from "./api/policy.js";
import { mockPlatformRoutes } from "./mock_platform/routes.js";
import { seedDefaultActions } from "./actions/defaults.js";
import { closeDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 3210);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", service: "agent-core" }));

  await app.register(memoryRoutes);
  await app.register(contextRoutes);
  await app.register(sessionRoutes);
  await app.register(traceRoutes);
  await app.register(actionRoutes);
  await app.register(rulesRoutes);
  await app.register(classifyRoutes);
  await app.register(policyRoutes);
  await app.register(mockPlatformRoutes);

  seedDefaultActions();
  seedDefaultRules();
  seedDefaultPolicies();

  app.addHook("onClose", () => {
    closeDb();
  });

  await app.listen({ port: PORT, host: HOST });
  console.log(`agent-core listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start agent-core:", err);
  process.exit(1);
});
