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
  "calendars", "calendar_occasions", "all_day_events", "calendar_subscriptions",
  "chat_conversations", "chat_messages", "chat_group_members", "chat_tags",
  "chat_message_reactions", "chat_message_stars", "chat_reminders",
  "chat_message_read_log", "chat_message_read_receipts", "chat_message_tag_assignments",
  "channels", "channel_members", "channel_messages", "channel_work_topics",
  "channel_broadcasts", "channel_group_tasks", "channel_group_task_assignments",
  "channel_group_task_activities", "channel_notification_rules", "channel_sms_rules",
  "channel_message_reactions", "channel_message_stars", "channel_message_private_pins",
  "channel_message_read_log", "call_sessions",
  "conference_rooms", "conference_participants", "conference_messages", "conference_polls",
  "conference_poll_votes", "conference_breakout_rooms", "conference_reactions", "room_mod_actions",
  "pending_approvals", "banned_users", "conference_whiteboard", "conference_waiting_room",
  "conference_quality_metrics",
  "notifications", "notification_templates", "notification_group_rules", "notification_event_registry",
  "broadcast_messages", "broadcast_recipients",
  "user_preferences", "user_auto_accept_organizers", "user_groups", "user_group_members", "user_access_relations", "user_bale_mapping",
  "org_organizations", "org_units", "org_positions", "org_position_members",
  "org_level_definitions", "org_level_permissions", "org_position_permissions",
  "system_config", "spark_config", "spark_ai_settings", "spark_field_keywords", "spark_memory",
  "spark_assistant_logs", "social_channel_configs", "sms_providers", "sms_templates", "sms_delivery_policies", "sms_group_rules",
  "sms_dispatch_logs", "daily_report_config", "rahyab_settings", "rahyab_inbox",
  "bale_link_tokens", "telegram_link_tokens", "hr_sso_config", "audit_log",
  "minutes", "minutes_agenda_results", "minutes_approval_comments", "minutes_approvals",
  "minutes_attachments", "minutes_audit_log", "minutes_decision_reminders",
  "minutes_decision_updates", "minutes_decisions", "minutes_external_participants", "minutes_participants",
]);

const RESTORE_ORDER = [
  "org_organizations", "org_level_definitions", "org_level_permissions", "org_units", "org_positions",
  "org_position_permissions", "user_groups", "notification_event_registry", "notification_templates",
  "social_channel_configs", "sms_providers", "sms_templates", "sms_delivery_policies", "sms_group_rules", "system_config",
  "spark_config", "spark_ai_settings", "spark_field_keywords", "daily_report_config", "rahyab_settings",
  "hr_sso_config", "user_preferences", "user_auto_accept_organizers", "user_bale_mapping", "user_access_relations", "bale_link_tokens",
  "telegram_link_tokens", "calendars", "calendar_occasions", "all_day_events", "contacts_email", "notes",
  "tasks", "task_workflow_steps", "chat_tags", "spark_memory", "spark_assistant_logs",
  "meetings", "shared_meetings", "meeting_inbox", "participants", "meeting_agenda_items",
  "minutes", "minutes_external_participants", "minutes_participants", "minutes_agenda_results",
  "minutes_decisions", "minutes_approvals", "minutes_approval_comments", "minutes_decision_updates",
  "minutes_decision_reminders", "minutes_attachments", "minutes_audit_log",
  "channels", "channel_work_topics", "channel_members", "channel_notification_rules", "channel_sms_rules",
  "channel_broadcasts", "channel_group_tasks", "channel_messages", "channel_group_task_assignments",
  "channel_group_task_activities", "channel_message_reactions", "channel_message_stars",
  "channel_message_private_pins", "channel_message_read_log", "calendar_subscriptions", "org_position_members",
  "user_group_members", "notification_group_rules", "chat_conversations", "chat_group_members", "chat_messages",
  "chat_message_reactions", "chat_message_stars", "chat_reminders", "chat_message_read_log",
  "chat_message_read_receipts", "chat_message_tag_assignments", "call_sessions", "conference_rooms",
  "conference_polls", "conference_participants", "conference_messages", "conference_reactions",
  "conference_poll_votes", "conference_breakout_rooms", "conference_whiteboard", "conference_waiting_room",
  "conference_quality_metrics", "room_mod_actions", "pending_approvals", "banned_users",
  "broadcast_messages", "broadcast_recipients", "sms_dispatch_logs", "rahyab_inbox", "notifications", "audit_log",
];

