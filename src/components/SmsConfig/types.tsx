import { CircleCheck as CheckCircle, Circle as XCircle, CircleMinus as MinusCircle, Clock } from 'lucide-react';

export interface SmsProvider {
  id: string;
  title: string;
  provider_name: string;
  provider_type: string;
  is_public_gateway: boolean;
  api_url: string;
  api_key: string;
  line_number: string;
  sender_number: string;
  is_active: boolean;
  username: string;
  password: string;
  token: string;
  is_default: boolean;
  created_at: string;
}

export interface UserGroup { id: string; name: string; display_name: string | null; }

export interface SmsTemplate {
  id: string;
  category: string;
  event_type: string;
  audience: string;
  subject: string;
  body: string;
  placeholders: string[];
  is_active: boolean;
}

export interface DispatchLog {
  id: string;
  created_at: string;
  target_user_id: string | null;
  triggered_by_user_id: string | null;
  target_phone: string | null;
  category: string;
  event_type: string;
  audience: string;
  message: string | null;
  provider_id: string | null;
  provider_name: string | null;
  status: string;
  error_text: string | null;
  pack_id: string | null;
  cost: number | null;
  provider_message_id: string | null;
  delivery_status: string | null;
  delivery_code: string | null;
  delivery_checked_at: string | null;
}

export type TestStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'error';

export interface RahyabTestCard {
  id: string;
  title: string;
  desc: string;
  action: string;
  needsPhone?: boolean;
  needsMessage?: boolean;
  needsReturnId?: boolean;
}

export const CATEGORY_COLORS: Record<string, string> = {
  meeting: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  task:    'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  calendar:'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  chat:    'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
  channel: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  note:    'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  report:  'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
  system:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  auth:    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
};

export const inp = 'w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-700 dark:[&>option]:text-white';

export const PROVIDER_TYPES = [
  { key: 'rest',        label: 'sms.ir / REST API',            desc: 'سرویس‌دهندگان استاندارد مانند sms.ir' },
  { key: 'rahyab',      label: 'وب‌سرویس رهیاب رایان (SOAP)',  desc: 'ارتباط از طریق پروتکل SOAP' },
  { key: 'rahyab_rest', label: 'رهیاب رایان REST API',         desc: 'ارتباط مستقیم HTTP بدون SOAP — rahyabbulk.ir:8443' },
];

export const RAHYAB_TESTS: RahyabTestCard[] = [
  { id: 'hello_world',     title: '۱. HelloWorld',             desc: 'تست اتصال به وب‌سرویس — پاسخ «Hello World» را بررسی می‌کند.',           action: 'hello_world' },
  { id: 'get_info',        title: '۲. doGetInfo',              desc: 'تست احراز هویت و اعتبار — نام کاربری، رمز، اعتبار و تاریخ انقضا.',       action: 'get_info' },
  { id: 'send',            title: '۳. doSendSMS',              desc: 'ارسال پیامک آزمایشی — نیاز به شماره موبایل و متن پیام دارد.',              action: 'send', needsPhone: true, needsMessage: true },
  { id: 'get_delivery',    title: '۴. doGetDelivery',          desc: 'وضعیت تحویل — شناسه بازگشتی مرحله ۳ را وارد کنید.',                       action: 'get_delivery', needsReturnId: true },
  { id: 'receive_by_flag', title: '۵. doReceiveSMSByFlag',    desc: 'دریافت پیامک‌های ورودی با پرچم — پیام‌های جدید از خط اختصاصی را می‌خواند.',  action: 'receive_by_flag' },
  { id: 'get_info_xml',    title: '۶. getInfoXML',             desc: 'اطلاعات کامل XML — اعتبار، قیمت‌ها و شماره‌های اختصاصی را برمی‌گرداند.',  action: 'get_info_xml' },
];

