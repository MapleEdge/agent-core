/**
 * Canonical action catalog — single source of truth.
 *
 * Every action that agent-core knows about is defined here with its Zod schema,
 * metadata, and planner guidance. The DB seed, the prompt builder, and the
 * validator all derive from this file. Nothing else should define actions.
 *
 * Architecture boundary:
 *   agent-core  — catalog, schemas, advisory planning, deterministic validation
 *   jubilant-goggles — runtime authorization, execution, worktree/path validation
 */

import { z, type ZodType } from "zod";

// ── Types ────────────────────────────────────────────────────────────

export type ActionCategory =
  | "context"
  | "repo"
  | "files"
  | "validation"
  | "browser_desktop"
  | "services"
  | "git_pr"
  | "control";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface CanonicalAction {
  name: string;
  category: ActionCategory;
  description: string;
  zodSchema: ZodType;
  params_json_schema: Record<string, unknown>;
  output_json_schema: Record<string, unknown>;
  risk: RiskLevel;
  side_effects: string[];
  requires_platform_validation: true;
  requires_approval: boolean;
  planner_guidance: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Zod-to-JSON-Schema is imported lazily at seed time. For catalog
 *  definition we defer JSON schema generation to seedCanonicalActions. */

function action(
  name: string,
  category: ActionCategory,
  description: string,
  zodSchema: ZodType,
  opts: {
    risk?: RiskLevel;
    side_effects?: string[];
    requires_approval?: boolean;
    planner_guidance?: string;
    output_json_schema?: Record<string, unknown>;
  } = {},
): CanonicalAction {
  return {
    name,
    category,
    description,
    zodSchema,
    // Placeholder — real JSON schema is generated at seed time
    params_json_schema: {},
    output_json_schema: opts.output_json_schema ?? {},
    risk: opts.risk ?? "low",
    side_effects: opts.side_effects ?? [],
    requires_platform_validation: true,
    requires_approval: opts.requires_approval ?? false,
    planner_guidance: opts.planner_guidance ?? "",
  };
}

// ── Secret-ref pattern (for browser_type, request_credential, etc.) ──

const SecretRefSchema = z.object({
  secret_ref: z.string().min(1),
});

// ── Canonical Actions ────────────────────────────────────────────────

// --- Context ---

const retrieve_context = action(
  "retrieve_context",
  "context",
  "Retrieve context nodes from the context tree",
  z.object({
    repo_id: z.string().optional(),
    path: z.string().optional(),
    query: z.string().optional(),
  }),
  { planner_guidance: "Use early in a plan to load repo/session context before making decisions." },
);

const search_memory = action(
  "search_memory",
  "context",
  "Search the memory store for relevant entries",
  z.object({
    query: z.string().min(1),
    scope: z.string().optional(),
  }),
  { planner_guidance: "Search for prior decisions, conventions, or relevant notes before editing." },
);

const inspect_session_state = action(
  "inspect_session_state",
  "context",
  "Inspect the current session state including completed actions and known context",
  z.object({
    session_id: z.string().optional(),
  }),
  { planner_guidance: "Use when the plan needs to branch based on what has already been done." },
);

const record_outcome = action(
  "record_outcome",
  "context",
  "Record an action outcome for the learning loop",
  z.object({
    action_name: z.string().min(1),
    status: z.enum(["succeeded", "failed", "skipped"]),
    summary: z.string().optional(),
  }),
  { planner_guidance: "Record outcomes after significant actions to feed the learning loop." },
);

// --- Repo ---

const inspect_repo = action(
  "inspect_repo",
  "repo",
  "Inspect repository structure, package manifests, and configuration",
  z.object({
    repo_id: z.string().optional(),
    depth: z.number().int().positive().optional(),
  }),
  { planner_guidance: "Use at the start of a task to understand repo layout. Prefer over guessing file paths." },
);

const list_files = action(
  "list_files",
  "repo",
  "List files in a directory or matching a glob pattern",
  z.object({
    path: z.string().optional(),
    pattern: z.string().optional(),
    recursive: z.boolean().optional(),
  }),
  { planner_guidance: "Use to discover files when paths are unknown. Prefer over guessing paths for read_file." },
);

const search_code = action(
  "search_code",
  "repo",
  "Semantic or structural code search across the repository",
  z.object({
    query: z.string().min(1),
    scope: z.string().optional(),
  }),
  { planner_guidance: "Use for higher-level code search when grep patterns are insufficient." },
);

const grep = action(
  "grep",
  "repo",
  "Search file contents with a regex or literal pattern",
  z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
    case_insensitive: z.boolean().optional(),
  }),
  { planner_guidance: "Use to locate symbols, function names, config keys. Pattern must be a real code pattern, not words from the user prompt." },
);

