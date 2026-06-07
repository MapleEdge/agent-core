import { FastifyInstance } from "fastify";
import { getCapabilityMatrix } from "./registry.js";

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/providers/capabilities", async () => ({
    capabilities: getCapabilityMatrix(),
  }));
}
