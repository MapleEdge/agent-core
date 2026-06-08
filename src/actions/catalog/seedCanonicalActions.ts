/**
 * Seed the action database and Zod schema registry from the canonical catalog.
 *
 * This is the single entry point for populating actions. It replaces
 * both seedDefaultActions() and seedActionSchemas() to eliminate divergence.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { getDb } from "../../db.js";
import { registerActionSchema } from "../actionSchemas.js";
import { CANONICAL_ACTIONS } from "./canonicalActions.js";

/**
 * Seed the SQLite actions table and register Zod schemas from the canonical
 * catalog. Call once at startup.
 */
export function seedCanonicalCatalog(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO actions (name, description, schema, risk_level, requires_approval)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const action of CANONICAL_ACTIONS) {
    const jsonSchema = zodToJsonSchema(action.zodSchema, { target: "openApi3" });
    // Mutate params_json_schema in place so the catalog reflects the real schema
    action.params_json_schema = jsonSchema as Record<string, unknown>;

    insert.run(
      action.name,
      action.description,
      JSON.stringify(jsonSchema),
      action.risk,
      action.requires_approval ? 1 : 0,
    );

    registerActionSchema(action.name, action.zodSchema);
  }
}

/**
 * Populate JSON schemas on canonical actions without touching the DB.
 * Useful for tests that only need schema validation.
 */
export function hydrateCanonicalSchemas(): void {
  for (const action of CANONICAL_ACTIONS) {
    const jsonSchema = zodToJsonSchema(action.zodSchema, { target: "openApi3" });
    action.params_json_schema = jsonSchema as Record<string, unknown>;
    registerActionSchema(action.name, action.zodSchema);
  }
}
