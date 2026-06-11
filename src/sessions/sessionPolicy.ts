import type {
  MountSessionRequest,
  PolicyAuthorizationContext,
  PolicyCheckEvidence,
  PolicyEvidence,
  Session,
  SessionPolicy,
} from "./sessionTypes.js";

export interface PolicyValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  evidence: PolicyEvidence;
}

const POLICY_DEFAULTS: SessionPolicy = {
  visibility: "workspace",
  allow_mount: true,
  allow_adapt: true,
  allow_outbound_mount: true,
  allow_inbound_mount: true,
  allow_outbound_adapt: true,
  allow_inbound_adapt: true,
  inherit_from_parent: true,
  allow_policy_override: false,
  effective_policy_source_ids: [],
  security_constraints: [],
};

const visibilityRank: Record<SessionPolicy["visibility"], number> = {
  public: 0,
  workspace: 1,
  private: 2,
};

function mostRestrictiveVisibility(a: SessionPolicy["visibility"], b: SessionPolicy["visibility"]): SessionPolicy["visibility"] {
  return visibilityRank[a] >= visibilityRank[b] ? a : b;
}

function mergePolicy(parent: SessionPolicy, child: SessionPolicy): SessionPolicy {
  return {
    visibility: mostRestrictiveVisibility(parent.visibility, child.visibility),
    allow_mount: parent.allow_mount && child.allow_mount,
    allow_adapt: parent.allow_adapt && child.allow_adapt,
    allow_outbound_mount: parent.allow_outbound_mount && child.allow_outbound_mount,
    allow_inbound_mount: parent.allow_inbound_mount && child.allow_inbound_mount,
    allow_outbound_adapt: parent.allow_outbound_adapt && child.allow_outbound_adapt,
    allow_inbound_adapt: parent.allow_inbound_adapt && child.allow_inbound_adapt,
    inherit_from_parent: child.inherit_from_parent,
    allow_policy_override: parent.allow_policy_override && child.allow_policy_override,
    effective_policy_source_ids: [...parent.effective_policy_source_ids, ...child.effective_policy_source_ids],
    license: parent.license ?? child.license,
    security_constraints: Array.from(new Set([...parent.security_constraints, ...child.security_constraints])),
  };
}

export function normalizePolicy(policy: Partial<SessionPolicy> | undefined, sessionId?: string): SessionPolicy {
  const normalized = { ...POLICY_DEFAULTS, ...(policy ?? {}) };
  const ids = new Set(normalized.effective_policy_source_ids);
  if (sessionId) ids.add(sessionId);
  return {
    ...normalized,
    effective_policy_source_ids: Array.from(ids),
    security_constraints: normalized.security_constraints ?? [],
  };
}

export function computeEffectivePolicy(parentChain: Session[], session: Session): SessionPolicy {
  const own = normalizePolicy(session.policy, session.id);
  if (!own.inherit_from_parent || parentChain.length === 0) {
    return own;
  }

  return parentChain.reduce(
    (effective, parent) => mergePolicy(effective, normalizePolicy(parent.policy, parent.id)),
    own,
  );
}

function pushCheck(input: {
  checks: PolicyCheckEvidence[];
  errors: string[];
  warnings: string[];
  ok: boolean;
  code: string;
  message: string;
  hard?: boolean;
  source_session_id?: string;
  target_session_id?: string;
}): void {
  input.checks.push({
    code: input.code,
    ok: input.ok,
    message: input.message,
    source_session_id: input.source_session_id,
    target_session_id: input.target_session_id,
  });
  if (input.ok) return;
  if (input.hard) input.errors.push(input.message);
  else input.warnings.push(input.message);
}

export function validatePolicyCompatibility(
  source: Session,
  target: Session,
  request: MountSessionRequest,
  options?: {
    source_parent_chain?: Session[];
    target_parent_chain?: Session[];
    authorization?: PolicyAuthorizationContext;
  },
): PolicyValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const checks: PolicyCheckEvidence[] = [];
  const authorization = request.authorization ?? options?.authorization;
  const sourceEffective = computeEffectivePolicy(options?.source_parent_chain ?? [], source);
  const targetEffective = computeEffectivePolicy(options?.target_parent_chain ?? [], target);

  pushCheck({
    checks,
    errors,
    warnings,
    ok: sourceEffective.allow_mount && sourceEffective.allow_outbound_mount,
    hard: true,
    code: "source_outbound_mount_allowed",
    message: `Source session ${source.id} effective policy does not allow outbound mounting.`,
    source_session_id: source.id,
    target_session_id: target.id,
  });
  pushCheck({
    checks,
    errors,
    warnings,
    ok: targetEffective.allow_mount && targetEffective.allow_inbound_mount,
    hard: true,
    code: "target_inbound_mount_allowed",
    message: `Target session ${target.id} effective policy does not allow inbound mounts.`,
    source_session_id: source.id,
    target_session_id: target.id,
  });

  if (request.create_adaptation_session) {
    pushCheck({
      checks,
      errors,
      warnings,
      ok: sourceEffective.allow_adapt && sourceEffective.allow_outbound_adapt,
      hard: true,
      code: "source_outbound_adapt_allowed",
      message: `Source session ${source.id} effective policy does not allow outbound adaptation.`,
      source_session_id: source.id,
      target_session_id: target.id,
    });
    pushCheck({
      checks,
      errors,
      warnings,
      ok: targetEffective.allow_adapt && targetEffective.allow_inbound_adapt,
      hard: true,
      code: "target_inbound_adapt_allowed",
      message: `Target session ${target.id} effective policy does not allow inbound adaptation.`,
      source_session_id: source.id,
      target_session_id: target.id,
    });
  }

  const crossRootPrivate = sourceEffective.visibility === "private" && source.root_id !== target.root_id;
  pushCheck({
    checks,
    errors,
    warnings,
    ok: !crossRootPrivate || authorization?.allow_private_projection === true,
    hard: true,
    code: "private_cross_root_projection_authorized",
    message: "Source effective visibility is private; cross-root projection requires explicit authorization.",
    source_session_id: source.id,
    target_session_id: target.id,
  });

  if (sourceEffective.license) {
    warnings.push(`Source license constraint should be carried into adapter constraints: ${sourceEffective.license}.`);
    checks.push({
      code: "source_license_carried",
      ok: true,
      message: `Source effective license constraint recorded: ${sourceEffective.license}.`,
      source_session_id: source.id,
      target_session_id: target.id,
    });
  }
  for (const constraint of sourceEffective.security_constraints) {
    warnings.push(`Security constraint should be represented in adapter constraints: ${constraint}.`);
    checks.push({
      code: "source_security_constraint_carried",
      ok: true,
      message: `Source effective security constraint recorded: ${constraint}.`,
      source_session_id: source.id,
      target_session_id: target.id,
    });
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    evidence: {
      source_effective_policy: sourceEffective,
      target_effective_policy: targetEffective,
      source_policy_source_ids: sourceEffective.effective_policy_source_ids,
      target_policy_source_ids: targetEffective.effective_policy_source_ids,
      authorization,
      checks,
    },
  };
}