// --- Files ---

const read_file = action(
  "read_file",
  "files",
  "Read a file from the working repository",
  z.object({
    path: z.string().min(1),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  }),
  { planner_guidance: "Only use after the path is known (from grep, list_files, or user). Never use with an empty path." },
);

const apply_patch = action(
  "apply_patch",
  "files",
  "Apply a code change via patch text or structured intent",
  z.object({
    patch: z.string().optional(),
    path: z.string().optional(),
    intent: z.string().optional(),
    evidence: z.array(z.string()).optional(),
  }).refine(
    (d) => (d.patch && d.patch.length > 0) || (d.path && d.path.length > 0 && d.intent && d.intent.length > 0),
    { message: "apply_patch requires either 'patch' (non-empty) or both 'path' and 'intent' (non-empty)" },
  ),
  {
    risk: "medium",
    side_effects: ["filesystem"],
    planner_guidance: "Must provide either a patch string or path+intent. Read the current file first. Include evidence when editing from reference/vendor behavior.",
  },
);

const write_file = action(
  "write_file",
  "files",
  "Write or create a file in the working repository",
  z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  {
    risk: "medium",
    side_effects: ["filesystem"],
    planner_guidance: "Use for new files. Prefer apply_patch for modifications to existing files.",
  },
);

const delete_file = action(
  "delete_file",
  "files",
  "Delete a file from the working repository",
  z.object({
    path: z.string().min(1),
    reason: z.string().optional(),
  }),
  {
    risk: "high",
    side_effects: ["filesystem"],
    requires_approval: true,
    planner_guidance: "Destructive operation. Requires approval. Explain why the file should be deleted.",
  },
);

const inspect_diff = action(
  "inspect_diff",
  "files",
  "Inspect the current unstaged or staged diff",
  z.object({
    staged: z.boolean().optional(),
    path: z.string().optional(),
  }),
  { planner_guidance: "Use to review changes before commit or to verify an apply_patch result." },
);

const summarize_diff = action(
  "summarize_diff",
  "files",
  "Produce a summary of recent changes for review or commit messages",
  z.object({
    base: z.string().optional(),
    head: z.string().optional(),
    include_remaining_gaps: z.boolean().optional(),
  }),
  { planner_guidance: "Use before commit to produce a readable summary. Should appear in every implementation plan." },
);

// --- Validation ---

const run_command = action(
  "run_command",
  "validation",
  "Run a shell command from the configured allowlist",
  z.object({
    command: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
  }),
  {
    risk: "medium",
    side_effects: ["process", "filesystem"],
    planner_guidance: "Command must be in the platform allowlist. Cannot run arbitrary commands.",
  },
);

const run_tests = action(
  "run_tests",
  "validation",
  "Run the test suite or a subset of tests",
  z.object({
    suite: z.string().optional(),
    filter: z.string().optional(),
    purpose: z.enum(["baseline", "targeted_validation", "final_validation"]).optional(),
  }),
  {
    side_effects: ["process", "filesystem"],
    planner_guidance: "Set purpose=baseline for pre-edit test runs, targeted_validation after specific changes, final_validation before commit.",
  },
);

const run_lint = action(
  "run_lint",
  "validation",
  "Run the configured linter",
  z.object({
    fix: z.boolean().optional(),
    path: z.string().optional(),
  }),
  {
    side_effects: ["process"],
    planner_guidance: "Run after edits to catch style/formatting issues.",
  },
);

