# Action Catalog and Plan Validation

## Overview

agent-core owns the **canonical action catalog** — the single source of truth for all actions that any agent or executor can use. The catalog defines schemas, risk levels, side effects, and planner guidance for each action.

**Architecture boundary (decision 0006):**
- `agent-core` — action catalog, Zod schemas, advisory planning, deterministic validation, plan repair, outcome records
- `jubilant-goggles` — runtime authorization, worktree/path validation, execution, service control, browser/desktop control, commits/PRs, approvals/secrets

agent-core does **not** execute actions. It validates plans deterministically and provides advisory planning.

## Canonical Action Catalog

The catalog is defined in `src/actions/catalog/canonicalActions.ts`. Every action specifies:

| Field | Description |
|---|---|
| `name` | Unique action identifier |
| `category` | One of: context, repo, files, validation, browser_desktop, services, git_pr, control |
| `description` | Human-readable description |
| `zodSchema` | Zod schema for params validation |
| `params_json_schema` | Auto-generated JSON Schema for LLM/API consumption |
| `output_json_schema` | Expected output shape (informational) |
| `risk` | low, medium, high, or critical |
| `side_effects` | Array of side effect categories (filesystem, process, git, browser, service, etc.) |
| `requires_platform_validation` | Always `true` — every step must be validated by the platform |
| `requires_approval` | Whether the action requires explicit approval before execution |
| `planner_guidance` | Advisory text for the LLM planner |

## Action Categories

### Context
| Action | Risk | Approval | Description |
|---|---|---|---|
| `retrieve_context` | low | no | Retrieve context from the context tree |
| `search_memory` | low | no | Search the memory store |
| `inspect_session_state` | low | no | Inspect current session state |
| `record_outcome` | low | no | Record an action outcome |

### Repo
| Action | Risk | Approval | Description |
|---|---|---|---|
| `inspect_repo` | low | no | Inspect repo structure and config |
| `list_files` | low | no | List files in a directory or by pattern |
| `search_code` | low | no | Semantic/structural code search |
| `grep` | low | no | Regex search in file contents |

### Files
| Action | Risk | Approval | Description |
|---|---|---|---|
| `read_file` | low | no | Read a file |
| `apply_patch` | medium | no | Apply a code change (requires `patch` or `path + intent`) |
| `write_file` | medium | no | Write or create a file |
| `delete_file` | high | **yes** | Delete a file |
| `inspect_diff` | low | no | Inspect staged/unstaged diff |
| `summarize_diff` | low | no | Summarize recent changes |

### Validation
| Action | Risk | Approval | Description |
|---|---|---|---|
| `run_command` | medium | no | Run an allowlisted shell command |
| `run_tests` | low | no | Run the test suite (supports `purpose`: baseline, targeted_validation, final_validation) |
| `run_lint` | low | no | Run the linter |
| `run_typecheck` | low | no | Run the type checker |
| `run_build` | low | no | Run the project build |
| `health_check` | low | no | Check service health |
| `identify_relevant_tests` | low | no | Identify which tests are relevant to changes |

### Browser/Desktop
| Action | Risk | Approval | Description |
|---|---|---|---|
| `open_browser_url` | low | no | Open a URL in the browser |
| `inspect_route_or_response` | low | no | Inspect HTTP response or page state |
| `browser_click` | low | no | Click a browser element |
| `browser_type` | low | no | Type text (uses `secret_ref` for secrets) |
| `browser_screenshot` | low | no | Take a screenshot |
| `open_remote_desktop` | low | no | Open a remote desktop session |

### Services
| Action | Risk | Approval | Description |
|---|---|---|---|
| `list_services` | low | no | List managed services |
| `inspect_service_status` | low | no | Inspect a service's status |
| `update_latest_from_github` | high | no | Fetch latest code from GitHub (uses `token_ref`, never raw token) |
| `restart_service` | medium | no | Restart a service |
| `start_service` | medium | no | Start a service |
| `stop_service` | critical | **yes** | Stop a service |

