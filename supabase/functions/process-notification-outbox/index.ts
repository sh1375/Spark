import { runMeetingNotificationBatch } from '../_shared/recurringDelivery.ts';
import { handleSendSms } from '../send-sms/handler.ts';
import { dispatchDelegationSms } from './delegationSms.ts';
import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { deferredSmsFailure } from "../_shared/deferredSmsFailure.ts";
import { timingSafeCompare } from "../_shared/crypto.ts";
import { evaluateSmsDeliveryPolicy, loadSmsDeliveryPolicy } from "../_shared/smsDeliveryPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
};

const MAX_SMS_ATTEMPTS = 5;
const MAX_NOTIFICATION_ATTEMPTS = 5;

const SMS_BACKOFF_MS = [2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
const NOTIF_BACKOFF_MS = [1 * 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];

interface ClaimedRow {
  id: string;
  event_key: string;
  category: string;
  entity_type: string;
  entity_id: string;
  minute_id: string;
  actor_user_id: string;
  recipient_id: string;
  audience: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  notification_attempt_count: number;
  sms_attempt_count: number;
  idempotency_key: string;
  notification_status: string;
  sms_status: string;
  sms_sent_at: string | null;
}

type OutboxMetadata = {
  event_type: string;
  meeting_id: string | null;
  created_at: string;
};

type DeferredSmsRow = {
  id: string;
  delivery_mode: "dispatch" | "external" | "send";
  target_user_id: string | null;
  target_phones: string[];
  category: string;
  event_type: string;
  audience: string;
  context: Record<string, unknown>;
  meeting_id: string | null;
  actor_user_id: string | null;
  event_key: string | null;
  raw_message: string | null;
  provider_id: string | null;
  attempt_count: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const providedSecret = req.headers.get("X-Cron-Secret");
  if (!providedSecret) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let authorized = false;
  const legacyCronSecret = Deno.env.get("NOTIFICATION_OUTBOX_CRON_SECRET") ?? "";
  if (legacyCronSecret) {
    authorized = timingSafeCompare(providedSecret, legacyCronSecret);
  }

  if (!authorized) {
    const { data, error } = await supabase.rpc("verify_cron_secret", { candidate: providedSecret });
    authorized = !error && data === true;
  }

  if (!authorized) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // The existing server notification timer also owns recurring delivery.
    // It does not require an additional worker URL or token in Vault.
    let recurringResult: unknown;
    try {
      const prepared = await supabase.rpc('prepare_meeting_notification_jobs');
      if (prepared.error) throw prepared.error;
      recurringResult = await runMeetingNotificationBatch(supabase, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    } catch {
      console.error('[outbox-worker] recurring delivery unavailable');
      recurringResult = { error: 'RECURRING_DELIVERY_UNAVAILABLE' };
    }
    const deferredResult = await processDeferredSmsQueue(supabase);

    const { data: claimedRows, error: claimError } = await supabase
      .rpc("claim_notification_outbox_rows", { p_limit: 50 });

    if (claimError) {
      console.error("[outbox-worker] claim failed", claimError);
      return new Response(
        JSON.stringify({ error: "claim_failed", details: claimError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!claimedRows || claimedRows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, recurring: recurringResult, deferred_sms_processed: deferredResult.processed, deferred_sms_failed: deferredResult.failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // claim_notification_outbox_rows intentionally returns a compact legacy row shape.
    // Fetch semantic routing fields from the source rows so template lookup never uses
    // the idempotency/event_key value as an SMS event type.
    const claimed = claimedRows as ClaimedRow[];
    const { data: metadataRows, error: metadataError } = await supabase
      .from("notification_outbox")
      .select("id, event_type, meeting_id, created_at")
      .in("id", claimed.map((row) => row.id));

    if (metadataError) {
      console.error("[outbox-worker] metadata fetch failed", metadataError);
      for (const row of claimed) {
        await supabase
          .from("notification_outbox")
          .update({
            status: "partial",
            last_error: `OUTBOX_METADATA_FETCH_FAILED: ${metadataError.message}`,
            next_attempt_at: new Date(Date.now() + 60000).toISOString(),
            processed_at: null,
          })
          .eq("id", row.id);
      }
      return new Response(
        JSON.stringify({ error: "metadata_fetch_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const metadataById = new Map<string, OutboxMetadata>();
    for (const meta of metadataRows || []) {
      metadataById.set(meta.id, {
        event_type: meta.event_type,
        meeting_id: meta.meeting_id,
        created_at: meta.created_at,
      });
    }

    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("system_config")
      .select("key,value")
      .eq("section", "minutes")
      .in("key", ["decision_due_schedule_enabled", "periodic_followup_schedule_enabled"]);
    const scheduleEnabled = new Map<string, boolean>(
      (scheduleRows || []).map((row) => [row.key, String(row.value ?? "true").trim().toLowerCase() !== "false"]),
    );

    const decisionIds = Array.from(new Set(
      claimed
        .filter((row) => row.entity_type === "decision" && row.entity_id)
        .map((row) => row.entity_id),
    ));
    const { data: decisionRows, error: decisionStatusError } = decisionIds.length
      ? await supabase.from("minutes_decisions").select("id,status").in("id", decisionIds)
      : { data: [], error: null };
    const decisionStatusById = new Map<string, string>(
      (decisionRows || []).map((row) => [row.id, row.status]),
    );

    let notificationCount = 0;
    let smsSentCount = 0;
    let failedCount = 0;

    for (const row of claimed) {
      try {
        const payload = row.payload || {};
        const context = (payload.context || {}) as Record<string, unknown>;
        const smsSupported = (payload.sms_supported as boolean) || false;
        const templateId = (payload.template_id as string) || null;
        const revisionNumber = (payload.revision_number as number) || null;
        const reminderId = (context.reminder_id as string) || null;
        const actionUrl = (payload.action_url as string) || (context.action_url as string) || (context.minute_link as string) || (context.decision_link as string) || null;
        const metadata = metadataById.get(row.id);
        const eventType = metadata?.event_type || row.event_key;
        const meetingId = metadata?.meeting_id || null;
        const isPeriodicScheduled = eventType === "decision_followup_due" && context.periodic_followup === true;
        const isDeadlineScheduled = eventType === "decision_due_soon" || eventType === "decision_overdue";
        const isScheduledDecisionEvent = isPeriodicScheduled || isDeadlineScheduled;

        if (isScheduledDecisionEvent && (scheduleError || decisionStatusError)) {
          await supabase
            .from("notification_outbox")
            .update({
              status: "partial",
              last_error: scheduleError ? "SCHEDULE_CONFIG_UNAVAILABLE" : "DECISION_STATUS_UNAVAILABLE",
              next_attempt_at: new Date(Date.now() + 60000).toISOString(),
              processed_at: null,
            })
            .eq("id", row.id);
          continue;
        }

        const scheduleDisabled =
          (isPeriodicScheduled && scheduleEnabled.get("periodic_followup_schedule_enabled") === false) ||
          (isDeadlineScheduled && scheduleEnabled.get("decision_due_schedule_enabled") === false);
        const decisionStatus = row.entity_type === "decision"
          ? decisionStatusById.get(row.entity_id)
          : undefined;
        const terminalDecision = isScheduledDecisionEvent &&
          (decisionStatus === "completed" || decisionStatus === "stopped");

        if (scheduleDisabled || terminalDecision) {
          await supabase
            .from("notification_outbox")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              next_attempt_at: null,
              last_error: scheduleDisabled ? "SCHEDULE_DISABLED" : "DECISION_TERMINAL",
            })
            .eq("id", row.id);

          if (reminderId) {
            await supabase
              .from("minutes_decision_reminders")
              .update({
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", reminderId)
              .in("status", ["pending", "processing", "queued", "partial", "failed"]);
          }
          continue;
        }

        let notificationSent = row.notification_status === "sent";
        let notifAttemptCount = row.notification_attempt_count || 0;
        let smsAttemptCount = row.sms_attempt_count || 0;
        let smsStatus = row.sms_status || "not_requested";
        let smsSentAt = row.sms_sent_at || null;

        if (!notificationSent) {
          const { error: notifError } = await supabase
            .from("notifications")
            .insert({
              user_id: row.recipient_id,
              title: payload.title || eventType,
              message: payload.message || eventType,
              type: row.category === "decision" ? "decision" : "minutes",
              read: false,
              entity_type: row.entity_type,
              entity_id: row.entity_id,
              minute_id: row.minute_id,
              revision_number: revisionNumber,
              actor_user_id: row.actor_user_id,
              template_id: templateId,
              template_category: row.category,
              template_event_type: eventType,
              template_audience: row.audience,
              action_url: actionUrl,
              event_key: row.idempotency_key,
              metadata: {
                ...context,
                outbox_id: row.id,
                event_key: row.event_key,
              },
            });

          if (notifError) {
            if (notifError.code === "23505") {
              notificationSent = true;
            } else {
              notifAttemptCount += 1;
              if (notifAttemptCount >= MAX_NOTIFICATION_ATTEMPTS) {
                await supabase
                  .from("notification_outbox")
                  .update({
                    status: "failed",
                    notification_status: "failed",
                    notification_attempt_count: notifAttemptCount,
                    attempt_count: notifAttemptCount + smsAttemptCount,
                    last_error: notifError.message,
                    next_attempt_at: null,
                    processed_at: null,
                  })
                  .eq("id", row.id);

                if (reminderId) {
                  await updateReminderStatus(supabase, reminderId, "failed", null, null);
                }
                failedCount++;
                continue;
              }

              const backoffIdx = Math.min(notifAttemptCount - 1, NOTIF_BACKOFF_MS.length - 1);
              await supabase
                .from("notification_outbox")
                .update({
                  status: "partial",
                  notification_status: "failed",
                  notification_attempt_count: notifAttemptCount,
                  attempt_count: notifAttemptCount + smsAttemptCount,
                  last_error: notifError.message,
                  next_attempt_at: new Date(Date.now() + NOTIF_BACKOFF_MS[backoffIdx]).toISOString(),
                  processed_at: null,
                })
                .eq("id", row.id);

              if (reminderId) {
                await updateReminderStatus(supabase, reminderId, "partial", null, null);
              }
              failedCount++;
              continue;
            }
          } else {
            notificationSent = true;
            notificationCount++;
          }
        }

        if (
          smsSupported &&
          smsStatus !== "sent" &&
          smsStatus !== "skipped_template_disabled" &&
          smsStatus !== "skipped_no_phone" &&
          smsStatus !== "skipped_no_provider_rule"
        ) {
          const policy = await loadSmsDeliveryPolicy(supabase, row.category, eventType);
          const policyDecision = evaluateSmsDeliveryPolicy(
            policy,
            new Date(),
            metadata?.created_at ? new Date(metadata.created_at) : new Date(),
          );

          if (!policyDecision.sendNow && policyDecision.nextAllowedAt) {
            await supabase
              .from("notification_outbox")
              .update({
                status: "partial",
                notification_status: notificationSent ? "sent" : row.notification_status,
                sms_status: "pending",
                next_attempt_at: policyDecision.nextAllowedAt.toISOString(),
                last_error: "SMS_DEFERRED_BY_POLICY",
                processed_at: null,
              })
              .eq("id", row.id);
            continue;
          }

          const smsResult = await dispatchSms(supabase, row, eventType, meetingId, {
            ...context,
            sms_policy_deferred_delivery: true,
          });

          if (smsResult.sent) {
            smsStatus = "sent";
            smsSentAt = new Date().toISOString();
            smsSentCount++;
          } else {
            smsStatus = smsResult.status;
            if (smsStatus === "failed") smsAttemptCount += 1;
          }
        }

        let finalStatus = "processed";
        let nextAttemptAt: string | null = null;
        let lastError: string | null = null;

        if (!notificationSent) {
          finalStatus = "failed";
          lastError = "NOTIFICATION_NOT_SENT";
        } else if (smsStatus === "failed" && smsAttemptCount < MAX_SMS_ATTEMPTS) {
          finalStatus = "partial";
          const backoffIdx = Math.min(smsAttemptCount - 1, SMS_BACKOFF_MS.length - 1);
          nextAttemptAt = new Date(Date.now() + SMS_BACKOFF_MS[backoffIdx]).toISOString();
          lastError = `SMS_FAILED (attempt ${smsAttemptCount})`;
        } else if (smsStatus === "failed" && smsAttemptCount >= MAX_SMS_ATTEMPTS) {
          finalStatus = "failed";
          nextAttemptAt = null;
          lastError = "SMS_MAX_ATTEMPTS_REACHED";
        } else if (smsStatus === "skipped_no_phone" || smsStatus === "skipped_no_provider_rule" || smsStatus === "skipped_template_disabled") {
          finalStatus = "processed";
          lastError = `SMS_SKIPPED: ${smsStatus}`;
        }

        await supabase
          .from("notification_outbox")
          .update({
            status: finalStatus,
            notification_status: notificationSent ? "sent" : "failed",
            sms_status: smsStatus,
            sms_sent_at: smsSentAt,
            processed_at: finalStatus === "processed" ? new Date().toISOString() : null,
            notification_attempt_count: notifAttemptCount,
            sms_attempt_count: smsAttemptCount,
            attempt_count: notifAttemptCount + smsAttemptCount,
            next_attempt_at: nextAttemptAt,
            last_error: lastError,
          })
          .eq("id", row.id);

        if (reminderId) {
          let reminderStatus = "sent";
          if (!notificationSent) {
            reminderStatus = "failed";
          } else if (smsStatus === "skipped_no_phone" || smsStatus === "skipped_no_provider_rule" || smsStatus === "skipped_template_disabled") {
            reminderStatus = "partial";
          } else if (smsStatus === "failed") {
            reminderStatus = smsAttemptCount >= MAX_SMS_ATTEMPTS ? "failed" : "partial";
          }

          await updateReminderStatus(
            supabase,
            reminderId,
            reminderStatus,
            notificationSent ? new Date().toISOString() : null,
            smsSentAt,
          );
        }
      } catch (err) {
        console.error("[outbox-worker] row failed", row.id, err);
        await supabase
          .from("notification_outbox")
          .update({
            status: "failed",
            attempt_count: (row.attempt_count || 0) + 1,
            last_error: err instanceof Error ? err.message : String(err),
            next_attempt_at: new Date(Date.now() + 60000).toISOString(),
          })
          .eq("id", row.id);
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        processed: claimed.length,
        recurring: recurringResult,
        notifications: notificationCount,
        sms_sent: smsSentCount,
        failed: failedCount,
        deferred_sms_processed: deferredResult.processed,
        deferred_sms_failed: deferredResult.failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[outbox-worker] fatal", err);
    return new Response(
      JSON.stringify({ error: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processDeferredSmsQueue(
  supabase: ReturnType<typeof createClient>,
): Promise<{ processed: number; failed: number }> {
  const { data, error } = await supabase.rpc("claim_deferred_sms_queue", { p_limit: 50 });
  if (error) {
    console.warn("[outbox-worker] deferred SMS queue unavailable", error.message);
    return { processed: 0, failed: 0 };
  }

  const rows = (data || []) as DeferredSmsRow[];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const body: Record<string, unknown> = {
        mode: row.delivery_mode,
        category: row.category,
        eventType: row.event_type,
        audience: row.audience,
        meetingId: row.meeting_id,
        eventKey: row.event_key,
        triggeredByUserId: row.actor_user_id,
        context: {
          ...(row.context || {}),
          sms_policy_deferred_delivery: true,
        },
      };

      if (row.delivery_mode === "dispatch") {
        body.targetUserId = row.target_user_id;
      } else if (row.delivery_mode === "external") {
        body.mobiles = row.target_phones || [];
      } else {
        body.mobiles = row.target_phones || [];
        body.message = row.raw_message || "";
        body.providerId = row.provider_id;
        body.bypassDeliveryPolicy = true;
      }

      const { data: result, error: invokeError } = await supabase.functions.invoke("send-sms", { body });

      if (invokeError || !result?.ok || result?.status === "failed") {
        const failure = await deferredSmsFailure(result, invokeError);
        if (row.delivery_mode === "send") {
          await supabase.from("sms_dispatch_logs").insert({
            target_phone: row.target_phones?.[0] || null,
            category: row.category,
            event_type: row.event_type,
            audience: row.audience,
            message: row.raw_message || "",
            provider_id: row.provider_id,
            status: "failed",
            error_text: failure,
            raw_response: result || null,
          });
        }
        throw new Error(failure);
      }

      if (row.delivery_mode === "send") {
        const returnIds: string[] = Array.isArray(result?.returnIds) ? result.returnIds.map(String) : [];
        const providerMessageId = returnIds[0] || null;
        await supabase.from("sms_dispatch_logs").insert({
          target_phone: row.target_phones?.[0] || null,
          category: row.category,
          event_type: row.event_type,
          audience: row.audience,
          message: row.raw_message || "",
          provider_id: row.provider_id,
          status: "sent",
          pack_id: result?.packId ? String(result.packId) : null,
          message_ids: result?.messageIds ?? null,
          cost: result?.cost ?? null,
          raw_response: result ?? null,
          provider_message_id: providerMessageId,
          delivery_status: providerMessageId ? "pending" : null,
        });
      }

      await supabase
        .from("deferred_sms_queue")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      processed++;
    } catch (err) {
      const attempt = Math.max(1, Number(row.attempt_count || 1));
      const backoffMinutes = Math.min(60, [2, 5, 15, 30, 60][Math.min(attempt - 1, 4)]);
      await supabase
        .from("deferred_sms_queue")
        .update({
          status: "failed",
          available_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { processed, failed };
}

async function dispatchSms(
  supabase: ReturnType<typeof createClient>,
  row: ClaimedRow,
  eventType: string,
  meetingId: string | null,
  context: Record<string, unknown>,
): Promise<{ status: string; sent: boolean; error?: string }> {
  try {
    const body = {
        mode: "dispatch",
        targetUserId: row.recipient_id,
        category: row.category,
        eventType,
        audience: row.audience,
        context,
        meetingId,
        triggeredByUserId: row.actor_user_id,
        eventKey: row.idempotency_key,
    };
    const { data: result, error } = eventType === 'meeting_invitation_delegate_selected'
      ? await dispatchDelegationSms(handleSendSms, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, body)
      : await supabase.functions.invoke("send-sms", {
          body: { ...body, triggeredByUserId: null, eventKey: undefined },
        });

    if (error) return { status: "failed", sent: false, error: error.message };

    if (result?.ok && result?.status === "sent") return { status: "sent", sent: true };
    if (result?.status === "skipped") {
      const reason = String(result?.reason || result?.errorCode || "");
      if (/PHONE/i.test(reason)) return { status: "skipped_no_phone", sent: false };
      if (/RULE/i.test(reason)) return { status: "skipped_no_provider_rule", sent: false };
      if (/TEMPLATE_NOT_FOUND/i.test(reason)) return { status: "skipped_template_disabled", sent: false };
      return { status: "failed", sent: false, error: reason || "SMS_SKIPPED_UNKNOWN" };
    }
    return {
      status: "failed",
      sent: false,
      error: result?.errorCode || result?.error || "UNKNOWN_SMS_RESULT",
    };
  } catch (err) {
    return { status: "failed", sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function updateReminderStatus(
  supabase: ReturnType<typeof createClient>,
  reminderId: string,
  status: string,
  notificationSentAt: string | null,
  smsSentAt: string | null,
): Promise<void> {
  await supabase
    .from("minutes_decision_reminders")
    .update({
      status,
      notification_sent_at: notificationSentAt,
      sms_sent_at: smsSentAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId);
}
