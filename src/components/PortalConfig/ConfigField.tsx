import { useId, useState, useEffect } from 'react';
import { Save, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type { ConfigEntry } from './types';
import { SECURITY_CONFIG_PRESENTATION, SELECT_OPTIONS } from './constants';
import { MaintenanceModeField } from './MaintenanceModeField';

export function ConfigField({ entry, onSave }: { entry: ConfigEntry; onSave: (id: string, value: string) => void }) {
  const fieldId = useId();
  const [val, setVal] = useState(entry.value ?? '');
  const [showPass, setShowPass] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { setAccentColor } = useTheme();
  const isPrimaryColor = entry.section === 'appearance' && entry.key === 'primary_color';
  const isMediaTopology = entry.section === 'video_conference' && entry.key === 'media_topology';
  const isMaintenanceMode = entry.section === 'security' && entry.key === 'maintenance_mode';

  useEffect(() => {
    const nextValue = entry.value ?? '';
    setVal(nextValue);
    setDirty(false);
    if (isPrimaryColor) setAccentColor(nextValue);
  }, [entry.value, isPrimaryColor, setAccentColor]);

  const change = (v: string) => {
    setVal(v);
    setDirty(v !== (entry.value ?? ''));
    if (isPrimaryColor) setAccentColor(v);
  };

  const saveMediaTopology = (value: 'mesh' | 'sfu') => {
    setVal(value);
    setDirty(false);
    onSave(entry.id, value);
  };

  if (isMaintenanceMode) {
    return <MaintenanceModeField entry={entry} />;
  }

  const inputCls = 'h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500';
  const selectOptions = entry.value_type === 'select' ? (SELECT_OPTIONS[entry.key] ?? []) : [];
  const presentation = entry.section === 'security' ? SECURITY_CONFIG_PRESENTATION[entry.key] : undefined;
  const label = presentation?.label || entry.label || entry.key;
  const description = presentation?.description || entry.description;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        {isMediaTopology || entry.value_type === 'boolean' || selectOptions.length > 0 ? (
          <span className="min-w-0 break-words text-[11px] font-bold text-slate-700 dark:text-slate-200">{label}</span>
        ) : (
          <label htmlFor={fieldId} className="min-w-0 break-words text-[11px] font-bold text-slate-700 dark:text-slate-200">{label}</label>
        )}
        {dirty && !isMediaTopology && (
          <button type="button" onClick={() => { onSave(entry.id, val); setDirty(false); }}
            className="flex h-7 flex-shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-[10px] font-bold text-white transition hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400">
            <Save className="h-3 w-3" /> ذخیره
          </button>
        )}
      </div>
      {description && entry.value_type !== 'select' && (
        <p className="break-words text-[10px] leading-5 text-slate-400 dark:text-slate-500">{description}</p>
      )}
      {isMediaTopology ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={label} dir="ltr">
          {([
            { value: 'mesh' as const, label: 'Mesh', description: 'WebRTC مستقیم' },
            { value: 'sfu' as const, label: 'SFU', description: 'سرویس SFU' },
          ]).map(option => {
            const active = val === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => saveMediaTopology(option.value)}
                className={`rounded-lg border px-3 py-2 text-center transition ${active
                  ? 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5'}`}>
                <span className="block text-[11px] font-bold">{option.label}</span>
                <span className="mt-0.5 block text-[9px] opacity-70">{option.description}</span>
              </button>
            );
          })}
        </div>
      ) : entry.value_type === 'boolean' ? (
        <div className="flex items-center gap-2">
          <button onClick={() => { const n = val === 'true' ? 'false' : 'true'; change(n); onSave(entry.id, n); }}
            type="button" role="switch" aria-checked={val === 'true'} aria-label={`${label}: ${val === 'true' ? 'فعال' : 'غیرفعال'}`}
            className={`relative h-5 w-10 flex-shrink-0 rounded-full transition-colors ${val === 'true' ? 'bg-violet-600 dark:bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${val === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className={`text-[10px] font-bold ${val === 'true' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {val === 'true' ? 'فعال' : 'غیرفعال'}
          </span>
        </div>
      ) : entry.value_type === 'password' ? (
        <div className="relative min-w-0">
          <input id={fieldId} type={showPass ? 'text' : 'password'} value={val} onChange={e => change(e.target.value)}
            className={`${inputCls} !pl-10 text-left`} dir="ltr" data-password-input="true" autoComplete="new-password" />
          <button type="button" onClick={() => setShowPass(v => !v)}
            className="absolute left-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-slate-800 dark:hover:text-violet-300"
            aria-label={showPass ? 'مخفی کردن مقدار' : 'نمایش مقدار'} aria-pressed={showPass}>
            {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      ) : entry.value_type === 'color' ? (
        <div className="flex min-w-0 items-center gap-2">
          <input id={`${fieldId}-picker`} aria-label={label} type="color" value={val || '#4f46e5'} onChange={e => change(e.target.value)}
            className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" />
          <input id={fieldId} type="text" value={val} onChange={e => change(e.target.value)} className={`${inputCls} flex-1`} placeholder="#4f46e5" dir="ltr" />
        </div>
      ) : entry.value_type === 'number' ? (
        <input id={fieldId} type="number" value={val} onChange={e => change(e.target.value)} className={inputCls} dir="ltr" />
      ) : entry.value_type === 'time' ? (
        <input id={fieldId} type="time" value={val} onChange={e => change(e.target.value)} className={inputCls} dir="ltr" />
      ) : entry.value_type === 'select' && selectOptions.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1.5" dir="rtl">
          {selectOptions.map(opt => (
            <button type="button" key={opt.value} onClick={() => { change(opt.value); onSave(entry.id, opt.value); }}
              className={`w-full min-w-0 rounded-lg border px-3 py-2 text-right transition ${val === opt.value
                ? 'border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10'
                : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-500/20 dark:hover:bg-violet-500/5'}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${val === opt.value ? 'border-violet-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {val === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
                </span>
                <span className={`min-w-0 break-words text-[11px] font-bold ${val === opt.value ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>{opt.label}</span>
              </div>
              <p className={`mr-5 mt-0.5 break-words text-right text-[9px] leading-4 ${val === opt.value ? 'text-violet-500 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'}`}>{opt.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <input id={fieldId} type="text" value={val} onChange={e => change(e.target.value)} className={inputCls} />
      )}
    </div>
  );
}