const run_typecheck = action(
  "run_typecheck",
  "validation",
  "Run the type checker (tsc, pyright, mypy, etc.)",
  z.object({
    path: z.string().optional(),
  }),
  {
    side_effects: ["process"],
    planner_guidance: "Run after edits to catch type errors before commit.",
  },
);

const run_build = action(
  "run_build",
  "validation",
  "Run the project build",
  z.object({
    target: z.string().optional(),
  }),
  {
    side_effects: ["process", "filesystem"],
    planner_guidance: "Run after significant changes to verify the project builds.",
  },
);

const health_check = action(
  "health_check",
  "validation",
  "Check the health of a running service or endpoint",
  z.object({
    url: z.string().optional(),
    service: z.string().optional(),
  }),
  { planner_guidance: "Use after service restart or deployment to verify the service is healthy." },
);

// --- Browser/Desktop ---

const open_browser_url = action(
  "open_browser_url",
  "browser_desktop",
  "Open a URL in the browser",
  z.object({
    url: z.string().min(1),
  }),
  {
    side_effects: ["browser"],
    planner_guidance: "Use to navigate to a specific page for inspection or testing.",
  },
);

const inspect_route_or_response = action(
  "inspect_route_or_response",
  "browser_desktop",
  "Inspect an HTTP route response or browser page state",
  z.object({
    url: z.string().optional(),
    method: z.string().optional(),
    selector: z.string().optional(),
  }),
  { planner_guidance: "Use to verify API responses or page content after navigation." },
);

