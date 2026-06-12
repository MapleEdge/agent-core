# Recommend-next prompt workflow

## Intent

`/actions/recommend-next` should become the primary and eventually only source of executable next-action decisions. `/actions/plan` creates or revises visible plan state; it should not guide the executor directly.

## Existing implementation used

The existing recommendation path is `ActionKnowledgeProvider.recommendNextActions()`. The mock provider already implements this by consulting the rule solver, outcome statistics, and policy hints.

## New scaffold

- `src/actions/recommendNextPromptBuilder.ts`
  - Builds a structured prompt for recommend-next.
  - Includes action catalog, current context, active visible plan, suggested plan, recent outcomes, memories, and session graph projection.

- `src/actions/RecommendNextEngine.ts`
  - Wraps the existing provider recommendation path.
  - Uses an LLM when available and falls back to `provider.recommendNextActions()`.
  - Returns exactly one primary recommendation plus the ranked provider list.

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

1. Update `/actions/recommend-next` route to use `recommendNext()` from `RecommendNextEngine.ts`.
2. Extend request schemas to pass active_plan and suggested_plan.
3. Use the visible plan store to provide active plan state by session.
4. Call plan revision when the selected next action deviates from the plan.
5. Update jubilant-goggles so the execution layer only calls `/actions/recommend-next`, never `/actions/plan` directly.
