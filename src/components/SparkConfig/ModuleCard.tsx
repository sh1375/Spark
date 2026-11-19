import { useId, useState, useEffect, useRef } from 'react';
import { Bot, Save, Plus, X, ChevronDown, ChevronUp, Calendar, MessageSquare, ClipboardList, BookOpen, Users, ChartBar as BarChart2, User, Video } from 'lucide-react';
import type { SparkModuleConfig, FieldKeyword } from './types';
import { MODULE_META, colorMap, Spinner } from './constants';
import { TestCommandPanel } from './TestCommandPanel';
import { FieldKeywordsSection } from './FieldKeywordsSection';

export function ModuleCard({
  config, fieldKeywords, onSave, onRefreshFields,
}: { config: SparkModuleConfig; fieldKeywords: FieldKeyword[]; onSave: (u: SparkModuleConfig) => Promise<void>; onRefreshFields: () => void }) {
  const fieldId = useId();
  const [form, setForm] = useState<SparkModuleConfig>({ ...config });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'trigger' | 'fields' | 'test'>('trigger');
  const [expanded, setExpanded] = useState(false);
  const [newKw, setNewKw] = useState('');

  const meta = MODULE_META[config.module] || { label: config.module, icon: Bot, color: 'gray', desc: '', defaultPhrases: [], sampleCommand: '' };
  const Icon = meta.icon;
  const c = colorMap[meta.color] || colorMap.gray;

  useEffect(() => {
    setDirty(JSON.stringify(form) !== JSON.stringify(config));
  }, [form, config]);

  const previousConfig = useRef(config);
  useEffect(() => {
    if (JSON.stringify(form) === JSON.stringify(previousConfig.current)) setForm({ ...config });
    previousConfig.current = config;
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); setDirty(false); } finally { setSaving(false); }
  };

  const addKw = () => {
    const kw = newKw.trim();
    if (!kw || form.trigger_keywords.includes(kw)) { setNewKw(''); return; }
    setForm(f => ({ ...f, trigger_keywords: [...f.trigger_keywords, kw] }));
    setNewKw('');
  };

  const removeKw = (kw: string) => setForm(f => ({ ...f, trigger_keywords: f.trigger_keywords.filter(k => k !== kw) }));

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'trigger', label: 'کلیدواژه‌ها' },
    { key: 'test', label: 'آزمایش' },
    { key: 'fields', label: 'فیلدها' },
  ];

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden ${form.enabled ? c.border : 'border-gray-200 dark:border-gray-700 opacity-60'}`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${form.enabled ? c.light : 'bg-gray-50 dark:bg-gray-800'}`}
        onClick={() => setExpanded(v => !v)}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.text} bg-white dark:bg-gray-800 shadow-sm`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-gray-800 dark:text-white">{meta.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-white/60 dark:bg-gray-700/60 rounded text-gray-500 font-mono">{config.module}</span>
            {form.trigger_keywords.length > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.badgeBg}`}>
                {form.trigger_keywords.length} کلیدواژه
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{meta.desc}</p>
        </div>
        {/* Enable toggle — stop propagation so click doesn't toggle expand */}
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={e => e.stopPropagation()}>
          <span className={`text-xs font-medium ${form.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
            {form.enabled ? 'فعال' : 'غیرفعال'}
          </span>
          <div className="relative">
            <input id={`${fieldId}-enabled`} type="checkbox" className="sr-only peer" checked={form.enabled}
              onChange={e => {
                setForm(f => ({ ...f, enabled: e.target.checked }));
              }} />
            <div className="w-10 h-5 bg-gray-200 dark:bg-gray-600 peer-checked:bg-emerald-500 rounded-full transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
          </div>
        </label>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </div>

      {/* Save bar for enable/disable change (outside expanded) */}
      {dirty && !expanded && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800 flex items-center justify-between">
          <span className="text-xs text-amber-700 dark:text-amber-300">تغییرات ذخیره نشده</span>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-medium transition-colors">
            {saving ? <Spinner className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} ذخیره
          </button>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
          {/* Sub-tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === t.key ? `${c.text} border-b-2 ${c.border}` : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4">
            {tab === 'trigger' && (
              <>
                {/* Description */}
                <div>
                  <label htmlFor={`${fieldId}-description`} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">توضیح قابلیت</label>
                  <textarea id={`${fieldId}-description`} rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm resize-none"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>

                {/* Trigger keywords */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor={`${fieldId}-trigger-keyword`} className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      کلیدواژه‌های فراخوان
                    </label>
                    {meta.defaultPhrases.length > 0 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        پیش‌فرض: {meta.defaultPhrases.slice(0, 3).join(' | ')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                    هنگامی که اسپارک این کلمات را در دستور ببیند، این ماژول فعال می‌شود.
                    کلیدواژه‌های شما اولویت بالاتری دارند (امتیاز ۲ در برابر ۱ برای پیش‌فرض‌ها).
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[36px] p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                    {form.trigger_keywords.length === 0 && (
                      <span className="text-xs text-gray-400">هنوز کلیدواژه‌ای افزوده نشده (از عبارات پیش‌فرض استفاده می‌شود)</span>
                    )}
                    {form.trigger_keywords.map(kw => (
                      <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs border border-gray-200 dark:border-gray-600 shadow-sm">
                        {kw}
                        <button onClick={() => removeKw(kw)} className="text-gray-300 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input id={`${fieldId}-trigger-keyword`}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      placeholder="کلیدواژه جدید را وارد کنید..."
                      value={newKw} onChange={e => setNewKw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKw())}
                    />
                    <button onClick={addKw} className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Voice template */}
                <div>
                  <label htmlFor={`${fieldId}-voice-template`} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    قالب پاسخ صوتی
                    <span className="text-gray-400 font-normal mr-1">({'{subject}'}, {'{date}'}, {'{target}'}, ...)</span>
                  </label>
                  <input id={`${fieldId}-voice-template`}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    value={form.voice_response_template} onChange={e => setForm(f => ({ ...f, voice_response_template: e.target.value }))}
                    placeholder="مثال: جلسه {subject} در تاریخ {date} ثبت شد." />
                </div>

                {dirty && (
                  <button onClick={handleSave} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                    {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    ذخیره تنظیمات
                  </button>
                )}
              </>
            )}

            {tab === 'test' && (
              <TestCommandPanel config={form} meta={meta} />
            )}

            {tab === 'fields' && (
              <FieldKeywordsSection module={config.module} fieldKeywords={fieldKeywords} onRefresh={onRefreshFields} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
