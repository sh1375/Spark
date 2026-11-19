import { Group as GroupIcon, FileText, ChartBar as BarChart2, Clock3 } from 'lucide-react';

export const NOTIFICATION_TYPES = [
  { key: 'meeting_invite',    label: 'دعوت به جلسه',           category: 'جلسات' },
  { key: 'meeting_change',    label: 'تغییر جلسه',             category: 'جلسات' },
  { key: 'meeting_cancel',    label: 'لغو جلسه',               category: 'جلسات' },
  { key: 'meeting_reminder',  label: 'یادآور جلسه',            category: 'جلسات' },
  { key: 'assign',             label: 'تخصیص اقدام',            category: 'اقدامات' },
  { key: 'reminder',           label: 'یادآور اقدام',           category: 'اقدامات' },
  { key: 'complete',           label: 'تکمیل اقدام',            category: 'اقدامات' },
  { key: 'note_added',         label: 'ثبت گزارش اقدام',         category: 'اقدامات' },
  { key: 'referred',           label: 'ارجاع اقدام',             category: 'اقدامات' },
  { key: 'status_in_progress', label: 'شروع اقدام',              category: 'اقدامات' },
  { key: 'status_pending',     label: 'بازگشت اقدام به انتظار', category: 'اقدامات' },
  { key: 'chat_message',      label: 'پیام چت',                category: 'چت' },
  { key: 'chat_mention',      label: 'منشن در چت',             category: 'چت' },
  { key: 'channel_message',   label: 'پیام کانال',             category: 'کانال‌ها' },
  { key: 'channel_mention',   label: 'منشن در کانال',          category: 'کانال‌ها' },
  { key: 'channel_invite',    label: 'دعوت به کانال',          category: 'کانال‌ها' },
  { key: 'calendar_event',    label: 'رویداد تقویم',           category: 'تقویم' },
  { key: 'calendar_reminder', label: 'یادآور تقویم',           category: 'تقویم' },
  { key: 'note_share',        label: 'اشتراک یادداشت',         category: 'یادداشت‌ها' },
  { key: 'report_ready',      label: 'گزارش آماده شد',         category: 'گزارشات' },
  { key: 'system_alert',      label: 'هشدار سیستم',            category: 'سیستم' },
  { key: 'minute_submitted',           label: 'ارسال صورت‌جلسه برای تأیید',  category: 'صورت‌جلسات' },
  { key: 'minute_approval_requested',  label: 'درخواست تأیید',                category: 'صورت‌جلسات' },
  { key: 'minute_approved_by_user',     label: 'تأیید توسط تأییدکننده',         category: 'صورت‌جلسات' },
  { key: 'minute_changes_requested',   label: 'درخواست اصلاح',                category: 'صورت‌جلسات' },
  { key: 'minute_resubmitted',          label: 'ارسال مجدد',                   category: 'صورت‌جلسات' },
  { key: 'minute_secretary_confirmed',  label: 'تأیید دبیر',                   category: 'صورت‌جلسات' },
  { key: 'minute_chair_confirmed',     label: 'تأیید رئیس جلسه',               category: 'صورت‌جلسات' },
  { key: 'minute_published',           label: 'انتشار صورت‌جلسه',              category: 'صورت‌جلسات' },
  { key: 'minute_revision_invalidated', label: 'باطل‌شدن نسخه',                category: 'صورت‌جلسات' },
  { key: 'decision_assigned',           label: 'تخصیص مصوبه',           category: 'مصوبات' },
  { key: 'decision_status_changed',     label: 'تغییر وضعیت',            category: 'مصوبات' },
  { key: 'decision_progress_updated',   label: 'به‌روزرسانی پیشرفت',     category: 'مصوبات' },
  { key: 'decision_followup',           label: 'ثبت پیگیری',             category: 'مصوبات' },
  { key: 'decision_followup_due',       label: 'موعد پیگیری',             category: 'مصوبات' },
  { key: 'decision_obstacle',           label: 'ثبت مانع',               category: 'مصوبات' },
  { key: 'decision_obstacle_resolved',  label: 'رفع مانع',               category: 'مصوبات' },
  { key: 'decision_completed',          label: 'تکمیل مصوبه',            category: 'مصوبات' },
  { key: 'decision_reopened',           label: 'بازگشایی',               category: 'مصوبات' },
  { key: 'decision_due_soon',           label: 'نزدیک‌شدن سررسید',       category: 'مصوبات' },
  { key: 'decision_overdue',            label: 'عبور از مهلت',            category: 'مصوبات' },
];

