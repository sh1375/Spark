import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, Clock, Search, User, X, Trash2, Loader as Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadCallHistory, callHistoryLoadError, type CallHistoryClient } from './callHistoryLoader';
import { supabase } from '../../lib/supabase';
import moment from 'moment-jalaali';
import type { UserProfile } from './types';

interface CallRecord {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
  otherUser: UserProfile | null;
  created_at: string;
  duration_seconds: number;
}

interface Props {
  currentUserId: string;
  onStartCall: (otherUser: UserProfile, callType: 'audio' | 'video') => void;
  onClose?: () => void;
}

export function CallHistoryPage({ currentUserId, onStartCall, onClose }: Props) {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'missed'>('all');

  const [error, setError] = useState<string | null>(null);
  const [canClear, setCanClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const requestRef = useRef(0);

  const fetchHistory = useCallback(async () => {
    const request = ++requestRef.current;
    const { data, error: loadError, canClear: supportsClear } = await loadCallHistory(supabase as unknown as CallHistoryClient, currentUserId);
    if (request !== requestRef.current) return;
    setCanClear(supportsClear);
    if (loadError || !data) { setError(callHistoryLoadError(loadError)); setLoading(false); return; }
    setError(null);
    if (data.length === 0) { setRecords([]); setLoading(false); return; }

    const otherIds = data.map(r => r.caller_id === currentUserId ? r.callee_id : r.caller_id);
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('user_id, full_name, username')
      .in('user_id', [...new Set(otherIds)]);

    if (request !== requestRef.current) return;
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setRecords(data.map((r: any) => ({
      ...r,
      otherUser: profileMap.get(r.caller_id === currentUserId ? r.callee_id : r.caller_id) || null,
    })));
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    setRecords([]);
    setLoading(true);
    return () => { requestRef.current++; };
  }, [currentUserId, fetchHistory]);

  useLiveData([...LIVE_DATA.calls, 'profiles'], fetchHistory, !!currentUserId, undefined, currentUserId);

  const clearHistory = async () => {
    if (clearing || !canClear) return;
    setClearing(true);
    requestRef.current++;
    try {
      const { error: clearError } = await supabase.rpc('clear_my_call_history');
      if (clearError) throw clearError;
      requestRef.current++;
      setRecords([]);
      setConfirmClear(false);
      toast.success('تاریخچه تماس‌ها برای شما پاک شد');
      await fetchHistory();
    } catch {
      toast.error('حذف تاریخچه تماس‌ها ناموفق بود؛ دوباره تلاش کنید');
    } finally { setClearing(false); }
  };

  const filtered = records.filter(r => {
    const name = r.otherUser?.full_name || r.otherUser?.username || r.otherUser?.email || '';
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'missed') return r.status === 'missed' || (r.status === 'declined' && r.callee_id === currentUserId);
    return true;
  });

  const getCallIcon = (r: CallRecord) => {
    const isCaller = r.caller_id === currentUserId;
    if (r.status === 'missed' || (r.status === 'declined' && !isCaller)) {
      return <PhoneMissed className="w-4 h-4 text-red-400" />;
    }
    if (isCaller) return <PhoneOutgoing className="w-4 h-4 text-teal-400" />;
    return <PhoneIncoming className="w-4 h-4 text-blue-400" />;
  };

  const getCallLabel = (r: CallRecord) => {
    const isCaller = r.caller_id === currentUserId;
    if (r.status === 'missed' || (r.status === 'declined' && !isCaller)) return 'از دست رفته';
    if (isCaller) return 'تماس خروجی';
    return 'تماس ورودی';
  };

  const formatDuration = (s: number) => {
    if (!s || s === 0) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m} دقیقه ${sec} ثانیه` : `${sec} ثانیه`;
  };

  const otherName = (r: CallRecord) => r.otherUser?.full_name || r.otherUser?.username || r.otherUser?.email || 'کاربر';

  return (
    <div className="chat-call-history flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="chat-workspace-sidebar chat-call-history-header px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">تماس‌ها</h2>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">تاریخچه تماس‌های سازمانی</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setConfirmClear(v => !v)} disabled={clearing || loading || !canClear || records.length === 0}
              aria-label="حذف تاریخچه تماس‌ها" title="حذف تاریخچه تماس‌ها"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30">
              <Trash2 className="h-4 w-4" />
            </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          </div>
        </div>
        {confirmClear && (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
            <p className="text-xs leading-6 text-gray-700 dark:text-gray-200">همه سابقه تماس‌های پایان‌یافته فقط برای شما حذف شود؟ سابقه طرف مقابل و تماس‌های در حال انجام حفظ می‌شود.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={clearing} onClick={clearHistory} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-medium text-white disabled:opacity-50">
                {clearing && <Loader2 className="h-4 w-4 animate-spin" />}حذف تاریخچه
              </button>
              <button type="button" disabled={clearing} onClick={() => setConfirmClear(false)} className="min-h-10 rounded-lg px-3 text-xs text-gray-600 dark:text-gray-300">انصراف</button>
            </div>
          </div>
        )}
        {error && <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{error}<button type="button" onClick={() => { void fetchHistory(); }} aria-label="تلاش مجدد" className="inline-flex h-10 w-10 shrink-0 items-center justify-center"><RefreshCw className="h-4 w-4" /></button></div>}

        {!canClear && !loading && !error && (
          <p role="status" className="mb-3 rounded-xl bg-gray-50 p-3 text-xs leading-6 text-gray-500 dark:bg-gray-800 dark:text-gray-400">تاریخچه قابل مشاهده است؛ برای فعال‌شدن حذف تاریخچه، به‌روزرسانی دیتابیس باید تکمیل شود.</p>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="جستجوی مخاطب"
            placeholder="جستجوی مخاطب..."
            className="w-full pr-9 pl-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-teal-400 dark:text-white placeholder-gray-400"
          />
        </div>

        {/* Tabs */}
        <div role="group" aria-label="فیلتر تاریخچه تماس" className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {([{ key: 'all', label: 'همه' }, { key: 'missed', label: 'از دست رفته' }] as const).map(t => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${tab === t.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="chat-call-history-list flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">در حال بارگذاری...</div>
        ) : error && records.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">نمایش تاریخچه فعلاً امکان‌پذیر نیست؛ دوباره تلاش کنید.</div>
        ) : filtered.length === 0 ? (
          <div className="chat-call-history-empty flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Phone className="w-10 h-10 opacity-30" />
            <p className="text-sm">تماسی یافت نشد</p>
          </div>
        ) : (
          filtered.map(r => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {otherName(r)[0]?.toUpperCase() || <User className="w-5 h-5" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {getCallIcon(r)}
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{otherName(r)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs ${(r.status === 'missed' || (r.status === 'declined' && r.callee_id === currentUserId)) ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {getCallLabel(r)}
                  </span>
                  {r.duration_seconds > 0 && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDuration(r.duration_seconds)}
                    </span>
                  )}
                  <span className="text-xs text-gray-300 dark:text-gray-600">
                    {moment(r.created_at).format('HH:mm jDD/jMM')}
                  </span>
                </div>
              </div>

              {/* Call back buttons */}
              {r.otherUser && (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onStartCall(r.otherUser!, 'audio')}
                    className="w-9 h-9 rounded-full bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 transition-colors"
                    title="تماس صوتی"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onStartCall(r.otherUser!, 'video')}
                    className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 transition-colors"
                    title="تماس تصویری"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
