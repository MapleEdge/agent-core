/**
 * Canonical action catalog — single source of truth.
 *
 * agent-core owns advisory action knowledge and schema validation. Runtime
 * authorization and live execution stay in the platform control plane.
 */

import { z, type ZodType } from "zod";
import { SESSION_GRAPH_ACTIONS } from "./sessionGraphActions.js";

export type ActionCategory =
  | "context"
  | "session_graph"
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
    params_json_schema: {},
    output_json_schema: opts.output_json_schema ?? {},
    risk: opts.risk ?? "low",
    side_effects: opts.side_effects ?? [],
    requires_platform_validation: true,
    requires_approval: opts.requires_approval ?? false,
    planner_guidance: opts.planner_guidance ?? "",
  };
}

const SecretRefSchema = z.object({
  secret_ref: z.string().min(1),
});

// Context
const retrieve_context = action("retrieve_context", "context", "Retrieve context nodes from the context tree", z.object({ repo_id: z.string().optional(), path: z.string().optional(), query: z.string().optional() }), { planner_guidance: "Use early to load repo/session context before decisions." });
const search_memory = action("search_memory", "context", "Search the memory store for relevant entries", z.object({ query: z.string().min(1), scope: z.string().optional() }), { planner_guidance: "Search for prior decisions or conventions before editing." });
const inspect_session_state = action("inspect_session_state", "context", "Inspect current session state including completed actions and known context", z.object({ session_id: z.string().optional() }), { planner_guidance: "Use when a plan depends on already completed work." });
const record_outcome = action("record_outcome", "context", "Record an action outcome for the learning loop", z.object({ action_name: z.string().min(1), status: z.enum(["succeeded", "failed", "skipped"]), summary: z.string().optional() }), { planner_guidance: "Record outcomes after significant actions." });

// Repo
const inspect_repo = action("inspect_repo", "repo", "Inspect repository structure, manifests, and configuration", z.object({ repo_id: z.string().optional(), depth: z.number().int().positive().optional() }), { planner_guidance: "Use at the start of a code task to understand layout." });
const list_files = action("list_files", "repo", "List files in a directory or matching a pattern", z.object({ path: z.string().optional(), pattern: z.string().optional(), recursive: z.boolean().optional() }), { planner_guidance: "Use to discover files when paths are unknown." });
const search_code = action("search_code", "repo", "Semantic or structural code search across the repository", z.object({ query: z.string().min(1), scope: z.string().optional() }), { planner_guidance: "Use for higher-level code search when grep is insufficient." });
const grep = action("grep", "repo", "Search file contents with a regex or literal pattern", z.object({ pattern: z.string().min(1), path: z.string().optional(), case_insensitive: z.boolean().optional() }), { planner_guidance: "Use to locate symbols, function names, or config keys." });

// Files
const read_file = action("read_file", "files", "Read a file from the working repository", z.object({ path: z.string().min(1), offset: z.number().int().nonnegative().optional(), limit: z.number().int().positive().optional() }), { planner_guidance: "Only use after the path is known." });
const apply_patch = action(
  "apply_patch",
  "files",
  "Apply a code change via patch text or structured intent",
  z.object({ patch: z.string().optional(), path: z.string().optional(), intent: z.string().optional(), evidence: z.array(z.string()).optional() }).refine(
    (d) => (d.patch && d.patch.length > 0) || (d.path && d.path.length > 0 && d.intent && d.intent.length > 0),
    { message: "apply_patch requires either 'patch' (non-empty) or both 'path' and 'intent' (non-empty)" },
  ),
  { risk: "medium", side_effects: ["filesystem"], planner_guidance: "Read current files first and include evidence when editing from reference behavior." },
);
const write_file = action("write_file", "files", "Write or create a file in the working repository", z.object({ path: z.string().min(1), content: z.string() }), { risk: "medium", side_effects: ["filesystem"], planner_guidance: "Use for new files. Prefer apply_patch for existing files." });
const delete_file = action("delete_file", "files", "Delete a file from the working repository", z.object({ path: z.string().min(1), reason: z.string().optional() }), { risk: "high", side_effects: ["filesystem"], requires_approval: true, planner_guidance: "Destructive operation. Requires approval." });
const inspect_diff = action("inspect_diff", "files", "Inspect current staged or unstaged diff", z.object({ staged: z.boolean().optional(), path: z.string().optional() }), { planner_guidance: "Use to review changes before commit." });
const summarize_diff = action("summarize_diff", "files", "Produce a readable summary of recent changes", z.object({ base: z.string().optional(), head: z.string().optional(), include_remaining_gaps: z.boolean().optional() }), { planner_guidance: "Use before commit and final summary." });

