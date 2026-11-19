import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, CircleCheck as CheckCircle, Circle as XCircle, Loader as Loader2, Save, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, TriangleAlert as AlertTriangle, Shield, Database, Link2, Key, Webhook, Trash2, Radio, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Globe, Shuffle, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

import { Toggle, FieldLabel, SecretInput, SectionHeader } from './Shared';
import { SetupGuide } from './SetupGuide';
import { callProxy } from './callProxy';
import type { ChannelConfig, WebhookInfo } from './types';
import { BLANK, inp, inpMono } from './types';

// ─── Bale Webhook Manager ─────────────────────────────────────────────────────
function BaleWebhookManager({ webhookUrl, webhookSecret }: { webhookUrl: string; webhookSecret: string }) {
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loadingSet, setLoadingSet] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);

  const getWebhookInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const data = await callProxy('bale', 'getWebhookInfo');
      if (data.ok) {
        setWebhookInfo(data.result as WebhookInfo);
      } else {
        toast.error('خطا: ' + (data.description || 'دریافت اطلاعات ناموفق'));
      }
    } catch {
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  // Auto-fetch webhook info on mount (critical for debugging)
  useEffect(() => { getWebhookInfo(); }, [getWebhookInfo]);

  const setWebhook = async () => {
    if (!webhookUrl.trim()) { toast.error('ابتدا Webhook URL را وارد و ذخیره کنید'); return; }
    if (!webhookUrl.startsWith('https://')) { toast.error('Webhook URL باید با https:// شروع شود'); return; }
    setLoadingSet(true);
    try {
      const params: Record<string, unknown> = { url: webhookUrl.trim() };
      const secret = webhookSecret?.trim();
      if (secret) params.secret_token = secret;
      const data = await callProxy('bale', 'setWebhook', params);
      if (data.ok || data.result === true) {
        toast.success('Webhook با موفقیت ثبت شد' + (secret ? ' (با Secret Token)' : ''));
        await getWebhookInfo();
      } else {
        toast.error('خطا در ثبت Webhook: ' + (data.description || ''));
      }
    } catch {
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setLoadingSet(false);
    }
  };

  const deleteWebhook = async () => {
    setLoadingDelete(true);
    try {
      const data = await callProxy('bale', 'deleteWebhook');
      if (data.ok || data.result === true) {
        toast.success('Webhook حذف شد');
        setWebhookInfo(null);
      } else {
        toast.error('خطا در حذف Webhook: ' + (data.description || ''));
      }
    } catch {
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setLoadingDelete(false);
    }
  };

  const getUpdates = async () => {
    setLoadingUpdates(true);
    setShowUpdates(true);
    try {
      const data = await callProxy('bale', 'getUpdates');
      if (data.ok) {
        setUpdates(data.result || []);
        if ((data.result || []).length === 0) {
          toast('هیچ آپدیتی یافت نشد. اگر Webhook فعال است، ابتدا آن را حذف کنید.', { icon: 'ℹ️' });
        } else {
          toast.success(`${data.result.length} آپدیت دریافت شد`);
        }
      } else {
        toast.error('خطا: ' + (data.description || 'دریافت آپدیت‌ها ناموفق'));
        if (data.description?.includes('webhook')) {
          toast('نکته: getUpdates وقتی Webhook فعال است کار نمی‌کند.', { icon: '⚠️' });
        }
      }
    } catch {
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setLoadingUpdates(false);
    }
  };

  const isRegistered = webhookInfo && webhookInfo.url;
  const hasError = webhookInfo?.last_error_message;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
        <Webhook className="w-4 h-4 text-teal-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">مدیریت Webhook</span>
        <span className="text-[10px] text-gray-400 font-mono mr-auto">tapi.bale.ai/bot&#x3C;TOKEN&#x3E;/METHOD</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Action row */}
        <div className="flex flex-wrap gap-2">
          {/* getWebhookInfo */}
          <button
            onClick={getWebhookInfo}
            disabled={loadingInfo}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 rounded-xl text-xs font-medium transition disabled:opacity-50"
          >
            {loadingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
            وضعیت Webhook
          </button>

          {/* setWebhook */}
          <button
            onClick={setWebhook}
            disabled={loadingSet}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-xl text-xs font-medium transition disabled:opacity-50"
          >
            {loadingSet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            ثبت Webhook
          </button>

          {/* deleteWebhook */}
          <button
            onClick={deleteWebhook}
            disabled={loadingDelete}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 rounded-xl text-xs font-medium transition disabled:opacity-50"
          >
            {loadingDelete ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            حذف Webhook
          </button>

          {/* getUpdates */}
          <button
            onClick={getUpdates}
            disabled={loadingUpdates}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded-xl text-xs font-medium transition disabled:opacity-50"
          >
            {loadingUpdates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            دریافت آپدیت‌ها
          </button>
        </div>

        {/* Webhook Info Panel */}
        {webhookInfo && (
          <div className={`rounded-xl border px-4 py-3 space-y-2 ${isRegistered ? (hasError ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700' : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700') : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600'}`}>
            <div className="flex items-center gap-2">
              {isRegistered
                ? hasError
                  ? <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  : <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
              }
              <span className={`text-xs font-semibold ${isRegistered ? (hasError ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300') : 'text-gray-500'}`}>
                {isRegistered ? (hasError ? 'Webhook فعال — با خطا' : 'Webhook فعال') : 'Webhook ثبت نشده'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              {webhookInfo.url && (
                <div className="flex gap-2">
                  <span className="text-gray-400 flex-shrink-0 w-20">url:</span>
                  <span className="text-gray-700 dark:text-gray-300 break-all">{webhookInfo.url}</span>
                </div>
              )}
              {webhookInfo.ip_address && (
                <div className="flex gap-2">
                  <span className="text-gray-400 flex-shrink-0 w-20">ip:</span>
                  <span className="text-gray-700 dark:text-gray-300">{webhookInfo.ip_address}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-gray-400 flex-shrink-0 w-20">pending:</span>
                <span className={`font-semibold ${webhookInfo.pending_update_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {webhookInfo.pending_update_count} آپدیت در صف
                </span>
              </div>
              {webhookInfo.max_connections && (
                <div className="flex gap-2">
                  <span className="text-gray-400 flex-shrink-0 w-20">max_conn:</span>
                  <span className="text-gray-700 dark:text-gray-300">{webhookInfo.max_connections}</span>
                </div>
              )}
              {webhookInfo.has_custom_certificate && (
                <div className="flex gap-2">
                  <span className="text-gray-400 flex-shrink-0 w-20">cert:</span>
                  <span className="text-gray-700 dark:text-gray-300">custom certificate</span>
                </div>
              )}
            </div>

            {hasError && (
              <div className="flex items-start gap-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg px-3 py-2 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-0.5">آخرین خطا</p>
                  {webhookInfo.last_error_date && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" />
                      {new Date(webhookInfo.last_error_date * 1000).toLocaleString('fa-IR')}
                    </p>
                  )}
                  <p className="text-xs text-amber-800 dark:text-amber-200 font-mono break-words">{webhookInfo.last_error_message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* getUpdates results */}
        {showUpdates && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">نتیجه getUpdates</span>
                <span className="text-[10px] text-gray-400">({updates.length} آپدیت)</span>
              </div>
              <button onClick={() => setShowUpdates(false)} className="text-gray-400 hover:text-gray-600 text-xs">بستن</button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {updates.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-gray-400">آپدیتی یافت نشد</p>
                  <p className="text-[10px] text-gray-300 mt-1">اگر Webhook فعال است، ابتدا آن را حذف کرده سپس پیامی به بات ارسال کنید</p>
                </div>
              ) : (
                updates.map((u, i) => {
                  const msg = u.message || u.callback_query?.message;
                  const chatId = msg?.chat?.id;
                  const chatType = msg?.chat?.type;
                  const chatTitle = msg?.chat?.title || msg?.chat?.username || msg?.chat?.first_name;
                  const text = msg?.text || '';
                  const from = msg?.from?.first_name || msg?.from?.username || '';
                  return (
                    <div key={i} className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-mono">
                              chat_id: {chatId}
                            </span>
                            {chatType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono">
                                {chatType}
                              </span>
                            )}
                            {chatTitle && (
                              <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{chatTitle}</span>
                            )}
                          </div>
                          {text && <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{text}</p>}
                          {from && <p className="text-[10px] text-gray-400 mt-0.5">از: {from}</p>}
                        </div>
                        <button
                          onClick={() => { navigator.clipboard.writeText(String(chatId)); toast.success('Chat ID کپی شد'); }}
                          className="text-[10px] px-2 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-lg hover:bg-teal-100 transition flex-shrink-0"
                        >
                          کپی
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* API reference note */}
        <p className="text-[10px] text-gray-400 leading-relaxed">
          متدها: <span className="font-mono text-gray-500">getMe</span> · <span className="font-mono text-gray-500">getWebhookInfo</span> · <span className="font-mono text-gray-500">setWebhook</span> · <span className="font-mono text-gray-500">deleteWebhook</span> · <span className="font-mono text-gray-500">getUpdates</span> · <span className="font-mono text-gray-500">sendMessage</span>
          {' — '}
          <a href="https://docs.bale.ai/" target="_blank" rel="noopener noreferrer" className="text-teal-500 hover:underline inline-flex items-center gap-0.5">
            مستندات بله <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Channel Card ─────────────────────────────────────────────────────────────
export function ChannelCard({ channel, label, icon, accentClass }: {
  channel: 'telegram' | 'bale';
  label: string;
  icon: React.ReactNode;
  accentClass: string;
}) {
  const [config, setConfig] = useState<ChannelConfig>({ channel, ...BLANK });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testChatId, setTestChatId] = useState('');
  const [testMsg, setTestMsg] = useState('این یک پیام آزمایشی از سامانه است.');
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [supabaseTestResult, setSupabaseTestResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [webhookUrlError, setWebhookUrlError] = useState('');

  const loadedConfig = useRef<string | null>(null);
  const configSnapshot = useRef(''); configSnapshot.current = JSON.stringify(config);
  const liveRefreshRef = useLiveData(LIVE_DATA.social, async () => {
    if (!saving && !testing && loadedConfig.current === configSnapshot.current) await load();
  });

  const load = useCallback(async () => {
    if (!liveRefreshRef.current) setLoading(true);
    const { data } = await supabase
      .from('social_channel_configs')
      .select('*')
      .eq('channel', channel)
      .maybeSingle();
    if (data) { const next = { ...BLANK, ...data } as ChannelConfig; loadedConfig.current = JSON.stringify(next); setConfig(next); } else { loadedConfig.current = configSnapshot.current; }
    setLoading(false);
  }, [channel]);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof ChannelConfig, v: any) => {
    setConfig(c => ({ ...c, [k]: v }));
    if (k === 'webhook_url') {
      const val = String(v).trim();
      setWebhookUrlError(val && !val.startsWith('https://') ? 'Webhook URL باید با https:// شروع شود' : '');
    }
  };

  const save = async () => {
    if (!config.bot_token.trim()) { toast.error('توکن بات الزامی است'); return; }
    setSaving(true);
    const payload = {
      channel,
      bot_token: config.bot_token.trim(),
      bot_username: config.bot_username.trim(),
      default_chat_id: config.default_chat_id.trim(),
      is_active: config.is_active,
      webhook_url: config.webhook_url.trim(),
      webhook_secret: config.webhook_secret.trim(),
      redis_url: config.redis_url.trim(),
      ext_supabase_url: config.ext_supabase_url.trim(),
      ext_supabase_service_key: config.ext_supabase_service_key.trim(),
      notes: config.notes.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('social_channel_configs')
      .upsert(payload, { onConflict: 'channel' });
    if (error) { toast.error('خطا در ذخیره: ' + error.message); }
    else { toast.success(`تنظیمات ${label} ذخیره شد`); load(); }
    setSaving(false);
  };

  const sendTest = async () => {
    const chatId = testChatId.trim() || config.default_chat_id.trim();
    if (!chatId) { toast.error('Chat ID برای تست الزامی است'); return; }
    setTesting(true);
    setTestResult('idle');
    try {
      const data = await callProxy(channel, 'sendMessage', {
        chat_id: chatId,
        text: testMsg || 'پیام آزمایشی',
      });
      if (data.ok) {
        setTestResult('ok');
        toast.success('پیام آزمایشی با موفقیت ارسال شد');
      } else {
        setTestResult('error');
        toast.error('خطا: ' + (data.description || 'ارسال ناموفق'));
      }
    } catch {
      setTestResult('error');
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setTesting(false);
    }
  };

  const getBotInfo = async () => {
    setTokenStatus('idle');
    try {
      const data = await callProxy(channel, 'getMe');
      if (data.ok) {
        const username = (data.result.username || '').replace(/^@/, '');
        const firstName = data.result.first_name || '';
        set('bot_username', username);
        setTokenStatus('ok');
        toast.success(`بات "${firstName}" (@${username}) معتبر است`);
      } else {
        setTokenStatus('error');
        toast.error('توکن نامعتبر: ' + (data.description || ''));
      }
    } catch {
      setTokenStatus('error');
      toast.error('خطا در ارتباط با پراکسی');
    }
  };

  const generateSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(64);
    crypto.getRandomValues(arr);
    const secret = Array.from(arr).map(b => chars[b % chars.length]).join('');
    set('webhook_secret', secret);
    toast.success('Secret Token تولید شد');
  };

  const testSupabaseConnection = async () => {
    setTestingSupabase(true);
    setSupabaseTestResult('idle');
    try {
      const data = await callProxy('bale', 'testSupabaseConnection' as any);
      if (data.ok) {
        setSupabaseTestResult('ok');
        toast.success('اتصال Supabase موفق بود');
      } else {
        setSupabaseTestResult('error');
        toast.error('خطا در اتصال Supabase: ' + (data.description || ''));
      }
    } catch {
      setSupabaseTestResult('error');
      toast.error('خطا در ارتباط با پراکسی');
    } finally {
      setTestingSupabase(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 ${accentClass}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">{label}</h4>
            <p className="text-xs text-white/70">
              {config.bot_username ? `@${config.bot_username}` : 'بات تنظیم نشده'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.is_active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'}`}>
            {config.is_active ? 'فعال' : 'غیرفعال'}
          </span>
          <Toggle value={config.is_active} onChange={v => set('is_active', v)} color="bg-white/40" />
        </div>
      </div>

      <div className="p-5 space-y-5">
        <SetupGuide channel={channel} />

        {/* ── REQUIRED ── */}
        <SectionHeader icon={<Key className="w-3.5 h-3.5 text-gray-500" />} title="پارامترهای الزامی" />

        {/* Token — calls getMe */}
        <form onSubmit={event => { event.preventDefault(); void getBotInfo(); }}>
          <FieldLabel
            label="توکن بات"
            required
            hint={`از @BotFather دریافت می‌شود. احراز هویت بات با ${channel === 'bale' ? 'API بله (tapi.bale.ai)' : 'API تلگرام'}.`}
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className={inpMono + ' pl-10'}
                name="bot-token" aria-label="توکن بات" autoComplete="new-password"
                type={showToken ? 'text' : 'password'}
                value={config.bot_token}
                onChange={e => { set('bot_token', e.target.value); setTokenStatus('idle'); }}
                placeholder="123456789:AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
                dir="ltr"
              />
              <button type="button" onClick={() => setShowToken(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition flex-shrink-0 ${
                tokenStatus === 'ok'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                  : tokenStatus === 'error'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
              title="getMe"
            >
              {tokenStatus === 'ok'
                ? <CheckCircle className="w-3.5 h-3.5" />
                : tokenStatus === 'error'
                ? <XCircle className="w-3.5 h-3.5" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              تایید (getMe)
            </button>
          </div>
          {tokenStatus === 'ok' && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> توکن معتبر — یوزرنیم خودکار پر شد
            </p>
          )}
          {tokenStatus === 'error' && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> توکن نامعتبر یا خطای شبکه
            </p>
          )}
        </form>

        {/* Webhook URL */}
        <div>
          <FieldLabel
            label="Webhook URL"
            required={channel === 'bale'}
            hint={
              channel === 'bale'
                ? 'آدرس HTTPS که سرور بله آپدیت‌ها را به آن POST می‌کند. پس از ذخیره، با دکمه «ثبت Webhook» آن را در سرور بله ثبت کنید.'
                : 'برای دریافت پیام از کاربران. اگر فقط ارسال می‌کنید نیازی نیست.'
            }
          />
          <input
            className={`${inpMono}${webhookUrlError ? ' border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`}
            name="webhook_url" aria-label="آدرس وب‌هوک" value={config.webhook_url}
            onChange={e => set('webhook_url', e.target.value)}
            placeholder={
              channel === 'bale'
                ? 'https://your-project.supabase.co/functions/v1/bale-webhook'
                : 'https://your-project.supabase.co/functions/v1/telegram-webhook'
            }
            dir="ltr"
          />
          {webhookUrlError && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {webhookUrlError}
            </p>
          )}
        </div>

        {/* Bot username */}
        <div>
          <FieldLabel label="یوزرنیم بات" hint="به صورت خودکار با کلیک روی «تایید (getMe)» پر می‌شود — غیر قابل ویرایش دستی." />
          <div className="relative">
            <input
              className={inp + ' bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'}
              name="bot-username" aria-label="نام کاربری بات" value={config.bot_username ? `@${config.bot_username}` : ''}
              readOnly
              placeholder="پس از تایید توکن پر می‌شود"
              dir="ltr"
            />
            {config.bot_username && (
              <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 pointer-events-none" />
            )}
          </div>
        </div>

        {/* Default Chat ID */}
        <div>
          <FieldLabel
            label="Chat ID پیش‌فرض (گروه/کانال)"
            hint="هنگامی که Chat ID خاصی برای کاربر تعریف نشده باشد استفاده می‌شود. برای دریافت Chat ID از دکمه «دریافت آپدیت‌ها» استفاده کنید."
          />
          <input
            className={inpMono}
            name="default_chat_id" aria-label="شناسه پیش‌فرض گفتگو" value={config.default_chat_id}
            onChange={e => set('default_chat_id', e.target.value)}
            placeholder="-100123456789 (گروه) یا 123456789 (کاربر)"
            dir="ltr"
          />
        </div>

        {/* ── BALE-SPECIFIC ── */}
        {channel === 'bale' && (
          <>
            {/* Webhook Manager */}
            <SectionHeader icon={<Webhook className="w-3.5 h-3.5 text-teal-500" />} title="مدیریت Webhook" />
            <BaleWebhookManager webhookUrl={config.webhook_url} webhookSecret={config.webhook_secret} />

            {/* Optional params */}
            <SectionHeader
              icon={<Shield className="w-3.5 h-3.5 text-amber-500" />}
              title="پارامترهای اختیاری"
              badge="توصیه می‌شود"
            />

            {/* Webhook Secret */}
            <div>
              <FieldLabel
                label="Webhook Secret Token"
                hint="رشته تصادفی برای تایید اعتبار درخواست‌های ورودی از سرور بله. توسط شما تولید می‌شود. (۶۴ کاراکتر توصیه می‌شود)"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <SecretInput
                    value={config.webhook_secret}
                    onChange={v => set('webhook_secret', v)}
                    placeholder="a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7b8c9d0e1F2"
                  />
                </div>
                <button
                  type="button"
                  onClick={generateSecret}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-xl text-xs font-medium transition flex-shrink-0"
                  title="تولید Secret Token تصادفی"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  تولید
                </button>
              </div>
              {config.webhook_secret && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Secret Token هنگام ثبت Webhook به سرور بله ارسال می‌شود
                </p>
              )}
            </div>

            {/* Redis URL */}
            <div>
              <FieldLabel
                label="Redis URL"
                hint="آدرس Redis برای مدیریت وضعیت بات. برای ارسال ساده اعلان الزامی نیست."
              />
              <input
                className={inpMono}
                name="redis_url" aria-label="آدرس Redis" value={config.redis_url}
                onChange={e => set('redis_url', e.target.value)}
                placeholder="redis://localhost:6379/0"
                dir="ltr"
              />
            </div>

            {/* Supabase block */}
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 px-4 py-3 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">اتصال Supabase (ذخیره‌سازی داده‌های بات)</p>
                </div>
                <button
                  type="button"
                  onClick={testSupabaseConnection}
                  disabled={testingSupabase}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50 ${
                    supabaseTestResult === 'ok'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                      : supabaseTestResult === 'error'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700'
                      : 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                  }`}
                  title="ابتدا تنظیمات را ذخیره کنید سپس تست کنید"
                >
                  {testingSupabase
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : supabaseTestResult === 'ok'
                    ? <CheckCircle className="w-3 h-3" />
                    : supabaseTestResult === 'error'
                    ? <XCircle className="w-3 h-3" />
                    : <Zap className="w-3 h-3" />}
                  تست اتصال
                </button>
              </div>
              <div>
                <FieldLabel
                  label="Supabase URL"
                  hint="آدرس پروژه Supabase برای ذخیره‌سازی پایدار."
                />
                <input
                  className={inpMono}
                  name="ext_supabase_url" aria-label="آدرس Supabase" value={config.ext_supabase_url}
                  onChange={e => set('ext_supabase_url', e.target.value)}
                  placeholder="https://your-supabase-project.supabase.co"
                  dir="ltr"
                />
              </div>
              <div>
                <FieldLabel
                  label="Supabase Service Role Key"
                  hint="کلید سرویس‌رول برای احراز هویت backend-to-backend. هرگز در frontend استفاده نشود."
                />
                <SecretInput
                  value={config.ext_supabase_service_key}
                  onChange={v => set('ext_supabase_service_key', v)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                />
              </div>
            </div>

            {/* Personal Chat ID note */}
            <div className="rounded-xl bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">اتصال به Chat ID شخصی کاربران</p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                هر کاربر می‌تواند Chat ID بله خود را در بخش <strong>پروفایل → شبکه‌های اجتماعی</strong> وارد کند.
                وقتی این بات فعال باشد، اعلان‌های جلسه به Chat ID شخصی ارسال می‌شوند؛ در غیر این صورت از Chat ID پیش‌فرض استفاده می‌شود.
              </p>
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <FieldLabel label="یادداشت مدیر" />
          <textarea
            className={inp + ' resize-none'}
            rows={2}
            name="notes" aria-label="یادداشت مدیر" value={config.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="توضیحات اضافی..."
          />
        </div>

        {/* Save */}
        <button onClick={save} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition shadow-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
        </button>

        {/* ── TEST: sendMessage ── */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              ارسال پیام آزمایشی
              <span className="text-[10px] font-mono text-gray-400 mr-2">(sendMessage)</span>
            </p>
            {testResult === 'ok' && <CheckCircle className="w-4 h-4 text-green-500" />}
            {testResult === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
          </div>
          <div>
            <label htmlFor={`${channel}-test-chat-id`} className="block text-xs text-gray-500 mb-1">
              Chat ID هدف
              <span className="text-gray-400"> — اختیاری، از Chat ID پیش‌فرض استفاده می‌کند</span>
            </label>
            <input
              className={inpMono}
              id={`${channel}-test-chat-id`} value={testChatId}
              onChange={e => setTestChatId(e.target.value)}
              placeholder="-100123456789"
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor={`${channel}-test-text`} className="block text-xs text-gray-500 mb-1">متن پیام (text)</label>
            <textarea
              className={inp + ' resize-none'}
              rows={2}
              id={`${channel}-test-text`} value={testMsg}
              onChange={e => setTestMsg(e.target.value)}
            />
          </div>
          <button onClick={sendTest} disabled={testing}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? 'در حال ارسال...' : 'ارسال پیام تست'}
          </button>
          {testResult === 'error' && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400">ارسال ناموفق. توکن و Chat ID را بررسی کنید. مطمئن شوید بات عضو گروه است و دسترسی ارسال پیام دارد.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
