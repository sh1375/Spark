import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reminderServiceError, deliveryLabel, type NoteReminderStatus } from './reminderDeliveryStatusModel';
import type { ReminderUser } from './ReminderField';

export function ReminderDeliveryStatus({ noteId, ownerId, users = [] }: { noteId?: string; ownerId?: string; users?: ReminderUser[] }) {
  const [status, setStatus] = useState<NoteReminderStatus | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus(null); setError(false);
    supabase.rpc('get_note_reminder_delivery_status', { p_note_id: noteId ?? null }).then(({ data, error }) => {
      if (active) { setError(Boolean(error)); setStatus(error ? null : data as NoteReminderStatus); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [noteId, revision]);
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-2.5 text-[10px] leading-5 dark:border-slate-700 dark:bg-slate-900/50">
    <div className="flex items-center justify-between gap-2"><strong className="text-slate-700 dark:text-slate-200">وضعیت ارسال یادآوری</strong><button type="button" onClick={() => setRevision(value => value + 1)} aria-label="تازه‌سازی وضعیت ارسال یادآوری" className="rounded p-1 text-slate-400"><RefreshCw className="h-3 w-3" /></button></div>
    {error ? <p role="alert" className="text-rose-600 dark:text-rose-300">وضعیت ارسال از سرور دریافت نشد. ممکن است بخش سروری یادآوری به‌روز نشده باشد؛ با مدیر سامانه بررسی کنید.</p>
      : !status ? <p className="text-slate-400">در حال بررسی سرویس ارسال...</p>
      : <>
        {!status.ready ? <p role="alert" className="flex items-start gap-1 text-rose-600 dark:text-rose-300"><AlertTriangle className="mt-1 h-3 w-3 shrink-0" />{reminderServiceError(status.last_error)} ثبت اعلان داخل سایت به معنی ارسال پیامک و بله نیست.</p>
          : <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />زمان‌بند ارسال فعال است؛ نتیجه واقعی هر گیرنده پس از موعد نمایش داده می‌شود.</p>}
        {status.legacy_in_app_only && <p role="alert" className="text-amber-700 dark:text-amber-300">این یادآوری قبلاً فقط داخل سایت ثبت شده است. برای ارسال پیامک و بله، تاریخ و ساعت جدیدی تعیین کنید.</p>}
        {status.deliveries.map(row => <div key={`${row.recipient_id}:${row.channel}`} className="border-t border-slate-100 pt-1 dark:border-slate-800"><span className="font-bold text-slate-700 dark:text-slate-200">{row.recipient_id === ownerId ? 'خودتان' : users.find(user => user.user_id === row.recipient_id)?.full_name || 'گیرنده انتخاب‌شده'} · {row.channel === 'sms' ? 'پیامک' : 'بله'}: </span><span className={row.status === 'sent' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}>{deliveryLabel(row)}</span></div>)}
      </>}
  </div>;
}