### Git/PR
| Action | Risk | Approval | Description |
|---|---|---|---|
| `git_status` | low | no | Show git status |
| `git_diff` | low | no | Show git diff |
| `commit` | high | **yes** | Commit changes |
| `push_branch` | high | **yes** | Push branch to remote |
| `create_pr` | high | **yes** | Create a pull request |
| `check_pr_status` | low | no | Check PR status |
| `check_ci_status` | low | no | Check CI pipeline status |
| `merge_pr` | critical | **yes** | Merge a pull request |

### Control
| Action | Risk | Approval | Description |
|---|---|---|---|
| `classify_task` | low | no | Classify task intent |
| `ask_user` | low | no | Ask the user a question |
| `request_approval` | low | no | Request approval for a gated action |
| `wait_for_approval` | low | no | Wait for approval decision |
| `request_credential` | low | no | Request a credential |
| `wait_for_secret` | low | no | Wait for a credential |
| `record_skipped_validation` | low | no | Record a skipped validation step |
| `summarize_result` | low | no | Summarize the workflow result |

## Atomic vs. Composite Actions

All actions in the catalog are **atomic** — they represent a single operation. Composite workflows are expressed as plans (sequences of atomic actions).

## Advisory-Only Actions

All agent-core actions are advisory. agent-core does not execute anything; it produces plans that jubilant-goggles validates and executes.

## Schema Validation vs. Runtime Authorization

| Concern | Owner | When |
|---|---|---|
| Params match Zod schema | agent-core | Plan validation (deterministic) |
| Action is in `allowed_actions` | agent-core | Plan validation |
| No secret-looking values in params | agent-core | Plan validation |
| `requires_platform_validation: true` | agent-core | Plan validation |
| File path is safe and within worktree | jubilant-goggles | Runtime |
| User has permission to execute action | jubilant-goggles | Runtime |
| Service exists and is manageable | jubilant-goggles | Runtime |
| Approval has been granted | jubilant-goggles | Runtime |

## Secret-Ref Rules

1. **Never** pass raw tokens, API keys, or passwords in action params.
2. Use `secret_ref` fields (e.g., `browser_type.secret_ref`, `update_latest_from_github.token_ref`) to reference secrets by name.
3. The platform resolves secret refs at runtime from secure storage.
4. The deterministic validator recursively scans all params for secret-looking patterns and rejects them with `SECRET_IN_PARAMS` errors.

Recognized secret patterns include:
- GitHub PATs (`ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
- OpenAI-style keys (`sk-`)
- Slack tokens (`xoxb-`, `xoxp-`)
- AWS access keys (`AKIA`)
- Bearer tokens (`Bearer ...`)
- JWTs (`eyJ...`)

## Plan Validation

The deterministic validator (`actionPlanValidator.ts`) checks:

1. Plan mode is `finite`, `loop`, or `open_ended`
2. Loop/open_ended plans should include `loop_condition`
3. Every action exists in the canonical catalog
4. Every action is in the session's `allowed_actions`
5. Every action's params match its Zod schema
6. Every step has `requires_platform_validation: true`
7. No secret-looking values appear recursively in params
8. `apply_patch` has `patch` or `path + intent`
9. `read_file` has non-empty `path`
10. `grep` has non-empty `pattern`
11. `commit` only appears if in `allowed_actions`
12. `merge_pr` only appears if in `allowed_actions`
13. `stop_service` triggers an approval warning
14. `run_tests` before edits is a **warning**, not an error (to allow baseline test runs)

Errors are returned as structured objects with `code`, `path`, `message`, `action_name`, and `step_index`.

## API Endpoints

### GET /actions
Returns the full action catalog with schemas.

### GET /actions/:name
Returns a single action definition.

### POST /actions/plan
Generates an advisory plan. Uses LLM when available, falls back to templates.

### POST /actions/validate-plan
Deterministic validation only. No LLM calls.

### POST /actions/outcome
Record what jubilant-goggles actually executed.

### GET /actions/outcomes/:session_id
Retrieve outcomes for a session.

### GET /actions/stats/:action_name
Retrieve execution statistics for an action.
