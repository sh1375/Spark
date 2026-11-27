import React, { useRef, useState } from 'react';
import { Download, Upload, Database, Loader as Loader2, TriangleAlert as AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import * as XLSX from '../lib/xlsxCompat';
import { TABLES, BACKUP_VERSION, PAGE_SIZE } from './Backup/tablesConfig';
import { TableRow, RestoreTableRow } from './Backup/BackupRows';
import { RestoreReport, type RestoreReportEntry } from './Backup/RestoreReport';

type Status = 'idle' | 'loading' | 'done' | 'error';
type BackupRow = Record<string, unknown>;
type DataMap = Record<string, BackupRow[]>;
type BackupMeta = Record<string, unknown> & { version?: string | number };
const KNOWN_TABLES = new Set(TABLES.map(t => t.key));

async function fetchAllRows(table: string): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.functions.invoke('backup-data', { body: { table, offset, limit: PAGE_SIZE } });
    if (error || data?.ok !== true || !Array.isArray(data?.rows)) throw new Error(data?.error || error?.message || 'BACKUP_READ_FAILED');
    rows.push(...data.rows);
    if (data.rows.length < PAGE_SIZE || data.has_more === false) break;
  }
  return rows;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function RestorePanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<DataMap | null>(null);
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [name, setName] = useState('');
  const [errorText, setErrorText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [strategy, setStrategy] = useState<'upsert' | 'replace'>('upsert');
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [report, setReport] = useState<Record<string, RestoreReportEntry> | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name); setErrorText(''); setData(null); setMeta(null); setReport(null); setConfirmed(false);
    try {
      const parsed: DataMap = {};
      if (file.name.toLowerCase().endsWith('.json')) {
        const obj: unknown = JSON.parse(await file.text());
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('فرمت JSON نامعتبر است');
        const record = obj as Record<string, unknown>;
        if (record._meta && typeof record._meta === 'object' && !Array.isArray(record._meta)) setMeta(record._meta as BackupMeta);
        for (const [key, value] of Object.entries(record)) {
          if (key === '_meta' || key === 'profiles' || !KNOWN_TABLES.has(key)) continue;
          if (!Array.isArray(value)) throw new Error(`داده جدول ${key} معتبر نیست`);
          parsed[key] = value as BackupRow[];
        }
      } else if (/\.xlsx?$/i.test(file.name)) {
        const wb = await XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const labelToKey = Object.fromEntries(TABLES.map(t => [t.label.slice(0, 31), t.key]));
        for (const sheet of wb.SheetNames) {
          const key = labelToKey[sheet] ?? sheet;
          if (KNOWN_TABLES.has(key)) parsed[key] = XLSX.utils.sheet_to_json(wb.Sheets[sheet]);
        }
      } else throw new Error('فقط JSON و XLSX پشتیبانی می‌شوند');
      if (!Object.keys(parsed).length) throw new Error('هیچ جدول قابل بازیابی پیدا نشد');
      setData(parsed); setSelected(new Set(Object.keys(parsed)));
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'خطا در خواندن فایل');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async () => {
    if (!data || !selected.size) return;
    setRunning(true); setReport(null);
    setStatus(Object.fromEntries([...selected].map(k => [k, 'loading' as Status])));
    try {
      const tables: DataMap = {};
      selected.forEach(k => { tables[k] = data[k] ?? []; });
      const { data: result, error } = await supabase.functions.invoke('restore-backup', { body: { tables, strategy } });
      if (error || !result || typeof result.results !== 'object' || !result.results || Array.isArray(result.results)) {
        throw new Error(result?.error || error?.message || 'RESTORE_FAILED');
      }
      const r = (result.results ?? {}) as Record<string, RestoreReportEntry>;
      setReport(r);
      const complete = (k: string) => {
        const entry = r[k];
        return Boolean(entry && entry.success === true && !entry.deleteError &&
          entry.failed === 0 && entry.skipped === 0 && entry.total === tables[k].length &&
          (entry.inserted ?? 0) + (entry.updated ?? 0) === entry.total);
      };
      setStatus(Object.fromEntries([...selected].map(k => [k, complete(k) ? 'done' : 'error'])) as Record<string, Status>);
      const rejected = Array.isArray(result.rejected_tables) ? result.rejected_tables.length : 0;
      const incomplete = [...selected].filter(k => !complete(k)).length;
      if (result.ok !== true || rejected || incomplete) {
        toast.error('بازیابی ناقص است. گزارش جداول را بررسی کنید.');
      } else {
        toast.success('بازیابی با موفقیت انجام شد');
      }
    } catch (err) {
      toast.error(`خطا در بازیابی: ${err instanceof Error ? err.message : 'نامشخص'}`);
      setStatus(Object.fromEntries([...selected].map(k => [k, 'error' as Status])));
    } finally { setRunning(false); setConfirmed(false); }
  };

  const toggle = (key: string) => setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  return <div className="space-y-4 min-w-0">
    <button type="button" onClick={() => fileRef.current?.click()} className="w-full p-5 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-2xl flex flex-col items-center gap-2 hover:border-emerald-400">
      <Upload className="w-7 h-7 text-emerald-600" /><span className="text-sm break-all">{name || 'فایل پشتیبان را انتخاب کنید'}</span><span className="text-xs text-gray-400">JSON یا XLSX{meta?.version ? ` — نسخه ${meta.version}` : ''}</span>
    </button>
    <input ref={fileRef} type="file" accept=".json,.xlsx,.xls" className="hidden" onChange={onFile} />
    {errorText && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{errorText}</div>}
    {data && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => setStrategy('upsert')} className={`p-3 rounded-xl border text-right ${strategy === 'upsert' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-600'}`}><b className="text-sm">ادغام (Upsert)</b><p className="text-xs text-gray-500 mt-1">به‌روزرسانی موجودها و افزودن داده جدید</p></button>
        <button onClick={() => setStrategy('replace')} className={`p-3 rounded-xl border text-right ${strategy === 'replace' ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600'}`}><b className="text-sm">جایگزینی کامل</b><p className="text-xs text-gray-500 mt-1">حذف داده فعلی جداول انتخاب‌شده و بازنویسی</p></button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border p-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3"><span className="text-sm">{selected.size} جدول انتخاب شده</span><div className="flex gap-2"><button onClick={() => setSelected(new Set(Object.keys(data)))} className="text-xs px-3 py-1.5 bg-emerald-50 rounded-lg">همه</button><button onClick={() => setSelected(new Set())} className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg">هیچ‌کدام</button></div></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto">{Object.entries(data).map(([key, rows]) => <RestoreTableRow key={key} tableKey={key} rowCount={rows.length} selected={selected.has(key)} onToggle={() => toggle(key)} status={status[key] || 'idle'} />)}</div>
      </div>
      {report && <RestoreReport report={report} expandedTable={expanded} setExpandedTable={setExpanded} />}
      {strategy === 'replace' && <label className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-xs"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />حذف داده فعلی جداول انتخاب‌شده را تأیید می‌کنم.</label>}
      <button onClick={run} disabled={running || !selected.size || (strategy === 'replace' && !confirmed)} className="w-full py-3 bg-emerald-500 disabled:opacity-50 text-white rounded-2xl flex justify-center items-center gap-2">{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}بازیابی ({selected.size} جدول)</button>
    </>}
  </div>;
}

