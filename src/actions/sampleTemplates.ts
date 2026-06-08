/**
 * Sample plan templates injected into the LLM prompt.
 *
 * These are examples, not constraints. The LLM may deviate entirely.
 * Templates show the LLM what well-formed plans look like for each mode.
 */

export interface SampleTemplate {
  name: string;
  description: string;
  mode: "finite" | "loop" | "open_ended";
  steps: string[];
}

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    name: "targeted_bug_fix",
    description:
      "Investigate a specific bug, apply a fix, validate with tests, then commit.",
    mode: "finite",
    steps: [
      "retrieve_context",
      "search_memory",
      "grep",
      "read_file",
      "apply_patch",
      "run_tests",
      "summarize_diff",
      "commit",
    ],
  },
  {
    name: "code_review",
    description:
      "Read files, check for issues, summarize findings. No mutations.",
    mode: "finite",
    steps: ["retrieve_context", "grep", "read_file", "summarize_diff"],
  },
  {
    name: "iterative_improvement_loop",
    description:
      "Find the next highest-value improvement, fix it, validate, commit, repeat.",
    mode: "loop",
    steps: [
      "retrieve_context",
      "search_memory",
      "grep",
      "read_file",
      "apply_patch",
      "run_tests",
      "summarize_diff",
      "commit",
    ],
  },
  {
    name: "open_ended_code_improvement_loop",
    description:
      "Investigate, edit, validate, summarize, commit when platform permits, then continue with the next highest-value improvement.",
    mode: "open_ended",
    steps: [
      "retrieve_context",
      "search_memory",
      "grep",
      "read_file",
      "apply_patch",
      "run_tests",
      "summarize_diff",
      "commit",
    ],
  },
  {
    name: "context_gathering",
    description:
      "Gather repo context and memory before deciding on changes. Read-only.",
    mode: "finite",
    steps: ["retrieve_context", "search_memory", "grep", "read_file"],
  },
  {
    name: "feature_implementation",
    description:
      "Implement a new feature: discover existing code, add new files/code, write tests, validate.",
    mode: "finite",
    steps: [
      "grep",
      "read_file",
      "read_file",
      "apply_patch",
      "apply_patch",
      "apply_patch",
      "run_tests",
      "summarize_diff",
      "commit",
    ],
  },
  {
    name: "add_provider_or_adapter",
    description:
      "Add a new provider/adapter: inspect interface, create adapter, add routes, add schemas, write tests.",
    mode: "finite",
    steps: [
      "grep",
      "read_file",
      "read_file",
      "apply_patch",
      "apply_patch",
      "apply_patch",
      "apply_patch",
      "run_tests",
      "summarize_diff",
      "commit",
    ],
  },
];
