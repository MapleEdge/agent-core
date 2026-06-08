/**
 * Zod schema registry for registered actions.
 *
 * The runtime Map is populated by seedCanonicalCatalog(). Individual schemas
 * can also be registered at runtime via registerActionSchema().
 *
 * The canonical Zod schemas live in catalog/canonicalActions.ts. This file
 * provides the registry API and the backwards-compatible ACTION_ZOD_SCHEMAS
 * re-export.
 */

import { type ZodType } from "zod";
import { CANONICAL_ZOD_SCHEMAS } from "./catalog/canonicalActions.js";

/** Runtime-registered Zod schemas, keyed by action name. */
const actionZodSchemas = new Map<string, ZodType>();

export function registerActionSchema(name: string, schema: ZodType): void {
  actionZodSchemas.set(name, schema);
}

export function getActionSchema(name: string): ZodType | undefined {
  return actionZodSchemas.get(name);
}

export function hasActionSchema(name: string): boolean {
  return actionZodSchemas.has(name);
}

export function resetActionSchemas(): void {
  actionZodSchemas.clear();
}

/**
 * Backwards-compatible export. Points to the canonical schemas.
 * Prefer CANONICAL_ZOD_SCHEMAS from catalog/canonicalActions.ts for new code.
 */
export const ACTION_ZOD_SCHEMAS: Record<string, ZodType> = CANONICAL_ZOD_SCHEMAS;

/**
 * Register all canonical Zod schemas into the runtime Map.
 * Called by seedCanonicalCatalog(); also available standalone for tests.
 */
export function seedActionSchemas(): void {
  for (const [name, schema] of Object.entries(CANONICAL_ZOD_SCHEMAS)) {
    registerActionSchema(name, schema);
  }
}