const browser_click = action(
  "browser_click",
  "browser_desktop",
  "Click an element in the browser",
  z.object({
    selector: z.string().min(1),
    coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  {
    side_effects: ["browser"],
    planner_guidance: "Use for UI testing. Prefer selector over coordinates.",
  },
);

const browser_type = action(
  "browser_type",
  "browser_desktop",
  "Type text into a browser input field. Use secret_ref for sensitive values.",
  z.object({
    selector: z.string().min(1),
    text: z.string().optional(),
    secret_ref: z.string().optional(),
  }).refine(
    (d) => (d.text !== undefined && d.text.length > 0) || (d.secret_ref !== undefined && d.secret_ref.length > 0),
    { message: "browser_type requires either 'text' or 'secret_ref'" },
  ),
  {
    side_effects: ["browser"],
    planner_guidance: "For passwords/tokens, use secret_ref instead of text. Raw secret-looking values will be rejected.",
  },
);

const browser_screenshot = action(
  "browser_screenshot",
  "browser_desktop",
  "Take a screenshot of the browser viewport",
  z.object({
    full_page: z.boolean().optional(),
  }),
  { planner_guidance: "Use to capture visual state for verification or reporting." },
);

const open_remote_desktop = action(
  "open_remote_desktop",
  "browser_desktop",
  "Open or connect to a remote desktop session",
  z.object({
    target: z.string().optional(),
  }),
  {
    side_effects: ["desktop"],
    planner_guidance: "Use when the task requires GUI interaction beyond the browser.",
  },
);

// --- Services ---

const list_services = action(
  "list_services",
  "services",
  "List all managed services and their status",
  z.object({}),
  { planner_guidance: "Use to discover available services before operating on them." },
);

const inspect_service_status = action(
  "inspect_service_status",
  "services",
  "Inspect detailed status of a specific service",
  z.object({
    service: z.string().min(1),
  }),
  { planner_guidance: "Use to check service health, uptime, and recent events." },
);

const update_latest_from_github = action(
  "update_latest_from_github",
  "services",
  "Fetch latest code from GitHub for a repo-backed service and optionally restart",
  z.object({
    service: z.string().min(1),
    restart: z.boolean().optional(),
    token_ref: z.string().optional(),
  }),
  {
    risk: "high",
    side_effects: ["filesystem", "service", "git"],
    planner_guidance: "Never pass a raw token. Use token_ref or rely on server-side env. The platform reads the token from env.",
  },
);

const restart_service = action(
  "restart_service",
  "services",
  "Restart a managed service",
  z.object({
    service: z.string().min(1),
  }),
  {
    risk: "medium",
    side_effects: ["service"],
    planner_guidance: "Use after code updates or config changes. Verify health after restart.",
  },
);

const start_service = action(
  "start_service",
  "services",
  "Start a stopped managed service",
  z.object({
    service: z.string().min(1),
  }),
  {
    risk: "medium",
    side_effects: ["service"],
    planner_guidance: "Use when a service is stopped and needs to be brought up.",
  },
);

const stop_service = action(
  "stop_service",
  "services",
  "Stop a running managed service",
  z.object({
    service: z.string().min(1),
    reason: z.string().optional(),
  }),
  {
    risk: "critical",
    side_effects: ["service"],
    requires_approval: true,
    planner_guidance: "Destructive: stops a running service. Requires approval metadata. Explain why.",
  },
);

// --- Git/PR ---

const git_status = action(
  "git_status",
  "git_pr",
  "Show current git status (branch, staged, unstaged, untracked)",
  z.object({}),
  { planner_guidance: "Use to check working tree state before commit or push." },
);

const git_diff = action(
  "git_diff",
  "git_pr",
  "Show git diff for staged or unstaged changes",
  z.object({
    staged: z.boolean().optional(),
    path: z.string().optional(),
  }),
  { planner_guidance: "Use to review changes before committing." },
);

const commit = action(
  "commit",
  "git_pr",
  "Commit staged changes to the repository",
  z.object({
    message: z.string().min(1),
    files: z.array(z.string()).optional(),
  }),
  {
    risk: "high",
    side_effects: ["git", "filesystem"],
    requires_approval: true,
    planner_guidance: "Only use if commit is in allowed_actions and the user requested commit-capable work. Summarize diff first.",
  },
);

const push_branch = action(
  "push_branch",
  "git_pr",
  "Push the current branch to the remote",
  z.object({
    remote: z.string().optional(),
    branch: z.string().optional(),
    force: z.boolean().optional(),
  }),
  {
    risk: "high",
    side_effects: ["git"],
    requires_approval: true,
    planner_guidance: "Use after commit to push changes. Requires approval.",
  },
);

const create_pr = action(
  "create_pr",
  "git_pr",
  "Create a pull request",
  z.object({
    title: z.string().min(1),
    body: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    draft: z.boolean().optional(),
  }),
  {
    risk: "high",
    side_effects: ["git"],
    requires_approval: true,
    planner_guidance: "Use after push to create a PR. Requires approval.",
  },
);

const check_pr_status = action(
  "check_pr_status",
  "git_pr",
  "Check the status of a pull request (reviews, merge status)",
  z.object({
    pr_number: z.number().int().positive().optional(),
    pr_url: z.string().optional(),
  }),
  { planner_guidance: "Use to check if a PR is ready to merge." },
);

const check_ci_status = action(
  "check_ci_status",
  "git_pr",
  "Check CI pipeline status for a branch or PR",
  z.object({
    pr_number: z.number().int().positive().optional(),
    branch: z.string().optional(),
  }),
  { planner_guidance: "Use before merge to verify CI passes. Should appear in every workflow that creates a PR." },
);

const merge_pr = action(
  "merge_pr",
  "git_pr",
  "Merge a pull request",
  z.object({
    pr_number: z.number().int().positive(),
    strategy: z.enum(["merge", "squash", "rebase"]).optional(),
  }),
  {
    risk: "critical",
    side_effects: ["git"],
    requires_approval: true,
    planner_guidance: "Only use if merge_pr is in allowed_actions. Check CI status first unless user explicitly says skip.",
  },
);

// --- Control ---

const classify_task = action(
  "classify_task",
  "control",
  "Classify the intent and type of a task",
  z.object({
    task_type: z.string().optional(),
    prompt: z.string().optional(),
  }),
  { planner_guidance: "Use at the start of a workflow to determine the task type." },
);

const ask_user = action(
  "ask_user",
  "control",
  "Ask the user a clarifying question",
  z.object({
    question: z.string().min(1),
    options: z.array(z.string()).optional(),
  }),
  { planner_guidance: "Use when the task is ambiguous and requires user input to proceed." },
);

const request_approval = action(
  "request_approval",
  "control",
  "Request approval from the platform for a gated action",
  z.object({
    action: z.string().min(1),
    reason: z.string().optional(),
  }),
  { planner_guidance: "Use before high-risk actions that require explicit approval." },
);

const wait_for_approval = action(
  "wait_for_approval",
  "control",
  "Wait for a pending approval to be granted or denied",
  z.object({
    approval_id: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
  }),
  { planner_guidance: "Use after request_approval to block until the approval decision arrives." },
);

const request_credential = action(
  "request_credential",
  "control",
  "Request a credential or secret from the user or platform",
  z.object({
    credential_name: z.string().min(1),
    reason: z.string().optional(),
  }),
  { planner_guidance: "Use when a task requires credentials that are not yet available." },
);

const wait_for_secret = action(
  "wait_for_secret",
  "control",
  "Wait for a requested credential to be provided",
  z.object({
    credential_name: z.string().min(1),
    timeout_ms: z.number().int().positive().optional(),
  }),
  { planner_guidance: "Use after request_credential to block until the secret is provided." },
);

const record_skipped_validation = action(
  "record_skipped_validation",
  "control",
  "Record that a validation step was intentionally skipped",
  z.object({
    validation: z.string().min(1),
    reason: z.string().min(1),
  }),
  { planner_guidance: "Use when validation is skipped (e.g., user override). Creates an audit trail." },
);

const summarize_result = action(
  "summarize_result",
  "control",
  "Summarize the overall result of a plan or workflow",
  z.object({
    status: z.enum(["success", "partial", "failed"]).optional(),
    summary: z.string().min(1),
    remaining_work: z.array(z.string()).optional(),
  }),
  { planner_guidance: "Use at the end of every plan to communicate what was accomplished and what remains." },
);

const identify_relevant_tests = action(
  "identify_relevant_tests",
  "validation",
  "Identify which tests are relevant to recent changes",
  z.object({
    files: z.array(z.string()).optional(),
    context: z.string().optional(),
  }),
  { planner_guidance: "Use before run_tests to determine which test subset to target." },
);

// ── Exported catalog ─────────────────────────────────────────────────

export const CANONICAL_ACTIONS: CanonicalAction[] = [
  // Context
  retrieve_context,
  search_memory,
  inspect_session_state,
  record_outcome,
  // Repo
  inspect_repo,
  list_files,
  search_code,
  grep,
  // Files
  read_file,
  apply_patch,
  write_file,
  delete_file,
  inspect_diff,
  summarize_diff,
  // Validation
  run_command,
  run_tests,
  run_lint,
  run_typecheck,
  run_build,
  health_check,
  identify_relevant_tests,
  // Browser/Desktop
  open_browser_url,
  inspect_route_or_response,
  browser_click,
  browser_type,
  browser_screenshot,
  open_remote_desktop,
  // Services
  list_services,
  inspect_service_status,
  update_latest_from_github,
  restart_service,
  start_service,
  stop_service,
  // Git/PR
  git_status,
  git_diff,
  commit,
  push_branch,
  create_pr,
  check_pr_status,
  check_ci_status,
  merge_pr,
  // Control
  classify_task,
  ask_user,
  request_approval,
  wait_for_approval,
  request_credential,
  wait_for_secret,
  record_skipped_validation,
  summarize_result,
];

/** Map for O(1) lookup by name. */
export const CANONICAL_ACTION_MAP = new Map(
  CANONICAL_ACTIONS.map((a) => [a.name, a]),
);

/** All canonical action names. */
export const CANONICAL_ACTION_NAMES = CANONICAL_ACTIONS.map((a) => a.name);

/** Exported Zod schemas keyed by action name. */
export const CANONICAL_ZOD_SCHEMAS: Record<string, ZodType> = Object.fromEntries(
  CANONICAL_ACTIONS.map((a) => [a.name, a.zodSchema]),
);

export { SecretRefSchema };
