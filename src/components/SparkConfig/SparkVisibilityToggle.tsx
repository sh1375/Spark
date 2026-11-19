import { useLiveData } from '../../shared/realtime/useLiveData';
import { useState } from 'react';
import { Bot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import toast from 'react-hot-toast';

export function SparkVisibilityToggle() {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useLiveData(['system_config'], async () => {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('section', 'spark')
      .eq('key', 'spark_visible')
      .maybeSingle();
    if (!error) setVisible(data?.value === 'true');
  });

  const toggle = async () => {
    if (visible === null) return;
    const newVal = !visible;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('system_config')
        .select('id')
        .eq('section', 'spark')
        .eq('key', 'spark_visible')
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('system_config')
          .update({ value: newVal ? 'true' : 'false' })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('system_config')
          .insert([{ section: 'spark', key: 'spark_visible', value: newVal ? 'true' : 'false' }]);
        if (error) throw error;
      }
      setVisible(newVal);
      window.dispatchEvent(new CustomEvent('spark-visible-changed', { detail: { visible: newVal } }));
      toast.success(newVal ? 'دستیار اسپارک نمایش داده می‌شود' : 'دستیار اسپارک پنهان شد');
      logAudit({ module: 'spark', action: newVal ? 'spark_enabled' : 'spark_disabled', entity_name: 'spark_visible', details: `نمایش دستیار اسپارک ${newVal ? 'فعال' : 'غیرفعال'} شد`, severity: 'warning' });
    } catch {
      toast.error('خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-blue-200 dark:border-blue-700">
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
        <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
          <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
            نمایش دستیار اسپارک
            {visible !== null && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${visible ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                {visible ? 'فعال' : 'غیرفعال'}
              </span>
            )}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {visible ? 'دکمه اسپارک روی تمام صفحات نمایش داده می‌شود' : 'دکمه اسپارک از تمام صفحات پنهان است'}
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <div className="relative">
            <input name="spark-visibility" aria-label="نمایش دستیار اسپارک"
              type="checkbox"
              className="sr-only peer"
              checked={visible === true}
              onChange={toggle}
              disabled={saving || visible === null}
            />
            <div className="w-10 h-5 bg-gray-200 dark:bg-gray-600 peer-checked:bg-emerald-500 rounded-full transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
          </div>
        </label>
      </div>
    </div>
  );
}
