import { useEffect, useState } from 'react';
import { Loader as Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import type { ConfigEntry } from './types';
import { SECURITY_CONFIG_PRESENTATION } from './constants';

interface MaintenanceModeRpcResult {
  ok?: boolean;
  error?: string;
  enabled?: boolean;
}

function maintenanceErrorMessage(error?: string): string {
  switch (error) {
    case 'ADMIN_REQUIRED':
      return 'فقط مدیر سامانه اجازه تغییر حالت تعمیر و نگهداری را دارد.';
    case 'SESSION_INVALID':
    case 'SESSION_NOT_FULLY_AUTHORIZED':
    case 'UNAUTHORIZED':
      return 'نشست شما برای این تغییر معتبر نیست؛ لطفاً دوباره وارد شوید.';
    default:
      return 'اعمال حالت تعمیر و نگهداری انجام نشد.';
  }
}

export function MaintenanceModeField({ entry }: { entry: ConfigEntry }) {
  const [enabled, setEnabled] = useState(entry.value === 'true');
  const [saving, setSaving] = useState(false);
  const presentation = SECURITY_CONFIG_PRESENTATION[entry.key];
  const label = presentation?.label || entry.label || entry.key;
  const description = presentation?.description || entry.description;

  useEffect(() => {
    let cancelled = false;
    setEnabled(entry.value === 'true');

    void supabase
      .from('system_config')
      .select('value')
      .eq('section', 'security')
      .eq('key', 'maintenance_mode')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setEnabled(data.value === 'true');
      });

    return () => {
      cancelled = true;
    };
  }, [entry.value]);

  const toggle = async () => {
    if (saving) return;

    const next = !enabled;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('set_maintenance_mode', {
        p_enabled: next,
      });

      if (error) {
        console.error('[MaintenanceMode] RPC failed:', error);
        toast.error('اعمال حالت تعمیر و نگهداری انجام نشد.');
        return;
      }

      const result = data as MaintenanceModeRpcResult | null;
      if (!result?.ok) {
        toast.error(maintenanceErrorMessage(result?.error));
        return;
      }

      setEnabled(next);
      window.dispatchEvent(new CustomEvent('maintenance-mode-changed', {
        detail: { enabled: next },
      }));
      toast.success(next ? 'حالت تعمیر و نگهداری فعال شد.' : 'حالت تعمیر و نگهداری غیرفعال شد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 break-words text-[11px] font-bold text-slate-700 dark:text-slate-200">
          {label}
        </span>
      </div>
      {description && (
        <p className="break-words text-[10px] leading-5 text-slate-400 dark:text-slate-500">
          {description}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${label}: ${enabled ? 'فعال' : 'غیرفعال'}`}
          onClick={() => void toggle()}
          disabled={saving}
          className={`relative h-5 w-10 flex-shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${enabled ? 'bg-violet-600 dark:bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        {saving ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-300">
            <Loader2 className="h-3 w-3 animate-spin" /> در حال اعمال...
          </span>
        ) : (
          <span className={`text-[10px] font-bold ${enabled ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {enabled ? 'فعال' : 'غیرفعال'}
          </span>
        )}
      </div>
    </div>
  );
}
