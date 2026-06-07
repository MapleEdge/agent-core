import { FastifyInstance } from "fastify";
import { ClassifyTaskInput } from "../schemas/classify.js";
import { getProvider } from "../providers/registry.js";

export async function classifyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/classify/task", async (req) => {
    const input = ClassifyTaskInput.parse(req.body);
    return getProvider("classifier").classify(input.prompt);
  });
}