export const RAHYAB_REST_TESTS: RahyabTestCard[] = [
  { id: 'ip',       title: '۱. Test Connection',  desc: 'بررسی اتصال — IP مشاهده‌شده توسط سرور رهیاب را نمایش می‌دهد.',                action: 'ip' },
  { id: 'get_info', title: '۲. Get Account Info', desc: 'دریافت اطلاعات کامل حساب از GetInfoXML — اعتبار، قیمت‌ها و شماره‌ها.',         action: 'get_info' },
  { id: 'send',     title: '۳. Send Test SMS',    desc: 'ارسال پیامک آزمایشی با POST — نیاز به شماره موبایل و متن پیام دارد.',           action: 'send', needsPhone: true, needsMessage: true },
  { id: 'delivery', title: '۴. Delivery Status',  desc: 'وضعیت تحویل — شناسه بازگشتی مرحله ۳ را وارد کنید.',                            action: 'delivery', needsReturnId: true },
  { id: 'receive',  title: '۵. Receive SMS',      desc: 'دریافت پیامک‌های ورودی — LastRowID را وارد کنید (پیش‌فرض: 0).',                 action: 'receive' },
];

export const DELIVERY_STATUS: Record<number, { label: string; color: string }> = {
  0: { label: 'نامشخص',        color: 'text-gray-500' },
  2: { label: 'تحویل داده شد', color: 'text-green-600' },
  5: { label: 'تحویل نشد',     color: 'text-red-600' },
  9: { label: 'بلاک شده',      color: 'text-orange-500' },
};

export const SAMPLE_VALUES: Record<string, string> = {
  formal_recipient_greeting: 'جناب آقای محمدی', series_weekdays: 'شنبه‌ها', recurrence_frequency: 'هفتگی',
  summary: 'دعوت به جلسات تکراری هیئت مدیره؛ ۴ نوبت',
  series_start_date: '۱۴۰۵/۰۸/۰۷', series_end_date: '۱۴۰۵/۰۸/۲۸',
  occurrence_count: '۴', series_pattern: 'هر هفته پنجشنبه',
  meeting_subject: 'جلسه هماهنگی پروژه',
  meeting_date: '۱۵/۳/۱۴۰۵',
  meeting_time: '۰۹:۰۰-۱۰:۰۰',
  location: 'اتاق کنفرانس A',
  location_part: ' | اتاق کنفرانس A',
  join_link: 'https://example.com/join/meeting',
  sender_name: 'علی محمدی',
  representative: 'رضا کریمی',
  full_name: 'سارا احمدی',
  task_title: 'بررسی گزارش هفتگی',
  task_assignee: 'محمد رضایی',
  task_due: '۲۰/۳/۱۴۰۵',
  event_title: 'جشن سالگرد تأسیس',
  event_date: '۲۵/۳/۱۴۰۵',
  channel_name: 'کانال اطلاع‌رسانی',
  message_preview: 'سلام، آیا گزارش آماده شده؟',
  note_title: 'یادداشت جلسه هیئت مدیره',
  username: 'ali.mohammadi',
};

