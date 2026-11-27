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
  const maxAgeHours = body.max_age_hours ?? 24;

  // 1. Fetch pending attachments older than threshold
  const { data: orphans, error: fetchErr } = await adminClient
    .from("minutes_attachments")
    .select("id,storage_path")
    .eq("upload_status", "pending_upload")
    .lt("created_at", new Date(Date.now() - maxAgeHours * 3600 * 1000).toISOString());

  if (fetchErr) {
    return json({ error: "fetch_failed" }, 500);
  }
  if (!orphans || orphans.length === 0) {
    return json({ deleted_records: 0, deleted_objects: 0 });
  }

  // 2. Remove storage objects (service role bypasses RLS)
  const paths = orphans.map((o: { storage_path: string }) => o.storage_path);
  let deletedObjects = 0;
  if (paths.length > 0) {
    const { error: rmErr } = await adminClient.storage.from("minutes-attachments").remove(paths);
    if (rmErr) return json({ error: "delete_objects_failed", deleted_records: 0 }, 500);
    deletedObjects = paths.length;
  }

  // 3. Delete DB records
  const ids = orphans.map((o: { id: string }) => o.id);
  const { error: delErr } = await adminClient
    .from("minutes_attachments")
    .delete()
    .in("id", ids);

  if (delErr) {
    return json({ error: "delete_records_failed", deleted_objects: deletedObjects }, 500);
  }

  return json({ deleted_records: ids.length, deleted_objects: deletedObjects });
});
