import { recordAccessDenial } from "../_shared/accessDenialAudit.ts";
import "jsr:@supabase/functions-js@2.111.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { requireFullAuthAccess, deniedResponse } from "../_shared/requireFullAuthAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const ALLOWED_TABLES = new Set([
  "meetings", "shared_meetings", "meeting_inbox", "participants", "meeting_agenda_items",
  "tasks", "task_workflow_steps", "notes", "contacts_email",
  "minutes", "minutes_participants", "minutes_external_participants", "minutes_agenda_results",
  "minutes_decisions", "minutes_approvals", "minutes_approval_comments", "minutes_decision_updates",
  "minutes_decision_reminders", "minutes_attachments", "minutes_audit_log",
  "calendars", "calendar_occasions", "all_day_events", "calendar_subscriptions",
  "chat_conversations", "chat_messages", "chat_group_members", "chat_tags", "chat_message_reactions",
  "chat_message_stars", "chat_reminders", "chat_message_read_log", "chat_message_read_receipts",
  "chat_message_tag_assignments", "channels", "channel_members", "channel_messages", "channel_work_topics",
  "channel_broadcasts", "channel_group_tasks", "channel_group_task_assignments", "channel_group_task_activities",
  "channel_notification_rules", "channel_sms_rules", "channel_message_reactions", "channel_message_stars",
  "channel_message_private_pins", "channel_message_read_log", "call_sessions", "conference_rooms",
  "conference_participants", "conference_messages", "conference_polls", "conference_poll_votes",
  "conference_breakout_rooms", "conference_reactions", "room_mod_actions", "pending_approvals", "banned_users",
  "conference_whiteboard", "conference_waiting_room", "conference_quality_metrics", "notifications",
  "notification_event_registry", "notification_templates", "notification_group_rules", "broadcast_messages",
  "broadcast_recipients", "user_preferences", "user_auto_accept_organizers", "user_groups", "user_group_members", "user_access_relations",
  "user_bale_mapping", "org_organizations", "org_units", "org_positions", "org_position_members",
  "org_level_definitions", "org_level_permissions", "org_position_permissions", "system_config", "spark_config",
  "spark_ai_settings", "spark_field_keywords", "spark_memory", "spark_assistant_logs", "social_channel_configs",
  "sms_providers", "sms_templates", "sms_delivery_policies", "sms_group_rules", "sms_dispatch_logs", "daily_report_config",
  "rahyab_settings", "rahyab_inbox", "bale_link_tokens", "telegram_link_tokens", "hr_sso_config", "audit_log",
]);

