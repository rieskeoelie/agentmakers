import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestDb, type TestDb } from "../stage2/helpers.js";

export const STAGE3_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261007090000_outreach_stage3.sql");
export const IDENTITY_REVIEW_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261009090000_outreach_identity_review.sql");
export const OWNER_DISCOVERY_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261010090000_outreach_owner_discovery.sql");
export const OWNER_FUNNEL_FIX_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261011090000_outreach_owner_funnel_fix.sql");

/** Stage 2 + Stage 3 (+ identity-review) migrations on real Postgres (PGlite); RPCs run as service_role. */
export async function createStage3Db(): Promise<TestDb> {
  const t = await createTestDb();
  await t.pg.exec(readFileSync(STAGE3_MIGRATION, "utf8"));
  await t.pg.exec(readFileSync(IDENTITY_REVIEW_MIGRATION, "utf8"));
  await t.pg.exec(readFileSync(OWNER_DISCOVERY_MIGRATION, "utf8"));
  await t.pg.exec(readFileSync(OWNER_FUNNEL_FIX_MIGRATION, "utf8"));
  return t;
}
