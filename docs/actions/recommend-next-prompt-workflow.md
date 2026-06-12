# Recommend-next module

## Intent

`/actions/recommend-next` should become the primary and eventually only source of executable next-action decisions. `/actions/plan` creates or revises visible plan state; it should not guide the executor directly.

## Consolidated location

All new recommend-next prompt, plan-alignment, visible-plan, and planning-action scaffold now lives under one module:

```text
src/actions/recommend-next/
```

Files:

- `types.ts`
  - Shared prompt, visible-plan, plan-alignment, and recommend-next output types.
- `promptBuilder.ts`
  - Builds the structured prompt for recommend-next.
- `visiblePlanStore.ts`
  - Stores and updates visible plan UI artifacts by session.
- `planCoordinator.ts`
  - Checks whether recommend-next aligns with the visible plan and marks steps complete from outcomes.
- `engine.ts`
  - Wraps LLM recommend-next and falls back to `ActionKnowledgeProvider.recommendNextActions()`.
- `planningActions.ts`
  - Defines `planning.generate_plan` and `planning.revise_plan` as visible UI-state actions.
- `index.ts`
  - Single barrel export for the module.

Legacy compatibility:

- `src/actions/RecommendNextEngine.ts` now re-exports from `src/actions/recommend-next/engine.ts`.

## Existing implementation used

The existing recommendation path is `ActionKnowledgeProvider.recommendNextActions()`. The mock provider already implements this by consulting the rule solver, outcome statistics, and policy hints.

## Prompt sources

The prompt construction intentionally includes:

- current context
- action catalog
- active visible plan
- suggested plan from `/actions/plan`
- recent action outcomes
- relevant memory
- session graph projection
- additional future sources

## Plan relationship

The plan is visible UI state and advisory context. Recommend-next may follow it, partially follow it, or deviate from it.

If recommend-next deviates, it should return `requires_plan_revision=true` so the plan can be revised to match the selected next action.

## Integration TODO

1. Update `/actions/recommend-next` route to use `recommendNext()` from `src/actions/recommend-next`.
2. Extend request schemas to pass active_plan and suggested_plan.
3. Use the visible plan store to provide active plan state by session.
4. Call plan revision when the selected next action deviates from the plan.
5. Update `/actions/outcome` to call `applyOutcomeToVisiblePlan()` after each outcome.
6. Update jubilant-goggles so the execution layer only calls `/actions/recommend-next`, never `/actions/plan` directly.
