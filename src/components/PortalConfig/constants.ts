import { Settings, Users, Bell, Lock, Monitor, Bot } from 'lucide-react';

export const NAV_ITEMS = [
  { key: 'platform', label: 'تنظیمات پلتفرم', icon: Settings, sub: [
    { key: 'general', label: 'تنظیمات کلی' },
    { key: 'appearance', label: 'ظاهر و برندینگ' },
    { key: 'regional', label: 'تنظیمات منطقه‌ای' },
    { key: 'ui_settings', label: 'تنظیمات محیطی' },
  ]},
  { key: 'users', label: 'کاربران', icon: Users, sub: [
    { key: 'users_list', label: 'فهرست کاربران' },
    { key: 'users_online', label: 'کاربران آنلاین' },
    { key: 'user_groups', label: 'گروه‌های کاربری' },
    { key: 'group_events', label: 'رخدادها' },
    { key: 'org_structure', label: 'ساختار سازمانی' },
  ]},
  { key: 'access', label: 'حقوق دسترسی', icon: Lock, sub: [
    { key: 'security', label: 'امنیت و دسترسی' },
    { key: 'server', label: 'دسترسی سرور' },
    { key: 'backup', label: 'پشتیبان‌گیری و بازگردانی' },
  ]},
  { key: 'notifications', label: 'اعلان‌ها و پیامک', icon: Bell, sub: [
    { key: 'notifications', label: 'اعلان‌ها' },
    { key: 'sms', label: 'پیامک' },
    { key: 'social_notifications', label: 'شبکه‌های اجتماعی' },
    { key: 'email', label: 'پست الکترونیک' },
    { key: 'daily_report', label: 'ارسال جلسات مدیریتی' },
  ]},
  { key: 'modules', label: 'مدیریت موجودیت‌ها', icon: Monitor, sub: [
    { key: 'video_conference', label: 'تماس و کنفرانس بیرونی' },
    { key: 'calendar', label: 'تقویم و مناسبت‌ها' },
    { key: 'minutes_config', label: 'صورت‌جلسات و مصوبات' },
    { key: 'monitoring', label: 'مانیتورینگ سیستم' },
  ]},
  { key: 'spark', label: 'دستیار اسپارک', icon: Bot, sub: [
    { key: 'spark_config', label: 'پیکربندی اسپارک' },
  ]},
];

export const SELECT_OPTIONS: Record<string, { value: string; label: string; description: string }[]> = {
};

// Only controls with a proven runtime consumer are exposed as generic
// system_config fields. Authentication/session/MFA/lockout/recovery policy is
// canonical in auth_security_settings and is managed by SecuritySettingsConsole.
export const SECURITY_CONFIG_PRESENTATION: Record<string, { label: string; description: string }> = {
  maintenance_mode: {
    label: 'حالت تعمیر و نگهداری',
    description: 'در صورت فعال بودن، کاربران عادی از پوسته سامانه خارج می‌شوند و فقط مدیران سامانه دسترسی دارند.',
  },
};

export const VISIBLE_SECURITY_CONFIG_KEYS = new Set(
  Object.keys(SECURITY_CONFIG_PRESENTATION),
);

// Historical compatibility keys are intentionally retained in the database so
// old deployments can be diagnosed, but they must not be shown as live controls.
// Internal runtime flags and secret material are also never rendered directly.
export const HIDDEN_SECURITY_CONFIG_KEYS = new Set([
  'allowed_ip_ranges',
  'audit_log_retention_days',
  'enable_2fa',
  'log_all_actions',
  'max_login_attempts',
  'require_strong_password',
  'session_timeout_minutes',
  'phone_login_enabled',
  'phone_login_canonical_enabled',
  'phone_login_hook_operator_confirmed',
  'phone_login_e2e_verified',
  'send_sms_hook_secret',
  'phone_rate_limit_pepper',
  'phone_login_allowed_origins',
  'phone_login_test_mode',
  'phone_login_test_phone',
  'phone_login_otp_ttl_seconds',
  'phone_login_otp_ttl_operator_confirmed',
  'phone_password_recovery_enabled',
  'phone_password_recovery_canonical_enabled',
  'phone_password_recovery_e2e_verified',
  'phone_password_recovery_test_mode',
  'phone_password_recovery_test_phone',
  'phone_password_recovery_secret_operator_confirmed',
  'phone_password_recovery_otp_ttl_seconds',
  'phone_auth_pepper',
  'phone_login_bale_otp_enabled',
  'phone_password_recovery_bale_otp_enabled',
  'phone_password_recovery_secret_configured',
  'phone_rate_limit_pepper_configured',
  'phone_otp_login_backend_ready',
  'phone_otp_login_max_attempts',
  'phone_otp_login_resend_seconds',
  'phone_otp_login_ttl_seconds',
  'registration_phone_otp_resend_seconds',
  'registration_phone_otp_secret_configured',
  'registration_phone_otp_ttl_seconds',
]);
