import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestDb, type TestDb } from "../stage2/helpers.js";

export const STAGE3_MIGRATION = join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261007090000_outreach_stage3.sql");

/** Stage 2 + Stage 3 migrations on real Postgres (PGlite); RPCs run as service_role. */
export async function createStage3Db(): Promise<TestDb> {
  const t = await createTestDb();
  await t.pg.exec(readFileSync(STAGE3_MIGRATION, "utf8"));
  return t;
}