// Validation
const run_command = action("run_command", "validation", "Run a shell command from the configured allowlist", z.object({ command: z.string().min(1), timeout_ms: z.number().int().positive().optional() }), { risk: "medium", side_effects: ["process", "filesystem"], planner_guidance: "Command must be in the platform allowlist." });
const run_tests = action("run_tests", "validation", "Run the test suite or a subset of tests", z.object({ suite: z.string().optional(), filter: z.string().optional(), purpose: z.enum(["baseline", "targeted_validation", "final_validation"]).optional() }), { side_effects: ["process", "filesystem"], planner_guidance: "Use baseline before edits and final_validation before commit." });
const run_lint = action("run_lint", "validation", "Run the configured linter", z.object({ fix: z.boolean().optional(), path: z.string().optional() }), { side_effects: ["process"], planner_guidance: "Run after edits to catch style issues." });
const run_typecheck = action("run_typecheck", "validation", "Run the configured type checker", z.object({ path: z.string().optional() }), { side_effects: ["process"], planner_guidance: "Run after edits to catch type errors." });
const run_build = action("run_build", "validation", "Run the project build", z.object({ target: z.string().optional() }), { side_effects: ["process", "filesystem"], planner_guidance: "Run after significant changes." });
const health_check = action("health_check", "validation", "Check the health of a running service or endpoint", z.object({ url: z.string().optional(), service: z.string().optional() }), { planner_guidance: "Use after service restart or deployment." });
const identify_relevant_tests = action("identify_relevant_tests", "validation", "Identify which tests are relevant to recent changes", z.object({ files: z.array(z.string()).optional(), context: z.string().optional() }), { planner_guidance: "Use before run_tests to select a subset." });

// Browser/Desktop
const open_browser_url = action("open_browser_url", "browser_desktop", "Open a URL in the browser", z.object({ url: z.string().min(1) }), { side_effects: ["browser"], planner_guidance: "Use to navigate for inspection or testing." });
const inspect_route_or_response = action("inspect_route_or_response", "browser_desktop", "Inspect an HTTP route response or browser page state", z.object({ url: z.string().optional(), method: z.string().optional(), selector: z.string().optional() }), { planner_guidance: "Use to verify API responses or page content." });
const browser_click = action("browser_click", "browser_desktop", "Click an element in the browser", z.object({ selector: z.string().min(1), coordinates: z.object({ x: z.number(), y: z.number() }).optional() }), { side_effects: ["browser"], planner_guidance: "Prefer selector over coordinates." });
const browser_type = action(
  "browser_type",
  "browser_desktop",
  "Type text into a browser input field. Use secret_ref for sensitive values.",
  z.object({ selector: z.string().min(1), text: z.string().optional(), secret_ref: z.string().optional() }).refine(
    (d) => (d.text !== undefined && d.text.length > 0) || (d.secret_ref !== undefined && d.secret_ref.length > 0),
    { message: "browser_type requires either 'text' or 'secret_ref'" },
  ),
  { side_effects: ["browser"], planner_guidance: "For passwords or tokens, use secret_ref." },
);
const browser_screenshot = action("browser_screenshot", "browser_desktop", "Take a screenshot of the browser viewport", z.object({ full_page: z.boolean().optional() }), { planner_guidance: "Use to capture visual state." });
const open_remote_desktop = action("open_remote_desktop", "browser_desktop", "Open or connect to a remote desktop session", z.object({ target: z.string().optional() }), { side_effects: ["desktop"], planner_guidance: "Use when the task requires GUI interaction." });

// Services
const list_services = action("list_services", "services", "List all managed services and their status", z.object({}), { planner_guidance: "Use before operating on services." });
const inspect_service_status = action("inspect_service_status", "services", "Inspect detailed status of a specific service", z.object({ service: z.string().min(1) }), { planner_guidance: "Use to check service health and recent events." });
const update_latest_from_github = action("update_latest_from_github", "services", "Fetch latest code from GitHub for a repo-backed service", z.object({ service: z.string().min(1), restart: z.boolean().optional(), token_ref: z.string().optional() }), { risk: "high", side_effects: ["filesystem", "service", "git"], planner_guidance: "Never pass a raw token. Use token_ref or server-side env." });
const restart_service = action("restart_service", "services", "Restart a managed service", z.object({ service: z.string().min(1) }), { risk: "medium", side_effects: ["service"], planner_guidance: "Verify health after restart." });
const start_service = action("start_service", "services", "Start a stopped managed service", z.object({ service: z.string().min(1) }), { risk: "medium", side_effects: ["service"], planner_guidance: "Use when a service is stopped." });
const stop_service = action("stop_service", "services", "Stop a running managed service", z.object({ service: z.string().min(1), reason: z.string().optional() }), { risk: "critical", side_effects: ["service"], requires_approval: true, planner_guidance: "Destructive: requires approval." });

