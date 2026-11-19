import { runMeetingNotificationBatch } from '../_shared/recurringDelivery.ts';
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { requireFullAuthAccess, deniedResponse } from "../_shared/requireFullAuthAccess.ts";
import { isValidPhone, normalizePhone } from "./phone.ts";
import { handleDispatchMode, handleExternalMode } from "./requestModes.ts";
import { evaluateSmsDeliveryPolicy, loadSmsDeliveryPolicy, queueDeferredSms } from "../_shared/smsDeliveryPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Meeting-Worker-Token",
};

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Validates the Bearer JWT and returns the caller's profile, or an error code string on failure. */
async function authenticate(
  authHeader: string | null,
): Promise<{ userId: string; isAdmin: boolean } | string> {
  if (!authHeader) return "MISSING_AUTH_HEADER";
  if (!authHeader.startsWith("Bearer ")) return "INVALID_AUTH_HEADER";
  const token = authHeader.slice(7);

  // Accept internal service-to-service calls using the service role key
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey.length > 0) {
    const enc = new TextEncoder();
    const a = enc.encode(token);
    const b = enc.encode(serviceKey);
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (diff === 0) return { userId: "service", isAdmin: true };
    }
  }

  const supabase = adminClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return "INVALID_ACCESS_TOKEN";
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return "PROFILE_NOT_FOUND";
  if (!profile.is_active) return "PROFILE_INACTIVE";
  return { userId: user.id, isAdmin: profile.is_admin === true };
}