export const N_CATEGORIES = Array.from(new Set(NOTIFICATION_TYPES.map(n => n.category)));

export const COLORS = [
  { key: 'blue', label: 'آبی', cls: 'bg-blue-500' },
  { key: 'green', label: 'سبز', cls: 'bg-green-500' },
  { key: 'amber', label: 'نارنجی', cls: 'bg-amber-500' },
  { key: 'red', label: 'قرمز', cls: 'bg-red-500' },
  { key: 'teal', label: 'فیروزه‌ای', cls: 'bg-teal-500' },
  { key: 'gray', label: 'خاکستری', cls: 'bg-gray-500' },
];

export const COLOR_BADGE: Record<string, string> = {
  blue:  'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  red:   'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  teal:  'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
  gray:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

export const TABS = [
  { key: 'groups',    label: 'گروه‌بندی اعلان',   icon: GroupIcon },
  { key: 'templates', label: 'قالب اعلان‌ها',     icon: FileText },
  { key: 'schedule',  label: 'زمان‌بندی مصوبات',  icon: Clock3 },
  { key: 'logs',      label: 'گزارش اعلان‌ها',    icon: BarChart2 },
];

export const inp = 'w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition text-sm';

export const audienceLabel: Record<string, string> = {
  participants: 'شرکت‌کنندگان', observers: 'مطلعین', external: 'خارج سازمان', all: 'همه',
};
export const eventLabel: Record<string, string> = {
  invite: 'دعوت', change: 'تغییر', cancel: 'لغو', reminder: 'یادآور',
  assign: 'تخصیص', complete: 'تکمیل', event_invite: 'دعوت رویداد',
  mention: 'منشن', message: 'پیام', share: 'اشتراک', alert: 'هشدار', custom: 'سفارشی',
};

export const AUDIENCE_COLORS: Record<string, string> = {
  all:          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  participants: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  observers:    'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
  external:     'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
};

export const NOTIF_SAMPLE_VALUES: Record<string, string> = {
  formal_recipient_greeting: 'جناب آقای محمدی', series_weekdays: 'شنبه‌ها', recurrence_frequency: 'هفتگی',
  summary: 'دعوت به جلسات تکراری هیئت مدیره؛ ۴ نوبت',
  series_start_date: '۱۴۰۵/۰۸/۰۷', series_end_date: '۱۴۰۵/۰۸/۲۸',
  occurrence_count: '۴', series_pattern: 'هر هفته پنجشنبه',
  full_name: 'سارا احمدی', meeting_subject: 'جلسه هماهنگی پروژه', meeting_date: '۱۵/۳/۱۴۰۵', meeting_time: '۰۹:۰۰-۱۰:۰۰', location: 'اتاق کنفرانس A', location_part: ' | اتاق کنفرانس A', representative: 'رضا کریمی', minutes: '۱۵', task_title: 'بررسی گزارش هفتگی', priority: 'بالا', due_date: '۲۰/۳/۱۴۰۵', event_title: 'جشن سالگرد تأسیس', event_date: '۲۵/۳/۱۴۰۵', sender_name: 'علی محمدی', note_title: 'یادداشت جلسه هیئت مدیره', message_preview: 'سلام، آیا گزارش آماده شده؟', alert_message: 'خرابی موقت در سرویس ایمیل', join_link: 'https://example.com/join/meeting', agenda: '۱. بررسی پیشرفت پروژه | ارائه‌دهنده: علی محمدی | ۲۰ دقیقه\n۲. تخصیص منابع | ۱۵ دقیقه',
};
