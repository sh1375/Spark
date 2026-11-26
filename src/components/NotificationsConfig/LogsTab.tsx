import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState, useEffect, useCallback } from 'react';
import moment from 'moment-jalaali';
import { Bell, Users, Check, Loader as Loader2, RefreshCw, CircleCheck as CheckCircle, Clock, ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

import {
  TEMPLATE_CATEGORIES as NOTIF_CATEGORIES,
  TEMPLATE_EVENT_TYPES as EVENT_TYPES,
} from '../../config/templateCatalog';
import { JalaliDateFilter } from './JalaliDateFilter';
import { jalaliToUtcRange } from './jalaliDateFilterUtils';
import type { NotifLog } from './types';

export function LogsTab() {
  const liveRefreshRef = useLiveData(LIVE_DATA.notifications, async () => { await load(); });
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterRead, setFilterRead] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterEventType, setFilterEventType] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    if (!liveRefreshRef.current) setLoading(true);
    let q = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filterType !== 'all') q = q.eq('type', filterType);
    if (filterRead === 'read') q = q.eq('read', true);
    if (filterRead === 'unread') q = q.eq('read', false);
    if (filterEventType !== 'all') q = q.eq('template_event_type', filterEventType);
    if (filterDate) {
      const range = jalaliToUtcRange(filterDate);
      if (range) {
        q = q.gte('created_at', range.start).lte('created_at', range.end);
      }
    }

    const { data, count } = await q;
    if (!data) { setLoading(false); return; }

    const userIds = Array.from(new Set((data as any[]).map(r => r.user_id).filter(Boolean)));
    let profileMap: Record<string, { full_name: string; email: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles_public').select('user_id, full_name, username').in('user_id', userIds);
      for (const p of (profiles || [])) {
        profileMap[p.user_id] = { full_name: p.full_name || '', email: p.username || '' };
      }
    }

    setLogs((data as any[]).map(r => ({
      ...r,
      recipient_name: profileMap[r.user_id]?.full_name || (r.user_id ? 'کاربر حذف‌شده' : 'گیرنده نامشخص'),
      recipient_email: profileMap[r.user_id]?.email || '',
    })));
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, filterType, filterRead, filterDate, filterEventType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [filterType, filterRead, filterDate, filterEventType]);

  const clearAllNotifications = async () => {
    if (clearing) return;
    const confirmed = window.confirm('تمام اعلان‌ها حذف شوند؟ این عملیات قابل بازگشت نیست.');
    if (!confirmed) return;

    setClearing(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;

      setLogs([]);
      setTotalCount(0);
      setExpandedId(null);
      setPage(0);
      toast.success('تمام اعلان‌ها حذف شدند');
    } catch (error: any) {
      toast.error(error?.message || 'حذف اعلان‌ها ناموفق بود');
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const typeLabel = (t: string) => NOTIF_CATEGORIES.find(c => c.key === t)?.label || t;
  const eventTypeLabel = (et: string) => EVENT_TYPES.find(e => e.key === et)?.label || et || '—';

  const availableEventTypes = filterType !== 'all'
    ? EVENT_TYPES.filter(e => e.category === filterType)
    : EVENT_TYPES;

  const TYPE_COLORS: Record<string, string> = {
    meeting:  'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    task:     'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    chat:     'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    channel:  'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
    calendar: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
    note:     'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    system:   'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  };

  const formatDate = (iso: string) => {
    const m = moment(iso);
    return `${m.jYear()}/${String(m.jMonth()+1).padStart(2,'0')}/${String(m.jDate()).padStart(2,'0')} ${String(m.hours()).padStart(2,'0')}:${String(m.minutes()).padStart(2,'0')}`;
  };

  const readCount = logs.filter(l => l.read).length;
  const unreadCount = logs.filter(l => !l.read).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'کل اعلان‌ها', value: totalCount, icon: Bell, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
          { label: 'خوانده‌شده', value: readCount, icon: CheckCircle, color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
          { label: 'خوانده‌نشده', value: unreadCount, icon: Clock, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-36">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">دسته‌بندی</label>
          <div className="relative">
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setFilterEventType('all'); }}
              className="appearance-none w-full text-sm pr-3 pl-7 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="all">همه دسته‌ها</option>
              {NOTIF_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">نوع رویداد</label>
          <div className="relative">
            <select value={filterEventType} onChange={e => setFilterEventType(e.target.value)}
              className="appearance-none w-full text-sm pr-3 pl-7 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="all">همه رویدادها</option>
              {availableEventTypes.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1 min-w-32">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">وضعیت خواندن</label>
          <div className="relative">
            <select value={filterRead} onChange={e => setFilterRead(e.target.value)}
              className="appearance-none w-full text-sm pr-3 pl-7 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="all">همه</option>
              <option value="read">خوانده‌شده</option>
              <option value="unread">خوانده‌نشده</option>
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">تاریخ</label>
          <JalaliDateFilter value={filterDate} onChange={setFilterDate} />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden lg:inline text-[11px] text-gray-400">نگهداری خودکار: ۷ روز</span>
          <button
            type="button"
            onClick={clearAllNotifications}
            disabled={clearing || totalCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 text-xs font-medium transition-colors"
          >
            {clearing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            خالی کردن اعلان‌ها
          </button>
          <button onClick={() => load()}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition-colors"
            aria-label="بارگذاری مجدد اعلان‌ها">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading && <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>}
        {!loading && logs.length === 0 && (
          <div className="py-14 text-center">
            <Bell className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">اعلانی یافت نشد</p>
          </div>
        )}
        {!loading && logs.length > 0 && (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {logs.map(log => (
              <div key={log.id}>
                <div
                  className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${log.read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[log.type] || TYPE_COLORS.system}`}>
                        {typeLabel(log.type)}
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{log.title}</span>
                      {!log.read && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">جدید</span>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{log.message}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {log.recipient_name || log.recipient_email || log.user_id.slice(0, 8) + '…'}
                      </span>
                      {log.sender_name && (
                        <span className="text-xs text-gray-400">از: {log.sender_name}</span>
                      )}
                      <span className="text-xs text-gray-300 dark:text-gray-500">{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} />
                </div>

                {expandedId === log.id && (
                  <div className="px-4 pb-4 pt-1 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-gray-400">دریافت‌کننده:</span>
                        <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{log.recipient_name || '—'}</span>
                        {log.recipient_email && <span className="text-gray-400 text-[11px]">({log.recipient_email})</span>}
                      </div>
                      <div>
                        <span className="text-gray-400">فرستنده:</span>
                        <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{log.sender_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">دسته:</span>
                        <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{typeLabel(log.type)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">نوع رویداد:</span>
                        <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{eventTypeLabel(log.template_event_type || '')}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">مخاطب:</span>
                        <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{log.template_audience || 'all'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">وضعیت:</span>
                        <span className={`mr-2 font-medium ${log.read ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {log.read ? 'خوانده‌شده' : 'خوانده‌نشده'}
                        </span>
                      </div>
                      {log.template_id && (
                        <div>
                          <span className="text-gray-400">قالب:</span>
                          <span className="mr-2 font-mono text-[11px] text-gray-500">{log.template_id.slice(0, 8)}…</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-400">متن اعلان:</span>
                      <p className="mt-1 text-gray-700 dark:text-gray-200 leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-100 dark:border-gray-600">{log.message}</p>
                    </div>
                    {log.action_url && (
                      <div>
                        <span className="text-gray-400">لینک:</span>
                        <span className="mr-2 font-mono text-gray-600 dark:text-gray-300">{log.action_url}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">زمان:</span>
                      <span className="mr-2 font-medium text-gray-700 dark:text-gray-200">{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 text-xs">{totalCount} اعلان — صفحه {page + 1} از {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 text-gray-600 dark:text-gray-300 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 text-gray-600 dark:text-gray-300 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
