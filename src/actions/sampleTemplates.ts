/**
 * Sample plan templates injected into the LLM prompt.
 *
 * These are examples, not constraints. The LLM may deviate entirely.
 * Templates show the LLM what well-formed plans look like for each mode.
 *
 * OpenViking-specific and other context-specific templates are included
 * here rather than in the generic prompt rules.
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
      "inspect_repo",
      "grep",
      "read_file",
      "read_file",
      "apply_patch",
      "apply_patch",
      "apply_patch",
      "run_tests",
      "run_lint",
      "run_typecheck",
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
      "inspect_repo",
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
  {
    name: "provider_parity_loop",
    description:
      "Improve a provider toward vendor/reference parity one slice at a time. Each iteration: search vendor code, read current impl, edit tests first, edit impl, run tests, summarize remaining gaps.",
    mode: "loop",
    steps: [
      "retrieve_context",
      "search_memory",
      "grep",
      "grep",
      "read_file",
      "read_file",
      "apply_patch",
      "apply_patch",
      "run_tests",
      "summarize_diff",
    ],
  },
  {
    name: "service_update_and_verify",
    description:
      "Update a service from GitHub, restart, and verify health.",
    mode: "finite",
    steps: [
      "list_services",
      "inspect_service_status",
      "update_latest_from_github",
      "health_check",
      "summarize_result",
    ],
  },
  {
    name: "pr_workflow",
    description:
      "Create a PR, wait for CI, check status, and merge if green.",
    mode: "finite",
    steps: [
      "summarize_diff",
      "commit",
      "push_branch",
      "create_pr",
      "check_ci_status",
      "merge_pr",
    ],
  },
  {
    name: "unknown_codebase_exploration",
    description:
      "When exact files are unknown, explore the repo structure first.",
    mode: "finite",
    steps: [
      "inspect_repo",
      "search_code",
      "grep",
      "read_file",
      "summarize_result",
    ],
  },
];