const CONFLICT_COLUMN: Record<string, string> = {
  notification_event_registry: "event_key",
  notification_templates: "category,event_type,audience",
  system_config: "section,key",
  user_group_members: "group_id,user_id",
  chat_conversations: "participant_a,participant_b",
  user_preferences: "user_id",
  user_auto_accept_organizers: "user_id,organizer_user_id",
  channel_members: "channel_id,user_id",
  org_position_members: "position_id,user_id",
  sms_templates: "category,event_type,audience",
  sms_delivery_policies: "category,event_type",
  spark_config: "module",
  chat_tags: "user_id,name",
  broadcast_recipients: "message_id,user_id",
  calendar_subscriptions: "calendar_id,user_id",
  channel_group_task_assignments: "group_task_id,assignee_id",
  channel_message_private_pins: "message_id,user_id",
  channel_message_reactions: "message_id,user_id,emoji",
  channel_message_stars: "message_id,user_id",
  channel_message_read_log: "message_id,user_id",
  channel_notification_rules: "channel_id,notification_type",
  channel_sms_rules: "channel_id,sms_category",
  chat_group_members: "conversation_id,user_id",
  chat_message_reactions: "message_id,user_id,emoji",
  chat_message_stars: "message_id,user_id",
  chat_message_read_log: "message_id,user_id",
  chat_message_read_receipts: "conversation_id,user_id",
  chat_message_tag_assignments: "message_id,tag_id,user_id",
  conference_participants: "room_id,user_id",
  conference_poll_votes: "poll_id,user_id",
  conference_quality_metrics: "room_id,user_id,measured_at",
  conference_waiting_room: "room_id,user_id",
  notification_group_rules: "group_id,notification_type",
  org_level_definitions: "level",
  org_level_permissions: "level,permission_key",
  org_position_permissions: "position_id,permission_key",
  sms_group_rules: "group_id,sms_category",
  spark_field_keywords: "module,field_key",
  spark_memory: "user_id,key",
  user_access_relations: "user_id,related_user_id",
  user_bale_mapping: "user_id",
  banned_users: "room_id,user_id",
  minutes: "meeting_id",
  minutes_approvals: "minute_id,revision_number,approver_user_id",
};

const TABLE_PK: Record<string, string> = {
  user_preferences: "user_id",
  bale_link_tokens: "token",
  telegram_link_tokens: "token",
  notification_event_registry: "event_key",
};

const REQUIRED_USER_FKS: Record<string, string[]> = {
  meetings: ["user_id"], tasks: ["user_id"], notes: ["user_id"], contacts_email: ["user_id"],
  user_preferences: ["user_id"], user_auto_accept_organizers: ["user_id", "organizer_user_id"], sms_delivery_policies: ["updated_by"], user_group_members: ["user_id"], chat_conversations: ["participant_a", "participant_b"],
  chat_messages: ["sender_id"], channel_members: ["user_id"], channel_messages: ["sender_id"], calendars: ["user_id"],
  org_position_members: ["user_id"], notifications: ["user_id"], audit_log: ["user_id"], chat_tags: ["user_id"],
  all_day_events: ["user_id"], bale_link_tokens: ["user_id"], telegram_link_tokens: ["user_id"],
  broadcast_recipients: ["user_id"], calendar_subscriptions: ["user_id"], channel_message_private_pins: ["user_id"],
  channel_message_reactions: ["user_id"], channel_message_read_log: ["user_id"], channel_message_stars: ["user_id"],
  chat_group_members: ["user_id"], chat_message_reactions: ["user_id"], chat_message_read_log: ["user_id"],
  chat_message_read_receipts: ["user_id"], chat_message_stars: ["user_id"], chat_message_tag_assignments: ["user_id"],
  chat_reminders: ["user_id"], call_sessions: ["caller_id", "callee_id"], conference_participants: ["user_id"],
  conference_poll_votes: ["user_id"], conference_quality_metrics: ["user_id"], conference_waiting_room: ["user_id"],
  conference_whiteboard: ["user_id"], meeting_inbox: ["user_id"], spark_assistant_logs: ["user_id"],
  spark_memory: ["user_id"], user_access_relations: ["user_id", "related_user_id"], user_bale_mapping: ["user_id"],
  minutes: ["created_by_user_id"], minutes_approval_comments: ["created_by_user_id"],
  minutes_approvals: ["approver_user_id"], minutes_attachments: ["uploaded_by_user_id"],
  minutes_decision_reminders: ["recipient_user_id", "created_by_user_id"],
  minutes_decision_updates: ["created_by_user_id"], minutes_decisions: ["created_by_user_id"],
};

