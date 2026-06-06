import { FastifyInstance } from "fastify";
import { ClassifyTaskInput, ClassifyResult } from "../schemas/classify.js";
import type { ClassifyResultType } from "../schemas/classify.js";
import { isDeepSeekConfigured, DeepSeekClient, llmJson } from "../llm/index.js";

export async function classifyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/classify/task", async (req) => {
    const input = ClassifyTaskInput.parse(req.body);

    if (isDeepSeekConfigured() && process.env.ENABLE_LLM_CLASSIFY === "true") {
      const llmResult = await classifyWithLLM(input.prompt);
      if (llmResult) return llmResult;
    }

    return classifyMock(input.prompt);
  });
}

async function classifyWithLLM(prompt: string): Promise<ClassifyResultType | null> {
  const client = new DeepSeekClient();
  const result = await llmJson(client, ClassifyResult, [
    {
      role: "system",
      content: `You are a task classifier for a software development agent platform.
Given a user prompt, classify it into a structured result.

Return valid JSON matching this schema:
{
  "intent": "ask" or "do",
  "task_type": one of "answer", "code_edit", "debug", "test_fix", "architecture", "provider_setup", "deploy", "payment_sensitive",
  "complexity_score": 1-100 integer,
  "risk_score": 1-100 integer,
  "ambiguity_score": 1-100 integer,
  "estimated_steps": positive integer,
  "requires_approval": string array of approval types needed (e.g. ["deploy_approval"]),
  "suggested_sequence": string array of recommended action names,
  "reasoning": brief explanation of classification
}

Guidelines:
- "ask" intent = information request; "do" intent = action request
- risk_score: low (1-20) for reads/answers, medium (21-50) for code edits, high (51-80) for deploys, critical (81-100) for payments
- suggested_sequence should use action names: classify_task, read_file, grep, write_file, run_tests, summarize_diff, request_approval, commit, retrieve_context, search_memory`,
    },
    { role: "user", content: prompt },
  ]);

  if (result.success) return result.data;
  return null;
}

function classifyMock(prompt: string): ClassifyResultType {
  const lower = prompt.toLowerCase();

  const isQuestion =
    lower.includes("what") ||
    lower.includes("how") ||
    lower.includes("why") ||
    lower.includes("explain") ||
    lower.startsWith("is ");

  const hasTest =
    lower.includes("test") || lower.includes("spec") || lower.includes("failing");
  const hasFix =
    lower.includes("fix") || lower.includes("bug") || lower.includes("error");
  const hasDeploy = lower.includes("deploy") || lower.includes("release");
  const hasPayment =
    lower.includes("payment") || lower.includes("billing") || lower.includes("credit");

  let task_type: ClassifyResultType["task_type"] = "code_edit";
  let risk_score = 20;
  const requires_approval: string[] = [];

  if (isQuestion) {
    task_type = "answer";
    risk_score = 5;
  } else if (hasPayment) {
    task_type = "payment_sensitive";
    risk_score = 95;
    requires_approval.push("payment_review", "manager_approval");
  } else if (hasDeploy) {
    task_type = "deploy";
    risk_score = 70;
    requires_approval.push("deploy_approval");
  } else if (hasTest && hasFix) {
    task_type = "test_fix";
    risk_score = 30;
  } else if (hasFix) {
    task_type = "debug";
    risk_score = 25;
  }

  const complexity_score = Math.min(100, Math.max(1, prompt.length));
  const ambiguity_score = isQuestion ? 60 : 30;

  const suggested_sequence =
    task_type === "answer"
      ? ["retrieve_context", "search_memory"]
      : [
          "classify_task",
          "read_file",
          "grep",
          "write_file",
          "run_tests",
          "summarize_diff",
        ];

  return {
    intent: isQuestion ? "ask" : "do",
    task_type,
    complexity_score,
    risk_score,
    ambiguity_score,
    estimated_steps: suggested_sequence.length,
    requires_approval,
    suggested_sequence,
    reasoning: `[mock] Classified prompt as ${task_type} based on keyword analysis`,
  };
}
