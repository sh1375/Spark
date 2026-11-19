import { useLiveRevision, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePermissions } from '../../context/PermissionsContext';
import { formatJalaliDateForDisplay, jalaliToGregorianDate, gregorianToJalaliDate } from '../../lib/minutesDate';
import type { PickerDecision } from '../../lib/linkedAgendaDecisions';
import { linkedDecisionAgendaTitle } from '../../lib/linkedAgendaDecisions';

type PickerResponse = { items: PickerDecision[]; total: number };
const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  ['','همه وضعیت‌ها'], ['not_started','شروع‌نشده'], ['planned','برنامه‌ریزی‌شده'],
  ['in_progress','در جریان'],['waiting_coordination','در انتظار هماهنگی'],
  ['waiting_approval','در انتظار تأیید'],['completed','تکمیل‌شده'],['stopped','متوقف‌شده'],
] as const;
const statusName = (status: string) => STATUS_OPTIONS.find(([key]) => key === status)?.[1] || status;

export function AgendaDecisionPicker({ existingIds, onSelect, onClose }: {
  existingIds: string[];
  onSelect: (decisions: PickerDecision[]) => void;
  onClose: () => void;
}) {
  const { isAdmin } = usePermissions();
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [referenceFields, setReferenceFields] = useState({ minute: '', decision: '' });
  const [referenceSaving, setReferenceSaving] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const revision = useLiveRevision(LIVE_DATA.minutes, overdueOnly);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [response, setResponse] = useState<PickerResponse>({ items: [], total: 0 });
  const [selected, setSelected] = useState<Record<string, PickerDecision>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const existing = useMemo(() => new Set(existingIds), [existingIds]);
  const selectedItems = Object.values(selected).filter(item => !existing.has(item.id));
  const normalizeDigits = (v: string) => v.replace(/[۰-۹٠-٩]/g, c =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c)));

  const saveReferences = async (item: PickerDecision) => {
    if (!isAdmin || referenceSaving || (!referenceFields.minute.trim() && !referenceFields.decision.trim())) return;
    setReferenceSaving(true); setReferenceError('');
    try {
      const { data, error: saveError } = await (supabase as any).rpc('set_minutes_agenda_official_references_v1', {
        p_decision_id: item.id,
        p_minute_number: referenceFields.minute.trim() || null,
        p_decision_number: referenceFields.decision.trim() || null,
      });
      if (saveError) throw saveError;
      const minuteNumber = data.minute_number as string | null;
      const decisionNumber = data.decision_number as string | null;
      setResponse(prev => ({
        ...prev,
        items: prev.items.map(row => ({
          ...row,
          minute_number: row.minute_id === item.minute_id ? minuteNumber : row.minute_number,
          decision_number: row.id === item.id ? decisionNumber : row.decision_number,
        })),
      }));
      setSelected(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          if (next[id].minute_id === item.minute_id) next[id] = { ...next[id], minute_number: minuteNumber };
          if (id === item.id) next[id] = { ...next[id], decision_number: decisionNumber };
        });
        return next;
      });
      setEditingReferenceId(null);
    } catch {
      setReferenceError('ثبت شماره رسمی ناموفق بود. مجوز مدیر، تکراری‌نبودن شماره مصوبه و اطلاعات ورودی را بررسی کنید.');
    } finally { setReferenceSaving(false); }
  };
  useEffect(() => { setOffset(0); }, [query, status, dateFrom, dateTo]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      const from = dateFrom.trim() ? jalaliToGregorianDate(dateFrom.trim()) : null;
      const to = dateTo.trim() ? jalaliToGregorianDate(dateTo.trim()) : null;
      if ((dateFrom.trim() && !from) || (dateTo.trim() && !to) || (from && to && from > to)) {
        if (!cancelled) { setLoading(false); setError('بازه تاریخ شمسی نامعتبر است.'); setResponse({ items: [], total: 0 }); }
        return;
      }
      try {
        const { data, error: requestError } = await supabase.rpc('pick_meeting_agenda_decisions_v2', {
          p_search: jalaliToGregorianDate(query.trim()) || normalizeDigits(query.trim()) || null,
          p_status: status || null,
          p_owner_user_id: null,
          p_date_from: from,
          p_date_to: to,
          p_limit: PAGE_SIZE, p_offset: offset, p_overdue_only: overdueOnly,
        });
        if (requestError) throw requestError;
        if (!data || !Array.isArray(data.items) || typeof data.total !== 'number') throw Error('INVALID_PICKER_RESPONSE');
        if (!cancelled) setResponse(data as PickerResponse);
      } catch {
        if (!cancelled) { setError('دریافت مصوبات مجاز ناموفق بود.'); setResponse({ items: [], total: 0 }); }
      } finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, status, dateFrom, dateTo, offset, overdueOnly, revision]);

  return createPortal(
    <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 p-3" dir="rtl" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="افزودن از پیگیری مصوبات" className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">افزودن از پیگیری مصوبات</h3>
          <button type="button" onClick={onClose} aria-label="بستن"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid shrink-0 grid-cols-1 gap-2 border-b p-3 dark:border-gray-700 sm:grid-cols-4">
          <label className="relative sm:col-span-2">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
            <input aria-label="جستجوی موضوع، مسئول، شماره و جلسه" value={query} onChange={e => setQuery(e.target.value)} placeholder="موضوع، شماره، عنوان جلسه، مسئول…" maxLength={180}
              className="w-full rounded-lg border p-2 pr-8 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </label>
          <select aria-label="وضعیت مصوبه" value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border p-2 text-sm dark:border-gray-600 dark:bg-gray-800">
            {STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <div className="flex gap-1">
            <input aria-label="تاریخ از به شمسی" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="از ۱۴۰۵/۰۸/۰۱" className="w-1/2 min-w-0 rounded-lg border p-2 text-xs dark:border-gray-600 dark:bg-gray-800" />
            <input aria-label="تاریخ تا به شمسی" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="تا ۱۴۰۵/۰۸/۳۰" className="w-1/2 min-w-0 rounded-lg border p-2 text-xs dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 sm:col-span-4">
            <input type="checkbox" checked={overdueOnly} onChange={event => {
              setOverdueOnly(event.target.checked);
              setOffset(0);
              setSelected({});
            }} className="h-4 w-4" />
            مصوبات عقب‌افتاده
          </label>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {loading && <div role="status" className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…</div>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!loading && !error && response.items.length === 0 && <p className="p-4 text-center text-sm text-gray-500">مصوبه‌ای مطابق فیلترها یافت نشد.</p>}
          {!loading && !error && response.items.map(item => {
            const duplicated = existing.has(item.id);
            return <div key={item.id} className={`flex gap-3 rounded-xl border p-3 dark:border-gray-700 ${duplicated ? 'opacity-60' : 'hover:border-blue-300'}`}>
              <input type="checkbox" aria-label={`انتخاب مصوبه ${item.title}`} className="mt-1 h-4 w-4" disabled={duplicated} checked={duplicated || Boolean(selected[item.id])}
                onChange={e => setSelected(previous => { const next = { ...previous }; if (e.target.checked) next[item.id] = item; else delete next[item.id]; return next; })} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.minute_number ? `صورت‌جلسه شماره ${item.minute_number}` : item.minute_title} · {gregorianToJalaliDate(item.meeting_date) || item.meeting_date || 'تاریخ نامشخص'} · {item.decision_number ? `مصوبه ${item.decision_number}` : 'بدون شماره رسمی'} {item.clause_order ? `· بند ${item.clause_order}` : ''}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">مسئول: {item.owner_name || '—'} · واحد: {item.responsible_unit_name_snapshot || '—'} · {statusName(item.status)}</p>
                {item.due_date && typeof item.days_overdue === 'number' && (
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">
                    مهلت انجام {formatJalaliDateForDisplay(item.due_date)} · {item.days_overdue.toLocaleString('fa-IR')} روز تأخیر
                  </p>
                )}
                {duplicated && <p className="text-xs text-amber-700">این مصوبه قبلاً به همین جلسه اضافه شده است.</p>}
                {!duplicated && <p className="line-clamp-2 text-xs text-blue-600 dark:text-blue-400">{linkedDecisionAgendaTitle(item)}</p>}
                {isAdmin && <button type="button" className="mt-2 text-xs text-indigo-600 hover:underline" onClick={() => {
                  setEditingReferenceId(editingReferenceId===item.id ? null : item.id);
                  setReferenceFields({minute:item.minute_number||'',decision:item.decision_number||''});
                  setReferenceError('');
                }}>ثبت یا اصلاح شماره رسمی صورت‌جلسه و مصوبه</button>}
                {isAdmin && editingReferenceId===item.id && <div className="mt-2 space-y-2 rounded-lg border border-indigo-200 p-2 dark:border-indigo-800">
                  <p className="text-xs text-amber-600">شماره‌ها باید از سند رسمی و تأییدشده وارد شوند؛ شماره‌گذاری خودکار انجام نمی‌شود.</p>
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="شماره رسمی صورت‌جلسه" value={referenceFields.minute} maxLength={80} placeholder="شماره رسمی صورت‌جلسه" onChange={e => setReferenceFields(prev=>({...prev,minute:e.target.value}))} className="min-w-0 flex-1 rounded-lg border p-2 text-xs dark:border-gray-700 dark:bg-gray-800" />
                    <input aria-label="شماره رسمی مصوبه" value={referenceFields.decision} maxLength={80} placeholder="شماره رسمی مصوبه" onChange={e => setReferenceFields(prev=>({...prev,decision:e.target.value}))} className="min-w-0 flex-1 rounded-lg border p-2 text-xs dark:border-gray-700 dark:bg-gray-800" />
                  </div>
                  {referenceError && <p role="alert" className="text-xs text-red-600">{referenceError}</p>}
                  <button type="button" disabled={referenceSaving || (!referenceFields.minute.trim()&&!referenceFields.decision.trim())} onClick={() => void saveReferences(item)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">{referenceSaving?'در حال ذخیره…':'ثبت شماره‌های معتبر'}</button>
                </div>}
              </div>
            </div>;
          })}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{response.total.toLocaleString('fa-IR')} نتیجه</span>
            <button type="button" disabled={offset===0 || loading} onClick={() => setOffset(Math.max(0,offset-PAGE_SIZE))}>قبلی</button>
            <button type="button" disabled={offset+PAGE_SIZE>=response.total || loading} onClick={() => setOffset(offset+PAGE_SIZE)}>بعدی</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{selectedItems.length.toLocaleString('fa-IR')} انتخاب</span>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm dark:border-gray-600" onClick={onClose}>انصراف</button>
            <button type="button" disabled={loading || Boolean(error) || selectedItems.length === 0} onClick={() => { onSelect(selectedItems); onClose(); }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">افزودن دستور جلسات</button>
          </div>
        </footer>
      </section>
    </div>, document.body,
  );
}
