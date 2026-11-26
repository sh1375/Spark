export interface NoteReminderDelivery {
  recipient_id: string;
  channel: 'sms' | 'bale';
  status: string;
  reason: string | null;
}
export interface NoteReminderStatus {
  ready: boolean;
  last_error: string | null;
  legacy_in_app_only: boolean;
  deliveries: NoteReminderDelivery[];
}
export function deliveryLabel(row: NoteReminderDelivery): string {
  const reasons: Record<string, string> = {
    BALE_NOT_LINKED: 'حساب بله این کاربر متصل نیست', BALE_DISABLED: 'ارسال بله در سامانه غیرفعال است',
    BALE_TOKEN_MISSING: 'اتصال ربات بله تنظیم نشده است', BALE_MAPPING_UNAVAILABLE: 'ارتباط با حساب بله در دسترس نیست',
    SMS_RULE_NOT_FOUND: 'ارسال پیامک یادداشت در گروه کاربری این شخص فعال نیست',
    INVALID_TARGET_PHONE: 'شماره همراه کاربر ثبت نشده یا معتبر نیست', TARGET_PROFILE_NOT_FOUND: 'پروفایل گیرنده یافت نشد',
    SMS_TEMPLATE_NOT_FOUND: 'قالب پیامک یادآوری فعال نیست', SMS_TEMPLATE_CONTEXT_MISSING: 'اطلاعات قالب پیامک کامل نیست',
    SMS_DEFERRED_BY_POLICY: 'در انتظار ساعت مجاز ارسال پیامک', DELIVERY_OUTCOME_UNKNOWN: 'نتیجه ارسال مشخص نیست؛ برای جلوگیری از تکرار، دوباره ارسال نشد',
    NOTE_MESSAGE_CONTEXT_UNAVAILABLE: 'اطلاعات معتبر پیام از سرور دریافت نشد؛ ارسال انجام نشد',
    NOTE_CONTENT_REDACTED: 'محتوای پیام طبق تنظیم محرمانگی ارسال نشد',
    REMINDER_CANCELLED_OR_RECIPIENT_NOT_ALLOWED: 'یادآوری لغو شده یا گیرنده دیگر مجاز نیست',
  };
  if (row.status === 'sent') return 'ارسال شد';
  if (row.reason && reasons[row.reason]) return reasons[row.reason];
  const labels: Record<string, string> = { pending: 'در صف ارسال', sending: 'در حال ارسال', failed: 'ارسال ناموفق بود',
    uncertain: 'نتیجه ارسال مشخص نیست', skipped: 'طبق تنظیمات ارسال نشد', cancelled: 'لغو شد' };
  return labels[row.status] || 'در انتظار بررسی';
}

export function reminderServiceError(reason: string | null): string {
  const labels: Record<string,string> = {
    WORKER_NOT_CONFIGURED: 'آدرس سرویس ارسال یادآوری تنظیم نشده است.',
    SCHEDULER_NOT_ACTIVE: 'زمان‌بند یادآوری فعال نیست.',
    WORKER_TIMEOUT: 'سرویس ارسال در مهلت تعیین‌شده پاسخ نداده است.',
    WORKER_NETWORK_ERROR: 'دیتابیس به سرویس ارسال دسترسی شبکه ندارد.',
    WORKER_HTTP_401: 'سرویس ارسال درخواست را نپذیرفت؛ تنظیم احراز هویت سرویس باید بررسی شود.',
    WORKER_HTTP_403: 'سرویس ارسال دسترسی را رد کرده است؛ توکن یا مسیر دسترسی باید بررسی شود.',
    WORKER_HTTP_404: 'مسیر سرویس ارسال یادآوری روی سرور پیدا نشد.',
  };
  if (reason && Object.hasOwn(labels,reason)) return labels[reason];
  if (reason?.startsWith('WORKER_HTTP_')) return 'سرویس ارسال پاسخ ناموفق داده است؛ وضعیت سرویس روی سرور را بررسی کنید.';
  if (reason?.startsWith('WORKER_DISPATCH_FAILED')) return 'دیتابیس نتوانسته درخواست ارسال را ثبت کند.';
  return 'زمان‌بند اخیراً اجرا نشده یا ارتباط سرویس ارسال آماده نیست.';
}
