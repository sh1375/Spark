/**
 * Shared catalog for SMS and notification templates.
 * All categories, event types, audiences, and placeholders are defined here
 * so that both SmsConfigPanel and NotificationsConfigPanel use the same source.
 */

// ─── Categories ──────────────────────────────────────────────────────────────

export interface TemplateCategory {
  key: string;
  label: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { key: 'meeting',  label: 'جلسات' },
  { key: 'task',     label: 'اقدامات' },
  { key: 'calendar', label: 'تقویم' },
  { key: 'chat',     label: 'چت سازمانی' },
  { key: 'channel',  label: 'کانال‌ها' },
  { key: 'note',     label: 'یادداشت‌ها' },
  { key: 'report',   label: 'گزارشات' },
  { key: 'system',   label: 'سیستم' },
  { key: 'auth',     label: 'احراز هویت' },
  { key: 'minutes',  label: 'صورت‌جلسات' },
  { key: 'decision', label: 'مصوبات' },
];

export function categoryLabel(key: string): string {
  return TEMPLATE_CATEGORIES.find(c => c.key === key)?.label ?? key;
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface TemplateEventType {
  key: string;
  label: string;
}

export const TEMPLATE_EVENT_TYPES: TemplateEventType[] = [
  { key: 'series_invite', label: 'دعوت خلاصه جلسات تکراری' },
  { key: 'series_change', label: 'تغییر جلسات تکراری' },
  { key: 'series_cancel', label: 'لغو جلسات تکراری' },
  { key: 'series_reminder', label: 'یادآوری نوبت جلسه تکراری' },

  { key: 'invite',       label: 'دعوت' },
  { key: 'change',        label: 'تغییر' },
  { key: 'cancel',        label: 'لغو' },
  { key: 'reminder',      label: 'یادآور' },
  { key: 'assign',        label: 'تخصیص' },
  { key: 'complete',      label: 'تکمیل' },
  { key: 'event_invite',  label: 'دعوت رویداد' },
  { key: 'mention',       label: 'منشن' },
  { key: 'message',       label: 'پیام' },
  { key: 'share',         label: 'اشتراک' },
  { key: 'alert',         label: 'هشدار' },
  { key: 'report_ready',  label: 'گزارش آماده شد' },
  { key: 'new_message',   label: 'پیام جدید در کانال' },
  { key: 'member_added',  label: 'افزودن عضو' },
  { key: 'meeting_created',                  label: 'ثبت جلسه' },
  { key: 'meeting_confirmed',                label: 'تأیید جلسه' },
  { key: 'meeting_declined',                 label: 'رد جلسه' },
  { key: 'meeting_representative_assigned',  label: 'انتخاب به‌عنوان جانشین' },
  { key: 'login_otp',     label: 'کد ورود' },
  // Minutes lifecycle events
  { key: 'minute_draft_created',        label: 'ایجاد پیش‌نویس صورت‌جلسه' },
  { key: 'minute_submitted',            label: 'ارسال صورت‌جلسه برای تأیید' },
  { key: 'minute_approval_requested',   label: 'درخواست تأیید از تأییدکننده' },
  { key: 'minute_approved_by_user',      label: 'تأیید توسط تأییدکننده' },
  { key: 'minute_changes_requested',   label: 'درخواست اصلاح صورت‌جلسه' },
  { key: 'minute_resubmitted',          label: 'ارسال مجدد پس از اصلاح' },
  { key: 'minute_secretary_confirmed',  label: 'تأیید دبیر جلسه' },
  { key: 'minute_chair_confirmed',     label: 'تأیید رئیس جلسه' },
  { key: 'minute_published',           label: 'انتشار صورت‌جلسه' },
  { key: 'minute_revision_invalidated', label: 'باطل‌شدن نسخه قبلی' },
  { key: 'minute_attachment_added',    label: 'افزودن پیوست صورت‌جلسه' },
  // Meeting invitation delegation events
  { key: 'meeting_invitation_delegate_assigned',   label: 'انتخاب به‌عنوان جانشین دعوت جلسه' },
  { key: 'meeting_invitation_delegate_selected',  label: 'انتخاب جانشین دعوت جلسه' },
  { key: 'meeting_invitation_delegation_confirmed', label: 'تأیید ثبت جانشین دعوت جلسه' },
  { key: 'minute_approval_delegate_assigned', label: 'انتخاب به‌عنوان جانشین تأییدکننده' },
  { key: 'minute_approver_delegate_selected',  label: 'انتخاب جانشین تأییدکننده' },
  // Decision lifecycle events
  { key: 'decision_assigned',          label: 'تخصیص مصوبه به مسئول' },
  { key: 'decision_status_changed',    label: 'تغییر وضعیت مصوبه' },
  { key: 'decision_progress_updated',  label: 'به‌روزرسانی پیشرفت مصوبه' },
  { key: 'decision_followup',          label: 'ثبت پیگیری مصوبه' },
  { key: 'decision_followup_due',      label: 'موعد پیگیری مصوبه' },
  { key: 'decision_obstacle',          label: 'ثبت مانع مصوبه' },
  { key: 'decision_obstacle_resolved', label: 'رفع مانع مصوبه' },
  { key: 'decision_completed',         label: 'تکمیل مصوبه' },
  { key: 'decision_reopened',          label: 'بازگشایی مصوبه' },
  { key: 'decision_due_soon',          label: 'نزدیک‌شدن سررسید مصوبه' },
  { key: 'decision_overdue',           label: 'عبور از مهلت مصوبه' },
  { key: 'custom',        label: 'سفارشی' },
];

export function eventTypeLabel(key: string): string {
  return TEMPLATE_EVENT_TYPES.find(e => e.key === key)?.label ?? key;
}

// ─── Audiences ────────────────────────────────────────────────────────────────

export interface TemplateAudience {
  key: string;
  label: string;
}

export const TEMPLATE_AUDIENCES: TemplateAudience[] = [
  { key: 'all',           label: 'همه' },
  { key: 'participants',  label: 'شرکت‌کنندگان' },
  { key: 'observers',     label: 'مطلعین' },
  { key: 'external',      label: 'خارج سازمان' },
  { key: 'external_observers', label: 'مطلعین خارج سازمان' },
  // Minutes audiences
  { key: 'creator',       label: 'ایجادکننده جلسه / صورت‌جلسه' },
  { key: 'secretary',      label: 'دبیر جلسه' },
  { key: 'chair',          label: 'رئیس جلسه' },
  { key: 'approvers',      label: 'تأییدکنندگان' },
  // Decision audiences
  { key: 'decision_owner', label: 'مسئول مصوبه' },
  { key: 'managers',        label: 'مدیران' },
  // Meeting delegation audiences
  { key: 'representatives',  label: 'جانشین‌ها (دعوت جلسه)' },
  { key: 'delegators',       label: 'واگذارکنندگان دعوت' },
  { key: 'organizer',       label: 'سازنده جلسه' },
];

export function audienceLabel(key: string): string {
  return TEMPLATE_AUDIENCES.find(a => a.key === key)?.label ?? key;
}

// ─── Placeholders ──────────────────────────────────────────────────────────────

export interface TemplatePlaceholder {
  key: string;
  label: string;
  example: string;
}

export const TEMPLATE_PLACEHOLDERS: TemplatePlaceholder[] = [
  { key: 'formal_recipient_greeting', label: 'خطاب رسمی مخاطب طبق پروفایل', example: 'جناب آقای محمدی' },
  { key: 'series_weekdays', label: 'روزهای واقعی برگزاری سری', example: 'شنبه‌ها' },
  { key: 'recurrence_frequency', label: 'دوره تکرار', example: 'هفتگی' },
  { key: 'series_start_date', label: 'تاریخ اولین نوبت مرتبط', example: '۱۴۰۵/۰۸/۰۷' },
  { key: 'series_end_date', label: 'تاریخ آخرین نوبت مرتبط', example: '۱۴۰۵/۰۸/۲۸' },
  { key: 'occurrence_count', label: 'تعداد نوبت‌های مرتبط', example: '۴' },
  { key: 'series_pattern', label: 'الگوی تکرار جلسات', example: 'هر هفته پنجشنبه' },
  { key: 'summary', label: 'خلاصه برنامه یا تغییر سری جلسات', example: 'شورای معاونت؛ هر هفته سه‌شنبه، از … تا …' },
  { key: 'full_name',           label: 'نام کامل گیرنده',      example: 'علی احمدی' },
  { key: 'recipient_greeting',  label: 'احوال‌پرسی گیرنده',     example: 'علی احمدی گرامی' },
  { key: 'meeting_subject',  label: 'موضوع جلسه',            example: 'جلسه هیئت مدیره' },
  { key: 'meeting_date',     label: 'تاریخ جلسه',            example: '۱۴۰۳/۰۳/۱۵' },
  { key: 'start_time',       label: 'ساعت شروع',              example: '۰۹:۰۰' },
  { key: 'end_time',         label: 'ساعت پایان',             example: '۱۰:۰۰' },
  { key: 'meeting_time',     label: 'بازه ساعت جلسه',         example: '۰۹:۰۰-۱۰:۰۰' },
  { key: 'location',         label: 'محل برگزاری',            example: 'سالن اجتماعات' },
  { key: 'location_part',    label: 'بخش محل (با خط فاصله)',  example: ' | سالن اجتماعات' },
  { key: 'join_link',        label: 'لینک ورود',              example: 'https://...' },
  { key: 'organizer_name',   label: 'نام تنظیم‌کننده جلسه',   example: 'سارا رضایی' },
  { key: 'representative',           label: 'نماینده',                example: 'رضا کریمی' },
  { key: 'represented_person_name',  label: 'نام فرد جانشین‌شده',      example: 'محمد رضایی' },
  { key: 'participant_name',         label: 'نام شرکت‌کننده',          example: 'علی احمدی' },
  { key: 'agenda',                   label: 'دستور جلسه',             example: '۱. بررسی گزارش...' },
  { key: 'minutes',          label: 'دقایق مانده',            example: '۳۰' },
  { key: 'task_title',       label: 'عنوان اقدام',            example: 'بررسی گزارش مالی' },
  { key: 'priority',         label: 'اولویت',                 example: 'بالا' },
  { key: 'due_date',         label: 'مهلت',                   example: '۱۴۰۳/۰۴/۰۱' },
  { key: 'event_title',      label: 'عنوان رویداد',           example: 'جشن سالگرد' },
  { key: 'event_date',       label: 'تاریخ رویداد',           example: '۱۴۰۳/۰۵/۱۰' },
  { key: 'sender_name',      label: 'نام فرستنده',            example: 'سارا رضایی' },
  { key: 'reminder_time', label: 'زمان یادآوری', example: '۱۴۰۵/۰۸/۱۶ ۰۹:۰۰' },
  { key: 'note_content', label: 'متن یادداشت', example: 'متن یادآوری شما' },
  { key: 'note_title',       label: 'عنوان یادداشت',          example: 'یادداشت جلسه' },
  { key: 'message_preview',  label: 'پیش‌نمایش پیام',         example: 'سلام، آیا گزارش آماده شده؟' },
  { key: 'alert_message',   label: 'متن هشدار',              example: 'خرابی موقت در سرویس ایمیل' },
  { key: 'org_name',         label: 'نام سازمان',            example: 'شرکت نمونه' },
  { key: 'report_title',     label: 'عنوان گزارش',            example: 'گزارش عملکرد ماهانه' },
  { key: 'report_link',     label: 'لینک گزارش',             example: 'https://...' },
  { key: 'channel_name',     label: 'نام کانال',              example: 'کانال اطلاع‌رسانی' },
  { key: 'channel_type',     label: 'نوع کانال',              example: 'کانال' },
  { key: 'otp',              label: 'کد یک‌بارمصرف',           example: '123456' },
  // Minutes placeholders
  { key: 'minute_title',         label: 'عنوان صورت‌جلسه',          example: 'صورت‌جلسه هیئت مدیره' },
  { key: 'minute_revision',      label: 'شماره نسخه صورت‌جلسه',     example: '۳' },
  { key: 'minute_status',        label: 'وضعیت صورت‌جلسه',          example: 'در انتظار تأیید' },
  { key: 'approval_mode',        label: 'مدل تأیید',                example: 'تأیید سیستمی' },
  { key: 'approver_name',        label: 'نام تأییدکننده',           example: 'علی احمدی' },
  { key: 'original_approver_name', label: 'نام تأییدکننده اصلی',      example: 'علی احمدی' },
  { key: 'delegate_name',         label: 'نام جانشین',                example: 'سارا رضایی' },
  { key: 'representative_name',   label: 'نام جانشین دعوت جلسه',      example: 'سارا رضایی' },
  { key: 'meeting_link',          label: 'لینک جلسه',                 example: '#calendar?meeting=...' },
  { key: 'actor_name',           label: 'نام انجام‌دهنده عمل',       example: 'سارا رضایی' },
  { key: 'change_reason',        label: 'دلیل اصلاح',               example: 'نیاز به اصلاح بخش مصوبات' },
  { key: 'minute_link',          label: 'لینک صورت‌جلسه',           example: 'https://...' },
  // Decision placeholders
  { key: 'decision_title',           label: 'عنوان مصوبه',           example: 'تهیه گزارش مالی' },
  { key: 'decision_status',          label: 'وضعیت مصوبه',           example: 'در حال انجام' },
  { key: 'previous_decision_status', label: 'وضعیت قبلی مصوبه',     example: 'شروع‌نشده' },
  { key: 'decision_progress',        label: 'درصد پیشرفت مصوبه',     example: '۶۰' },
  { key: 'decision_owner_name',      label: 'نام مسئول مصوبه',       example: 'محمد کریمی' },
  { key: 'responsible_unit',         label: 'واحد مسئول',            example: 'واحد مالی' },
  { key: 'decision_due_date',        label: 'مهلت مصوبه',            example: '۱۴۰۳/۰۴/۰۱' },
  { key: 'followup_date',            label: 'تاریخ پیگیری',          example: '۱۴۰۳/۰۳/۲۰' },
  { key: 'followup_method',          label: 'روش پیگیری',            example: 'تلفن' },
  { key: 'followup_result',          label: 'نتیجه پیگیری',          example: 'تماس گرفته شد و در حال انجام' },
  { key: 'obstacle_title',           label: 'عنوان مانع',             example: 'کمبود بودجه' },
  { key: 'obstacle_severity',        label: 'شدت مانع',              example: 'زیاد' },
  { key: 'decision_link',            label: 'لینک مصوبه',            example: 'https://...' },
];

export const PLACEHOLDER_KEYS: string[] = TEMPLATE_PLACEHOLDERS.map(p => p.key);

// ─── Placeholder extraction & validation ──────────────────────────────────────

/**
 * Extracts all `{{placeholder}}` tokens from a template string.
 * Returns a de-duplicated array of placeholder names (without braces).
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
  return [...new Set(Array.from(matches, m => m[1]))];
}

/**
 * Returns placeholders found in the template that are not in the known list.
 */
export function findUnknownPlaceholders(template: string): string[] {
  const found = extractPlaceholders(template);
  return found.filter(k => !PLACEHOLDER_KEYS.includes(k));
}

// ─── Safe template rendering ───────────────────────────────────────────────────

export interface RenderTemplateResult {
  text: string;
  missingPlaceholders: string[];
  unresolvedPlaceholders: string[];
}

/**
 * Replaces `{{placeholder}}` tokens in a template string with values from `vars`.
 *
 * - Missing/empty values are replaced with '' and collected in `missingPlaceholders`.
 * - Any `{{...}}` tokens that survive the replace (e.g. malformed) are collected
 *   in `unresolvedPlaceholders`.
 * - The rendered text never contains `undefined` or `null`.
 *
 * In development, missing required placeholders are logged via console.warn.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): RenderTemplateResult {
  const missingPlaceholders: string[] = [];

  const text = template.replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (_match, key: string) => {
      const value = vars[key];
      if (value === undefined || value === null || String(value).trim() === '') {
        missingPlaceholders.push(key);
        return '';
      }
      return String(value);
    },
  );

  const unresolvedPlaceholders = Array.from(
    text.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g),
    (m: RegExpMatchArray) => m[1],
  );

  if (import.meta.env?.DEV && missingPlaceholders.length > 0) {
    console.warn('[notification-template] missing placeholder(s):',
      missingPlaceholders.join(', '));
  }

  return {
    text,
    missingPlaceholders: [...new Set(missingPlaceholders)],
    unresolvedPlaceholders: [...new Set(unresolvedPlaceholders)],
  };
}

/**
 * Backward-compatible wrapper: returns `{ rendered, leftover }`.
 * `leftover` combines both missing and unresolved placeholders.
 */
export function renderTemplateLegacy(
  template: string,
  vars: Record<string, string>,
): { rendered: string; leftover: string[] } {
  const result = renderTemplate(template, vars);
  return {
    rendered: result.text,
    leftover: [...result.missingPlaceholders, ...result.unresolvedPlaceholders],
  };
}

// ─── Meeting recipient role & template key ────────────────────────────────────

export type MeetingRecipientRole = 'creator' | 'organizer' | 'participant' | 'representative' | 'observer';

export type MeetingAction = 'created' | 'invite' | 'change' | 'cancel' | 'reminder' | 'confirmed' | 'declined';

/**
 * Determines which template event_type to use for a meeting notification
 * based on the recipient's role relative to the meeting and the action.
 *
 * - Creator/organizer of a newly created meeting gets 'meeting_created'
 *   (not 'invite' — they created it, they weren't invited).
 * - Representative gets 'meeting_representative_assigned'.
 * - Everyone else gets the action itself ('invite', 'change', 'cancel', 'reminder').
 */
export function getMeetingTemplateKey(
  role: MeetingRecipientRole,
  action: MeetingAction,
): string {
  if (action === 'created' && (role === 'creator' || role === 'organizer')) {
    return 'meeting_created';
  }
  if (role === 'representative') {
    return 'meeting_representative_assigned';
  }
  if (action === 'confirmed') {
    return 'meeting_confirmed';
  }
  if (action === 'declined') {
    return 'meeting_declined';
  }
  return action;
}

// ─── Meeting payload ───────────────────────────────────────────────────────────

export interface MeetingTemplatePayload {
  full_name: string;
  meeting_subject: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  meeting_time: string;
  location?: string;
  location_part?: string;
  join_link?: string;
  organizer_name?: string;
  representative?: string;
  agenda?: string;
}

/**
 * Builds a standardised meeting payload from raw meeting data.
 * All optional fields that are empty produce empty strings (not undefined),
 * so the caller can safely spread the result into template vars.
 */
export function buildMeetingPayload(params: {
  recipientName: string;
  subject: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  location?: string;
  joinLink?: string;
  organizerName?: string;
  representative?: string;
  agenda?: string;
}): Record<string, string> {
  const meetingTime = params.startTime && params.endTime
    ? `${params.startTime}-${params.endTime}`
    : params.startTime || '';
  const location = params.location || '';
  const fullName = params.recipientName || '';
  const greeting = fullName ? `${fullName} گرامی` : 'همکار گرامی';
  return {
    full_name: fullName,
    recipient_greeting: greeting,
    meeting_subject: params.subject,
    meeting_date: params.dateStr,
    start_time: params.startTime,
    end_time: params.endTime,
    meeting_time: meetingTime,
    location,
    location_part: location ? ` | ${location}` : '',
    join_link: params.joinLink || '',
    organizer_name: params.organizerName || '',
    representative: params.representative || '',
    agenda: params.agenda || '',
  };
}

/**
 * Resolves a recipient's display name from multiple possible fields.
 * Returns empty string if none are available.
 */
export function resolveRecipientFullName(recipient: {
  full_name?: string | null;
  display_name?: string | null;
  name?: string | null;
}): string {
  return (
    recipient.full_name?.trim() ||
    recipient.display_name?.trim() ||
    recipient.name?.trim() ||
    ''
  );
}

/**
 * Required placeholders for meeting invite templates.
 * `location` is optional — it may appear in the template but is not required.
 */
export const REQUIRED_MEETING_INVITE_PLACEHOLDERS = [
  'full_name',
  'meeting_subject',
  'meeting_date',
  'start_time',
  'end_time',
  'organizer_name',
];

// ─── Event Definition Catalog ─────────────────────────────────────────────────

export interface TemplateEventDefinition {
  key: string;
  category: string;
  label: string;
  supportedChannels: Array<'notification' | 'sms'>;
  audiences: string[];
  requiredPlaceholders: string[];
  optionalPlaceholders: string[];
}

export const TEMPLATE_EVENTS: TemplateEventDefinition[] = [
  { key: 'series_invite', category: 'meeting', label: 'دعوت خلاصه جلسات تکراری', supportedChannels: ['sms', 'notification'], audiences: ['all','creator','participants','observers','external','external_observers'], requiredPlaceholders: [], optionalPlaceholders: ['formal_recipient_greeting','series_weekdays','recurrence_frequency','summary','series_start_date','series_end_date','occurrence_count','series_pattern','meeting_time','location_part','meeting_subject','meeting_date','start_time','end_time','location','recipient_greeting','full_name'] },
  { key: 'series_change', category: 'meeting', label: 'تغییر جلسات تکراری', supportedChannels: ['sms', 'notification'], audiences: ['all','creator','participants','observers','external','external_observers'], requiredPlaceholders: [], optionalPlaceholders: ['formal_recipient_greeting','series_weekdays','recurrence_frequency','summary','series_start_date','series_end_date','occurrence_count','series_pattern','meeting_time','location_part','meeting_subject','meeting_date','start_time','end_time','location','recipient_greeting','full_name'] },
  { key: 'series_cancel', category: 'meeting', label: 'لغو جلسات تکراری', supportedChannels: ['sms', 'notification'], audiences: ['all','creator','participants','observers','external','external_observers'], requiredPlaceholders: [], optionalPlaceholders: ['formal_recipient_greeting','series_weekdays','recurrence_frequency','summary','series_start_date','series_end_date','occurrence_count','series_pattern','meeting_time','location_part','meeting_subject','meeting_date','start_time','end_time','location','recipient_greeting','full_name'] },
  { key: 'series_reminder', category: 'meeting', label: 'یادآوری نوبت جلسه تکراری', supportedChannels: ['sms', 'notification'], audiences: ['all','creator','participants','observers','external','external_observers'], requiredPlaceholders: [], optionalPlaceholders: ['formal_recipient_greeting','series_weekdays','recurrence_frequency','summary','series_start_date','series_end_date','occurrence_count','series_pattern','meeting_time','location_part','meeting_subject','meeting_date','start_time','end_time','location','recipient_greeting','full_name'] },

  // Meeting events
  {
    key: 'meeting_created',
    category: 'meeting',
    label: 'ثبت جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time'],
    optionalPlaceholders: ['location', 'organizer_name', 'join_link', 'recipient_greeting', 'full_name', 'location_part'],
  },
  {
    key: 'invite',
    category: 'meeting',
    label: 'دعوت به جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'participants', 'observers', 'external'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time'],
    optionalPlaceholders: ['location', 'organizer_name', 'join_link', 'recipient_greeting', 'full_name', 'location_part', 'meeting_time'],
  },
  {
    key: 'meeting_confirmed',
    category: 'meeting',
    label: 'تأیید جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'organizer'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time', 'participant_name'],
    optionalPlaceholders: ['location', 'organizer_name', 'join_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'meeting_declined',
    category: 'meeting',
    label: 'رد جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'organizer'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time', 'participant_name'],
    optionalPlaceholders: ['location', 'organizer_name', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'change',
    category: 'meeting',
    label: 'تغییر جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'participants', 'observers', 'external'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time'],
    optionalPlaceholders: ['location', 'organizer_name', 'join_link', 'recipient_greeting', 'full_name', 'location_part', 'meeting_time'],
  },
  {
    key: 'cancel',
    category: 'meeting',
    label: 'لغو جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'participants', 'observers'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date'],
    optionalPlaceholders: ['start_time', 'end_time', 'location', 'organizer_name', 'recipient_greeting', 'full_name', 'location_part', 'meeting_time'],
  },
  {
    key: 'reminder',
    category: 'meeting',
    label: 'یادآوری جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'participants', 'observers'],
    requiredPlaceholders: ['meeting_subject', 'minutes'],
    optionalPlaceholders: ['meeting_date', 'start_time', 'end_time', 'location', 'recipient_greeting', 'full_name', 'location_part'],
  },
  {
    key: 'meeting_representative_assigned',
    category: 'meeting',
    label: 'انتخاب به‌عنوان جانشین',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'representative'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time', 'represented_person_name'],
    optionalPlaceholders: ['location', 'organizer_name', 'join_link', 'recipient_greeting', 'full_name', 'location_part', 'meeting_time'],
  },
  // Task events
  {
    key: 'assign',
    category: 'task',
    label: 'تخصیص اقدام',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['task_title'],
    optionalPlaceholders: ['priority', 'due_date', 'sender_name', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'complete',
    category: 'task',
    label: 'تکمیل اقدام',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['task_title'],
    optionalPlaceholders: ['sender_name'],
  },
  {
    key: 'reminder',
    category: 'task',
    label: 'یادآوری اقدام',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['task_title'],
    optionalPlaceholders: ['due_date'],
  },
  // Chat events
  {
    key: 'message',
    category: 'chat',
    label: 'پیام چت',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'message_preview'],
    optionalPlaceholders: ['recipient_greeting', 'full_name'],
  },
  {
    key: 'mention',
    category: 'chat',
    label: 'منشن در چت',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'message_preview'],
    optionalPlaceholders: ['recipient_greeting', 'full_name'],
  },
  // Channel events
  {
    key: 'new_message',
    category: 'channel',
    label: 'پیام جدید در کانال',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'message_preview'],
    optionalPlaceholders: ['channel_name', 'channel_type'],
  },
  {
    key: 'mention',
    category: 'channel',
    label: 'منشن در کانال',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'message_preview'],
    optionalPlaceholders: ['channel_name', 'channel_type'],
  },
  {
    key: 'member_added',
    category: 'channel',
    label: 'افزودن عضو',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['channel_name', 'channel_type'],
    optionalPlaceholders: [],
  },
  // Note events
  {
    key: 'reminder', category: 'note', label: 'یادآوری یادداشت',
    supportedChannels: ['notification', 'sms'], audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'note_content', 'reminder_time'], optionalPlaceholders: ['note_title'],
  },
  {
    key: 'share',
    category: 'note',
    label: 'اشتراک یادداشت',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['sender_name', 'note_content'],
    optionalPlaceholders: ['note_title', 'recipient_greeting', 'full_name'],
  },
  // Report events
  {
    key: 'report_ready',
    category: 'report',
    label: 'گزارش آماده شد',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['report_title'],
    optionalPlaceholders: ['report_link', 'recipient_greeting', 'full_name'],
  },
  // System events
  {
    key: 'alert',
    category: 'system',
    label: 'هشدار سیستم',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['alert_message'],
    optionalPlaceholders: [],
  },
  // Auth events
  {
    key: 'login_otp',
    category: 'auth',
    label: 'کد ورود موبایلی',
    supportedChannels: ['sms'],
    audiences: ['all'],
    requiredPlaceholders: ['otp'],
    optionalPlaceholders: [],
  },
  // Minutes lifecycle events
  {
    key: 'minute_draft_created',
    category: 'minutes',
    label: 'ایجاد پیش‌نویس صورت‌جلسه',
    supportedChannels: ['notification'],
    audiences: ['creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'minute_status', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_submitted',
    category: 'minutes',
    label: 'ارسال صورت‌جلسه برای تأیید',
    supportedChannels: ['notification', 'sms'],
    audiences: ['approvers', 'creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'minute_status', 'approval_mode', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_approval_requested',
    category: 'minutes',
    label: 'درخواست تأیید از تأییدکننده',
    supportedChannels: ['notification', 'sms'],
    audiences: ['approvers', 'all'],
    requiredPlaceholders: ['minute_title', 'approver_name'],
    optionalPlaceholders: ['minute_revision', 'approval_mode', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_approved_by_user',
    category: 'minutes',
    label: 'تأیید توسط تأییدکننده',
    supportedChannels: ['notification', 'sms'],
    audiences: ['creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title', 'approver_name'],
    optionalPlaceholders: ['minute_revision', 'minute_status', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_changes_requested',
    category: 'minutes',
    label: 'درخواست اصلاح صورت‌جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title', 'change_reason'],
    optionalPlaceholders: ['minute_revision', 'approver_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_resubmitted',
    category: 'minutes',
    label: 'ارسال مجدد پس از اصلاح',
    supportedChannels: ['notification', 'sms'],
    audiences: ['approvers', 'creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'minute_status', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_secretary_confirmed',
    category: 'minutes',
    label: 'تأیید دبیر جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['chair', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_chair_confirmed',
    category: 'minutes',
    label: 'تأیید رئیس جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['secretary', 'creator', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_published',
    category: 'minutes',
    label: 'انتشار صورت‌جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['creator', 'secretary', 'chair', 'participants', 'decision_owner', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_revision_invalidated',
    category: 'minutes',
    label: 'باطل‌شدن نسخه قبلی',
    supportedChannels: ['notification'],
    audiences: ['creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['minute_revision', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_attachment_added',
    category: 'minutes',
    label: 'افزودن پیوست صورت‌جلسه',
    supportedChannels: ['notification'],
    audiences: ['creator', 'secretary', 'all'],
    requiredPlaceholders: ['minute_title'],
    optionalPlaceholders: ['actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  // Meeting invitation delegation events
  {
    key: 'meeting_invitation_delegate_assigned',
    category: 'meeting',
    label: 'انتخاب به‌عنوان جانشین دعوت جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'representatives'],
    requiredPlaceholders: ['meeting_subject', 'meeting_date', 'start_time', 'end_time', 'represented_person_name'],
    optionalPlaceholders: ['location', 'organizer_name', 'recipient_greeting', 'full_name', 'meeting_link', 'meeting_time'],
  },
  {
    key: 'meeting_invitation_delegate_selected',
    category: 'meeting',
    label: 'انتخاب جانشین دعوت جلسه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all', 'participants', 'observers', 'organizer'],
    requiredPlaceholders: ['meeting_subject', 'represented_person_name', 'representative_name'],
    optionalPlaceholders: ['meeting_date', 'start_time', 'end_time', 'location', 'organizer_name', 'recipient_greeting', 'full_name', 'meeting_link'],
  },
  {
    key: 'meeting_invitation_delegation_confirmed',
    category: 'meeting',
    label: 'تأیید ثبت جانشین دعوت جلسه',
    supportedChannels: ['notification'],
    audiences: ['all', 'delegators'],
    requiredPlaceholders: ['meeting_subject', 'representative_name'],
    optionalPlaceholders: ['meeting_date', 'start_time', 'end_time', 'location', 'organizer_name', 'recipient_greeting', 'full_name', 'meeting_link'],
  },
  {
    key: 'minute_approval_delegate_assigned',
    category: 'minutes',
    label: 'انتخاب به‌عنوان جانشین تأییدکننده',
    supportedChannels: ['notification', 'sms'],
    audiences: ['approvers', 'all'],
    requiredPlaceholders: ['minute_title', 'original_approver_name'],
    optionalPlaceholders: ['minute_revision', 'delegate_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'minute_approver_delegate_selected',
    category: 'minutes',
    label: 'انتخاب جانشین تأییدکننده',
    supportedChannels: ['notification'],
    audiences: ['creator', 'secretary', 'chair', 'approvers', 'all'],
    requiredPlaceholders: ['minute_title', 'original_approver_name', 'delegate_name'],
    optionalPlaceholders: ['minute_revision', 'actor_name', 'minute_link', 'recipient_greeting', 'full_name'],
  },
  // Decision lifecycle events
  {
    key: 'decision_assigned',
    category: 'decision',
    label: 'تخصیص مصوبه به مسئول',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'all'],
    requiredPlaceholders: ['decision_title', 'decision_owner_name'],
    optionalPlaceholders: ['decision_due_date', 'responsible_unit', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_status_changed',
    category: 'decision',
    label: 'تغییر وضعیت مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title', 'decision_status'],
    optionalPlaceholders: ['previous_decision_status', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_progress_updated',
    category: 'decision',
    label: 'به‌روزرسانی پیشرفت مصوبه',
    supportedChannels: ['notification'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['decision_progress', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_followup',
    category: 'decision',
    label: 'ثبت پیگیری مصوبه',
    supportedChannels: ['notification'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['followup_date', 'followup_method', 'followup_result', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_followup_due',
    category: 'decision',
    label: 'موعد پیگیری مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['followup_date', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_obstacle',
    category: 'decision',
    label: 'ثبت مانع مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title', 'obstacle_title'],
    optionalPlaceholders: ['obstacle_severity', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_obstacle_resolved',
    category: 'decision',
    label: 'رفع مانع مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['obstacle_title', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_completed',
    category: 'decision',
    label: 'تکمیل مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['decision_progress', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_reopened',
    category: 'decision',
    label: 'بازگشایی مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'creator', 'secretary', 'chair', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['decision_status', 'actor_name', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_due_soon',
    category: 'decision',
    label: 'نزدیک‌شدن سررسید مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['decision_due_date', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  {
    key: 'decision_overdue',
    category: 'decision',
    label: 'عبور از مهلت مصوبه',
    supportedChannels: ['notification', 'sms'],
    audiences: ['decision_owner', 'all'],
    requiredPlaceholders: ['decision_title'],
    optionalPlaceholders: ['decision_due_date', 'decision_link', 'recipient_greeting', 'full_name'],
  },
  // Calendar events
  {
    key: 'event_invite',
    category: 'calendar',
    label: 'دعوت رویداد',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['event_title', 'event_date'],
    optionalPlaceholders: ['recipient_greeting', 'full_name'],
  },
  {
    key: 'reminder',
    category: 'calendar',
    label: 'یادآوری رویداد',
    supportedChannels: ['notification', 'sms'],
    audiences: ['all'],
    requiredPlaceholders: ['event_title', 'event_date'],
    optionalPlaceholders: ['recipient_greeting', 'full_name'],
  },
];

// ─── Template Validation ─────────────────────────────────────────────────────

export interface TemplateValidationResult {
  valid: boolean;
  missingRequiredPlaceholders: string[];
  unknownPlaceholders: string[];
  unusedPayloadPlaceholders: string[];
}

export function validateTemplateForEvent(
  body: string,
  event: TemplateEventDefinition,
  knownPlaceholders: string[],
): TemplateValidationResult {
  const used = extractPlaceholders(body);

  const missingRequiredPlaceholders = event.requiredPlaceholders.filter(
    key => !used.includes(key),
  );

  const unknownPlaceholders = used.filter(
    key => !knownPlaceholders.includes(key),
  );

  const allowed = [
    ...event.requiredPlaceholders,
    ...event.optionalPlaceholders,
  ];

  const unusedPayloadPlaceholders = allowed.filter(
    key => !used.includes(key),
  );

  return {
    valid:
      missingRequiredPlaceholders.length === 0 &&
      unknownPlaceholders.length === 0,
    missingRequiredPlaceholders,
    unknownPlaceholders,
    unusedPayloadPlaceholders,
  };
}

// ─── Payload Validation ───────────────────────────────────────────────────────

export interface PayloadValidationResult {
  valid: boolean;
  missingRequiredValues: string[];
  emptyRequiredValues: string[];
}

export function validatePayloadForEvent(
  eventType: string,
  payload: Record<string, string>,
): PayloadValidationResult {
  const eventDef = TEMPLATE_EVENTS.find(e => e.key === eventType);
  if (!eventDef) {
    return { valid: true, missingRequiredValues: [], emptyRequiredValues: [] };
  }

  const missingRequiredValues = eventDef.requiredPlaceholders.filter(
    key => !(key in payload),
  );

  const emptyRequiredValues = eventDef.requiredPlaceholders.filter(
    key => key in payload && (!payload[key] || String(payload[key]).trim() === ''),
  );

  return {
    valid: missingRequiredValues.length === 0 && emptyRequiredValues.length === 0,
    missingRequiredValues,
    emptyRequiredValues,
  };
}
