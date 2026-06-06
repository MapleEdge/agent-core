# Rule Solver: Letta ToolRulesSolver Port

## Overview

`LettaRuleSolver` is a deterministic TypeScript port of Letta's `ToolRulesSolver` (Python). It implements Letta-style tool rule constraints — controlling which tools an agent can call at each step of execution.

This is a **direct** integration: the core algorithm was ported line-by-line from the Python source. No LLM calls, no live action execution, no platform authorization.

## Source References

| File | Upstream |
|------|----------|
| `src/rules/lettaRuleTypes.ts` | `letta/schemas/tool_rule.py` + `letta/schemas/enums.py` |
| `src/rules/lettaRuleSolver.ts` | `letta/helpers/tool_rule_solver.py` |
| `src/providers/adapters/LettaRuleSolverProvider.ts` | Provider adapter (new) |

## Rule Types

All 9 Letta rule types are supported:

| Rule Type | Letta Enum | Behavior |
|-----------|-----------|----------|
| `InitToolRule` | `run_first` | Restricts first tool call to designated init tools |
| `ChildToolRule` | `constrain_child_tools` | After parent, only listed children are allowed |
| `ParentToolRule` | `parent_last_tool` | Children blocked unless parent was the last tool called |
| `TerminalToolRule` | `exit_loop` | Tool ends the agent loop |
| `ContinueToolRule` | `continue_loop` | Tool continues the agent loop |
| `RequiredBeforeExitToolRule` | `required_before_exit` | Must be called before agent can exit |
| `RequiresApprovalToolRule` | `requires_approval` | Triggers human-in-the-loop approval |
| `ConditionalToolRule` | `conditional` | Maps to different children based on function output |
| `MaxCountPerStepToolRule` | `max_count_per_step` | Limits calls per step |

## Core Algorithm

The solver follows Letta's exact logic:

1. **No history + init rules** → only init tool names are allowed
2. **Otherwise** → compute the intersection of all child/parent/conditional/max-count valid-tool sets
3. **Continue/terminal/required-before-exit** are agent-loop flow controls, not tool restrictions

```
getAllowedToolNames(history, availableTools):
  if history.empty AND initRules.exist:
    return initRules.map(r => r.tool_name)
  
  validSets = []
  for rule in [childRules, conditionalRules, maxCountRules, parentRules]:
    validSets.push(rule.getValidTools(history, availableTools))
  
  return intersection(validSets) ∩ availableTools
```

## What Was Ported

- `get_allowed_tool_names()` → `getAllowedToolNames()`
- `is_terminal_tool()` → `isTerminalTool()`
- `is_continue_tool()` → `isContinueTool()`
- `is_requires_approval_tool()` → `isRequiresApprovalTool()`
- `has_children_tools()` → `hasChildrenTools()`
- `has_required_tools_been_called()` → `hasRequiredToolsBeenCalled()`
- `get_uncalled_required_tools()` → `getUncalledRequiredTools()`
- `should_force_tool_call()` → `shouldForceToolCall()`
- `compile_tool_rule_prompts()` → `compilePrompt()` (returns string, not Block)
- `guess_rule_violation()` → not ported (used for LLM error recovery)
- Sequence validation (new) — walks a proposed sequence step-by-step through the solver

## What Was Not Ported

| Feature | Reason |
|---------|--------|
| Prefilled args cache (`last_prefilled_args_by_tool`) | Requires LLM integration; agent-core does not execute tools with args |
| `ToolCallNode` / `child_arg_nodes` | Per-child argument overrides for LLM invocation |
| `guess_rule_violation()` | Used for LLM error recovery prompts; not needed without LLM execution |
| `Block` compilation | Letta-specific `Block` type; we return plain strings |
| `last_function_response` full support | ConditionalToolRule supports it, but production use requires runtime response piping |
| `register_tool_call()` / mutable history | Solver is stateless; history is passed as parameter |

## Why These Were Not Ported

The omitted features all relate to **LLM-driven tool execution** — prefilling arguments, recovering from LLM errors, and assembling prompt blocks. agent-core does not execute tools via LLM; it only determines which tools are allowed. The solver is intentionally stateless: callers pass history rather than mutating internal state, which makes it easier to test and reason about.

## Usage

### Direct solver usage

```typescript
import { LettaRuleSolver } from "./rules/lettaRuleSolver.js";

const solver = new LettaRuleSolver([
  { type: "run_first", tool_name: "classify_task" },
  { type: "constrain_child_tools", tool_name: "classify_task", children: ["read_file", "grep"] },
  { type: "required_before_exit", tool_name: "summarize_diff" },
  { type: "exit_loop", tool_name: "send_response" },
]);

const result = solver.solve(
  ["classify_task"],                                    // history
  new Set(["classify_task", "read_file", "grep", "summarize_diff", "send_response"]),
);
// result.allowed = ["read_file", "grep"]
// result.uncalled_required = ["summarize_diff"]
// result.should_force_tool_call = true
```

### Provider adapter usage

```typescript
import { LettaRuleSolverProvider } from "./providers/adapters/LettaRuleSolverProvider.js";
import { registerProvider } from "./providers/registry.js";

const provider = new LettaRuleSolverProvider();
provider.setRules("code_edit", [
  { type: "run_first", tool_name: "classify_task" },
  { type: "constrain_child_tools", tool_name: "classify_task", children: ["read_file"] },
]);

registerProvider("rule_solver", provider);

const result = await provider.getAllowedNext("code_edit", null, []);
// result.allowed = ["classify_task"]
```

## Test Fixtures

Golden test fixtures are in `tests/fixtures/letta-rule-cases.json`. Each fixture specifies:
- Input rules, history, available tools
- Expected allowed tools, uncalled required, approval status, terminal status
- Expected prompt contents and sequence validation results

The test suite runs all fixtures automatically, plus integration tests for the provider adapter and registry.
