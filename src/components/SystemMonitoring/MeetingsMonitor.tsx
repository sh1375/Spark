import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarDays, ListFilter as Filter, Search, EllipsisVertical as MoreVertical, CreditCard as Edit2, Trash2, GitBranch, X, Loader as Loader2, RefreshCw } from 'lucide-react';
import { type MeetingRow, type Profile } from './types';
import { toJalaliTime, toJalali, jalaliToGregorian, SEL } from './utils';
import { Badge2, DataField } from './DisplayComponents';
import { JalaliInput } from './JalaliInput';
import { MeetingFlowModal } from './MeetingFlowModal';
import { MeetingEditModal } from './MeetingEditModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { priorityLabel, priorityColor, statusLabel, statusColor } from './utils';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

function MeetingsMonitor({ profiles }: { profiles: Profile[] }) {
  const liveRefreshRef = useLiveData(LIVE_DATA.meetings, async () => { await loadMeetings(); });
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStatusType, setFilterStatusType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterShared, setFilterShared] = useState('all');
  const [filterMembersOnly, setFilterMembersOnly] = useState('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [flowMeeting, setFlowMeeting] = useState<MeetingRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editMeeting, setEditMeeting] = useState<MeetingRow | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadMeetings = useCallback(async () => {
    if (!liveRefreshRef.current) setLoading(true);
    const { data, error } = await supabase.from('meetings').select(`
      id, subject, request_date, duration, location, representative, phone,
      notes, priority, status, status_type, created_at, user_id, start_time,
      end_time, guest_emails, members_only, repeat_type,
      participants(id, name), actions(id, title, status, assignee)
    `).order('created_at', { ascending: false });
    if (error) { toast.error('خطا در بارگذاری جلسات'); setLoading(false); return; }

    const rows: MeetingRow[] = (data || []).map((m: any) => ({
      ...m,
      creator_name: profiles.find(p => p.user_id === m.user_id)?.full_name || null,
    }));

    const ids = rows.map(r => r.id);
    const counts = new Map<string, number>();
    for (let offset = 0; offset < ids.length; offset += 50) {
      const { data: shared, error: sharedError } = await supabase.from('shared_meetings')
        .select('meeting_id').in('meeting_id', ids.slice(offset, offset + 50));
      if (sharedError) {
        toast.error('خطا در بارگذاری اشتراک‌های جلسات');
        setLoading(false);
        return;
      }
      for (const row of shared || []) counts.set(row.meeting_id, (counts.get(row.meeting_id) ?? 0) + 1);
    }
    rows.forEach(row => { row.shared_count = counts.get(row.id) ?? 0; });
    setMeetings(rows);
    setLoading(false);
  }, [profiles]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const deleteMeeting = async (id: string) => {
    await supabase.from('participants').delete().eq('meeting_id', id);
    await supabase.from('actions').delete().eq('meeting_id', id);
    const { error } = await supabase.from('meetings').delete().eq('id', id);
    if (error) { toast.error('خطا در حذف'); return; }
    toast.success('جلسه حذف شد');
    setDeleteId(null);
    loadMeetings();
  };

  const filtered = meetings.filter(m => {
    if (search && !m.subject?.toLowerCase().includes(search.toLowerCase()) && !m.representative?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterStatusType !== 'all' && m.status_type !== filterStatusType) return false;
    if (filterPriority !== 'all' && m.priority !== filterPriority) return false;
    if (filterUser !== 'all' && m.user_id !== filterUser) return false;
    if (filterDateFrom) {
      const fromIso = jalaliToGregorian(filterDateFrom);
      if (fromIso && m.created_at && new Date(m.created_at) < new Date(fromIso)) return false;
    }
    if (filterDateTo) {
      const toIso = jalaliToGregorian(filterDateTo);
      if (toIso && m.created_at && new Date(m.created_at) > new Date(toIso)) return false;
    }
    if (filterShared === 'yes' && !(m.shared_count && m.shared_count > 0)) return false;
    if (filterShared === 'no' && (m.shared_count && m.shared_count > 0)) return false;
    if (filterMembersOnly === 'yes' && !m.members_only) return false;
    if (filterMembersOnly === 'no' && m.members_only) return false;
    return true;
  });

  const clearFilters = () => { setSearch(''); setFilterStatus('all'); setFilterStatusType('all'); setFilterPriority('all'); setFilterUser('all'); setFilterDateFrom(''); setFilterDateTo(''); setFilterShared('all'); setFilterMembersOnly('all'); };
  const hasFilter = search || filterStatus !== 'all' || filterStatusType !== 'all' || filterPriority !== 'all' || filterUser !== 'all' || filterDateFrom || filterDateTo || filterShared !== 'all' || filterMembersOnly !== 'all';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-sm flex-shrink-0">
          <CalendarDays className="w-9 h-9 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">مدیریت جلسات</h2>
          <p className="text-sm text-gray-500">{filtered.length} جلسه از {meetings.length}</p>
        </div>
        <button onClick={loadMeetings} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 transition-colors">
          <RefreshCw className="w-4 h-4" /> بارگذاری
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-blue-500" /><span className="text-sm font-semibold text-gray-700 dark:text-gray-300">فیلترهای پیشرفته</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input name="search" aria-label="جستجوی جلسه" value={search} onChange={e => setSearch(e.target.value)} placeholder="جستجو موضوع / نماینده..." className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select name="filterStatus" aria-label="وضعیت جلسه" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SEL}>
            <option value="all">همه وضعیت‌ها</option>
            <option value="open">باز</option>
            <option value="closed">بسته</option>
          </select>
          <select name="filterStatusType" aria-label="نوع وضعیت جلسه" value={filterStatusType} onChange={e => setFilterStatusType(e.target.value)} className={SEL}>
            <option value="all">همه نوع‌ها</option>
            <option value="requested">درخواست شده</option>
            <option value="approved">تایید شده</option>
          </select>
          <select name="filterPriority" aria-label="اولویت" value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={SEL}>
            <option value="all">همه اولویت‌ها</option>
            <option value="high">بالا</option>
            <option value="medium">متوسط</option>
            <option value="low">پایین</option>
          </select>
          <select name="filterUser" aria-label="کاربر" value={filterUser} onChange={e => setFilterUser(e.target.value)} className={SEL}>
            <option value="all">همه کاربران</option>
            {profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
          </select>
          <select name="filterShared" aria-label="وضعیت اشتراک" value={filterShared} onChange={e => setFilterShared(e.target.value)} className={SEL}>
            <option value="all">اشتراک: همه</option>
            <option value="yes">به اشتراک گذاشته</option>
            <option value="no">گذاشته نشده</option>
          </select>
          <select name="filterMembersOnly" aria-label="محدودهٔ اعضا" value={filterMembersOnly} onChange={e => setFilterMembersOnly(e.target.value)} className={SEL}>
            <option value="all">دسترسی: همه</option>
            <option value="yes">فقط اعضا</option>
            <option value="no">عمومی</option>
          </select>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-400">از (شمسی)</span>
              <JalaliInput value={filterDateFrom} onChange={setFilterDateFrom} placeholder="1403/01/01" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-400">تا (شمسی)</span>
              <JalaliInput value={filterDateTo} onChange={setFilterDateTo} placeholder="1403/12/29" />
            </div>
          </div>
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="mt-3 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600">
            <X className="w-3.5 h-3.5" /> پاک کردن فیلترها
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">هیچ جلسه‌ای یافت نشد</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{m.subject}</h4>
                    {m.priority && <Badge2 label={priorityLabel[m.priority] || m.priority} colorCls={priorityColor[m.priority] || 'bg-gray-100 text-gray-500'} />}
                    {m.status && <Badge2 label={statusLabel[m.status] || m.status} colorCls={statusColor[m.status] || 'bg-gray-100 text-gray-500'} />}
                    {m.status_type && <Badge2 label={statusLabel[m.status_type] || m.status_type} colorCls={statusColor[m.status_type] || 'bg-gray-100 text-gray-500'} />}
                    {(m.shared_count || 0) > 0 && <Badge2 label={`اشتراک ${m.shared_count}`} colorCls="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" />}
                    {m.members_only && <Badge2 label="فقط اعضا" colorCls="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400" />}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                    <DataField label="شناسه" value={<span className="font-mono text-gray-400 text-xs">{m.id.slice(0, 8)}…</span>} />
                    <DataField label="نماینده" value={m.representative} />
                    <DataField label="ایجادکننده" value={m.creator_name} />
                    <DataField label="تاریخ ایجاد" value={toJalali(m.created_at)} />
                    <DataField label="تاریخ درخواست" value={m.request_date ? toJalali(m.request_date) : '—'} />
                    <DataField label="شروع" value={toJalaliTime(m.start_time)} />
                    <DataField label="پایان" value={toJalaliTime(m.end_time)} />
                    <DataField label="مدت" value={m.duration} />
                    <DataField label="مکان" value={m.location} />
                    <DataField label="تکرار" value={m.repeat_type} />
                    <DataField label="شرکت‌کنندگان" value={`${m.participants?.length || 0} نفر`} />
                    <DataField label="اقدامات" value={`${m.actions?.length || 0} مورد`} />
                  </div>
                  {m.notes && <p className="mt-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-2.5 py-1.5 line-clamp-2">{m.notes}</p>}
                  {m.participants && m.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.participants.slice(0, 5).map(p => <span key={p.id} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 rounded-full text-xs">{p.name}</span>)}
                      {m.participants.length > 5 && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full text-xs">+{m.participants.length - 5}</span>}
                    </div>
                  )}
                </div>
                <div className="relative flex-shrink-0" ref={menuOpen === m.id ? menuRef : undefined}>
                  <button onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {menuOpen === m.id && (
                    <div className="absolute left-0 top-8 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 min-w-[140px] overflow-hidden">
                      <button onClick={() => { setEditMeeting(m); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <Edit2 className="w-3.5 h-3.5 text-blue-500" /> ویرایش
                      </button>
                      <button onClick={() => { setFlowMeeting(m); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <GitBranch className="w-3.5 h-3.5 text-teal-500" /> فلوچارت
                      </button>
                      <button onClick={() => { setDeleteId(m.id); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {flowMeeting && <MeetingFlowModal meeting={flowMeeting} profiles={profiles} onClose={() => setFlowMeeting(null)} />}
      {editMeeting && <MeetingEditModal meeting={editMeeting} profiles={profiles} onClose={() => setEditMeeting(null)} onSaved={loadMeetings} />}
      {deleteId && <ConfirmDeleteModal message="آیا از حذف این جلسه و تمام داده‌های آن اطمینان دارید؟ این عملیات برگشت‌پذیر نیست." onConfirm={() => deleteMeeting(deleteId)} onCancel={() => setDeleteId(null)} />}
    </div>
  );
}

export { MeetingsMonitor };