export async function handleSendSms(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Authentication ──────────────────────────────────────────────────────────
  // The database cron uses a dedicated Vault token for this mode only.
  // Ordinary sends still require the existing user/service authentication.
  const schedulerToken = req.headers.get('X-Meeting-Worker-Token');
  let schedulerCaller = false;
  let authResult: Awaited<ReturnType<typeof authenticate>>;
  if (schedulerToken) {
    try {
      const verified = await adminClient().rpc('verify_meeting_worker_token', { p_candidate: schedulerToken });
      if (verified.error) return json({ ok: false, errorCode: 'SCHEDULER_VERIFICATION_UNAVAILABLE' }, 503);
      if (verified.data !== true) return json({ ok: false, errorCode: 'INVALID_SCHEDULER_TOKEN' }, 403);
      schedulerCaller = true;
      authResult = { userId: 'service', isAdmin: true };
    } catch { return json({ ok: false, errorCode: 'SCHEDULER_VERIFICATION_UNAVAILABLE' }, 503); }
  } else {
    authResult = await authenticate(req.headers.get("Authorization"));
  }
  if (typeof authResult === "string") {
    return json({ ok: false, error: "Unauthorized", errorCode: authResult }, 401);
  }
  const caller = authResult;

  // ── FULL auth access gate (only for real user callers; service-to-service calls bypass) ──
  if (caller.userId !== "service") {
    const fullAuth = await requireFullAuthAccess(req);
    if (!fullAuth.ok) return deniedResponse();
  }

  // Internal dispatch/external modes re-enter the same authorized send handler.
  // The Database gateway may not host Functions in split deployments.
  const sendRequest = (_url: string, init: RequestInit) =>
    handleSendSms(new Request("https://internal.invalid/send-sms", init));

  let isAuthOtp = false;

  try {
    const supabase = adminClient();

    const body = await req.json();
    let mode: string = body.mode || "send";
    if (schedulerCaller && mode !== 'recurring_delivery') return json({ ok: false, errorCode: 'SCHEDULER_MODE_ONLY' }, 403);
    if (mode === 'recurring_delivery') {
      if (schedulerCaller) {
        const prepared = await supabase.rpc('prepare_meeting_notification_jobs');
        if (prepared.error) return json({ ok: false, errorCode: 'RECURRING_PREPARE_FAILED' }, 503);
        return json(await runMeetingNotificationBatch(supabase, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
      }
      if (caller.userId === 'service' || typeof body.seriesId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.seriesId)) return json({error:'INVALID_SERIES_REQUEST'},400);
      return json(await runMeetingNotificationBatch(supabase, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, caller.userId, body.seriesId));
    }
    if (body.category === 'meeting' && String(body.eventType || '').startsWith('series_') && caller.userId !== 'service') {
      return json({ ok: false, errorCode: 'SERVER_MANAGED_EVENT' }, 403);
    }
    if (body.category === 'meeting' && body.meetingId && ['invite','change','cancel','meeting_created','informee_invite','informee_change','informee_cancel'].includes(body.eventType)) {
      const identity = await supabase.from('meetings').select('series_id').eq('id', body.meetingId).maybeSingle();
      if (identity.error) return json({ ok: false, errorCode: 'SERIES_ROUTING_UNAVAILABLE' }, 503);
      if (identity.data?.series_id) return json({ ok: true, status: 'skipped', reason: 'SERVER_MANAGED_SERIES' });
    }

    let providerId: string | undefined = body.providerId;
    isAuthOtp = mode === 'auth_otp';

    // test_connection and provider management require admin
    if (mode === "test_connection" && !caller.isAdmin) {
      return json({ ok: false, error: "Forbidden: admin access required" }, 403);
    }

    // ── MODE: clear_logs ───────────────────────────────────────────────────────
    // Operational SMS logs are intentionally short-lived. Manual purge is
    // restricted to admins and deletes only sms_dispatch_logs.
    if (mode === "clear_logs") {
      if (!caller.isAdmin) {
        return json({ ok: false, error: "Forbidden: admin access required" }, 403);
      }

      const { count, error: clearError } = await supabase
        .from("sms_dispatch_logs")
        .delete({ count: "exact" })
        .not("id", "is", null);

      if (clearError) {
        return json({
          ok: false,
          errorCode: "SMS_LOG_CLEAR_FAILED",
          error: clearError.message,
        }, 500);
      }

      return json({
        ok: true,
        deleted: count ?? 0,
      });
    }

    // ── MODE: dispatch ─────────────────────────────────────────────────────────
    // Server-side SMS dispatch for internal users (participants/observers).
    // Resolves target phone + provider from server-side rules — never trusts client-provided phone.
    if (mode === "dispatch") {
      return await handleDispatchMode({ supabase, body, caller, json, sendRequest });
    }

    // ── MODE: auth_otp ─────────────────────────────────────────────────────────
    // Internal mode for Auth Send SMS Hook. Uses explicit providerId.
    // Falls through to the same provider dispatch logic as 'send' mode —
    // no recursive self-call. The caller handles redacted logging.
    // Only service-to-service callers (service role key) may use auth_otp.
    if (mode === "auth_otp") {
      if (caller.userId !== "service") {
        return json({ ok: false, error: "Forbidden: auth_otp requires service caller" }, 403);
      }
      const rawMobiles: string[] = body.mobiles || [];
      const message: string = body.message || "";
      if (!rawMobiles.length) return json({ ok: false, error: "شماره موبایل وارد نشده" }, 400);
      if (!message.trim()) return json({ ok: false, error: "متن پیام وارد نشده" }, 400);
      // Rewrite mode to 'send' and fall through to provider logic below
      mode = "send";
      // isAuthOtp is already captured above; providerId is already set
    }

    // ── MODE: external ─────────────────────────────────────────────────────────
    // SMS dispatch for contacts outside the organization.
    // Client may supply phone numbers (they come from the user's own contacts form).
    // Provider is always resolved server-side; client-provided providerId is ignored.
    if (mode === "external") {
      return await handleExternalMode({ supabase, body, caller, json, isAuthOtp, sendRequest });
    }

    // Generic raw-send delivery policy. This covers service flows such as
    // daily reports that already have fully-rendered SMS text.
    if (
      mode === "send" &&
      body.bypassDeliveryPolicy !== true &&
      typeof body.category === "string" &&
      body.category &&
      typeof body.eventType === "string" &&
      body.eventType
    ) {
      try {
        const policy = await loadSmsDeliveryPolicy(supabase, body.category, body.eventType);
        const decision = evaluateSmsDeliveryPolicy(policy);
        if (!decision.sendNow && decision.nextAllowedAt) {
          const rawMobiles = Array.isArray(body.mobiles)
            ? body.mobiles.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const rawMessage = typeof body.message === "string" ? body.message : "";
          if (!rawMobiles.length || !rawMessage.trim()) {
            return json({ ok: false, error: "mobiles و message برای ارسال زمان‌بندی‌شده الزامی است" }, 400);
          }
          const queueResult = await queueDeferredSms(supabase, {
            deliveryMode: "send",
            targetPhones: rawMobiles,
            category: body.category,
            eventType: body.eventType,
            audience: typeof body.audience === "string" && body.audience ? body.audience : "all",
            context: body.context && typeof body.context === "object" ? body.context : {},
            meetingId: typeof body.meetingId === "string" && body.meetingId ? body.meetingId : null,
            actorUserId: caller.userId === "service" ? null : caller.userId,
            eventKey: typeof body.eventKey === "string" && body.eventKey ? body.eventKey : null,
            rawMessage,
            providerId: typeof body.providerId === "string" && body.providerId ? body.providerId : null,
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

    // For delivery_lookup, derive provider and message ID from the log record —
    // never trust provider credentials or message IDs from the request body.
    interface DeliveryLookupContext {
      logId: string;
      providerMessageId: string;
    }
    let deliveryLookupCtx: DeliveryLookupContext | null = null;

    if (mode === "rahyab_rest_delivery_lookup") {
      const logId: string = body.logId || "";
      if (!logId) return json({ ok: false, error: "logId الزامی است" }, 400);

      const { data: logRow, error: logErr } = await supabase
        .from("sms_dispatch_logs")
        .select("id, provider_id, provider_message_id")
        .eq("id", logId)
        .maybeSingle();

      if (logErr || !logRow) return json({ ok: false, error: "رکورد گزارش یافت نشد" }, 404);
      if (!logRow.provider_id) return json({ ok: false, error: "provider_id در گزارش ثبت نشده است" }, 400);
      if (!logRow.provider_message_id) return json({ ok: false, error: "provider_message_id در گزارش ثبت نشده — ابتدا پیامک را ارسال کنید" }, 400);

      // Override providerId so the normal provider-fetch path finds the right provider
      providerId = logRow.provider_id;
      deliveryLookupCtx = { logId, providerMessageId: String(logRow.provider_message_id) };
    }

    // ── Fetch provider ────────────────────────────────────────────────
    let q = supabase.from("sms_providers").select("*").eq("is_active", true);
    if (providerId) q = q.eq("id", providerId);
    else q = q.eq("is_default", true);

    const { data: providers, error: provErr } = await q.limit(1);
    if (provErr || !providers?.length) {
      return json({ ok: false, error: "سرویس‌دهنده SMS فعالی یافت نشد" }, 400);
    }

    const p = providers[0];

    // ── Route to Rahyab REST if provider_type === 'rahyab_rest' ─────────
    if (p.provider_type === "rahyab_rest") {
      const apiBase = (p.api_url || "https://rahyabbulk.ir:8443").replace(/\/$/, "");

      // ── Credential resolver ────────────────────────────────────────────
      // Token takes priority: username = token, password = static 5-char string.
      // Without token: use configured username + password.
      interface RahyabCredentials { username: string; password: string; usesToken: boolean; }
      function resolveRahyabCredentials(): RahyabCredentials {
        const token = p.token?.trim() || "";
        if (token) return { username: token, password: "aBcD1", usesToken: true };
        return { username: p.username?.trim() || "", password: p.password?.trim() || "", usesToken: false };
      }
      const creds = resolveRahyabCredentials();
      if (!creds.username) return json({ ok: false, error: "نام کاربری یا توکن پیکربندی نشده است" }, 400);

      const fromNumber = p.line_number?.trim() || "";

      const maskVal = (v: string) => (!v || v.length <= 4) ? "***" : "***" + v.slice(-4);
      const maskPhone = (v: string) => (!v || v.length <= 4) ? "***" : v.slice(0, 3) + "****" + v.slice(-4);

      type DebugEntry = {
        soapAction: string; url: string;
        requestHeaders: Record<string, string>; requestBody: string;
        requestTimestamp: string; durationMs: number;
        responseStatus?: number; responseBody?: string;
        parsedResult?: string; error?: string;
      };

      // ── HTTP helper ────────────────────────────────────────────────────
      const callRest = async (
        url: string,
        params: Record<string, string>,
        method: "GET" | "POST" = "GET",
      ): Promise<{ ok: boolean; status: number; body: string; durationMs: number; t0: number; error?: string }> => {
        const controller = new AbortController();
        const restTimeoutMs = isAuthOtp ? 7000 : 13000;
        const timer = setTimeout(() => controller.abort(), restTimeoutMs);
        const t0 = Date.now();
        try {
          let fetchUrl = url;
          const fetchOpts: RequestInit = {
            method, signal: controller.signal,
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
          };
          if (method === "GET" && Object.keys(params).length) {
            fetchUrl += "?" + new URLSearchParams(params).toString();
          } else if (method === "POST") {
            fetchOpts.body = new URLSearchParams(params).toString();
          }
          const res = await fetch(fetchUrl, fetchOpts);
          clearTimeout(timer);
          const text = await res.text();
          return { ok: res.ok, status: res.status, body: text, durationMs: Date.now() - t0, t0 };
        } catch (e: unknown) {
          clearTimeout(timer);
          const msg = (e instanceof Error && (e as Error & { name?: string }).name === "AbortError")
            ? `اتصال timeout شد (${restTimeoutMs}ms)`
            : (e instanceof Error ? e.message : String(e));
          return { ok: false, status: 0, body: "", durationMs: Date.now() - t0, t0, error: msg };
        }
      };

      const buildEntry = (
        label: string, url: string, method: string,
        maskedParams: Record<string, string>,
        r: { ok: boolean; status: number; body: string; durationMs: number; t0: number; error?: string },
      ): DebugEntry => ({
        soapAction: `${method} ${label}`,
        url,
        requestHeaders: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" } : {},
        requestBody: new URLSearchParams(maskedParams).toString(),
        requestTimestamp: new Date(r.t0).toISOString(),
        durationMs: r.durationMs,
        responseStatus: r.status || undefined,
        responseBody: r.body || undefined,
        parsedResult: r.body?.trim().slice(0, 500) || undefined,
        error: r.error,
      });

      // Masked creds for debug log (never expose password/token)
      const maskedCredsParams = (extra: Record<string, string> = {}): Record<string, string> => ({
        username: creds.usesToken ? "***token***" : creds.username,
        password: maskVal(creds.password),
        ...extra,
      });

      // ── Application-level error detection ─────────────────────────────
      // Rahyab returns "Error! ..." or "!Error ..." for application errors.
      function extractRahyabError(body: string): string | null {
        const t = body.trim();
        if (/^\s*!?Error\b/i.test(t)) return t;
        return null;
      }

      // ── Return ID validation ───────────────────────────────────────────
      // Valid Return ID: all-digit string representing a positive integer.
      // Kept as string to avoid JS number overflow for large IDs.
      function isValidRahyabReturnId(value: string): boolean {
        if (!/^\d+$/.test(value)) return false;
        if (value === "0") return false;
        // Strip leading zeros for comparison; any remaining non-zero digit is valid
        return value.replace(/^0+/, "").length > 0;
      }

      // ── Send response parser ───────────────────────────────────────────
      // Rahyab Send response format:
      //   "Send OK.<ReturnIDs>ID1;ID2</ReturnIDs>"  (success)
      //   "Error! ..."                              (application error)
      // Legacy bare numeric ID also accepted.
      interface RahyabSendParseResult {
        success: boolean;
        status: "success" | "partial_success" | "error";
        returnIds: string[];
        validReturnIds: string[];
        failedReturnIds: string[];
        rawResponse: string;
        errorMessage: string | null;
      }

      function parseRahyabSendResponse(raw: unknown): RahyabSendParseResult {
        const rawResponse = typeof raw === "string" ? raw.trim()
          : raw == null ? "" : String(raw).trim();

        const appError = extractRahyabError(rawResponse);
        if (appError) {
          return { success: false, status: "error", returnIds: [], validReturnIds: [], failedReturnIds: [], rawResponse, errorMessage: appError };
        }

        const hasSendOk = /Send\s+OK\.?/i.test(rawResponse);
        const idsMatch = rawResponse.match(/<ReturnIDs>\s*([\s\S]*?)\s*<\/ReturnIDs>/i);
        let allIds: string[] = [];

        if (idsMatch?.[1]) {
          // Rahyab uses ";" as primary separator; also accept comma and whitespace for robustness
          allIds = idsMatch[1].split(/[;,\s]+/).map(id => id.trim()).filter(Boolean);
        }

        // Legacy: bare positive integer (no Send OK wrapper)
        const isLegacyNumeric = !hasSendOk && /^\d+$/.test(rawResponse) && rawResponse !== "0";
        if (isLegacyNumeric) allIds = [rawResponse];

        const validReturnIds = allIds.filter(isValidRahyabReturnId);
        const failedReturnIds = allIds.filter(id => !isValidRahyabReturnId(id));

        if (!(hasSendOk || isLegacyNumeric)) {
          return { success: false, status: "error", returnIds: allIds, validReturnIds: [], failedReturnIds: allIds, rawResponse, errorMessage: rawResponse || "پاسخ معتبری از سرویس رهیاب دریافت نشد" };
        }

        if (validReturnIds.length === 0) {
          return { success: false, status: "error", returnIds: allIds, validReturnIds: [], failedReturnIds: allIds, rawResponse, errorMessage: "Rahyab returned no valid message ID" };
        }

        if (failedReturnIds.length > 0) {
          // Some valid, some failed → partial success
          return { success: true, status: "partial_success", returnIds: allIds, validReturnIds, failedReturnIds, rawResponse, errorMessage: null };
        }

        return { success: true, status: "success", returnIds: allIds, validReturnIds, failedReturnIds: [], rawResponse, errorMessage: null };
      }

      // ── Delivery response parser ───────────────────────────────────────
      interface RahyabDeliveryItem {
        returnId: string;
        code: string;
        statusKey: string;
        statusLabel: string;
      }

      type RahyabDeliveryOverallStatus =
        | "delivered" | "pending" | "partial" | "failed" | "not_found" | "error";

      const DELIVERY_CODE_MAP: Record<string, { key: string; label: string }> = {
        "0":  { key: "unknown",       label: "ارسال شده، وضعیت تحویل هنوز مشخص نیست" },
        "2":  { key: "delivered",     label: "تحویل شده به گوشی" },
        "5":  { key: "not_delivered", label: "به گوشی تحویل نشده" },
        "9":  { key: "blocked",       label: "ارسال نشده / بلاک شده" },
        "-1": { key: "not_found",     label: "شناسه پیام در سامانه رهیاب پیدا نشد" },
      };

      function getRahyabDeliveryOverallStatus(items: RahyabDeliveryItem[]): RahyabDeliveryOverallStatus {
        if (items.length === 0) return "error";
        const codes = items.map(i => i.code);
        const allMatch = (c: string) => codes.every(x => x === c);
        const allIn = (...cs: string[]) => codes.every(x => cs.includes(x));
        if (allMatch("2")) return "delivered";
        if (allMatch("0")) return "pending";
        if (allMatch("-1")) return "not_found";
        if (allIn("5", "9")) return "failed";
        return "partial";
      }

      function parseRahyabDeliveryResponse(rawBody: string, requestedIds: string[]): {
        ok: boolean; status: RahyabDeliveryOverallStatus; items: RahyabDeliveryItem[];
        rawResponse: string; errorMessage: string | null;
      } {
        const raw = rawBody.trim();
        const appError = extractRahyabError(raw);
        if (appError) return { ok: false, status: "error", items: [], rawResponse: raw, errorMessage: appError };
        if (!raw) return { ok: false, status: "error", items: [], rawResponse: raw, errorMessage: "پاسخ خالی از سرویس رهیاب" };

        const codes = raw.split(/[;,\s]+/).map(c => c.trim()).filter(Boolean);
        const items: RahyabDeliveryItem[] = codes.map((code, i) => {
          const returnId = requestedIds[i] || `#${i + 1}`;
          const mapping = DELIVERY_CODE_MAP[code] || { key: "unrecognized", label: `کد ناشناخته: ${code}` };
          return { returnId, code, statusKey: mapping.key, statusLabel: mapping.label };
        });
        const overallStatus = getRahyabDeliveryOverallStatus(items);
        return { ok: overallStatus === "delivered", status: overallStatus, items, rawResponse: raw, errorMessage: null };
      }

      // ── Compare large integer strings safely (no Number conversion) ────
      function comparePositiveIntegerStrings(a: string, b: string): number {
        const na = a.replace(/^0+/, "") || "0";
        const nb = b.replace(/^0+/, "") || "0";
        if (na.length !== nb.length) return na.length - nb.length;
        return na.localeCompare(nb);
      }

      // ── Receive XML parser ─────────────────────────────────────────────
      interface RahyabReceivedSms {
        rowId: string; sender: string; receiver: string; time: string; message: string;
      }

      function parseRahyabReceiveXml(rawBody: string, currentLastRowId: string): {
        ok: boolean; messages: RahyabReceivedSms[]; nextLastRowId: string; rawResponse: string; errorMessage: string | null;
      } {
        const raw = rawBody.trim();
        const appError = extractRahyabError(raw);
        if (appError) return { ok: false, messages: [], nextLastRowId: currentLastRowId, rawResponse: raw, errorMessage: appError };

        // Truly empty response = no new messages
        if (!raw) return { ok: true, messages: [], nextLastRowId: currentLastRowId, rawResponse: raw, errorMessage: null };

        // Non-empty response must have valid smsBatch root
        const hasSmsBatchRoot = /<smsBatch(?:\s|>)[\s\S]*<\/smsBatch>/i.test(raw);
        if (!hasSmsBatchRoot) {
          return {
            ok: false, messages: [], nextLastRowId: currentLastRowId, rawResponse: raw,
            errorMessage: "پاسخ Receive رهیاب ساختار معتبر smsBatch ندارد",
          };
        }

        const messages: RahyabReceivedSms[] = [];
        const smsBlocks = Array.from(raw.matchAll(/<sms>([\s\S]*?)<\/sms>/gi));
        for (const match of smsBlocks) {
          const block = match[1];
          const get = (tag: string): string => {
            const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, "i"));
            return (m?.[1] ?? m?.[2] ?? "").trim();
          };
          messages.push({ rowId: get("rowID"), sender: get("origAddr"), receiver: get("destAddr"), time: get("time"), message: get("message") });
        }

        const validRowIds = messages.map(m => m.rowId).filter(r => /^\d+$/.test(r) && r !== "0");
        const nextLastRowId = validRowIds.length > 0
          ? validRowIds.reduce((max, id) => comparePositiveIntegerStrings(id, max) > 0 ? id : max, validRowIds[0])
          : currentLastRowId;

        return { ok: true, messages, nextLastRowId, rawResponse: raw, errorMessage: null };
      }

      // ── GetInfoXML parser ──────────────────────────────────────────────
      interface RahyabAccountInfo {
        creditType: string | null; credit: string | null; active: boolean | null; expireDate: string | null;
        prices: Array<{ provider: string; unicodePrice: string | null; nonUnicodePrice: string | null }>;
        shortCodes: string[];
      }

      function parseRahyabAccountInfoXml(rawBody: string): {
        ok: boolean; accountInfo: RahyabAccountInfo | null; rawResponse: string; errorMessage: string | null;
      } {
        const raw = rawBody.trim();
        const appError = extractRahyabError(raw);
        if (appError) return { ok: false, accountInfo: null, rawResponse: raw, errorMessage: appError };
        if (!raw) return { ok: false, accountInfo: null, rawResponse: raw, errorMessage: "پاسخ معتبری از سرویس رهیاب دریافت نشد" };

        // Must have UserAllInformation root — rejects HTML error pages and partial responses
        const hasValidRoot = /<UserAllInformation(?:\s|>)[\s\S]*<\/UserAllInformation>/i.test(raw);
        if (!hasValidRoot) {
          return { ok: false, accountInfo: null, rawResponse: raw, errorMessage: "پاسخ GetInfoXML رهیاب ساختار معتبر UserAllInformation ندارد" };
        }

        const getTag = (xml: string, tag: string): string => {
          const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, "i"));
          return (m?.[1] ?? m?.[2] ?? "").trim();
        };

        const userInfo = raw.match(/<UserInfo>([\s\S]*?)<\/UserInfo>/i)?.[1] ?? "";
        const prices: Array<{ provider: string; unicodePrice: string | null; nonUnicodePrice: string | null }> = [];
        for (const pm of Array.from(raw.matchAll(/<Provider>([\s\S]*?)<\/Provider>/gi))) {
          prices.push({
            provider: getTag(pm[1], "Name"),
            unicodePrice: getTag(pm[1], "UnicodePrice") || null,
            nonUnicodePrice: getTag(pm[1], "NonUnicodePrice") || null,
          });
        }

        const shortCodes: string[] = [];
        for (const sm of Array.from(raw.matchAll(/<ShortCode>([\s\S]*?)<\/ShortCode>/gi))) {
          const code = sm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
          if (code) shortCodes.push(code);
        }

        const activeRaw = getTag(userInfo, "Active");
        const accountInfo: RahyabAccountInfo = {
          creditType: getTag(userInfo, "CreditType") || null,
          credit: getTag(userInfo, "Credit") || null,
          active: activeRaw === "1" ? true : activeRaw === "0" ? false : null,
          expireDate: getTag(userInfo, "ExpireDate") || null,
          prices,
          shortCodes,
        };

        return { ok: true, accountInfo, rawResponse: raw, errorMessage: null };
      }

      // ── Shared send execution (used by both production and test) ──────
      interface RahyabRestSendExecutionResult {
        ok: boolean;
        status: "success" | "partial_success" | "error";
        validReturnIds: string[];
        failedReturnIds: string[];
        rawResponse: string;
        error: string | null;
        errorCode: string | null;
        requestResult: { ok: boolean; status: number; body: string; durationMs: number; t0: number; error?: string };
      }

      async function sendRahyabRestSms(to: string, message: string): Promise<RahyabRestSendExecutionResult> {
        const url = `${apiBase}/url/send.ashx`;
        const digits = to.replace(/\D/g, "");
        const rahyabTo = /^00989\d{9}$/.test(digits) ? `0${digits.slice(4)}`
          : /^989\d{9}$/.test(digits) ? `0${digits.slice(2)}`
          : /^9\d{9}$/.test(digits) ? `0${digits}`
          : to.trim();
        const params: Record<string, string> = {
          username: creds.username, password: creds.password,
          from: fromNumber, to: rahyabTo, farsi: "true", message,
        };
        const r = await callRest(url, params, "POST");
        const parsed = parseRahyabSendResponse(r.body || "");
        const ok = !r.error && r.ok && parsed.success;
        const transportError = r.error
          ? (r.error.includes("timeout") ? "PROVIDER_TIMEOUT" : "PROVIDER_TRANSPORT_ERROR")
          : null;
        return {
          ok,
          status: ok ? parsed.status : "error",
          validReturnIds: parsed.validReturnIds,
          failedReturnIds: parsed.failedReturnIds,
          rawResponse: parsed.rawResponse,
          error: ok
            ? null
            : (r.error || (!r.ok && r.status ? `HTTP ${r.status}` : null) || parsed.errorMessage || "ارسال ناموفق"),
          errorCode: ok ? null : (transportError || (!r.ok && r.status ? "PROVIDER_HTTP_ERROR" : "PROVIDER_REJECTED")),
          requestResult: r,
        };
      }

      // ── test_connection → GET /ip.ashx ────────────────────────────────
      if (mode === "test_connection") {
        const url = `${apiBase}/ip.ashx`;
        const r = await callRest(url, {}, "GET");
        const dbg = [buildEntry("/ip.ashx", url, "GET", {}, r)];
        if (r.error || !r.ok) return json({ ok: false, error: r.error || `HTTP ${r.status}`, debug: dbg });
        const ipText = r.body?.trim() || "";
        const appErr = extractRahyabError(ipText);
        if (appErr) return json({ ok: false, error: appErr, debug: dbg });
        return json({ ok: true, ip: ipText, debug: dbg });
      }

      // ── send (production) ─────────────────────────────────────────────
      if (mode === "send") {
        const rawMobiles: string[] = body.mobiles || [];
        const message: string = body.message || "";
        if (!rawMobiles.length) return json({ ok: false, error: "شماره موبایل وارد نشده" }, 400);
        if (!message.trim()) return json({ ok: false, error: "متن پیام وارد نشده" }, 400);
        if (!fromNumber) return json({ ok: false, error: "شماره فرستنده پیکربندی نشده است" }, 400);

        const allValidIds: string[] = [];
        const errors: string[] = [];
        const failures: Array<{
          phone: string;
          errorCode: string | null;
          error: string;
          httpStatus: number;
          durationMs: number;
          transportError: string | null;
          responseBody: string | null;
        }> = [];

        for (const to of rawMobiles) {
          const sent = await sendRahyabRestSms(to, message);
          if (sent.ok) {
            allValidIds.push(...sent.validReturnIds);
          } else {
            const errorText = sent.error || "ارسال ناموفق";
            errors.push(`${maskPhone(to)}: ${errorText}`);
            failures.push({
              phone: maskPhone(to),
              errorCode: sent.errorCode,
              error: errorText,
              httpStatus: sent.requestResult.status,
              durationMs: sent.requestResult.durationMs,
              transportError: sent.requestResult.error ?? null,
              responseBody: sent.requestResult.body ? sent.requestResult.body.slice(0, 1000) : null,
            });
          }
        }

        const dominantErrorCode = failures.find(f => f.errorCode === "PROVIDER_TIMEOUT")?.errorCode
          || failures.find(f => f.errorCode)?.errorCode
          || null;

        if (isAuthOtp) {
          return json({
            ok: errors.length === 0,
            errorCode: errors.length === 0 ? null : (dominantErrorCode || "SMS_PROVIDER_REJECTED"),
            returnIds: allValidIds,
            packId: null,
            cost: null,
          });
        }
        return json({
          ok: errors.length === 0,
          sent: allValidIds.length,
          returnIds: allValidIds,
          errors,
          errorCode: errors.length > 0 ? (dominantErrorCode || "PROVIDER_ERROR") : undefined,
          error: errors.length > 0 ? errors.join("; ") : undefined,
          response: errors.length > 0 ? { errors, failures } : undefined,
        });
      }

      // ── rahyab_rest_test — individual test actions ─────────────────────
      if (mode === "rahyab_rest_test") {
        const action: string = body.action || "";

        if (action === "ip") {
          const url = `${apiBase}/ip.ashx`;
          const r = await callRest(url, {}, "GET");
          const ipText = r.body?.trim() || "";
          const appErr = extractRahyabError(ipText);
          return json({ ok: !r.error && r.ok && !appErr, ip: appErr ? undefined : ipText, error: appErr || r.error || undefined, debug: [buildEntry("/ip.ashx", url, "GET", {}, r)] });
        }

        if (action === "get_info") {
          const url = `${apiBase}/url/GetInfoXML.ashx`;
          const params = { username: creds.username, password: creds.password };
          const r = await callRest(url, params, "POST");
          const parsed = parseRahyabAccountInfoXml(r.body || "");
          const dbg: DebugEntry[] = [{
            ...buildEntry("/url/GetInfoXML.ashx", url, "POST", maskedCredsParams(), r),
            parsedResult: JSON.stringify({ validRoot: parsed.ok, accountInfo: parsed.accountInfo }),
          }];
          return json({ ok: !r.error && r.ok && parsed.ok, accountInfo: parsed.accountInfo, rawResult: parsed.rawResponse, error: parsed.errorMessage || r.error || undefined, debug: dbg });
        }

        if (action === "send") {
          const to: string = body.to || "";
          const message: string = body.message || "";
          if (!to) return json({ ok: false, error: "شماره گیرنده وارد نشده" });
          if (!message.trim()) return json({ ok: false, error: "متن پیام وارد نشده" });
          if (!fromNumber) return json({ ok: false, error: "شماره فرستنده پیکربندی نشده است" });

          const sent = await sendRahyabRestSms(to, message);
          const maskedP = maskedCredsParams({ from: fromNumber, to: maskPhone(to), farsi: "true", message: message.slice(0, 20) + (message.length > 20 ? "…" : "") });
          return json({
            ok: sent.ok,
            status: sent.status,
            returnId: sent.validReturnIds[0] ?? null,
            returnIds: sent.validReturnIds,
            failedReturnIds: sent.failedReturnIds,
            rawResult: sent.rawResponse,
            error: sent.error,
            debug: [buildEntry("/url/send.ashx", `${apiBase}/url/send.ashx`, "POST", maskedP, sent.requestResult)],
          });
        }

        if (action === "delivery") {
          const returnIdsInput: string = body.returnIds || "";
          if (!returnIdsInput.trim()) return json({ ok: false, error: "شناسه بازگشتی وارد نشده" });
          const requestedIds = returnIdsInput.split(/[;,\s]+/).map(s => s.trim()).filter(Boolean);
          const rahyabReturnIds = requestedIds.join(";");

          const url = `${apiBase}/url/delivery.ashx`;
          const params: Record<string, string> = { username: creds.username, ReturnIDs: rahyabReturnIds };
          const r = await callRest(url, params, "GET");
          const parsed = parseRahyabDeliveryResponse(r.body || "", requestedIds);
          const dbg: DebugEntry[] = [{
            ...buildEntry("/url/delivery.ashx", url, "GET", { username: "***", ReturnIDs: rahyabReturnIds }, r),
            parsedResult: JSON.stringify({ overallStatus: parsed.status, items: parsed.items }),
          }];
          return json({
            ok: parsed.ok,
            status: parsed.status,
            delivery: parsed.items,
            rawResult: parsed.rawResponse,
            error: parsed.errorMessage || r.error || undefined,
            debug: dbg,
          });
        }

        if (action === "receive") {
          const lastRowIdRaw = String(body.lastRowId ?? "0").trim();
          const lastRowId = /^\d+$/.test(lastRowIdRaw) ? lastRowIdRaw : "0";

          const url = `${apiBase}/url/receive.ashx`;
          const params: Record<string, string> = { username: creds.username, password: creds.password, LastRowID: lastRowId };
          const r = await callRest(url, params, "GET");
          const parsed = parseRahyabReceiveXml(r.body || "", lastRowId);
          const dbg: DebugEntry[] = [{
            ...buildEntry("/url/receive.ashx", url, "GET", maskedCredsParams({ LastRowID: lastRowId }), r),
            parsedResult: JSON.stringify({ messageCount: parsed.messages.length, nextLastRowId: parsed.nextLastRowId, messages: parsed.messages }),
          }];
          return json({
            ok: !r.error && r.ok && parsed.ok,
            messages: parsed.messages,
            messageCount: parsed.messages.length,
            nextLastRowId: parsed.nextLastRowId,
            rawResult: parsed.rawResponse,
            error: parsed.errorMessage || r.error || undefined,
            debug: dbg,
          });
        }

        return json({ ok: false, error: `عملیات ناشناخته: ${action}` }, 400);
      }

      // ── rahyab_rest_delivery_lookup ────────────────────────────────────
      if (mode === "rahyab_rest_delivery_lookup" && deliveryLookupCtx) {
        const { logId, providerMessageId } = deliveryLookupCtx;

        // Validate provider_message_id is a positive integer string
        if (!isValidRahyabReturnId(providerMessageId)) {
          return json({ ok: false, error: `provider_message_id نامعتبر: ${providerMessageId}` }, 400);
        }

        const url = `${apiBase}/url/delivery.ashx`;
        const params: Record<string, string> = { username: creds.username, ReturnIDs: providerMessageId };
        const r = await callRest(url, params, "GET");

        const parsed = parseRahyabDeliveryResponse(r.body || "", [providerMessageId]);
        const now = new Date().toISOString();

        // Map overall status to delivery_status column value
        const deliveryStatusMap: Record<string, string> = {
          delivered: "delivered",
          pending: "pending",
          failed: "not_delivered",
          not_found: "not_found",
          partial: "unknown",
          error: "error",
        };
        // For single-message lookup: use first item's code if available
        const firstItem = parsed.items[0];
        const rawCode = firstItem?.code ?? null;
        const deliveryStatusFromCode: Record<string, string> = {
          "2": "delivered", "0": "pending", "5": "not_delivered", "9": "blocked", "-1": "not_found",
        };
        const dbDeliveryStatus = rawCode
          ? (deliveryStatusFromCode[rawCode] ?? "unknown")
          : (deliveryStatusMap[parsed.status] ?? "error");

        // Update sms_dispatch_logs
        await supabase.from("sms_dispatch_logs").update({
          delivery_status: dbDeliveryStatus,
          delivery_code: rawCode,
          delivery_checked_at: now,
        }).eq("id", logId);

        const dbg: DebugEntry[] = [{
          ...buildEntry("/url/delivery.ashx", url, "GET", { username: "***", ReturnIDs: providerMessageId }, r),
          parsedResult: JSON.stringify({ overallStatus: parsed.status, code: rawCode, deliveryStatus: dbDeliveryStatus }),
        }];

        // Human-readable message for UI
        const statusMessages: Record<string, string> = {
          delivered:     "پیامک به گوشی تحویل شده است",
          pending:       "پیامک ارسال شده اما وضعیت تحویل هنوز مشخص نیست",
          not_delivered: "پیامک به گوشی تحویل نشده",
          blocked:       "پیامک ارسال نشده یا بلاک شده",
          not_found:     "شناسه پیام در سامانه رهیاب پیدا نشد",
          unknown:       "وضعیت نامشخص",
          error:         parsed.errorMessage || r.error || "خطا در استعلام وضعیت",
        };

        return json({
          ok: dbDeliveryStatus === "delivered",
          status: parsed.status,
          deliveryStatus: dbDeliveryStatus,
          deliveryCode: rawCode,
          deliveryCheckedAt: now,
          providerMessageId,
          message: statusMessages[dbDeliveryStatus] ?? "وضعیت نامشخص",
          rawResult: parsed.rawResponse,
          error: parsed.errorMessage || r.error || undefined,
          debug: dbg,
        });
      }

      return json({ ok: false, error: "mode نامعتبر برای rahyab_rest" }, 400);
    }

    // ── Route to Rahyab if provider_type === 'rahyab' ─────────────────
    if (p.provider_type === "rahyab") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const providerOverride = {
        token:      p.token || p.api_key || "",
        username:   p.username || "",
        password:   p.password || "",
        short_code: p.line_number || "",
        soap_url:   p.api_url || "http://RahyabBulk.ir/WebService/sms.asmx",
      };

      let rahyabBody: Record<string, unknown>;
      if (mode === "test_connection") {
        rahyabBody = { action: "test", _providerOverride: providerOverride, debug: true };
      } else if (mode === "rahyab_test") {
        rahyabBody = { ...body.rahyabPayload, _providerOverride: providerOverride, debug: true };
      } else {
        rahyabBody = { action: "send", mobiles: body.mobiles, message: body.message, isFarsi: true, _providerOverride: providerOverride };
      }

      // Internal service-to-service call; service key is the correct credential here.
      const resp = await fetch(`${supabaseUrl}/functions/v1/rahyab-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(rahyabBody),
      });
      const data = await resp.json();
      if (isAuthOtp) {
        return new Response(JSON.stringify({
          ok: data.ok === true || data.success === true,
          errorCode: (data.ok === true || data.success === true) ? null : "SMS_PROVIDER_REJECTED",
          returnIds: data.returnIds ?? data.validReturnIds ?? null,
          packId: data.packId ?? null,
          cost: data.cost ?? null,
        }), {
          status: resp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard REST provider (sms.ir-style) ─────────────────────────
    const apiKey: string = p.api_key || "";
    const lineNumber: string = p.line_number || "";
    const baseUrl: string = (p.api_url || "https://api.sms.ir").replace(/\/$/, "");

    if (!apiKey) {
      if (isAuthOtp) return json({ ok: false, errorCode: "SMS_PROVIDER_CONFIG_INVALID" });
      return json({ ok: false, error: "کلید API تنظیم نشده است" }, 400);
    }

    // ── MODE: test_connection ─────────────────────────────────────────
    if (mode === "test_connection") {
      const reqUrl = `${baseUrl}/v1/credit`;
      const reqHeaders = { "Accept": "application/json", "X-API-KEY": `***${apiKey.slice(-4)}` };
      const reqTimestamp = new Date().toISOString();
      const t0 = Date.now();

      let creditRaw: Response;
      try {
        creditRaw = await fetch(reqUrl, {
          headers: { "Accept": "application/json", "X-API-KEY": apiKey },
        });
      } catch (e: any) {
        const durationMs = Date.now() - t0;
        const debugEntry = {
          soapAction: "GET /v1/credit",
          url: reqUrl,
          requestHeaders: reqHeaders,
          requestBody: "",
          requestTimestamp: reqTimestamp,
          durationMs,
          error: e.message,
        };
        return json({ ok: false, error: `خطای اتصال: ${e.message}`, debug: [debugEntry] });
      }

      const durationMs = Date.now() - t0;
      const text = await creditRaw.text();
      const responseHeaders: Record<string, string> = {};
      creditRaw.headers.forEach((v, k) => { responseHeaders[k] = v; });

      let data: any;
      try { data = JSON.parse(text); } catch { data = { rawText: text }; }

      const debugEntry = {
        soapAction: "GET /v1/credit",
        url: reqUrl,
        requestHeaders: reqHeaders,
        requestBody: "",
        requestTimestamp: reqTimestamp,
        durationMs,
        responseStatus: creditRaw.status,
        responseHeaders,
        responseBody: text,
        parsedResult: JSON.stringify(data),
        error: !creditRaw.ok ? (data?.message || `HTTP ${creditRaw.status}`) : (data?.status !== 1 ? (data?.message || "پاسخ غیرمنتظره") : undefined),
      };

      if (!creditRaw.ok) {
        return json({ ok: false, httpStatus: creditRaw.status, response: data,
          error: data?.message || `HTTP ${creditRaw.status}`, debug: [debugEntry] });
      }
      if (data?.status !== 1) {
        return json({ ok: false, response: data,
          error: data?.message || "پاسخ غیرمنتظره از سرور", debug: [debugEntry] });
      }
      return json({ ok: true, credit: data.data, response: data, debug: [debugEntry] });
    }

    // ── MODE: send (likeToLike) ───────────────────────────────────────
    const rawMobiles: string[] = body.mobiles || [];
    const message: string = body.message || "";
    const messageTextsInput: string[] | undefined = body.messageTexts;
    const sendDateTime: number | null = body.sendDateTime ?? null;

    if (!rawMobiles.length) {
      if (isAuthOtp) return json({ ok: false, errorCode: "SMS_PROVIDER_CONFIG_INVALID" });
      return json({ ok: false, error: "شماره موبایل وارد نشده" }, 400);
    }
    if (!lineNumber) {
      if (isAuthOtp) return json({ ok: false, errorCode: "SMS_PROVIDER_CONFIG_INVALID" });
      return json({ ok: false, error: "شماره خط ارسال تنظیم نشده است" }, 400);
    }

    // Validate each destination number before any external call
    const invalidNumbers = rawMobiles.filter(m => !isValidPhone(m.replace(/\s/g, "")));
    if (invalidNumbers.length > 0) {
      return json({ ok: false, error: `شماره موبایل نامعتبر: ${invalidNumbers.slice(0, 3).join(", ")}` }, 400);
    }

    const pairs: { mobile: string; text: string }[] = rawMobiles
      .map((m, i) => ({ mobile: m, text: messageTextsInput?.[i] ?? message }))
      .filter(({ mobile }) => mobile?.trim().length >= 7)
      .map(({ mobile, text }) => ({ mobile: normalizePhone(mobile), text }));

    if (!pairs.length) return json({ ok: false, error: "شماره موبایل معتبری یافت نشد" }, 400);

    const messageTexts = pairs.map(x => x.text);
    const normalized = pairs.map(x => x.mobile);

    if (messageTexts.some(t => !t.trim())) {
      return json({ ok: false, error: "متن پیام وارد نشده" }, 400);
    }

    const lineNumberValue = Number(lineNumber.replace(/\D/g, ""));

    const payload: Record<string, unknown> = {
      lineNumber: lineNumberValue,
      messageTexts,
      mobiles: normalized,
      sendDateTime,
    };

    const sendReqUrl = `${baseUrl}/v1/send/likeToLike`;
    const sendReqHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-API-KEY": `***${apiKey.slice(-4)}`,
    };
    const sendReqBody = JSON.stringify(payload);
    const sendReqTimestamp = new Date().toISOString();
    const sendT0 = Date.now();

    const restProviderTimeoutMs = isAuthOtp ? 7000 : 13000;
    const restController = new AbortController();
    const restTimer = setTimeout(() => restController.abort(), restProviderTimeoutMs);
    let smsRaw: Response;
    try {
      smsRaw = await fetch(sendReqUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-API-KEY": apiKey,
        },
        body: sendReqBody,
        signal: restController.signal,
      });
      clearTimeout(restTimer);
    } catch (e: any) {
      clearTimeout(restTimer);
      if (isAuthOtp) {
        const isTimeout = e instanceof Error && e.name === "AbortError";
        return json({ ok: false, errorCode: isTimeout ? "SMS_PROVIDER_TIMEOUT" : "SMS_PROVIDER_CONNECTION_FAILED" });
      }
      const durationMs = Date.now() - sendT0;
      const debugEntry = {
        soapAction: "POST /v1/send/likeToLike",
        url: sendReqUrl,
        requestHeaders: sendReqHeaders,
        requestBody: sendReqBody,
        requestTimestamp: sendReqTimestamp,
        durationMs,
        error: e.message,
      };
      return json({ ok: false, errorCode: "PROVIDER_TRANSPORT_ERROR", error: `خطای اتصال به سرور: ${e.message}`, debug: [debugEntry] });
    }

    const sendDurationMs = Date.now() - sendT0;
    const text = await smsRaw.text();
    const sendResponseHeaders: Record<string, string> = {};
    smsRaw.headers.forEach((v, k) => { sendResponseHeaders[k] = v; });

    let smsData: any;
    try { smsData = JSON.parse(text); } catch { smsData = { rawText: text }; }

    const sendDebugEntry = {
      soapAction: "POST /v1/send/likeToLike",
      url: sendReqUrl,
      requestHeaders: sendReqHeaders,
      requestBody: sendReqBody,
      requestTimestamp: sendReqTimestamp,
      durationMs: sendDurationMs,
      responseStatus: smsRaw.status,
      responseHeaders: sendResponseHeaders,
      responseBody: text,
      parsedResult: JSON.stringify(smsData),
      error: !smsRaw.ok ? (smsData?.message || `HTTP ${smsRaw.status}`) : (smsData?.status !== 1 ? (smsData?.message || "ارسال ناموفق") : undefined),
    };

    if (!smsRaw.ok) {
      if (isAuthOtp) {
        return json({ ok: false, errorCode: "SMS_PROVIDER_REJECTED" });
      }
      return json({ ok: false, httpStatus: smsRaw.status, response: smsData,
        error: smsData?.message || `HTTP ${smsRaw.status}`, debug: [sendDebugEntry] });
    }

    if (smsData?.status !== 1) {
      if (isAuthOtp) {
        return json({ ok: false, errorCode: "SMS_PROVIDER_REJECTED" });
      }
      return json({ ok: false, response: smsData,
        error: smsData?.message || "ارسال ناموفق", debug: [sendDebugEntry] });
    }

    if (isAuthOtp) {
      return json({
        ok: true,
        packId: smsData.data?.packId ?? null,
        messageIds: smsData.data?.messageIds ?? null,
        returnIds: smsData.data?.messageIds ?? null,
        cost: smsData.data?.cost ?? null,
      });
    }
    return json({
      ok: true,
      sent: normalized.length,
      packId: smsData.data?.packId,
      messageIds: smsData.data?.messageIds,
      cost: smsData.data?.cost,
      response: smsData,
      debug: [sendDebugEntry],
    });

  } catch (err: any) {
    if (isAuthOtp) {
      return json({ ok: false, errorCode: "SMS_DISPATCH_FAILED" });
    }
    return json({ ok: false, error: err?.message || "خطای داخلی سرور" }, 500);
  }
}
