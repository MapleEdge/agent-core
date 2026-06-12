# Recommend-next primary with visible plan action

## Intent

`planning.generate_plan` is a catalog action because it creates a user-facing UI artifact: a visible plan checklist. The plan is not a direct execution source.

The execution layer must only receive one action at a time from `/actions/recommend-next`.

## Core rule

```text
plan informs recommend-next
recommend-next chooses executable action
executor never follows plan directly
```

## Why plan is still an action

Plan generation has an observable product behavior:

- create a plan component in the UI
- display planned steps to the user
- checkmark steps as outcomes prove they are complete
- revise the displayed plan when recommend-next deviates

This is a real action, but its side effect is UI/advisory state, not code execution.

## Flow

```text
user prompt
  -> planning.generate_plan creates visible checklist
  -> recommend-next receives active_plan
  -> recommend-next returns one executable action
  -> platform executes that one action
  -> outcome is recorded
  -> visible plan steps are checked if outcome matches planned step
  -> recommend-next is called again
```

If recommend-next chooses an action outside the visible plan:

```text
recommend-next returns requires_plan_revision=true
  -> planning.revise_plan updates visible checklist
  -> selected action remains the execution source
```

Reality wins over the plan. The plan is revised to match the best next action, not the other way around.

## Scaffolded files

- `src/actions/planning/planActionTypes.ts`
- `src/actions/planning/visiblePlanStore.ts`
- `src/actions/planning/recommendNextPlanCoordinator.ts`
- `src/actions/catalog/planningActions.ts`

## Integration TODOs

1. Register `planningActions` in the canonical action catalog.
2. Extend `/actions/recommend-next` to accept and return the plan alignment fields.
3. Update `/actions/outcome` to call `applyOutcomeToVisiblePlan()`.
4. Add `/actions/plans/:session_id` for the frontend.
5. Add a control-plane plan component that renders checklist state.
6. Make jubilant-goggles call only `/actions/recommend-next` for action execution decisions.
