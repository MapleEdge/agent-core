# 0006: Action Knowledge Boundary

## Status

Accepted.

## Decision

agent-core owns action knowledge, not action execution.

agent-core is responsible for knowing what actions exist, what schemas they require, how actions relate to each other, which action should usually happen next, and how action outcomes should be recorded as traces and memory.

jubilant-goggles is responsible for executing actions and enforcing validation, permissions, approvals, policy, worktree safety, and side-effect boundaries.

## Boundary

agent-core owns:

```text
action catalog
action names and descriptions
action input/output schemas
action schema validation
action risk metadata
action sequencing rules
action recommendation
action plan generation
action-plan schema validation
allowed-next-action solving
action trace semantics
action outcome memory extraction
```

jubilant-goggles owns:

```text
real execution
repo checkout and source access
worktrees and branches
executor routing
file reads/writes
shell commands
browser actions
validation commands
permission checks
policy enforcement
approval gates
commits, pushes, PRs, deploys
secrets, payments, subscriptions, cloud resources
```

## Invariant

```text
No action recommendation leaves agent-core unless it passes agent-core schema validation.
No action is executed by jubilant-goggles unless it passes jubilant-goggles platform validation and permission checks.
```

Schema-valid means only:

```text
The action payload is well-formed according to the action contract.
```

Schema-valid does not mean:

```text
The action is safe, authorized, approved, executable, or allowed for this user/session/repo.
```

## ActionKnowledgeProvider

The action interface should be named `ActionKnowledgeProvider`, not `ActionProvider`, because agent-core does not provide execution.

Recommended methods:

```typescript
interface ActionKnowledgeProvider {
  listActions(): Promise<ActionDefinition[]>;
  getAction(name: string): Promise<ActionDefinition | null>;

  validateAction(input: ProposedAction): Promise<ActionValidationResult>;
  validatePlan(plan: ProposedActionPlan): Promise<ActionPlanValidationResult>;

  recommendNextActions(
    context: ActionRecommendationContext
  ): Promise<ValidatedActionRecommendation[]>;

  buildPlan(
    context: ActionPlanContext
  ): Promise<ValidatedActionPlan>;

  recordActionOutcome(
    outcome: ActionOutcomeRecord
  ): Promise<void>;
}
```

All recommendations returned to jubilant-goggles must include:

```typescript
{
  requires_platform_validation: true
}
```

## Zod and JSON Schema

agent-core may use Zod internally for action contract validation.

HTTP responses should expose portable JSON Schema rather than Zod objects, so jubilant-goggles can independently validate or generate compatible runtime validators.

Example action definition:

```json
{
  "name": "read_file",
  "description": "Read a file from the current worktree",
  "params_json_schema": {
    "type": "object",
    "required": ["path"],
    "properties": {
      "path": { "type": "string", "minLength": 1 },
      "reason": { "type": "string" }
    }
  },
  "requires_platform_validation": true
}
```

## Endpoint Direction

agent-core action endpoints should be contract and recommendation endpoints:

```text
GET  /actions
GET  /actions/:name
POST /actions/validate
POST /actions/plan
POST /actions/recommend-next
POST /actions/validate-plan
```

Any existing `/actions/execute` endpoint is a mock contract test only. It must not be treated as production execution authority.

## Why

This preserves the product boundary:

```text
agent-core:
  knows and recommends

jubilant-goggles:
  validates and does
```

It also lets agent-core remain reusable across different platforms and runners, while jubilant-goggles retains responsibility for user-visible control, execution safety, and real-world side effects.