const NULLABLE_USER_FKS: Record<string, string[]> = {
  user_groups: ["created_by"], system_config: ["updated_by"], notifications: ["sender_id"], channels: ["created_by"],
  channel_messages: ["pinned_by"], channel_work_topics: ["created_by", "assignee_id"], org_position_members: ["assigned_by"],
  daily_report_config: ["updated_by"], broadcast_messages: ["sender_id"], channel_group_task_activities: ["user_id"],
  channel_group_task_assignments: ["assignee_id"], channel_group_tasks: ["created_by"], conference_messages: ["user_id"],
  shared_meetings: ["sender_id", "recipient_id"], sms_dispatch_logs: ["target_user_id", "triggered_by_user_id"],
  task_workflow_steps: ["from_user_id", "to_user_id"], user_access_relations: ["created_by"], banned_users: ["banned_by"],
  pending_approvals: ["approved_by"],
  minutes: ["chair_confirmed_by_user_id", "chair_user_id", "published_by_user_id", "secretary_confirmed_by_user_id",
    "secretary_user_id", "submitted_by_user_id"],
  minutes_approvals: ["acted_by_user_id", "delegate_user_id", "delegated_by_user_id"],
  minutes_audit_log: ["actor_user_id"], minutes_decision_updates: ["resolved_by_user_id"],
  minutes_decisions: ["primary_owner_user_id"], minutes_participants: ["user_id"],
};

const BATCH_SIZE = 50;
const MAX_ERRORS = 100;

type RowError = { row: number; id: string; reason: string; code?: string; dependency?: string };
type TableResult = {
  success: boolean; total: number; inserted: number; updated: number; skipped: number; failed: number;
  errors: RowError[]; deleteError?: string;
};

async function loadIds(client: ReturnType<typeof adminClient>, table: string, col = "id"): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 500;
  for (let page = 0; ; page++) {
    const { data, error } = await (client as any).from(table).select(col).order(col, { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) if (row[col] != null) ids.add(String(row[col]));
    if (!data || data.length < pageSize) break;
  }
  return ids;
}

function sanitizeRows(table: string, rows: Record<string, unknown>[], userIds: Set<string>) {
  const required = REQUIRED_USER_FKS[table] ?? [];
  const nullable = NULLABLE_USER_FKS[table] ?? [];
  const clean: Record<string, unknown>[] = [];
  const skipped: RowError[] = [];

  rows.forEach((source, index) => {
    let row = { ...source };
    const id = String(row.id ?? row.user_id ?? row.token ?? row.event_key ?? "");
    for (const col of required) {
      const value = row[col];
      if (value != null && String(value) !== "" && !userIds.has(String(value))) {
        skipped.push({ row: index + 2, id, reason: "کاربر مرجع در مقصد وجود ندارد", dependency: `${col}=${String(value).slice(0, 8)}…` });
        return;
      }
    }
    for (const col of nullable) {
      const value = row[col];
      if (value != null && String(value) !== "" && !userIds.has(String(value))) row[col] = null;
    }
    // notification_outbox is an operational queue and intentionally is not part of backup.
    if (table === "minutes_decision_reminders") row.outbox_id = null;
    clean.push(row);
  });
  return { clean, skipped };
}