// Git/PR
const git_status = action("git_status", "git_pr", "Show current git status", z.object({}), { planner_guidance: "Use before commit or push." });
const git_diff = action("git_diff", "git_pr", "Show git diff for staged or unstaged changes", z.object({ staged: z.boolean().optional(), path: z.string().optional() }), { planner_guidance: "Use to review changes before committing." });
const commit = action("commit", "git_pr", "Commit staged changes to the repository", z.object({ message: z.string().min(1), files: z.array(z.string()).optional() }), { risk: "high", side_effects: ["git", "filesystem"], requires_approval: true, planner_guidance: "Summarize diff first and only commit when allowed." });
const push_branch = action("push_branch", "git_pr", "Push the current branch to remote", z.object({ remote: z.string().optional(), branch: z.string().optional(), force: z.boolean().optional() }), { risk: "high", side_effects: ["git"], requires_approval: true, planner_guidance: "Use after commit. Requires approval." });
const create_pr = action("create_pr", "git_pr", "Create a pull request", z.object({ title: z.string().min(1), body: z.string().optional(), base: z.string().optional(), head: z.string().optional(), draft: z.boolean().optional() }), { risk: "high", side_effects: ["git"], requires_approval: true, planner_guidance: "Use after push. Requires approval." });
const check_pr_status = action("check_pr_status", "git_pr", "Check pull request status", z.object({ pr_number: z.number().int().positive().optional(), pr_url: z.string().optional() }), { planner_guidance: "Use to check if a PR is ready." });
const check_ci_status = action("check_ci_status", "git_pr", "Check CI status for a branch or PR", z.object({ pr_number: z.number().int().positive().optional(), branch: z.string().optional() }), { planner_guidance: "Use before merge." });
const merge_pr = action("merge_pr", "git_pr", "Merge a pull request", z.object({ pr_number: z.number().int().positive(), strategy: z.enum(["merge", "squash", "rebase"]).optional() }), { risk: "critical", side_effects: ["git"], requires_approval: true, planner_guidance: "Check CI status first unless explicitly skipped." });

// Control
const classify_task = action("classify_task", "control", "Classify the intent and type of a task", z.object({ task_type: z.string().optional(), prompt: z.string().optional() }), { planner_guidance: "Use at the start of a workflow." });
const ask_user = action("ask_user", "control", "Ask the user a clarifying question", z.object({ question: z.string().min(1), options: z.array(z.string()).optional() }), { planner_guidance: "Use when the task requires user input." });
const request_approval = action("request_approval", "control", "Request approval for a gated action", z.object({ action: z.string().min(1), reason: z.string().optional() }), { planner_guidance: "Use before high-risk actions." });
const wait_for_approval = action("wait_for_approval", "control", "Wait for a pending approval decision", z.object({ approval_id: z.string().optional(), timeout_ms: z.number().int().positive().optional() }), { planner_guidance: "Use after request_approval." });
const request_credential = action("request_credential", "control", "Request a credential or secret", z.object({ credential_name: z.string().min(1), reason: z.string().optional() }), { planner_guidance: "Use when credentials are missing." });
const wait_for_secret = action("wait_for_secret", "control", "Wait for a requested credential", z.object({ credential_name: z.string().min(1), timeout_ms: z.number().int().positive().optional() }), { planner_guidance: "Use after request_credential." });
const record_skipped_validation = action("record_skipped_validation", "control", "Record that validation was intentionally skipped", z.object({ validation: z.string().min(1), reason: z.string().min(1) }), { planner_guidance: "Use when validation is skipped." });
const summarize_result = action("summarize_result", "control", "Summarize the overall result of a plan", z.object({ status: z.enum(["success", "partial", "failed"]).optional(), summary: z.string().min(1), remaining_work: z.array(z.string()).optional() }), { planner_guidance: "Use at the end of every plan." });

export const CANONICAL_ACTIONS: CanonicalAction[] = [
  retrieve_context,
  search_memory,
  inspect_session_state,
  record_outcome,
  ...SESSION_GRAPH_ACTIONS,
  inspect_repo,
  list_files,
  search_code,
  grep,
  read_file,
  apply_patch,
  write_file,
  delete_file,
  inspect_diff,
  summarize_diff,
  run_command,
  run_tests,
  run_lint,
  run_typecheck,
  run_build,
  health_check,
  identify_relevant_tests,
  open_browser_url,
  inspect_route_or_response,
  browser_click,
  browser_type,
  browser_screenshot,
  open_remote_desktop,
  list_services,
  inspect_service_status,
  update_latest_from_github,
  restart_service,
  start_service,
  stop_service,
  git_status,
  git_diff,
  commit,
  push_branch,
  create_pr,
  check_pr_status,
  check_ci_status,
  merge_pr,
  classify_task,
  ask_user,
  request_approval,
  wait_for_approval,
  request_credential,
  wait_for_secret,
  record_skipped_validation,
  summarize_result,
];

export const CANONICAL_ACTION_MAP = new Map(
  CANONICAL_ACTIONS.map((a) => [a.name, a]),
);

export const CANONICAL_ACTION_NAMES = CANONICAL_ACTIONS.map((a) => a.name);

export const CANONICAL_ZOD_SCHEMAS: Record<string, ZodType> = Object.fromEntries(
  CANONICAL_ACTIONS.map((a) => [a.name, a.zodSchema]),
);

export { SecretRefSchema };
