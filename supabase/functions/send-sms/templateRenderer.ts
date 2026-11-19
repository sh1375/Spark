type SmsClient = any;

export type SystemSmsRenderInput = {
  supabase: SmsClient;
  category: string;
  eventType: string;
  audience: string;
  context?: Record<string, unknown>;
  targetUserId?: string | null;
  meetingId?: string | null;
};

export type SystemSmsRenderResult =
  | { ok: true; text: string; templateId: string; context: Record<string, unknown> }
  | { ok: false; errorCode: "SMS_TEMPLATE_NOT_FOUND" | "SMS_TEMPLATE_CONTEXT_MISSING"; error: string; missing?: string[] };

const OPTIONAL_PLACEHOLDERS = new Set(["join_link", "location_part", "external_schedule"]);
const DATE_PLACEHOLDERS = new Set(["meeting_date", "event_date", "due_date", "decision_due_date", "followup_date"]);
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function nonEmpty(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildMeetingTime(start: string, end: string): string {
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

function formatTemplateDate(raw: unknown): string {
  const value = nonEmpty(raw).replace(/[۰-۹٠-٩]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".includes(digit) ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) : "٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!value) return "";

  const datePrefix = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (datePrefix) {
    const year = Number(datePrefix[1]);
    if (year >= 1300 && year <= 1499) {
      return `${datePrefix[1]}/${datePrefix[2].padStart(2, "0")}/${datePrefix[3].padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}/${month}/${day}` : value;
}

function normalizeTemplateDates(context: Record<string, unknown>): Record<string, unknown> {
  for (const key of DATE_PLACEHOLDERS) {
    if (nonEmpty(context[key])) context[key] = formatTemplateDate(context[key]);
  }
  return context;
}

async function enrichContext(input: SystemSmsRenderInput): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    ...(input.context && typeof input.context === "object" ? input.context : {}),
  };

  if (input.targetUserId) {
    const { data: profile } = await input.supabase
      .from("profiles")
      .select("full_name, username")
      .eq("user_id", input.targetUserId)
      .maybeSingle();

    const name = nonEmpty(profile?.full_name) || nonEmpty(profile?.username);
    if (name) {
      if (!nonEmpty(context.full_name)) context.full_name = name;
      if (!nonEmpty(context.recipient_greeting)) context.recipient_greeting = name;
    }
  }

  if (input.meetingId) {
    const { data: meeting } = await input.supabase
      .from("meetings")
      .select("subject, request_date, request_jalaali_date, start_time, end_time, location, user_id")
      .eq("id", input.meetingId)
      .maybeSingle();

    if (meeting) {
      const subject = nonEmpty(meeting.subject);
      const date = formatTemplateDate(meeting.request_date) || formatTemplateDate(meeting.request_jalaali_date);
      const start = nonEmpty(meeting.start_time);
      const end = nonEmpty(meeting.end_time);
      const location = nonEmpty(meeting.location);

      if (!nonEmpty(context.meeting_subject) && subject) context.meeting_subject = subject;
      if (!nonEmpty(context.meeting_date) && date) context.meeting_date = date;
      if (!nonEmpty(context.start_time) && start) context.start_time = start;
      if (!nonEmpty(context.end_time) && end) context.end_time = end;
      if (!nonEmpty(context.meeting_time)) context.meeting_time = buildMeetingTime(start, end);
      if (!nonEmpty(context.location) && location) context.location = location;
      if (!nonEmpty(context.location_part)) context.location_part = location ? ` در محل ${location}` : "";

      if (meeting.user_id && (!nonEmpty(context.organizer_name) || !nonEmpty(context.sender_name))) {
        const { data: organizer } = await input.supabase
          .from("profiles")
          .select("full_name, username")
          .eq("user_id", meeting.user_id)
          .maybeSingle();
        const organizerName = nonEmpty(organizer?.full_name) || nonEmpty(organizer?.username);
        if (organizerName) {
          if (!nonEmpty(context.organizer_name)) context.organizer_name = organizerName;
          if (!nonEmpty(context.sender_name)) context.sender_name = organizerName;
        }
      }
    }
  }

  return normalizeTemplateDates(context);
}

export async function renderSystemSmsTemplate(input: SystemSmsRenderInput): Promise<SystemSmsRenderResult> {
  const category = nonEmpty(input.category);
  const eventType = nonEmpty(input.eventType);
  const audience = nonEmpty(input.audience) || "all";

  let { data: template } = await input.supabase
    .from("sms_templates")
    .select("id, body")
    .eq("category", category)
    .eq("event_type", eventType)
    .eq("audience", audience)
    .eq("is_active", true)
    .maybeSingle();

  if (!template && audience !== "all") {
    const fallback = await input.supabase
      .from("sms_templates")
      .select("id, body")
      .eq("category", category)
      .eq("event_type", eventType)
      .eq("audience", "all")
      .eq("is_active", true)
      .maybeSingle();
    template = fallback.data;
  }

  if (!template?.body) {
    return {
      ok: false,
      errorCode: "SMS_TEMPLATE_NOT_FOUND",
      error: `قالب فعال پیامک برای ${category}/${eventType}/${audience} یافت نشد`,
    };
  }

  const context = await enrichContext(input);
  const placeholders = [...String(template.body).matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
  const missing = [...new Set(placeholders.filter((key) => !OPTIONAL_PLACEHOLDERS.has(key) && !nonEmpty(context[key])))];

  if (missing.length > 0) {
    return {
      ok: false,
      errorCode: "SMS_TEMPLATE_CONTEXT_MISSING",
      error: `مقادیر لازم برای قالب پیامک موجود نیست: ${missing.join(", ")}`,
      missing,
    };
  }

  const externalSchedule = category === "meeting"
    && ["external", "external_observers"].includes(audience)
    && ["series_invite", "series_change", "series_cancel", "change", "informee_change"].includes(eventType)
    ? nonEmpty(context.external_schedule)
    : "";
  let text = String(template.body).replace(PLACEHOLDER_RE, (_match, key: string) =>
    key === "external_schedule" ? externalSchedule : nonEmpty(context[key]));
  if (externalSchedule) {
    text = text
      .replace("جزئیات و برنامه جلسات در تقویم سامانه اسپارک قابل مشاهده است.", "")
      .replace(/\s*[|؛]?\s*جزئیات و استثناها در تقویم اسپارک/g, "")
      .trim();
    if (["change", "informee_change"].includes(eventType) && !placeholders.includes("meeting_subject")) {
      text = `تغییر زمان جلسه «${nonEmpty(context.meeting_subject)}»\n${text}`;
    }
    if (!placeholders.includes("external_schedule")) text += `\n\n${externalSchedule}`;
  }
  return { ok: true, text, templateId: String(template.id), context };
}
