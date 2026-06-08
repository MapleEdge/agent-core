/**
 * Reusable fixture runner for action parity tests.
 *
 * Creates a Fastify test app with all routes registered, provides
 * helpers for running pipeline fixtures and asserting results.
 */

import Fastify, { FastifyInstance } from "fastify";
import { actionRoutes } from "../../src/actions/routes.js";
import { policyRoutes, seedDefaultPolicies } from "../../src/api/policy.js";
import { sessionRoutes, traceRoutes } from "../../src/traces/routes.js";
import { rulesRoutes, seedDefaultRules } from "../../src/rules/routes.js";
import { seedDefaultActions } from "../../src/actions/defaults.js";
import { seedActionSchemas, resetActionSchemas } from "../../src/actions/actionSchemas.js";
import { closeDb } from "../../src/db.js";
import { registerDefaultProviders } from "../../src/providers/defaults.js";
import { resetProviderRegistry } from "../../src/providers/registry.js";

export interface FixtureExpected {
  validation?: "pass" | "fail";
  invoked?: boolean;
  allowed?: boolean;
  failStage?: string | null;
  errorCode?: string;
  issueField?: string;
  auditStatuses?: string[];
  timelineEvents?: string[];
  finalStatus?: string;
  hasOutput?: boolean;
  hasError?: boolean;
  hasRationale?: boolean;
  hasSessionId?: boolean;
  persistedInAudit?: boolean;
  persistedInTimeline?: boolean;
  persistedInResponse?: boolean;
  auditStatus?: string;
  timelineHasFailedEvent?: boolean;
  note?: string;
  valid?: boolean;
  injectFailure?: string;
}

export interface ActionFixture {
  name: string;
  action: string;
  params: Record<string, unknown>;
  rationale?: string | null;
  taskType?: string;
  completedActions?: string[];
  withSession?: boolean;
  injectFailure?: string;
  expected: FixtureExpected;
}

export interface PipelineRunResult {
  statusCode: number;
  body: Record<string, unknown>;
  sessionId?: string;
  auditRecord?: Record<string, unknown>;
  timelineEvents?: Array<Record<string, unknown>>;
}

export async function createTestApp(): Promise<FastifyInstance> {
  process.env.AGENT_CORE_DB = ":memory:";
  const app = Fastify();
  await app.register(actionRoutes);
  await app.register(policyRoutes);
  await app.register(sessionRoutes);
  await app.register(traceRoutes);
  await app.register(rulesRoutes);
  seedDefaultActions();
  seedActionSchemas();
  seedDefaultRules();
  seedDefaultPolicies();
  registerDefaultProviders();
  await app.ready();
  return app;
}

export async function destroyTestApp(app: FastifyInstance): Promise<void> {
  await app.close();
  resetProviderRegistry();
  resetActionSchemas();
  closeDb();
}

export async function runPipelineFixture(
  app: FastifyInstance,
  fixture: ActionFixture,
): Promise<PipelineRunResult> {
  let sessionId: string | undefined;

  if (fixture.withSession || fixture.expected.timelineEvents || fixture.expected.auditStatuses) {
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: `fixture-${fixture.name}` },
    });
    sessionId = sessionRes.json().id;
  }

  const payload: Record<string, unknown> = {
    action_name: fixture.action,
    params: fixture.params,
  };
  if (sessionId) payload.session_id = sessionId;
  if (fixture.rationale !== undefined && fixture.rationale !== null) payload.rationale = fixture.rationale;
  if (fixture.taskType) payload.task_type = fixture.taskType;
  if (fixture.completedActions) payload.completed_actions = fixture.completedActions;

  const res = await app.inject({
    method: "POST",
    url: "/actions/simulate-pipeline",
    payload,
  });

  const body = res.json();
  let auditRecord: Record<string, unknown> | undefined;
  let timelineEvents: Array<Record<string, unknown>> | undefined;

  if (body.audit_id) {
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${body.audit_id}`,
    });
    auditRecord = auditRes.json();
  }

  if (sessionId) {
    const timelineRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/timeline`,
    });
    const tl = timelineRes.json();
    timelineEvents = (tl.events ?? []).map((e: { data: Record<string, unknown> }) => {
      const data = typeof e.data === "string" ? JSON.parse(e.data as string) : e.data;
      return data;
    });
  }

  return {
    statusCode: res.statusCode,
    body,
    sessionId,
    auditRecord,
    timelineEvents,
  };
}

/**
 * Compute percentile from a sorted array of numbers.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
}