export const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  sent:    { label: 'ارسال شد',    icon: <CheckCircle  className="w-4 h-4" />, cls: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
  failed:  { label: 'ناموفق',      icon: <XCircle      className="w-4 h-4" />, cls: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
  skipped: { label: 'ارسال انجام نشد', icon: <MinusCircle  className="w-4 h-4" />, cls: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
  pending: { label: 'در حال پردازش', icon: <Clock        className="w-4 h-4" />, cls: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' },
};

export const DELIVERY_STATUS_UI: Record<string, { label: string; className: string }> = {
  pending:       { label: 'در انتظار نتیجه تحویل', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  delivered:     { label: 'تحویل شده',              className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  not_delivered: { label: 'تحویل نشده',             className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  blocked:       { label: 'بلاک / ارسال نشده',      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  not_found:     { label: 'شناسه یافت نشد',         className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  unknown:       { label: 'نامشخص',                  className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  error:         { label: 'خطا در استعلام',          className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

export const CATEGORY_LABEL: Record<string, string> = {
  meeting: 'جلسه', task: 'اقدام', calendar: 'تقویم', chat: 'چت', system: 'سیستم', auth: 'احراز هویت',
};

export const EVENT_LABEL: Record<string, string> = {
  invite: 'دعوت', change: 'تغییر', cancel: 'لغو', reminder: 'یادآور',
  assign: 'تخصیص', complete: 'تکمیل', event_invite: 'دعوت رویداد', mention: 'منشن', login_otp: 'کد ورود',
};

export const SMS_ERROR_LABELS: Record<string, string> = {
  AUTH_TARGET_NOT_ELIGIBLE:
    'شماره موبایل برای ورود پیامکی قابل استفاده نیست',
  RESOLVE_UNAVAILABLE:
    'بررسی حساب کاربری در حال حاضر امکان‌پذیر نیست',
  AUTH_UNAVAILABLE:
    'بررسی وضعیت حساب کاربری با خطا مواجه شد',
  NO_ACTIVE_SMS_PROVIDER:
    'هیچ سرویس‌دهنده پیامک فعالی وجود ندارد',
  AMBIGUOUS_SMS_PROVIDER:
    'سرویس‌دهنده پیامک به‌صورت مشخص انتخاب نشده است',
  SMS_PROVIDER_CONFIG_INVALID:
    'تنظیمات سرویس‌دهنده پیامک ناقص یا نامعتبر است',
  OTP_TEMPLATE_UNAVAILABLE:
    'قالب پیامک کد ورود در دسترس نیست یا معتبر نیست',
  CHALLENGE_CREATION_FAILED:
    'ایجاد درخواست کد تأیید ناموفق بود',
  RESEND_NOT_READY:
    'ارسال مجدد کد هنوز مجاز نیست',
  SMS_PROVIDER_TIMEOUT:
    'سرویس‌دهنده پیامک در زمان مقرر پاسخ نداد',
  SMS_PROVIDER_CONNECTION_FAILED:
    'ارتباط با سرویس‌دهنده پیامک برقرار نشد',
  SMS_PROVIDER_REJECTED:
    'سرویس‌دهنده پیامک درخواست ارسال را رد کرد',
  SMS_DISPATCH_FAILED:
    'ارسال پیامک با خطا مواجه شد',
};

export function smsErrorLabel(code: string | null): string | null {
  if (!code) return null;
  return SMS_ERROR_LABELS[code] ?? 'خطای ثبت‌شده در فرآیند ارسال';
}

export function smsDeliveryLabel(log: DispatchLog): string {
  if (log.delivery_status) {
    return DELIVERY_STATUS_UI[log.delivery_status]?.label ?? log.delivery_status;
  }
  if (log.status === 'sent') return 'وضعیت تحویل توسط سرویس‌دهنده ارائه نشده';
  return 'قابل بررسی نیست';
}

export function isLoginOtpLog(log: { category: string; event_type: string }): boolean {
  return log.category === 'auth' && log.event_type === 'login_otp';
}

export function loginOtpStageInfo(log: DispatchLog): {
  requestRegistered: boolean;
  userMatched: 'matched' | 'not_matched' | 'unknown';
  otpGenerated: 'generated' | 'not_generated';
  providerSelected: 'selected' | 'not_selected';
  messagePrepared: 'prepared' | 'not_prepared';
  dispatchAttempted: 'sent' | 'failed' | 'not_attempted';
  deliveryStatus: 'delivered' | 'pending' | 'failed' | 'unknown';
} {
  const requestRegistered = true;
  const userMatched = log.target_user_id
    ? 'matched'
    : (log.error_text === 'AUTH_TARGET_NOT_ELIGIBLE' ? 'not_matched' : 'unknown');
  const otpGenerated = log.message && log.message !== 'درخواست کد یک‌بارمصرف ورود' && log.message.includes('******')
    ? 'generated'
    : 'not_generated';
  const providerSelected = log.provider_id || log.provider_name
    ? 'selected'
    : 'not_selected';
  const messagePrepared = otpGenerated === 'generated' ? 'prepared' : 'not_prepared';
  const dispatchAttempted = log.status === 'sent'
    ? 'sent'
    : (log.status === 'failed' && providerSelected === 'selected' ? 'failed' : 'not_attempted');
  const deliveryStatus = log.delivery_status === 'delivered'
    ? 'delivered'
    : (log.delivery_status === 'pending' ? 'pending'
    : (log.delivery_status === 'not_delivered' || log.delivery_status === 'blocked' ? 'failed' : 'unknown'));
  return { requestRegistered, userMatched, otpGenerated, providerSelected, messagePrepared, dispatchAttempted, deliveryStatus };
}
