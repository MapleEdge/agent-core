import type { MountSessionRequest, Session } from "./sessionTypes.js";

export interface PolicyValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export function validatePolicyCompatibility(
  source: Session,
  target: Session,
  request: MountSessionRequest,
): PolicyValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!source.policy.allow_mount) {
    errors.push(`Source session ${source.id} policy does not allow mounting.`);
  }
  if (request.create_adaptation_session && !source.policy.allow_adapt) {
    errors.push(`Source session ${source.id} policy does not allow adaptation.`);
  }
  if (source.policy.visibility === "private" && source.root_id !== target.root_id) {
    warnings.push("Source visibility is private; platform authorization must approve cross-root projection.");
  }
  if (source.policy.license) {
    warnings.push(`Source license constraint should be carried into adapter constraints: ${source.policy.license}.`);
  }
  for (const constraint of source.policy.security_constraints) {
    warnings.push(`Security constraint should be represented in adapter constraints: ${constraint}.`);
  }

  return { ok: errors.length === 0, warnings, errors };
}
