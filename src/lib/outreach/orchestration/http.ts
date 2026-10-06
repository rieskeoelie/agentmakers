import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { supabaseOutreachDb, type OutreachDb } from "./db";
import type { Actor } from "./repository";
import { actorFromSession, httpErrorFor } from "./service";

/** Next.js glue for the outreach API routes (server-only). */
export function outreachDb(): OutreachDb {
  return supabaseOutreachDb(supabaseAdmin);
}

export function sessionActor(req: NextRequest): Actor | null {
  const s = getSessionFromRequest(req);
  return s ? actorFromSession(s) : null;
}

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export function errorResponse(e: unknown): NextResponse {
  const { status, error } = httpErrorFor(e);
  if (status >= 500) console.error("[outreach]", e);
  return NextResponse.json({ error }, { status });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
