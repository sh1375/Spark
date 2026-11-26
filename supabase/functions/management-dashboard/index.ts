import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.111.0";
import { deniedResponse, requireFullAuthAccess } from "../_shared/requireFullAuthAccess.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Content-Type": "application/json",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: corsHeaders });
  }

  const auth = await requireFullAuthAccess(req);
  if (!auth.ok || !auth.userId) return deniedResponse();

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "INVALID_REQUEST_BODY" }), { status: 400, headers: corsHeaders });
  }

  const mode = typeof body.mode === "string" ? body.mode : "summary";
  if (mode !== "summary" && mode !== "decisions") {
    return new Response(JSON.stringify({ error: "INVALID_MODE" }), { status: 400, headers: corsHeaders });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === "decisions") {
    const unitId = body.unit_id == null ? null : String(body.unit_id);
    const unitName = body.unit_name == null ? null : String(body.unit_name).trim();

    if (unitId && !uuidPattern.test(unitId)) {
      return new Response(JSON.stringify({ error: "INVALID_UNIT_ID" }), { status: 400, headers: corsHeaders });
    }
    if (unitName && unitName.length > 300) {
      return new Response(JSON.stringify({ error: "INVALID_UNIT_NAME" }), { status: 400, headers: corsHeaders });
    }

    const { data, error } = await service.rpc("get_management_dashboard_decisions_for_user_v1", {
      p_user_id: auth.userId,
      p_unit_id: unitId,
      p_unit_name: unitName || null,
    });

    if (error) {
      const forbidden = error.message?.includes("MANAGEMENT_DASHBOARD_FORBIDDEN");
      return new Response(JSON.stringify({ error: forbidden ? "MANAGEMENT_DASHBOARD_FORBIDDEN" : "MANAGEMENT_DASHBOARD_DECISIONS_FAILED" }), {
        status: forbidden ? 403 : 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: corsHeaders });
  }

  const { data, error } = await service.rpc("get_management_dashboard_for_user_v1", {
    p_user_id: auth.userId,
  });

  if (error) {
    const forbidden = error.message?.includes("MANAGEMENT_DASHBOARD_FORBIDDEN");
    return new Response(JSON.stringify({ error: forbidden ? "MANAGEMENT_DASHBOARD_FORBIDDEN" : "MANAGEMENT_DASHBOARD_FAILED" }), {
      status: forbidden ? 403 : 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: corsHeaders });
});