const TABLE_PK: Record<string, string[]> = {
  "all_day_events": [
    "id"
  ],
  "audit_log": [
    "id"
  ],
  "bale_link_tokens": [
    "token"
  ],
  "banned_users": [
    "id"
  ],
  "broadcast_messages": [
    "id"
  ],
  "broadcast_recipients": [
    "id"
  ],
  "calendar_occasions": [
    "id"
  ],
  "calendar_subscriptions": [
    "id"
  ],
  "calendars": [
    "id"
  ],
  "call_sessions": [
    "id"
  ],
  "channel_broadcasts": [
    "id"
  ],
  "channel_group_task_activities": [
    "id"
  ],
  "channel_group_task_assignments": [
    "id"
  ],
  "channel_group_tasks": [
    "id"
  ],
  "channel_members": [
    "id"
  ],
  "channel_message_private_pins": [
    "id"
  ],
  "channel_message_reactions": [
    "id"
  ],
  "channel_message_read_log": [
    "message_id",
    "user_id"
  ],
  "channel_message_stars": [
    "id"
  ],
  "channel_messages": [
    "id"
  ],
  "channel_notification_rules": [
    "id"
  ],
  "channel_sms_rules": [
    "id"
  ],
  "channel_work_topics": [
    "id"
  ],
  "channels": [
    "id"
  ],
  "chat_conversations": [
    "id"
  ],
  "chat_group_members": [
    "id"
  ],
  "chat_message_reactions": [
    "id"
  ],
  "chat_message_read_log": [
    "message_id",
    "user_id"
  ],
  "chat_message_read_receipts": [
    "conversation_id",
    "user_id"
  ],
  "chat_message_stars": [
    "id"
  ],
  "chat_message_tag_assignments": [
    "id"
  ],
  "chat_messages": [
    "id"
  ],
  "chat_reminders": [
    "id"
  ],
  "chat_tags": [
    "id"
  ],
  "conference_breakout_rooms": [
    "id"
  ],
  "conference_messages": [
    "id"
  ],
  "conference_participants": [
    "id"
  ],
  "conference_poll_votes": [
    "id"
  ],
  "conference_polls": [
    "id"
  ],
  "conference_quality_metrics": [
    "id"
  ],
  "conference_reactions": [
    "id"
  ],
  "conference_rooms": [
    "id"
  ],
  "conference_waiting_room": [
    "id"
  ],
  "conference_whiteboard": [
    "id"
  ],
  "contacts_email": [
    "id"
  ],
  "daily_report_config": [
    "id"
  ],
  "hr_sso_config": [
    "id"
  ],
  "meeting_agenda_items": [
    "id"
  ],
  "meeting_inbox": [
    "id"
  ],
  "meetings": [
    "id"
  ],
  "minutes_agenda_results": [
    "id"
  ],
  "minutes_approval_comments": [
    "id"
  ],
  "minutes_approvals": [
    "id"
  ],
  "minutes_attachments": [
    "id"
  ],
  "minutes_audit_log": [
    "id"
  ],
  "minutes_decision_reminders": [
    "id"
  ],
  "minutes_decision_updates": [
    "id"
  ],
  "minutes_decisions": [
    "id"
  ],
  "minutes_external_participants": [
    "id"
  ],
  "minutes_participants": [
    "id"
  ],
  "minutes": [
    "id"
  ],
  "notes": [
    "id"
  ],
  "notification_event_registry": [
    "event_key"
  ],
  "notification_group_rules": [
    "id"
  ],
  "notification_templates": [
    "id"
  ],
  "notifications": [
    "id"
  ],
  "org_level_definitions": [
    "id"
  ],
  "org_level_permissions": [
    "id"
  ],
  "org_organizations": [
    "id"
  ],
  "org_position_members": [
    "id"
  ],
  "org_position_permissions": [
    "id"
  ],
  "org_positions": [
    "id"
  ],
  "org_units": [
    "id"
  ],
  "participants": [
    "id"
  ],
  "pending_approvals": [
    "id"
  ],
  "rahyab_inbox": [
    "id"
  ],
  "rahyab_settings": [
    "id"
  ],
  "room_mod_actions": [
    "id"
  ],
  "shared_meetings": [
    "id"
  ],
  "sms_delivery_policies": [
    "category",
    "event_type"
  ],
  "sms_dispatch_logs": [
    "id"
  ],
  "sms_group_rules": [
    "id"
  ],
  "sms_providers": [
    "id"
  ],
  "sms_templates": [
    "id"
  ],
  "social_channel_configs": [
    "id"
  ],
  "spark_ai_settings": [
    "id"
  ],
  "spark_assistant_logs": [
    "id"
  ],
  "spark_config": [
    "id"
  ],
  "spark_field_keywords": [
    "id"
  ],
  "spark_memory": [
    "id"
  ],
  "system_config": [
    "id"
  ],
  "task_workflow_steps": [
    "id"
  ],
  "tasks": [
    "id"
  ],
  "telegram_link_tokens": [
    "id"
  ],
  "user_access_relations": [
    "id"
  ],
  "user_auto_accept_organizers": [
    "user_id",
    "organizer_user_id"
  ],
  "user_bale_mapping": [
    "id"
  ],
  "user_group_members": [
    "id"
  ],
  "user_groups": [
    "id"
  ],
  "user_preferences": [
    "user_id"
  ]
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const auth = await requireFullAuthAccess(req);
  if (!auth.ok || !auth.userId) return deniedResponse();

  try {
    const client = adminClient();
    const { data: profile } = await client
      .from("profiles")
      .select("is_admin")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (profile?.is_admin !== true) {
      await recordAccessDenial(req, auth.userId, "ADMIN_REQUIRED");
      return json({ error: "ADMIN_REQUIRED" }, 403);
    }

    const body = await req.json() as { table?: string; offset?: number; limit?: number };
    const table = String(body.table || "");
    if (!ALLOWED_TABLES.has(table)) return json({ error: "TABLE_NOT_ALLOWED" }, 400);

    const offset = Math.max(0, Number.isFinite(Number(body.offset)) ? Math.floor(Number(body.offset)) : 0);
    const limit = Math.min(1000, Math.max(1, Number.isFinite(Number(body.limit)) ? Math.floor(Number(body.limit)) : 1000));
    const keys = TABLE_PK[table];
    if (!keys?.length) return json({ error: "BACKUP_STABLE_KEY_UNAVAILABLE" }, 409);
    let query = (client as any).from(table).select("*");
    for (const key of keys) query = query.order(key, { ascending: true });
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) return json({ error: "BACKUP_READ_FAILED", code: error.code }, 500);

    return json({
      ok: true,
      backup_schema_version: 3,
      table,
      offset,
      limit,
      rows: data ?? [],
      has_more: Array.isArray(data) && data.length === limit,
    });
  } catch {
    return json({ error: "BACKUP_READ_FAILED" }, 500);
  }
});
