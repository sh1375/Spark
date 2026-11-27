import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.111.0";
import {
  requireFullAuthAccess,
  deniedResponse,
} from "../_shared/requireFullAuthAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authResult = await requireFullAuthAccess(req);
  if (!authResult.ok) return deniedResponse();

  const callerUserId = authResult.userId!;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select("is_admin, is_active")
    .eq("user_id", callerUserId)
    .maybeSingle();

  if (profileErr || !profile || !profile.is_active || !profile.is_admin) {
    return json({ error: "ADMIN_REQUIRED" }, 403);
  }

  let body: { max_age_hours?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const maxAgeHours = body?.max_age_hours ?? 24;
  if (!Number.isInteger(maxAgeHours) || maxAgeHours < 24 || maxAgeHours > 87600) {
    return json({ error: "INVALID_CLEANUP_AGE" }, 400);
  }

  // Atomically reserve and mark stale rows before touching Storage.
  const { data: orphans, error: fetchErr } = await adminClient.rpc(
    "claim_stale_minutes_attachments_service", { p_max_age_hours: maxAgeHours },
  );

  if (fetchErr) {
    return json({ error: "fetch_failed" }, 500);
  }
  if (!Array.isArray(orphans) || orphans.some(o => !o || typeof o.id !== "string" || !o.id || typeof o.storage_path !== "string" || !o.storage_path)) {
    return json({ error: "invalid_cleanup_claim" }, 500);
  }
  if (orphans.length === 0) {
    return json({ deleted_records: 0, deleted_objects: 0 });
  }

  // 2. Remove storage objects (service role bypasses RLS)
  const paths = orphans.map((o: { storage_path: string }) => o.storage_path);
  let deletedObjects = 0;
  if (paths.length > 0) {
    try {
      const { data: removed, error: rmErr } = await adminClient.storage.from("minutes-attachments").remove(paths);
      if (rmErr || !Array.isArray(removed)) return json({ error: "delete_objects_failed", deleted_records: 0 }, 500);
      // Storage returns the objects it removed. A retry may find none remaining.
      deletedObjects = removed.length;
    } catch {
      // A lost response is ambiguous; preserve the reserved metadata for retry.
      return json({ error: "delete_objects_failed", deleted_records: 0 }, 500);
    }
  }

  // 3. Delete DB records
  const ids = orphans.map((o: { id: string }) => o.id);
  const { data: deleted, error: delErr } = await adminClient
    .from("minutes_attachments")
    .delete()
    .in("id", ids)
    .eq("upload_status", "cleanup_claimed")
    .select("id");

  if (delErr) {
    return json({ error: "delete_records_failed", deleted_objects: deletedObjects }, 500);
  }

  return json({ deleted_records: deleted?.length ?? 0, deleted_objects: deletedObjects });
});
