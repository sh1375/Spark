import { isValidPhone, normalizePhone } from "./phone.ts";
import { renderSystemSmsTemplate } from "./templateRenderer.ts";
import { evaluateSmsDeliveryPolicy, loadSmsDeliveryPolicy, queueDeferredSms } from "../_shared/smsDeliveryPolicy.ts";

type SmsClient = any;
type Caller = { userId: string; isAdmin: boolean };
type JsonResponder = (data: unknown, status?: number) => Response;
type ModeContext = {
  supabase: SmsClient;
  body: Record<string, any>;
  caller: Caller;
  json: JsonResponder;
  sendRequest?: (url: string, init: RequestInit) => Promise<Response>;
};

type DispatchLogSeed = {
  dispatchKey: string | null;
  meetingId: string | null;
  targetUserId: string | null;
  targetPhone: string | null;
  triggeredByUserId: string | null;
  category: string;
  eventType: string;
  audience: string;
  message: string;
  providerId?: string | null;
  providerName?: string | null;
};

function objectContext(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedEventKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function internalDispatchKey(eventKey: string | null, meetingId: string | null, eventType: string, audience: string, targetUserId: string): string | null {
  if (eventKey) return `event:${eventKey}:sms:user:${targetUserId}`;
  if (meetingId && eventType === "cancel") return `meeting:${meetingId}:sms:cancel:${audience}:user:${targetUserId}`;
  return null;
}

function externalDispatchKey(eventKey: string | null, meetingId: string | null, eventType: string, phone: string): string | null {
  const base = eventKey
    ? `event:${eventKey}`
    : (meetingId && eventType === "cancel" ? `meeting:${meetingId}:cancel:external` : null);
  return base ? `${base}:sms:phone:${phone}` : null;
}

async function claimLog(supabase: SmsClient, seed: DispatchLogSeed): Promise<{ id: string | null; claimed: boolean; status: string | null }> {
  if (seed.dispatchKey) {
    const { data, error } = await supabase.rpc("claim_sms_dispatch_v1", {
      p_dispatch_key: seed.dispatchKey,
      p_target_user_id: seed.targetUserId,
      p_target_phone: seed.targetPhone,
      p_triggered_by_user_id: seed.triggeredByUserId,
      p_category: seed.category,
      p_event_type: seed.eventType,
      p_audience: seed.audience,
      p_message: seed.message,
      p_meeting_id: seed.meetingId,
      p_provider_id: seed.providerId ?? null,
      p_provider_name: seed.providerName ?? null,
    });
    if (error) throw error;
    const row = data?.[0];
    return {
      id: row?.log_id ?? null,
      claimed: row?.claimed === true,
      status: row?.existing_status ?? null,
    };
  }

  const { data, error } = await supabase
    .from("sms_dispatch_logs")
    .insert({
      dispatch_key: null,
      meeting_id: seed.meetingId,
      target_user_id: seed.targetUserId,
      target_phone: seed.targetPhone,
      triggered_by_user_id: seed.triggeredByUserId,
      category: seed.category,
      event_type: seed.eventType,
      audience: seed.audience,
      message: seed.message,
      provider_id: seed.providerId ?? null,
      provider_name: seed.providerName ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data?.id ?? null, claimed: true, status: "pending" };
}

async function finishLog(supabase: SmsClient, logId: string | null, patch: Record<string, unknown>): Promise<void> {
  if (!logId) return;
  await supabase.from("sms_dispatch_logs").update(patch).eq("id", logId);
}

export async function handleDispatchMode({ supabase, body, caller, json, sendRequest = fetch }: ModeContext): Promise<Response> {
  const targetUserId: string = body.targetUserId || "";
  const category: string = body.category || "";
  const eventType: string = body.eventType || "";
  const audience: string = body.audience || "all";
  const meetingId: string | null = typeof body.meetingId === "string" && body.meetingId ? body.meetingId : null;
  const eventKey = normalizedEventKey(body.eventKey);
  const context = objectContext(body.context);
  const triggeredByUserId: string | null = body.triggeredByUserId ?? caller.userId ?? null;
  const dbTriggeredBy = triggeredByUserId === "service" ? null : triggeredByUserId;

  if (!targetUserId) return json({ ok: false, errorCode: "TARGET_PROFILE_NOT_FOUND", error: "targetUserId الزامی است" }, 400);
  if (!category || !eventType) return json({ ok: false, errorCode: "INVALID_REQUEST", error: "category و eventType الزامی است" }, 400);

  const isDeferredDelivery = context.sms_policy_deferred_delivery === true;
  if (!isDeferredDelivery) {
    try {
      const policy = await loadSmsDeliveryPolicy(supabase, category, eventType);
      const decision = evaluateSmsDeliveryPolicy(policy);
      if (!decision.sendNow && decision.nextAllowedAt) {
        // Validate and snapshot the resolved context before postponing delivery.
        // Otherwise a missing date is queued and retried without ever being repairable.
        const preflight = await renderSystemSmsTemplate({
          supabase, category, eventType, audience, context, meetingId,
          targetUserId,
        });
        if (!preflight.ok) {
          return json({
            ok: false, status: "failed", errorCode: preflight.errorCode,
            error: preflight.error, missing: preflight.missing ?? [],
          }, 422);
        }
        const queueResult = await queueDeferredSms(supabase, {
          deliveryMode: "dispatch",
          targetUserId,
          category,
          eventType,
          audience,
          meetingId,
          actorUserId: dbTriggeredBy,
          eventKey,
          context: preflight.context,
          availableAt: decision.nextAllowedAt,
        });
        return json({
          ok: true,
          status: "skipped",
          reason: queueResult === "queued" ? "DEFERRED_BY_SMS_POLICY" : "DUPLICATE_DEFERRED_SMS",
          deferredUntil: decision.nextAllowedAt.toISOString(),
          deliveryMode: policy.mode,
        });
      }
    } catch (policyError) {
      return json({
        ok: false,
        status: "failed",
        errorCode: "SMS_DELIVERY_POLICY_ERROR",
        error: policyError instanceof Error ? policyError.message : String(policyError),
      }, 500);
    }
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("user_id, phone, is_active")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    await supabase.from("sms_dispatch_logs").insert({
      meeting_id: meetingId,
      target_user_id: targetUserId,
      triggered_by_user_id: dbTriggeredBy,
      category,
      event_type: eventType,
      audience,
      message: "",
      target_phone: null,
      status: "skipped",
      error_text: "TARGET_PROFILE_NOT_FOUND: پروفایل کاربر هدف یافت نشد",
    });
    return json({ ok: true, status: "skipped", reason: "TARGET_PROFILE_NOT_FOUND" });
  }

  const dispatchKey = internalDispatchKey(eventKey, meetingId, eventType, audience, targetUserId);
  const claimed = await claimLog(supabase, {
    dispatchKey,
    meetingId,
    targetUserId,
    targetPhone: targetProfile.phone ?? null,
    triggeredByUserId: dbTriggeredBy,
    category,
    eventType,
    audience,
    message: "",
  });

  if (!claimed.claimed) {
    return json({
      ok: true,
      status: "skipped",
      reason: "DUPLICATE_SMS_DISPATCH",
      existingStatus: claimed.status,
    });
  }

  const rendered = await renderSystemSmsTemplate({
    supabase,
    category,
    eventType,
    audience,
    context,
    targetUserId,
    meetingId,
  });

  const legacyMessage = typeof body.message === "string" ? body.message.trim() : "";
  const useLegacyMessage = category !== "meeting" && !rendered.ok
    && rendered.errorCode === "SMS_TEMPLATE_CONTEXT_MISSING"
    && legacyMessage.length > 0;

  if (!rendered.ok && !useLegacyMessage) {
    const status = rendered.errorCode === "SMS_TEMPLATE_NOT_FOUND" ? "skipped" : "failed";
    await finishLog(supabase, claimed.id, {
      status,
      error_text: `${rendered.errorCode}: ${rendered.error}`,
      target_phone: targetProfile.phone ?? null,
    });
    return json({
      ok: rendered.errorCode === "SMS_TEMPLATE_NOT_FOUND",
      status,
      reason: rendered.errorCode,
      errorCode: rendered.errorCode,
      error: rendered.error,
      missing: rendered.missing ?? [],
    }, rendered.errorCode === "SMS_TEMPLATE_NOT_FOUND" ? 200 : 422);
  }

  const message = rendered.ok ? rendered.text : legacyMessage;
  await finishLog(supabase, claimed.id, {
    message,
    error_text: useLegacyMessage ? "TEMPLATE_CONTEXT_FALLBACK: used caller-rendered message" : null,
  });

  const { data: dispatchRows, error: rpcError } = await supabase
    .rpc("get_sms_dispatch_info", { target_user_id: targetUserId, p_category: category });

  if (rpcError || !dispatchRows?.length) {
    const reason = rpcError?.message || `پیامک برای دسته «${category}» در گروه‌های کاربر فعال نیست`;
    await finishLog(supabase, claimed.id, {
      status: "skipped",
      error_text: `SMS_RULE_NOT_FOUND: ${reason}`,
    });
    return json({ ok: true, status: "skipped", reason: "SMS_RULE_NOT_FOUND" });
  }

  const resolvedProviderId: string | null = dispatchRows[0].provider_id ?? null;
  const rawPhone: string = dispatchRows[0].phone?.trim() ?? "";

  if (!rawPhone || rawPhone.length < 7) {
    await finishLog(supabase, claimed.id, {
      target_phone: rawPhone || null,
      provider_id: resolvedProviderId,
      status: "skipped",
      error_text: "INVALID_TARGET_PHONE: شماره موبایل کاربر ثبت نشده یا معتبر نیست",
    });
    return json({ ok: true, status: "skipped", reason: "INVALID_TARGET_PHONE" });
  }

  let providerName: string | null = null;
  let effectiveProviderId: string | null = resolvedProviderId;
  if (effectiveProviderId) {
    const { data: prov } = await supabase.from("sms_providers").select("title").eq("id", effectiveProviderId).maybeSingle();
    providerName = prov?.title ?? null;
  } else {
    const { data: defProv } = await supabase.from("sms_providers").select("id, title").eq("is_default", true).eq("is_active", true).maybeSingle();
    if (defProv) {
      effectiveProviderId = defProv.id;
      providerName = defProv.title;
    }
  }

  await finishLog(supabase, claimed.id, {
    target_phone: rawPhone,
    provider_id: effectiveProviderId,
    provider_name: providerName,
  });

  const sendBody: Record<string, unknown> = { mode: "send", mobiles: [rawPhone], message, bypassDeliveryPolicy: true };
  if (effectiveProviderId) sendBody.providerId = effectiveProviderId;

  let result: any;
  try {
    const innerResp = await sendRequest(
      `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-sms`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify(sendBody),
      },
    );
    result = await innerResp.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await finishLog(supabase, claimed.id, {
      status: "failed",
      error_text: `PROVIDER_TRANSPORT_ERROR: ${detail}`,
      raw_response: { transportError: detail },
    });
    return json({ ok: false, status: "failed", errorCode: "PROVIDER_TRANSPORT_ERROR", error: detail });
  }

  if (result.ok) {
    const providerMessageId: string | null = result.returnIds?.[0] ?? null;
    await finishLog(supabase, claimed.id, {
      status: "sent",
      error_text: null,
      pack_id: result.packId ?? null,
      message_ids: result.messageIds ?? null,
      cost: result.cost ?? null,
      raw_response: result.response ?? null,
      provider_message_id: providerMessageId,
      delivery_status: providerMessageId ? "pending" : null,
    });
    return json({
      ok: true,
      status: "sent",
      targetPhone: rawPhone,
      providerId: effectiveProviderId,
      templateId: rendered.ok ? rendered.templateId : null,
      returnIds: result.returnIds ?? null,
    });
  }

  const providerErrorCode = result.errorCode || "PROVIDER_ERROR";
  await finishLog(supabase, claimed.id, {
    status: "failed",
    error_text: `${providerErrorCode}: ${result.error ?? "خطای ناشناخته از سرویس پیامک"}`,
    raw_response: result.response ?? null,
  });
  return json({
    ok: false,
    status: "failed",
    errorCode: providerErrorCode,
    error: result.error ?? "خطای ناشناخته از سرویس پیامک",
  });
}

export async function handleExternalMode({ supabase, body, caller, json, isAuthOtp, sendRequest = fetch }: ModeContext & { isAuthOtp: boolean }): Promise<Response> {
  const rawMobiles: string[] = body.mobiles || [];
  const triggeredByUserId: string | null = body.triggeredByUserId ?? caller.userId ?? null;
  const dbTriggeredBy = triggeredByUserId === "service" ? null : triggeredByUserId;
  const category: string = body.category || "meeting";
  const eventType: string = body.eventType || "invite";
  const audience = category === "meeting" && eventType.startsWith("series_") && body.audience === "external_observers"
    ? "external_observers" : "external";
  const meetingId: string | null = typeof body.meetingId === "string" && body.meetingId ? body.meetingId : null;
  const eventKey = normalizedEventKey(body.eventKey);
  const context = objectContext(body.context);

  if (!rawMobiles.length) return json({ ok: false, errorCode: "INVALID_REQUEST", error: "شماره موبایل وارد نشده" }, 400);
  if (!category || !eventType) return json({ ok: false, errorCode: "INVALID_REQUEST", error: "category و eventType الزامی است" }, 400);

  const seen = new Set<string>();
  const validMobiles: string[] = [];
  const invalidMobiles: string[] = [];
  for (const raw of rawMobiles) {
    const trimmed = raw.replace(/\s/g, "");
    if (!isValidPhone(trimmed)) {
      invalidMobiles.push(raw);
      continue;
    }
    const norm = normalizePhone(trimmed);
    if (!seen.has(norm)) {
      seen.add(norm);
      validMobiles.push(norm);
    }
  }

  if (!validMobiles.length) {
    return json({ ok: false, errorCode: "INVALID_TARGET_PHONE", error: `شماره موبایل معتبری یافت نشد. نامعتبر: ${invalidMobiles.join(", ")}` }, 400);
  }

  const isDeferredDelivery = context.sms_policy_deferred_delivery === true;
  if (!isDeferredDelivery) {
    try {
      const policy = await loadSmsDeliveryPolicy(supabase, category, eventType);
      const decision = evaluateSmsDeliveryPolicy(policy);
      if (!decision.sendNow && decision.nextAllowedAt) {
        // Validate and snapshot the resolved context before postponing delivery.
        // Otherwise a missing date is queued and retried without ever being repairable.
        const preflight = await renderSystemSmsTemplate({
          supabase, category, eventType, audience, context, meetingId,
        });
        if (!preflight.ok) {
          return json({
            ok: false, status: "failed", errorCode: preflight.errorCode,
            error: preflight.error, missing: preflight.missing ?? [],
          }, 422);
        }
        const queueResult = await queueDeferredSms(supabase, {
          deliveryMode: "external",
          targetPhones: validMobiles,
          category,
          eventType,
          audience,
          meetingId,
          actorUserId: dbTriggeredBy,
          eventKey,
          context: preflight.context,
          availableAt: decision.nextAllowedAt,
        });
        return json({
          ok: true,
          status: "skipped",
          reason: queueResult === "queued" ? "DEFERRED_BY_SMS_POLICY" : "DUPLICATE_DEFERRED_SMS",
          deferredUntil: decision.nextAllowedAt.toISOString(),
          deliveryMode: policy.mode,
        });
      }
    } catch (policyError) {
      return json({
        ok: false,
        status: "failed",
        errorCode: "SMS_DELIVERY_POLICY_ERROR",
        error: policyError instanceof Error ? policyError.message : String(policyError),
      }, 500);
    }
  }

  const rendered = await renderSystemSmsTemplate({
    supabase,
    category,
    eventType,
    audience,
    context,
    meetingId,
  });

  const legacyMessage = typeof body.message === "string" ? body.message.trim() : "";
  const useLegacyMessage = category !== "meeting" && !rendered.ok
    && rendered.errorCode === "SMS_TEMPLATE_CONTEXT_MISSING"
    && legacyMessage.length > 0;

  if (!rendered.ok && !useLegacyMessage) {
    for (const phone of validMobiles) {
      const key = externalDispatchKey(eventKey, meetingId, eventType, phone);
      const claim = await claimLog(supabase, {
        dispatchKey: key,
        meetingId,
        targetUserId: null,
        targetPhone: phone,
        triggeredByUserId: dbTriggeredBy,
        category,
        eventType,
        audience,
        message: "",
      });
      if (claim.claimed) {
        await finishLog(supabase, claim.id, {
          status: "failed",
          error_text: `${rendered.errorCode}: ${rendered.error}`,
        });
      }
    }
    return json({
      ok: false,
      status: "failed",
      errorCode: rendered.errorCode,
      error: rendered.error,
      missing: rendered.missing ?? [],
    }, 422);
  }

  const message = rendered.ok ? rendered.text : legacyMessage;
  const { data: defProv } = await supabase
    .from("sms_providers")
    .select("id, title")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  const providerId: string | null = defProv?.id ?? null;
  const providerName: string | null = defProv?.title ?? null;

  const claimedPhones: string[] = [];
  const logByPhone = new Map<string, string>();
  let duplicateCount = 0;
  let existingStatus: string | null = null;

  for (const phone of validMobiles) {
    const key = externalDispatchKey(eventKey, meetingId, eventType, phone);
    const claim = await claimLog(supabase, {
      dispatchKey: key,
      meetingId,
      targetUserId: null,
      targetPhone: phone,
      triggeredByUserId: dbTriggeredBy,
      category,
      eventType,
      audience,
      message,
      providerId,
      providerName,
    });
    if (!claim.claimed) {
      duplicateCount += 1;
      existingStatus = claim.status;
      continue;
    }
    if (claim.id) logByPhone.set(phone, claim.id);
    claimedPhones.push(phone);
  }

  if (!claimedPhones.length) {
    return json({
      ok: true,
      status: "skipped",
      reason: "DUPLICATE_SMS_DISPATCH",
      existingStatus: validMobiles.length === 1 ? existingStatus : null,
      sent: 0,
      skipped: invalidMobiles.length + duplicateCount,
      templateId: rendered.ok ? rendered.templateId : null,
    });
  }

  let result: any;
  let transportStatus = 0;
  try {
    const innerResp = await sendRequest(
      `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-sms`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ mode: "send", mobiles: claimedPhones, message, providerId, bypassDeliveryPolicy: true }),
      },
    );
    transportStatus = innerResp.status;
    result = await innerResp.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    for (const phone of claimedPhones) {
      await finishLog(supabase, logByPhone.get(phone) ?? null, {
        status: "failed",
        error_text: `PROVIDER_TRANSPORT_ERROR: ${detail}`,
        raw_response: { transportError: detail },
      });
    }
    return json({
      ok: false,
      status: "failed",
      sent: 0,
      skipped: invalidMobiles.length + duplicateCount,
      errorCode: "PROVIDER_TRANSPORT_ERROR",
      error: detail,
    });
  }

  const scheduleOutcomeUnknown = Boolean(context.external_schedule) && !result.ok && (
    transportStatus >= 500 || Number(result.httpStatus) >= 500
    || ['PROVIDER_TIMEOUT', 'PROVIDER_TRANSPORT_ERROR'].includes(result.errorCode)
    || result.response?.failures?.some?.((failure: { httpStatus?: number }) => Number(failure.httpStatus) >= 500)
  );
  const errorCode = scheduleOutcomeUnknown ? "DELIVERY_OUTCOME_UNKNOWN" : (result.errorCode || "PROVIDER_ERROR");
  const returnIds: string[] = Array.isArray(result.returnIds) ? result.returnIds : [];
  for (let i = 0; i < claimedPhones.length; i++) {
    const phone = claimedPhones[i];
    const providerMessageId = returnIds[i] ?? null;
    await finishLog(supabase, logByPhone.get(phone) ?? null, result.ok
      ? {
          status: "sent",
          error_text: null,
          pack_id: result.packId ?? null,
          message_ids: result.messageIds ?? null,
          raw_response: result.response ?? null,
          provider_message_id: providerMessageId,
          delivery_status: providerMessageId ? "pending" : null,
        }
      : {
          status: "failed",
          error_text: `${errorCode}: ${result.error ?? "خطای ناشناخته"}`,
          raw_response: result.response ?? null,
        });
  }

  if (invalidMobiles.length > 0) {
    await supabase.from("sms_dispatch_logs").insert(
      invalidMobiles.map(phone => ({
        meeting_id: meetingId,
        triggered_by_user_id: dbTriggeredBy,
        target_user_id: null,
        target_phone: phone,
        category,
        event_type: eventType,
        audience,
        message,
        status: "skipped",
        error_text: "INVALID_TARGET_PHONE: شماره نامعتبر است",
      })),
    );
  }

  if (isAuthOtp) {
    return json({
      ok: result.ok,
      errorCode: result.ok ? null : (result.errorCode || "SMS_PROVIDER_REJECTED"),
      returnIds,
      packId: result.packId ?? null,
      cost: result.cost ?? null,
    });
  }

  return json({
    ok: result.ok,
    status: result.ok ? "sent" : "failed",
    sent: result.ok ? claimedPhones.length : 0,
    skipped: invalidMobiles.length + duplicateCount,
    templateId: rendered.ok ? rendered.templateId : null,
    errorCode: result.ok ? undefined : errorCode,
    error: result.ok ? undefined : (result.error ?? "خطای ناشناخته"),
    returnIds,
  });
}
