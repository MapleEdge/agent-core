# 0007: LLM-First Action Sequencing

## Status

Accepted.

## Decision

agent-core will remove the dedicated classifier as the primary action-routing step.

Instead, action sequencing will be LLM-first:

```text
user prompt
  -> available action catalog
  -> action JSON schemas
  -> sample action-plan templates
  -> session-allowed action subset
  -> strict JSON action sequence
  -> deterministic validation after generation
  -> jubilant-goggles executes only after platform validation
```

The LLM is responsible for interpreting the user prompt and proposing a sequence of actions.

agent-core is responsible for validating the proposed sequence against:

- known action names
- action parameter schemas
- required output JSON schema
- allowed session action subset
- sequence shape
- invariant that every action requires platform validation

jubilant-goggles remains responsible for execution, runtime validation, permissions, approval, policy enforcement, worktrees, executors, commits, PRs, deploys, and all real-world side effects.

## Rationale

A deterministic classifier plus plan-template system is conservative, but it creates a rigid routing layer that may underfit diverse user prompts.

The new design treats the LLM as the semantic planner because the LLM is better suited to interpret open-ended user requests and select from a semantically described action catalog.

The system remains bounded because:

1. The LLM only sees actions that are allowed in the current session.
2. Disallowed actions are manually removed from the session action catalog before planning.
3. The LLM must emit strict JSON.
4. agent-core validates the JSON shape and action schemas after generation.
5. agent-core does not execute anything.
6. jubilant-goggles performs final platform validation and execution.

## Consequences

Positive:

- simpler prompt-to-plan path
- removes brittle classifier layer
- supports richer action sequencing from natural language
- session settings become the primary allowlist mechanism
- easier to add new actions by extending catalog descriptions and schemas

Negative:

- generated sequences are nondeterministic
- invalid plans must be rejected or repaired
- benchmark and regression tests must use fixed model/settings or golden fixtures
- prompt injection resistance depends on catalog scoping and strict validation
- manual session allowlists become critical

## Non-Negotiable Invariants

```text
The LLM may propose.
agent-core validates.
jubilant-goggles authorizes and executes.
```

```text
No disallowed action is included in the LLM-visible catalog.
No action sequence leaves agent-core unless every step passes schema validation.
No action is executed by agent-core.
No action is executed by jubilant-goggles unless jubilant-goggles validates permissions and runtime safety.
```

Schema-valid means only:

```text
The action sequence is well-formed and uses valid action contracts.
```

It does not mean:

```text
The action is safe, authorized, approved, or executable.
```

## Planner Input

The LLM action planner receives:

```json
{
  "user_prompt": "...",
  "session": {
    "session_id": "...",
    "repo_id": "...",
    "allowed_actions": ["retrieve_context", "search_memory", "grep", "read_file"]
  },
  "action_catalog": [
    {
      "name": "grep",
      "description": "Search repository file contents using a literal or regex pattern.",
      "params_json_schema": {},
      "output_json_schema": {},
      "risk": "low",
      "side_effects": [],
      "requires_platform_validation": true
    }
  ],
  "sample_templates": [
    {
      "name": "code_edit_basic",
      "description": "Typical investigation-edit-test-review loop.",
      "steps": ["retrieve_context", "search_memory", "grep", "read_file", "apply_patch", "run_tests", "summarize_diff"]
    }
  ],
  "recent_memories": [],
  "context_summaries": []
}
```

The LLM must return only strict JSON matching the action sequence schema.

## Planner Output

```json
{
  "plan": {
    "goal": "...",
    "steps": [
      {
        "action_name": "grep",
        "params": {
          "pattern": "login|auth|session"
        },
        "rationale": "Find authentication-related code before reading files.",
        "requires_platform_validation": true
      }
    ]
  }
}
```

## Validation After Generation

agent-core validates:

1. JSON parse success.
2. Output matches `ActionSequenceSchema`.
3. Every action exists in the session-visible catalog.
4. No action outside `session.allowed_actions` appears.
5. Every action params object validates against that action's Zod schema.
6. Every step has `requires_platform_validation: true`.
7. Optional: sequence warnings from `RuleSolverProvider`, if enabled as advisory.

If validation fails, agent-core may attempt one repair pass or return a validation error.

## Classifier Deprecation

`POST /classify/task` is deprecated for action sequencing.

It may remain temporarily for compatibility or evaluation, but the primary planning path is now:

```text
POST /actions/plan
```

`/actions/plan` should not require a classifier result.

## Rule Solver Role

The existing Letta-style `RuleSolverProvider` is demoted from primary sequencer to optional validator/advisory checker.

It may still be used to emit sequence warnings or reject plans when a session explicitly enables deterministic sequence enforcement.

Default radical mode:

```text
LLM chooses sequence from visible catalog.
Schema/session validation is hard.
Rule-solver sequence validation is advisory unless configured as hard.
```

## Required Endpoint Direction

Implement or update:

```text
POST /actions/plan
POST /actions/validate-plan
POST /actions/outcome
GET  /actions
GET  /actions/:name
```

`POST /actions/plan` should be the prompt-to-action-sequence endpoint.

`POST /actions/recommend-next` may remain useful for stepwise agents, but it should call the same planner with recent action history, not the old classifier-first path.

## Session Allowlist

Session settings control which actions are visible.

If an action is not allowed in session settings, it must not be included in the planner prompt at all.

This is the primary pre-planning restriction mechanism.

## Security Note

This architecture intentionally uses an LLM for semantic planning, so prompt-injection safety depends on:

- catalog allowlisting
- strict JSON output
- schema validation
- no execution in agent-core
- final validation in jubilant-goggles
- audit of generated action plans

Do not include secrets, hidden policy text, or unavailable actions in the planner prompt.
