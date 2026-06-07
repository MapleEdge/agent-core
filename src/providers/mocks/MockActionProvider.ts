import { getDb } from "../../db.js";
import { executeMockAction } from "../../actions/executor.js";
import { getActionSchema } from "../../actions/actionSchemas.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  ActionProvider,
  ActionSchema,
  ActionValidationResult,
  ActionExecutionResult,
} from "../ActionProvider.js";
import type { ProviderStatus } from "../registry.js";

interface ActionRow {
  name: string;
  description: string;
  schema: string;
  risk_level: ActionSchema["risk_level"];
  requires_approval: number;
}

export class MockActionProvider implements ActionProvider {
  readonly name = "mock-action";
  readonly status: ProviderStatus = "mock";

  async register(schema: ActionSchema): Promise<ActionSchema> {
    getDb()
      .prepare("INSERT OR REPLACE INTO actions (name, description, schema, risk_level, requires_approval) VALUES (?, ?, ?, ?, ?)")
      .run(
        schema.name,
        schema.description,
        JSON.stringify(schema.parameters),
        schema.risk_level,
        schema.requires_approval ? 1 : 0,
      );
    return schema;
  }

  async list(): Promise<ActionSchema[]> {
    const rows = getDb().prepare("SELECT * FROM actions ORDER BY name").all() as ActionRow[];
    return rows.map((row) => this.mapAction(row));
  }

  async get(name: string): Promise<ActionSchema | null> {
    const row = getDb().prepare("SELECT * FROM actions WHERE name = ?").get(name) as ActionRow | undefined;
    return row ? this.mapAction(row) : null;
  }

  async validate(name: string, params: Record<string, unknown>): Promise<ActionValidationResult> {
    const action = await this.get(name);
    if (!action) return { valid: false, errors: [`Unknown action: ${name}`] };

    const zodSchema = getActionSchema(name);
    if (zodSchema) {
      const result = zodSchema.safeParse(params);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        }));
        return {
          valid: false,
          errors: issues.map((i) => `${i.path}: ${i.message}`),
          issues,
        };
      }
      return { valid: true, errors: [] };
    }

    // Fallback: legacy parameter-required check
    const missingRequired = Object.entries(action.parameters)
      .filter(([, value]) => this.isRequiredParameter(value))
      .map(([key]) => key)
      .filter((key) => !(key in params));
    return {
      valid: missingRequired.length === 0,
      errors: missingRequired.map((key) => `Missing required parameter: ${key}`),
    };
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ActionExecutionResult> {
    const action = await this.get(name);
    if (!action) {
      return {
        success: false,
        output: null,
        duration_ms: 0,
        execution_mode: "mock",
        error: `Unknown action: ${name}`,
      };
    }
    if (action.requires_approval) {
      return {
        success: false,
        output: null,
        duration_ms: 0,
        execution_mode: "mock",
        error: "Action requires platform approval",
      };
    }

    const start = performance.now();
    const output = executeMockAction(name, params);
    const duration_ms = Math.round(performance.now() - start);
    return {
      success: true,
      output,
      duration_ms,
      execution_mode: name === "read_file" ? "local_safe" : "mock",
    };
  }

  private mapAction(row: ActionRow): ActionSchema {
    const zodSchema = getActionSchema(row.name);
    return {
      name: row.name,
      description: row.description,
      parameters: JSON.parse(row.schema) as Record<string, unknown>,
      risk_level: row.risk_level,
      requires_approval: Boolean(row.requires_approval),
      zodSchema,
      jsonSchema: zodSchema ? zodToJsonSchema(zodSchema) as Record<string, unknown> : undefined,
    };
  }

  private isRequiredParameter(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const parameter = value as Record<string, unknown>;
    return parameter.required === true;
  }
}
