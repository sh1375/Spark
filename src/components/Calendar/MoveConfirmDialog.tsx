import { Bell, Loader as Loader2 } from 'lucide-react';
import { formatJalaliDateForDisplay, formatPersianClock } from '../../lib/minutesDate';
import type { MeetingData } from './types';

export function MoveConfirmDialog({
  pendingMove,
  committing,
  onCommitWithNotify,
  onCommitWithoutNotify,
  onReturnToEdit,
  onCancel,
}: {
  pendingMove: {
    meeting: MeetingData;
    updates: Record<string, string>;
    oldDateIso: string;
    newDateIso: string;
  } | null;
  committing: boolean;
  onCommitWithNotify: () => void;
  onCommitWithoutNotify: () => void;
  onReturnToEdit: () => void;
  onCancel: () => void;
}) {
  if (!pendingMove) return null;

  const importantChanges: string[] = [];
  if (pendingMove.oldDateIso !== pendingMove.newDateIso) {
    importantChanges.push('تاریخ جلسه');
  }
  if (pendingMove.meeting.start_time !== pendingMove.updates.start_time) {
    importantChanges.push('ساعت شروع');
  }
  if (pendingMove.meeting.end_time !== pendingMove.updates.end_time) {
    importantChanges.push('ساعت پایان');
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">ثبت تغییرات جلسه</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              تغییراتی در اطلاعات یا اعضای جلسه ایجاد شده است. نحوه ثبت تغییرات را انتخاب کنید.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-xs dark:bg-gray-900/40">
            <div><dt className="text-gray-500">زمان قبلی</dt><dd dir="ltr" className="mt-1 text-right">{formatJalaliDateForDisplay(pendingMove.oldDateIso)}<br />{formatPersianClock(pendingMove.meeting.start_time)} – {formatPersianClock(pendingMove.meeting.end_time)}</dd></div>
            <div><dt className="text-gray-500">زمان جدید پس از ثبت</dt><dd dir="ltr" className="mt-1 text-right font-bold text-teal-700 dark:text-teal-300">{formatJalaliDateForDisplay(pendingMove.newDateIso)}<br />{formatPersianClock(pendingMove.updates.start_time)} – {formatPersianClock(pendingMove.updates.end_time)}</dd></div>
          </dl>
          {importantChanges.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">تغییرات مهم</p>
              <ul className="text-xs text-gray-700 dark:text-gray-300 list-disc pr-4 space-y-0.5">
                {importantChanges.map(change => <li key={change}>{change}</li>)}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
            با ثبت همراه اطلاع‌رسانی، برای مدعوین و مطلعین خارج از سازمان پیامک زمان قبلی و جدید در صف ارسال ثبت می‌شود. در حالت ثبت بدون اطلاع‌رسانی، تغییرات فقط در سامانه ذخیره می‌شوند و هیچ پیامی ارسال نخواهد شد.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={onCommitWithNotify}
            disabled={committing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 active:scale-95 bg-teal-600 text-white hover:bg-teal-700"
          >
            {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            ثبت تغییرات با اطلاع‌رسانی
          </button>

          <button
            type="button"
            onClick={onCommitWithoutNotify}
            disabled={committing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 active:scale-95 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            ثبت تغییرات بدون اطلاع‌رسانی
          </button>

          <button
            type="button"
            onClick={onReturnToEdit}
            disabled={committing}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            بازگشت به ویرایش
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={committing}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
