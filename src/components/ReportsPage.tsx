import { useLiveData, LIVE_DATA } from '../shared/realtime/useLiveData';
import { useEffect, useRef, useState, type ElementType } from 'react';
import {
  ChartBar as BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Clock,
  Users,
  CircleCheck as CheckCircle2,
  TriangleAlert as AlertTriangle,
  RefreshCw,
  Loader as Loader2,
  Target,
  Activity,
  MapPin,
  UserCheck,
  Timer,
  ChartPie as PieChart,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from '../lib/xlsxCompat';
import toast from 'react-hot-toast';
import moment from 'moment-jalaali';
import { usePermissions } from '../context/PermissionsContext';

interface Stats {
  totalMeetings: number;
  openMeetings: number;
  closedMeetings: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  requestedMeetings: number;
  approvedMeetings: number;
  avgDurationMin: number;
  mostActiveLocation: string;
  topRepresentative: string;
  totalParticipants: number;
  avgParticipants: number;
  upcomingMeetings: number;
  completionRate: number;
  taskCompletionRate: number;
  meetingsByMonth: Record<string, number>;
  tasksByMonth: Record<string, number>;
}

type DateRange = '1month' | '3months' | '6months' | '1year';
const RANGE_MONTHS: Record<DateRange, number> = { '1month': 1, '3months': 3, '6months': 6, '1year': 12 };
const TEHRAN_OFFSET_MINUTES = 210;

type KpiTone = 'violet' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';

const REPORT_FIELDS = [
  { key: 'subject', label: 'موضوع جلسه' },
  { key: 'request_date', label: 'تاریخ جلسه' },
  { key: 'duration', label: 'مدت زمان' },
  { key: 'location', label: 'محل برگزاری' },
  { key: 'representative', label: 'نماینده' },
  { key: 'phone', label: 'شماره تماس' },
  { key: 'priority', label: 'اولویت' },
  { key: 'status', label: 'وضعیت' },
  { key: 'status_type', label: 'نوع وضعیت' },
];

const RANGE_LABELS: Record<DateRange, string> = {
  '1month': 'ماه جاری',
  '3months': '۳ ماه اخیر',
  '6months': '۶ ماه اخیر',
  '1year': 'یک سال اخیر',
};

const KPI_TONES: Record<KpiTone, { card: string; icon: string; value?: string }> = {
  violet: {
    card: 'border-violet-100 bg-white/85 dark:border-violet-500/20 dark:bg-violet-500/5',
    icon: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  },
  blue: {
    card: 'border-blue-100 bg-white/85 dark:border-blue-500/20 dark:bg-blue-500/5',
    icon: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  },
  cyan: {
    card: 'border-cyan-100 bg-white/85 dark:border-cyan-500/20 dark:bg-cyan-500/5',
    icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300',
  },
  emerald: {
    card: 'border-emerald-100 bg-white/85 dark:border-emerald-500/20 dark:bg-emerald-500/5',
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  amber: {
    card: 'border-amber-100 bg-white/85 dark:border-amber-500/20 dark:bg-amber-500/5',
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  },
  rose: {
    card: 'border-rose-200 bg-rose-50/70 ring-1 ring-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:ring-rose-400/10',
    icon: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    value: 'text-rose-700 dark:text-rose-200',
  },
  slate: {
    card: 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/65',
    icon: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

function formatNumber(value: number): string {
  return value.toLocaleString('fa-IR');
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  tone: KpiTone;
}) {
  const classes = KPI_TONES[tone];
  const displayed = typeof value === 'number' ? formatNumber(value) : value;

  return (
    <div className={`rounded-xl border px-3 py-2.5 shadow-[0_7px_20px_rgba(15,23,42,0.035)] ${classes.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">{title}</p>
          <p className={`mt-1 text-lg font-bold leading-6 text-slate-900 dark:text-white ${classes.value || ''}`}>
            {displayed}
          </p>
          {sub && <p className="mt-0.5 truncate text-[9px] text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${classes.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

const JALAALI_MONTHS_SHORT = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

function formatJalaaliLabel(key: string): string {
  const parts = key.split('/');
  if (parts.length === 2) {
    const month = parseInt(parts[1], 10);
    const monthName = JALAALI_MONTHS_SHORT[month - 1] || parts[1];
    return `${monthName} ${parts[0]}`;
  }
  return key;
}

function BarChartBlock({
  data,
  color = 'bg-blue-500',
}: {
  data: Record<string, number>;
  color?: string;
}) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, value]) => value), 1);

  if (entries.length === 0) {
    return <p className="py-8 text-center text-[11px] text-slate-400">داده‌ای موجود نیست</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>{formatJalaaliLabel(label)}</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{formatNumber(value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${color} transition-all duration-700`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const liveRefreshRef = useLiveData([...LIVE_DATA.meetings, ...LIVE_DATA.tasks], async () => { await fetchStats(); });
  const { hasPermission } = usePermissions();
  const canExport = hasPermission('reports_export');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const statsRequest = useRef(0);
  const [range, setRange] = useState<DateRange>('3months');
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<any[] | null>(null);

  useEffect(() => {
    void fetchStats();
  }, [range]);

  const fetchStats = async () => {
    const request = ++statsRequest.current;
    if (!liveRefreshRef.current) setLoading(true);
    try {
      const monthStart = moment().utcOffset(TEHRAN_OFFSET_MINUTES).startOf('jMonth');
      const from = monthStart.clone().subtract(RANGE_MONTHS[range] - 1, 'jMonth');
      const to = monthStart.clone().add(1, 'jMonth');

      const [meetingsResult, tasksResult] = await Promise.all([
        supabase.from('meetings').select('*, participants(id), actions(id,status)')
          .gte('request_local_date', from.format('YYYY-MM-DD')).lt('request_local_date', to.format('YYYY-MM-DD')),
        supabase.from('tasks').select('*').gte('created_at', from.toISOString()).lt('created_at', to.toISOString()),
      ]);
      if (request !== statsRequest.current) return;
      if (meetingsResult.error || tasksResult.error) throw new Error('REPORT_QUERY_FAILED');

      const m = meetingsResult.data || [];
      const t = tasksResult.data || [];
      const now = new Date();

      const meetingsByMonth: Record<string, number> = {};
      const tasksByMonth: Record<string, number> = {};

      let totalPart = 0;
      const locationCount: Record<string, number> = {};
      const repCount: Record<string, number> = {};
      let totalDur = 0;
      let durCount = 0;

      m.forEach(mtg => {
        const mk = moment.utc(mtg.request_local_date).format('jYYYY/jMM');
        meetingsByMonth[mk] = (meetingsByMonth[mk] || 0) + 1;
        totalPart += mtg.participants?.length || 0;
        locationCount[mtg.location] = (locationCount[mtg.location] || 0) + 1;
        repCount[mtg.representative] = (repCount[mtg.representative] || 0) + 1;
        const duration = parseInt(mtg.duration);
        if (!isNaN(duration)) {
          totalDur += duration;
          durCount++;
        }
      });

      t.forEach(task => {
        const tk = moment(task.created_at).utcOffset(TEHRAN_OFFSET_MINUTES).format('jYYYY/jMM');
        tasksByMonth[tk] = (tasksByMonth[tk] || 0) + 1;
      });

      const mostActiveLocation = Object.entries(locationCount).sort(([, a], [, b]) => b - a)[0]?.[0] || '—';
      const topRepresentative = Object.entries(repCount).sort(([, a], [, b]) => b - a)[0]?.[0] || '—';
      const completedTasks = t.filter(task => task.status === 'completed').length;
      const pendingTasks = t.filter(task => task.status !== 'completed').length;

      setStats({
        totalMeetings: m.length,
        openMeetings: m.filter(item => item.status === 'open').length,
        closedMeetings: m.filter(item => item.status === 'closed').length,
        totalTasks: t.length,
        completedTasks,
        pendingTasks,
        highPriority: m.filter(item => item.priority === 'high').length,
        mediumPriority: m.filter(item => item.priority === 'medium').length,
        lowPriority: m.filter(item => item.priority === 'low').length,
        requestedMeetings: m.filter(item => item.status_type === 'requested').length,
        approvedMeetings: m.filter(item => item.status_type === 'approved').length,
        avgDurationMin: durCount ? Math.round(totalDur / durCount) : 0,
        mostActiveLocation,
        topRepresentative,
        totalParticipants: totalPart,
        avgParticipants: m.length ? Math.round(totalPart / m.length) : 0,
        upcomingMeetings: m.filter(item => new Date(item.request_date) > now).length,
        completionRate: m.length ? Math.round((m.filter(item => item.status === 'closed').length / m.length) * 100) : 0,
        taskCompletionRate: t.length ? Math.round((completedTasks / t.length) * 100) : 0,
        meetingsByMonth,
        tasksByMonth,
      });
    } catch {
      if (request === statsRequest.current) {
        setStats(null);
        toast.error('خطا در دریافت آمار');
      }
    } finally {
      if (request === statsRequest.current) setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedFields.length) {
      toast.error('حداقل یک فیلد انتخاب کنید');
      return;
    }

    setExporting(true);
    try {
      const { data } = await supabase.from('meetings').select('*');
      const rows = (data || []).map(mtg => {
        const row: Record<string, string> = {};
        selectedFields.forEach(field => {
          const value = (mtg as Record<string, unknown>)[field];
          if (field === 'request_date') {
            row['تاریخ جلسه'] = moment(value).format('jYYYY/jMM/jDD HH:mm');
          } else if (field === 'priority') {
            row['اولویت'] = value === 'high' ? 'بالا' : value === 'medium' ? 'متوسط' : 'پایین';
          } else if (field === 'status') {
            row['وضعیت'] = value === 'open' ? 'باز' : 'بسته';
          } else if (field === 'status_type') {
            row['نوع وضعیت'] = value === 'requested' ? 'درخواست شده' : 'تایید شده';
          } else {
            row[REPORT_FIELDS.find(item => item.key === field)?.label || field] = String(value ?? '');
          }
        });
        return row;
      });
      setExportData(rows);
    } catch {
      toast.error('خطا در تهیه گزارش');
    } finally {
      setExporting(false);
    }
  };

  const downloadExcel = async () => {
    if (!exportData?.length) return;
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    await XLSX.writeFile(wb, `report-${moment().format('jYYYY-jMM-jDD')}.xlsx`);
    toast.success('فایل دانلود شد');
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!stats) return null;

  const approvalPct = stats.totalMeetings
    ? Math.round((stats.approvedMeetings / stats.totalMeetings) * 100)
    : 0;

  const highPct = stats.totalMeetings ? (stats.highPriority / stats.totalMeetings) * 100 : 0;
  const mediumPct = stats.totalMeetings ? (stats.mediumPriority / stats.totalMeetings) * 100 : 0;
  const lowPct = Math.max(0, 100 - highPct - mediumPct);

  const panelClass =
    'rounded-xl border border-slate-200/80 bg-white/85 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.035)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-3.5';

  return (
    <>
      <div
        className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/75 to-indigo-50/45 p-3 antialiased shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/15 sm:p-4"
        dir="rtl"
      >
        <div className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full bg-violet-300/10 blur-3xl dark:bg-violet-600/10" />
        <div className="pointer-events-none absolute -right-20 top-32 h-56 w-56 rounded-full bg-cyan-200/15 blur-3xl dark:bg-cyan-500/10" />

        <div className="relative z-10">
          <header className="mb-3 flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white/85 px-2.5 py-1 text-[10px] font-bold text-indigo-700 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  مرکز گزارشات و تحلیل
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[9px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <Calendar className="h-3 w-3" />
                  {RANGE_LABELS[range]}
                </span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                داشبورد گزارشات
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
                نمای یکپارچه عملکرد جلسات، اقدامات و شاخص‌های عملیاتی
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              <select
                value={range}
                onChange={event => setRange(event.target.value as DateRange)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:text-xs"
              >
                <option value="1month">ماه جاری</option>
                <option value="3months">۳ ماه اخیر</option>
                <option value="6months">۶ ماه اخیر</option>
                <option value="1year">یک سال اخیر</option>
              </select>

              <button
                type="button"
                onClick={() => void fetchStats()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300"
                title="بروزرسانی"
                aria-label="بروزرسانی آمار"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              {canExport && (
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300 sm:text-xs"
                >
                  <Download className="h-4 w-4" />
                  خروجی Excel
                </button>
              )}
            </div>
          </header>

          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiCard
              title="کل جلسات"
              value={stats.totalMeetings}
              sub={`${formatNumber(stats.openMeetings)} باز · ${formatNumber(stats.closedMeetings)} بسته`}
              icon={Calendar}
              tone="violet"
            />
            <KpiCard title="جلسات آینده" value={stats.upcomingMeetings} icon={Activity} tone="cyan" />
            <KpiCard title="نرخ تکمیل جلسات" value={`${stats.completionRate.toLocaleString('fa-IR')}٪`} icon={Target} tone="emerald" />
            <KpiCard
              title="کل اقدامات"
              value={stats.totalTasks}
              sub={`${formatNumber(stats.completedTasks)} تکمیل‌شده`}
              icon={CheckCircle2}
              tone="blue"
            />
            <KpiCard title="میانگین شرکت‌کنندگان" value={stats.avgParticipants} icon={Users} tone="slate" />
            <KpiCard title="میانگین مدت جلسه" value={`${formatNumber(stats.avgDurationMin)} دقیقه`} icon={Timer} tone="blue" />
            <KpiCard
              title="درخواست‌های در انتظار"
              value={stats.requestedMeetings}
              icon={AlertTriangle}
              tone={stats.requestedMeetings > 0 ? 'amber' : 'slate'}
            />
            <KpiCard title="درخواست‌های تأییدشده" value={stats.approvedMeetings} icon={UserCheck} tone="emerald" />
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <section className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">روند ماهانه جلسات</h2>
                    <p className="mt-0.5 text-[9px] text-slate-400">تعداد جلسات بر اساس تاریخ جلسه در ماه‌های شمسیِ بازهٔ انتخابی</p>
                  </div>
                </div>
              </div>
              <BarChartBlock data={stats.meetingsByMonth} color="bg-violet-500" />
            </section>

            <section className={panelClass}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">روند ماهانه اقدامات</h2>
                  <p className="mt-0.5 text-[9px] text-slate-400">تعداد اقدامات ایجادشده در بازه انتخابی</p>
                </div>
              </div>
              <BarChartBlock data={stats.tasksByMonth} color="bg-cyan-500" />
            </section>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
            <section className={panelClass}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  <PieChart className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">توزیع اولویت جلسات</h2>
                  <p className="mt-0.5 text-[9px] text-slate-400">سهم جلسات با اولویت بالا، متوسط و پایین</p>
                </div>
              </div>

              {stats.totalMeetings > 0 ? (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                  <div
                    className="relative h-24 w-24 flex-shrink-0 rounded-full"
                    style={{
                      background: `conic-gradient(#f43f5e 0 ${highPct}%, #f59e0b ${highPct}% ${highPct + mediumPct}%, #10b981 ${highPct + mediumPct}% ${highPct + mediumPct + lowPct}%)`,
                    }}
                    aria-label="نمودار توزیع اولویت جلسات"
                  >
                    <div className="absolute inset-[12px] flex items-center justify-center rounded-full bg-white dark:bg-slate-900">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{formatNumber(stats.totalMeetings)}</span>
                    </div>
                  </div>

                  <div className="w-full min-w-0 space-y-2">
                    {[
                      { label: 'اولویت بالا', count: stats.highPriority, color: 'bg-rose-500' },
                      { label: 'اولویت متوسط', count: stats.mediumPriority, color: 'bg-amber-500' },
                      { label: 'اولویت پایین', count: stats.lowPriority, color: 'bg-emerald-500' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-[10px]">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${row.color}`} />
                          <span className="truncate text-slate-600 dark:text-slate-300">{row.label}</span>
                        </div>
                        <span className="font-bold text-slate-800 dark:text-white">{formatNumber(row.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-[11px] text-slate-400">داده‌ای موجود نیست</p>
              )}
            </section>

            <section className={panelClass}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">نرخ تأیید درخواست‌ها</h2>
                  <p className="mt-0.5 text-[9px] text-slate-400">نسبت درخواست‌های تأییدشده به کل جلسات</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 py-1">
                <div
                  className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(#10b981 0 ${approvalPct}%, #e2e8f0 ${approvalPct}% 100%)`,
                  }}
                >
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white dark:bg-slate-900">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{approvalPct.toLocaleString('fa-IR')}٪</span>
                  </div>
                </div>
                <div className="min-w-0 space-y-2 text-[10px]">
                  <div className="flex items-center justify-between gap-5">
                    <span className="text-slate-500 dark:text-slate-400">درخواست‌شده</span>
                    <span className="font-bold text-amber-600 dark:text-amber-300">{formatNumber(stats.requestedMeetings)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <span className="text-slate-500 dark:text-slate-400">تأییدشده</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-300">{formatNumber(stats.approvedMeetings)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2 text-slate-400 dark:border-slate-800">
                    {formatNumber(stats.approvedMeetings)} از {formatNumber(stats.totalMeetings)} جلسه
                  </div>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <Activity className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">وضعیت اقدامات</h2>
                  <p className="mt-0.5 text-[9px] text-slate-400">پیشرفت تکمیل اقدامات ثبت‌شده</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'تکمیل‌شده', value: stats.completedTasks, color: 'bg-emerald-500' },
                  { label: 'در انتظار / جاری', value: stats.pendingTasks, color: 'bg-amber-500' },
                ].map(row => (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-[10px]">
                      <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{formatNumber(row.value)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${row.color}`}
                        style={{ width: `${stats.totalTasks ? (row.value / stats.totalTasks) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}

                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-center dark:border-blue-500/20 dark:bg-blue-500/5">
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-200">
                    {stats.taskCompletionRate.toLocaleString('fa-IR')}٪
                  </span>
                  <p className="mt-0.5 text-[9px] text-blue-500 dark:text-blue-300">نرخ تکمیل اقدامات</p>
                </div>
              </div>
            </section>
          </div>

          <section className={panelClass}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 sm:text-sm">اطلاعات تکمیلی</h2>
                <p className="mt-0.5 text-[9px] text-slate-400">چند شاخص کاربردی از بازه انتخاب‌شده</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { label: 'پرتکرارترین محل', value: stats.mostActiveLocation, icon: MapPin, tone: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-300' },
                { label: 'فعال‌ترین نماینده', value: stats.topRepresentative, icon: UserCheck, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300' },
                { label: 'کل شرکت‌کنندگان', value: `${formatNumber(stats.totalParticipants)} نفر`, icon: Users, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' },
                { label: 'میانگین مدت', value: `${formatNumber(stats.avgDurationMin)} دقیقه`, icon: Clock, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300' },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/65 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/45">
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${item.tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9px] text-slate-400">{item.label}</p>
                      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-700 dark:text-slate-200 sm:text-xs">
                        {item.value || '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">خروجی گزارش Excel</h2>
                <p className="mt-0.5 text-[9px] text-slate-400">فیلدهای موردنیاز را انتخاب کنید</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExportModal(false);
                  setExportData(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-400 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                aria-label="بستن"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-1.5">
                {REPORT_FIELDS.map(field => (
                  <label
                    key={field.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] transition ${
                      selectedFields.includes(field.key)
                        ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.key)}
                      onChange={event =>
                        setSelectedFields(previous =>
                          event.target.checked
                            ? [...previous, field.key]
                            : previous.filter(item => item !== field.key)
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>

              {exportData && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {formatNumber(exportData.length)} ردیف آماده دانلود است
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting || !selectedFields.length}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-l from-violet-600 to-indigo-600 px-3 text-xs font-bold text-white transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  تهیه گزارش
                </button>

                {exportData && (
                  <button
                    type="button"
                    onClick={() => void downloadExcel()}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    <Download className="h-4 w-4" />
                    دانلود Excel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
