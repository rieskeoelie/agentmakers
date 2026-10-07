import { CampaignInputSchema } from "../config";
import { matchRole } from "../roles";
import { reviewGatePriority } from "../vocabulary";

/**
 * Decision-maker role check for review approvals — the Phase 0 rule, not a Stage 3 list:
 * the stored contact title must match the run's `decision_maker_priority` (same default and synonyms as the
 * Phase 0 contact selection) via Phase 0 `matchRole` (roles.ts), which also rejects assistant/junior/former/deputy… titles.
 * The database refuses an approval unless this verdict is present, is for exactly the stored title and is qualified.
 */
export interface RoleCheck {
  title: string | null;
  qualified: boolean;
  matched_role: string | null;
}

/** The run's priority list as Phase 0 parses it (CampaignInputSchema: default DEFAULT_ROLE_PRIORITY). */
function priorityOf(stored: unknown): string[] {
  const r = CampaignInputSchema.shape.decision_maker_priority.safeParse(stored ?? undefined);
  return r.success ? r.data : CampaignInputSchema.shape.decision_maker_priority.parse(undefined);
}

export function decisionMakerRoleCheck(title: string | null | undefined, storedPriority: unknown): RoleCheck {
  const m = matchRole(title, reviewGatePriority(priorityOf(storedPriority)));
  return { title: title ?? null, qualified: m !== null, matched_role: m?.matched_role ?? null };
}

/** Blocker codes for display (the same codes the database uses). */
export function roleBlockers(check: RoleCheck): string[] {
  if (!check.title || !check.title.trim()) return ["NO_DECISION_MAKER_ROLE"];
  return check.qualified ? [] : ["ROLE_NOT_DECISION_MAKER"];
}

export function withRoleBlockers(blockers: string[], check: RoleCheck): string[] {
  return [...new Set([...blockers, ...roleBlockers(check)])].sort();
}
