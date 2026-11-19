import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useId, useState, useEffect, useRef } from 'react';
import { Brain, Save, Plus, X, Eye, EyeOff, Key, Play, CircleCheck as CheckCircle2, Circle as XCircle, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { SparkAiSettings } from './types';
import { Spinner } from './constants';

export function AiSettingsPanel() {
  const fieldId = useId();
  const [settings, setSettings] = useState<SparkAiSettings | null>(null);
  const [form, setForm] = useState({ provider: 'groq', api_key: '', model: 'llama-3.3-70b-versatile', enabled: false });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadedForm = useRef<string | null>(null);
  const formSnapshot = useRef(''); formSnapshot.current = JSON.stringify(form);
  const load = async () => {
    const { data, error } = await supabase.from('spark_ai_settings').select('*').maybeSingle();
    if (error) return;
    if (data) {
      const next = { provider: data.provider || 'groq', api_key: data.api_key ?? '', model: data.model || 'llama-3.3-70b-versatile', enabled: data.enabled };
      setSettings(data as SparkAiSettings); loadedForm.current = JSON.stringify(next); setForm(next);
    } else { loadedForm.current = formSnapshot.current; }
    setLoading(false);
  };
  useLiveData(LIVE_DATA.spark, async () => {
    if (!saving && !testing && loadedForm.current === formSnapshot.current) await load();
  });
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        const { error } = await supabase.from('spark_ai_settings').update({ ...form, updated_at: new Date().toISOString() }).eq('id', settings.id);
        if (error) { toast.error('خطا: ' + error.message); return; }
      } else {
        const { error } = await supabase.from('spark_ai_settings').insert([form]);
        if (error) { toast.error('خطا: ' + error.message); return; }
      }
      loadedForm.current = formSnapshot.current;
      toast.success('تنظیمات هوش مصنوعی ذخیره شد');
      const { data } = await supabase.from('spark_ai_settings').select('*').maybeSingle();
      if (data) setSettings(data as SparkAiSettings);
    } finally { setSaving(false); }
  };

  const testConnection = async () => {
    if (!form.api_key.trim()) { setTestResult('کلید API وارد نشده'); return; }
    setTesting(true); setTestResult(null);
    try {
      const apiUrl = form.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${form.api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: form.model, messages: [{ role: 'user', content: 'Say "OK" in one word' }], max_tokens: 5 }),
      });
      if (res.ok) setTestResult('اتصال موفق! هوش مصنوعی آماده است.');
      else { const d = await res.json(); setTestResult('خطا: ' + (d.error?.message || res.status)); }
    } catch (e: any) { setTestResult('خطا در اتصال: ' + e.message); }
    finally { setTesting(false); }
  };

  const PROVIDERS = [
    { value: 'groq', label: 'Groq (رایگان و سریع)', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    { value: 'openai', label: 'OpenAI (GPT)', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'] },
  ];
  const currentProvider = PROVIDERS.find(p => p.value === form.provider);

  const inp = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm';

  if (loading) return <div className="animate-pulse h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />;

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-yellow-200 dark:border-yellow-700">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20">
        <div className="w-9 h-9 rounded-xl bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center">
          <Brain className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
            هوش مصنوعی (AI Mode)
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${form.enabled ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
              {form.enabled ? 'فعال' : 'غیرفعال'}
            </span>
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">پردازش هوشمند دستورات با مدل زبانی</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <div className="relative">
            <input id={`${fieldId}-enabled`} type="checkbox" className="sr-only peer" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            <div className="w-10 h-5 bg-gray-200 dark:bg-gray-600 peer-checked:bg-emerald-500 rounded-full transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow" />
          </div>
        </label>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 space-y-4">
        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
          <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-yellow-500" />
          <div>
            <p className="font-semibold mb-0.5">چرا AI Mode؟</p>
            <p>با هوش مصنوعی، اسپارک هر جمله فارسی را می‌فهمد — بدون نیاز به کلیدواژه خاص. دستورات پیچیده و طبیعی را اجرا می‌کند و به مرور زمان یاد می‌گیرد.</p>
            <p className="mt-1 font-medium">Groq رایگان است — کلید API از <span className="underline">console.groq.com</span> بگیرید.</p>
          </div>
        </div>

        {/* Provider */}
        <div>
          <label htmlFor={`${fieldId}-provider`} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">سرویس‌دهنده</label>
          <select id={`${fieldId}-provider`} value={form.provider} onChange={e => { setForm(f => ({ ...f, provider: e.target.value, model: PROVIDERS.find(p => p.value === e.target.value)?.models[0] || '' })); setTestResult(null); }}
            className={inp}>
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {/* Model */}
        <div>
          <label htmlFor={`${fieldId}-model`} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">مدل</label>
          <select id={`${fieldId}-model`} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className={inp}>
            {(currentProvider?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* API Key */}
        <form onSubmit={event => event.preventDefault()}>
          <label htmlFor={`${fieldId}-api-key`} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
            <Key className="w-3 h-3" /> کلید API
          </label>
          <div className="relative">
            <input autoComplete="new-password" id={`${fieldId}-api-key`} type={showKey ? 'text' : 'password'} value={form.api_key} onChange={e => { setForm(f => ({ ...f, api_key: e.target.value })); setTestResult(null); }}
              placeholder="کلید API را اینجا وارد کنید..." dir="ltr"
              className={inp + ' pr-10'} />
            <button type="button" onClick={() => setShowKey(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </form>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 p-2.5 rounded-xl text-xs ${testResult.includes('موفق') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
            {testResult.includes('موفق') ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {testResult}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex-1 justify-center">
            {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} ذخیره
          </button>
          <button onClick={testConnection} disabled={testing || !form.api_key.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium transition-colors flex-1 justify-center">
            {testing ? <Spinner className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} آزمایش اتصال
          </button>
        </div>
      </div>
    </div>
  );
}