export function BackupPanel() {
  const [selected, setSelected] = useState<Set<string>>(new Set(TABLES.map(t => t.key)));
  const [format, setFormat] = useState<'json' | 'xlsx'>('json');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [restoreOpen, setRestoreOpen] = useState(false);
  const toggle = (key: string) => setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const runBackup = async () => {
    if (!selected.size) return toast.error('حداقل یک جدول انتخاب کنید');
    setRunning(true); setProgress({ done: 0, total: selected.size });
    setStatus(Object.fromEntries([...selected].map(k => [k, 'loading' as Status])));
    const result: DataMap = {}; let done = 0; let failures = 0;
    for (const cfg of TABLES) {
      if (!selected.has(cfg.key)) continue;
      try { result[cfg.key] = await fetchAllRows(cfg.key); setStatus(s => ({ ...s, [cfg.key]: 'done' })); }
      catch { failures++; setStatus(s => ({ ...s, [cfg.key]: 'error' })); }
      setProgress({ done: ++done, total: selected.size });
    }
    try {
      // Never export a partial result using the normal full-backup filename.
      if (failures) {
        toast.error('پشتیبان ناقص است؛ هیچ فایل پشتیبانی ذخیره نشد.');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const counts = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length]));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (format === 'json') {
        saveBlob(new Blob([JSON.stringify({ _meta: { version: BACKUP_VERSION, schema_version: 3, created_at: new Date().toISOString(), table_count: Object.keys(result).length, total_rows: total, row_counts: counts, includes_storage_files: false }, ...result }, null, 2)], { type: 'application/json' }), `spark_backup_v3_${stamp}.json`);
      } else {
        const wb = XLSX.utils.book_new();
        TABLES.forEach(cfg => { if (result[cfg.key]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result[cfg.key]), cfg.label.slice(0, 31)); });
        await XLSX.writeFile(wb, `spark_backup_v3_${stamp}.xlsx`);
      }
      failures ? toast.error(`${failures.toLocaleString('fa-IR')} جدول خوانده نشد؛ به این فایل به‌عنوان Backup کامل اتکا نکنید`) : toast.success(`پشتیبان ${Object.keys(result).length} جدول و ${total.toLocaleString('fa-IR')} ردیف ایجاد شد`);
    } finally { setRunning(false); }
  };

  return <div className="space-y-5 min-w-0" dir="rtl">
    <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0"><Database className="w-5 h-5 text-blue-500" /></div><div className="min-w-0"><h3 className="font-bold dark:text-white">پشتیبان‌گیری از داده‌های سامانه</h3><p className="text-sm text-gray-500">نسخه {BACKUP_VERSION} — {TABLES.length} جدول، خواندن کامل از مسیر امن ادمین</p></div></div>
    <div className="bg-white dark:bg-gray-800 rounded-2xl border p-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><button onClick={() => setFormat('json')} className={`py-2.5 rounded-xl border ${format === 'json' ? 'bg-blue-500 text-white' : ''}`}>JSON — مناسب Restore</button><button onClick={() => setFormat('xlsx')} className={`py-2.5 rounded-xl border ${format === 'xlsx' ? 'bg-blue-500 text-white' : ''}`}>Excel (.xlsx)</button></div><div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs flex items-start gap-2"><Info className="w-4 h-4 flex-shrink-0" />فایل‌های باینری Supabase Storage داخل JSON/Excel نیستند؛ پیوست‌ها به‌صورت فراداده و مسیر فایل ذخیره می‌شوند.</div></div>
    <div className="bg-white dark:bg-gray-800 rounded-2xl border p-4 min-w-0"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3"><span className="text-sm">{selected.size} از {TABLES.length} جدول</span><div className="flex gap-2"><button onClick={() => setSelected(new Set(TABLES.map(t => t.key)))} className="text-xs px-3 py-1.5 bg-blue-50 rounded-lg">همه</button><button onClick={() => setSelected(new Set())} className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg">هیچ‌کدام</button></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[28rem] overflow-y-auto">{TABLES.map(cfg => <TableRow key={cfg.key} cfg={cfg} selected={selected.has(cfg.key)} onToggle={() => toggle(cfg.key)} status={status[cfg.key] || 'idle'} />)}</div></div>
    {running && <div className="p-4 bg-blue-50 rounded-2xl text-sm">در حال پشتیبان‌گیری: {progress.done} / {progress.total}</div>}
    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />فایل پشتیبان ممکن است شامل تنظیمات حساس باشد؛ آن را رمزگذاری و فقط در محل مجاز نگهداری کنید.</div>
    <button onClick={runBackup} disabled={running || !selected.size} className="w-full py-3 bg-blue-500 text-white rounded-2xl disabled:opacity-50 flex justify-center items-center gap-2">{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}دریافت پشتیبان ({selected.size} جدول)</button>
    <div className="border-t pt-5"><button onClick={() => setRestoreOpen(v => !v)} className="w-full flex items-center gap-3 text-right"><Upload className="w-5 h-5 text-emerald-600" /><div className="flex-1"><h3 className="font-bold dark:text-white">بازیابی / وارد کردن پشتیبان</h3><p className="text-sm text-gray-500">Restore نسخه 3 با ترتیب وابستگی</p></div>{restoreOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>{restoreOpen && <div className="mt-4"><RestorePanel /></div>}</div>
  </div>;
}
