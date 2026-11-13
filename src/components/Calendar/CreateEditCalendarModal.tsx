import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CalendarEntry, CalendarFormState } from './types';
import { PRESET_COLORS } from './utils';

interface Props {
  editingCalendar: CalendarEntry | null;
  form: CalendarFormState;
  onChange: (form: CalendarFormState) => void;
  onSave: () => void;
  onClose: () => void;
}

const TOGGLES = [
  { key: 'is_active', label: 'وضعیت تقویم' },
  { key: 'enable_reminder', label: 'یادآوری رویدادها' },
  { key: 'create_online_link', label: 'ایجاد لینک جلسه آنلاین' },
  { key: 'show_time_overlap', label: 'همپوشانی زمانی رویدادها' },
  { key: 'free_for_all', label: 'کنترل آزاد بودن افراد' },
];

export function CreateEditCalendarModal({ editingCalendar, form, onChange, onSave, onClose }: Props) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[250]" dir="rtl" onClick={onClose}>
      <div
        className="absolute inset-y-0 left-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slideInLeft"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-bold dark:text-white">{editingCalendar ? 'ویرایش تقویم' : 'تقویم جدید'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 dark:text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name + type */}
          <div className="flex gap-2">
            <input
              value={form.name}
              onChange={e => onChange({ ...form, name: e.target.value })}
              placeholder="عنوان تقویم"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={form.type}
              onChange={e => onChange({ ...form, type: e.target.value as any })}
              className="w-32 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="shared">اشتراکی</option>
              <option value="public">عمومی</option>
              <option value="private">شخصی</option>
            </select>
          </div>

          {/* Description */}
          <textarea
            value={form.description}
            onChange={e => onChange({ ...form, description: e.target.value })}
            placeholder="توضیحات تقویم"
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Toggles */}
          {TOGGLES.map(({ key, label }) => {
            const val = form[key as keyof CalendarFormState] as boolean;
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm dark:text-gray-300">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{val ? 'فعال' : 'غیرفعال'}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...form, [key]: !val })}
                    className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${val ? 'bg-teal-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${val ? 'right-1' : 'right-6'}`} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Color */}
          <div>
            <p className="text-sm dark:text-gray-300 mb-2">رنگ</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onChange({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={onSave}
            className="w-full py-2.5 bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            ثبت
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