async function restoreTable(
  client: ReturnType<typeof adminClient>, table: string, rows: Record<string, unknown>[], userIds: Set<string>,
): Promise<TableResult> {
  const total = rows.length;
  if (total === 0) return { success: true, total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  const { clean, skipped } = sanitizeRows(table, rows, userIds);
  const conflict = CONFLICT_COLUMN[table] ?? "id";
  const pk = TABLE_PK[table] ?? "id";
  let existing = new Set<string>();
  try { existing = await loadIds(client, table, pk); } catch { /* reporting remains best-effort */ }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: RowError[] = [...skipped];

  for (let i = 0; i < clean.length; i += BATCH_SIZE) {
    const batch = clean.slice(i, i + BATCH_SIZE);
    const { error } = await (client as any).from(table).upsert(batch, { onConflict: conflict });
    if (!error) {
      for (const row of batch) existing.has(String(row[pk] ?? "")) ? updated++ : inserted++;
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const { error: rowError } = await (client as any).from(table).upsert(row, { onConflict: conflict });
      if (!rowError) {
        existing.has(String(row[pk] ?? "")) ? updated++ : inserted++;
      } else {
        failed++;
        if (errors.length < MAX_ERRORS) {
          errors.push({
            row: i + j + 2,
            id: String(row.id ?? row.user_id ?? row.token ?? row.event_key ?? ""),
            reason: "خطای بازیابی",
            code: rowError.code,
          });
        }
      }
    }
  }

  return { success: failed === 0, total, inserted, updated, skipped: skipped.length, failed, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const auth = await requireFullAuthAccess(req);
  if (!auth.ok || !auth.userId) return deniedResponse();

  try {
    const client = adminClient();
    const { data: caller } = await client.from("profiles").select("is_admin").eq("user_id", auth.userId).maybeSingle();
    if (caller?.is_admin !== true) {
      await recordAccessDenial(req, auth.userId, "ADMIN_REQUIRED");
      return json({ error: "ADMIN_REQUIRED" }, 403);
    }

    const payload = await req.json() as { tables?: Record<string, unknown[]>; strategy?: "upsert" | "replace" };
    if (!payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) return json({ error: "INVALID_PAYLOAD" }, 400);
    if (payload.strategy !== "upsert" && payload.strategy !== "replace") return json({ error: "INVALID_STRATEGY" }, 400);

    const tables: Record<string, Record<string, unknown>[]> = {};
    const rejectedTables: string[] = [];
    for (const [name, rows] of Object.entries(payload.tables)) {
      if (!ALLOWED_TABLES.has(name)) { rejectedTables.push(name); continue; }
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) return json({ error: "INVALID_TABLE_ROWS", table: name }, 400);
      tables[name] = rows as Record<string, unknown>[];
    }

    // A browser export is not a transaction-consistent database snapshot.
    // Never perform irreversible multi-table deletes over independent HTTP requests.
    if (payload.strategy === "replace") {
      return json({ ok: false, error: "TRANSACTIONAL_RESTORE_REQUIRED", rejected_tables: rejectedTables, results: {} });
    }
    const orderIndex = new Map(RESTORE_ORDER.map((name, index) => [name, index]));
    const sorted = Object.keys(tables).sort((a, b) =>
      (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER));
    const results: Record<string, TableResult> = {};
    const userIds = await loadIds(client, "profiles", "user_id");
    const incomplete = () => rejectedTables.length > 0 || Object.keys(tables).length === 0 ||
      Object.keys(tables).some(table => {
        const result = results[table];
        return !result || result.success !== true || !!result.deleteError ||
          result.failed > 0 || result.skipped > 0 || result.total !== tables[table].length ||
          result.inserted + result.updated !== result.total;
      });
    for (const table of sorted) {
      try { results[table] = await restoreTable(client, table, tables[table], userIds); }
      catch {
        results[table] = { success: false, total: tables[table].length, inserted: 0, updated: 0, skipped: 0,
          failed: tables[table].length, errors: [{ row: 0, id: "", reason: "RESTORE_OUTCOME_UNKNOWN" }] };
      }
    }

    return json({
      ok: !incomplete(),
      ...(incomplete() ? { error: "RESTORE_INCOMPLETE" } : {}),
      counts_estimated: true,
      backup_schema_version: 3,
      rejected_tables: rejectedTables,
      results,
    });
  } catch (error) {
    return json({ error: "RESTORE_FAILED" }, 500);
  }
});
