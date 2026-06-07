import type { ClassifierProvider, ClassificationResult } from "../ClassifierProvider.js";
import type { ProviderStatus } from "../registry.js";

const TASK_PATTERNS: Record<string, { task_type: string; risk: number }> = {
  fix: { task_type: "debug", risk: 30 },
  bug: { task_type: "debug", risk: 30 },
  test: { task_type: "test_fix", risk: 20 },
  refactor: { task_type: "code_edit", risk: 40 },
  add: { task_type: "code_edit", risk: 35 },
  create: { task_type: "code_edit", risk: 35 },
  deploy: { task_type: "deploy", risk: 80 },
  architect: { task_type: "architecture", risk: 50 },
  design: { task_type: "architecture", risk: 50 },
  explain: { task_type: "answer", risk: 5 },
  what: { task_type: "answer", risk: 5 },
  how: { task_type: "answer", risk: 10 },
  why: { task_type: "answer", risk: 10 },
};

export class MockClassifierProvider implements ClassifierProvider {
  readonly name = "mock-classifier";
  readonly status: ProviderStatus = "mock";

  async classify(prompt: string): Promise<ClassificationResult> {
    const lower = prompt.toLowerCase();
    let task_type = "code_edit";
    let risk = 25;
    let intent: "ask" | "do" = "do";
    const hasTest = lower.includes("test") || lower.includes("spec") || lower.includes("failing");
    const hasFix = lower.includes("fix") || lower.includes("bug") || lower.includes("error");

    if (hasTest && hasFix) {
      task_type = "test_fix";
      risk = 30;
    } else {
      for (const [keyword, info] of Object.entries(TASK_PATTERNS)) {
        if (lower.includes(keyword)) {
          task_type = info.task_type;
          risk = info.risk;
          break;
        }
      }
    }

    if (task_type === "answer") intent = "ask";

    const words = prompt.split(/\s+/).length;
    const complexity = Math.min(100, Math.max(10, words * 3));
    const steps = Math.ceil(complexity / 20);

    return {
      intent,
      task_type,
      complexity_score: complexity,
      risk_score: risk,
      ambiguity_score: Math.min(100, words * 2),
      estimated_steps: steps,
      requires_approval: risk > 60 ? ["request_approval"] : [],
      suggested_sequence: ["classify_task", "read_file", "grep"],
      reasoning: `Mock classifier: matched keyword pattern, estimated ${steps} steps`,
    };
  }
}
