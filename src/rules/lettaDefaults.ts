/**
 * Default Letta-style rules for the code_edit task type.
 *
 * These mirror the DB-seeded sequence but use the richer Letta rule model
 * (init, child, required-before-exit, approval-required, terminal).
 */

import type { LettaRuleSolverProvider } from "../providers/adapters/LettaRuleSolverProvider.js";

export function seedLettaDefaultRules(provider: LettaRuleSolverProvider): void {
  provider.setRules("code_edit", [
    { type: "run_first", tool_name: "classify_task" },
    {
      type: "constrain_child_tools",
      tool_name: "classify_task",
      children: ["read_file", "grep"],
    },
    {
      type: "constrain_child_tools",
      tool_name: "read_file",
      children: ["grep", "write_file", "read_file"],
    },
    {
      type: "constrain_child_tools",
      tool_name: "grep",
      children: ["read_file", "write_file", "grep"],
    },
    {
      type: "constrain_child_tools",
      tool_name: "write_file",
      children: ["run_tests", "read_file", "grep", "write_file"],
    },
    {
      type: "constrain_child_tools",
      tool_name: "run_tests",
      children: ["summarize_diff", "read_file", "write_file", "grep"],
    },
    {
      type: "constrain_child_tools",
      tool_name: "summarize_diff",
      children: ["request_approval", "commit"],
    },
    { type: "required_before_exit", tool_name: "summarize_diff" },
    { type: "requires_approval", tool_name: "commit" },
    { type: "exit_loop", tool_name: "commit" },
  ]);
}
