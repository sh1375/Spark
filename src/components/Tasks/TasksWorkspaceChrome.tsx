import { useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpLeft, CalendarClock, CheckCircle2, ChevronDown, ClipboardList, Columns3, FolderKanban, LayoutGrid, List, ListFilter, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { PersonalTaskProject } from './PersonalTaskProjects';
import type { TaskDueFilter, TaskPriorityFilter, TaskSort, TaskStatusFilter, TaskTab, TaskViewMode, getTaskCounters } from './taskPageSelectors';
import type { ManagementProjectOption } from './ActionCreateDrawer';

const control = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
const formatCount = (count: number) => count.toLocaleString('fa-IR');
export type TaskMetricKey = 'open' | 'assignedToMe' | 'today' | 'overdue' | 'inProgress' | 'completed';
export interface TaskAdvancedFilters {
  priority: TaskPriorityFilter;
  due: TaskDueFilter;
  assignee: string;
  managementProject: string;
}
export const DEFAULT_TASK_ADVANCED_FILTERS: TaskAdvancedFilters = { priority: 'all', due: 'all', assignee: 'all', managementProject: 'all' };

const headerControl = 'spark-press-feedback inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 text-xs font-medium text-slate-700 hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

export function TasksWorkspaceHeader({ canCreate, onOpenPersonalProjects, onExport, onCreate, onRefresh, refreshing, lastUpdated, exportDisabled }: {
  canCreate: boolean; onOpenPersonalProjects: () => void; onExport: () => void; onCreate: () => void;
  onRefresh: () => void; refreshing: boolean; lastUpdated: Date | null; exportDisabled: boolean;
}) {
  return (
    <header className="spark-action-header relative isolate overflow-hidden rounded-3xl border border-slate-200 bg-white px-4 py-5 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white sm:px-6">
      <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-300 sm:size-13">
            <FolderKanban aria-hidden="true" className="size-5 sm:size-6" />
          </span>
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">مرکز اقدامات</h2>
            <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">اولویت‌ها، سررسیدها و پیشرفت کارها را دنبال کنید.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && <button type="button" onClick={onCreate} className="spark-press-feedback inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-700 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"><Plus className="size-4" />اقدام جدید</button>}
          <button type="button" onClick={onOpenPersonalProjects} className={headerControl}><FolderKanban className="size-4" />پروژه‌های من</button>
          <button type="button" onClick={onExport} disabled={exportDisabled} className={headerControl}><ArrowDownToLine className="size-4" />اکسل نتایج</button>
          <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing} aria-label="تازه‌سازی اقدامات" title={lastUpdated ? `آخرین بروزرسانی: ${lastUpdated.toLocaleTimeString('fa-IR')}` : 'تازه‌سازی'} className={`${headerControl} w-10 px-0`}><RefreshCw className={`size-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`} /></button>
        </div>
      </div>
    </header>
  );
}

export function TaskMetricCards({ counters, onSelect }: { counters: ReturnType<typeof getTaskCounters>; onSelect: (key: TaskMetricKey) => void }) {
  const metrics = [
    { key: 'open', label: 'اقدامات باز', icon: ClipboardList, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
    { key: 'assignedToMe', label: 'کارتابل من', icon: FolderKanban, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
    { key: 'today', label: 'سررسید امروز', icon: CalendarClock, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
    { key: 'overdue', label: 'سررسید گذشته', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' },
    { key: 'inProgress', label: 'در حال انجام', icon: Columns3, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
    { key: 'completed', label: 'تکمیل‌شده', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  ] as const;
  return <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
    {metrics.map(({ key, label, icon: Icon, tone }) => <button key={key} type="button" onClick={() => onSelect(key)} className="spark-action-metric group rounded-2xl border border-slate-200/80 bg-white p-3.5 text-right shadow-sm hover:border-violet-300 hover:shadow-md focus-visible:outline-violet-500 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
      <div className="flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span><ArrowUpLeft className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-violet-500" /></div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{formatCount(counters[key])}</div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
    </button>)}
  </div>;
}

export function TaskViewTabs({ taskTab, setTaskTab, createdByMeCount, viewMode, setViewMode }: {
  taskTab: TaskTab; setTaskTab: (tab: TaskTab) => void; createdByMeCount: number;
  viewMode: TaskViewMode; setViewMode: (mode: TaskViewMode) => void;
}) {
  return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="محدوده اقدامات">
      {([{ key: 'assigned_to_me', label: 'کارتابل من' }, { key: 'created_by_me', label: `ایجادشده توسط من (${formatCount(createdByMeCount)})` }, { key: 'all', label: 'همه اقدامات' }] as const).map(tab => <button key={tab.key} type="button" aria-pressed={taskTab === tab.key} onClick={() => setTaskTab(tab.key)} className={`spark-press-feedback whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${taskTab === tab.key ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-200' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>{tab.label}</button>)}
    </div>
    <div className="inline-flex w-fit items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700" role="group" aria-label="نحوه نمایش">
      {([{ key: 'cards', label: 'کارت', icon: LayoutGrid }, { key: 'list', label: 'لیست', icon: List }, { key: 'kanban', label: 'کانبان', icon: Columns3 }] as const).map(({ key, label, icon: Icon }) => <button key={key} type="button" title={label} aria-pressed={viewMode === key} onClick={() => setViewMode(key)} className={`spark-press-feedback inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] ${viewMode === key ? 'bg-violet-50 font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
    </div>
  </div>;
}

export function TaskFilters({ searchTerm, setSearchTerm, statusFilter, setStatusFilter, personalProjectFilter, setPersonalProjectFilter, personalProjects,
  advanced, onAdvancedChange, managementProjects, assignees, sort, onSortChange, onReset, activeCount,
}: {
  searchTerm: string; setSearchTerm: (value: string) => void; statusFilter: TaskStatusFilter; setStatusFilter: (value: TaskStatusFilter) => void;
  personalProjectFilter: string; setPersonalProjectFilter: (value: string) => void; personalProjects: PersonalTaskProject[];
  advanced: TaskAdvancedFilters; onAdvancedChange: (patch: Partial<TaskAdvancedFilters>) => void;
  managementProjects: ManagementProjectOption[]; assignees: { id: string; name: string }[];
  sort: TaskSort; onSortChange: (sort: TaskSort) => void; onReset: () => void; activeCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="جستجوی اقدامات" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="عنوان، توضیحات، مسئول یا برچسب..." className={`${control} pr-10`} /></div>
      <select aria-label="مرتب‌سازی اقدامات" value={sort} onChange={e => onSortChange(e.target.value as TaskSort)} className={`${control} sm:!w-44`}><option value="due">نزدیک‌ترین سررسید</option><option value="priority">اولویت بالاتر</option><option value="newest">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="progress">بیشترین پیشرفت</option><option value="title">عنوان اقدام</option></select>
      <button type="button" aria-expanded={expanded} aria-controls="task-advanced-filters" onClick={() => setExpanded(!expanded)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium ${expanded || activeCount ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}><SlidersHorizontal className="h-4 w-4" />فیلترهای پیشرفته{activeCount > 0 && <span className="rounded-md bg-violet-100 px-1.5 text-[10px] dark:bg-violet-500/20">{formatCount(activeCount)}</span>}<ChevronDown className={`h-3 w-3 transition ${expanded ? 'rotate-180' : ''}`} /></button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-slate-400"><Sparkles className="h-3 w-3" />دسترسی سریع</span>
      {([{ key: 'today', label: 'امروز' }, { key: 'overdue', label: 'عقب‌افتاده' }, { key: 'week', label: 'تا ۷ روز آینده' }, { key: 'no_due', label: 'بدون سررسید' }] as const).map(item => <button key={item.key} type="button" aria-pressed={advanced.due === item.key} onClick={() => onAdvancedChange({ due: advanced.due === item.key ? 'all' : item.key })} className={`rounded-lg border px-2.5 py-1.5 text-[10px] transition ${advanced.due === item.key ? 'border-violet-200 bg-violet-50 font-bold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300' : 'border-slate-200 text-slate-500 hover:border-violet-300 dark:border-slate-700 dark:text-slate-400'}`}>{item.label}</button>)}
      {activeCount > 0 && <button type="button" onClick={onReset} className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-rose-600 dark:text-rose-300"><X className="h-3 w-3" />پاک کردن فیلترها</button>}
    </div>
    {expanded && <div id="task-advanced-filters" className="spark-reveal-panel grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50 sm:grid-cols-2 xl:grid-cols-3">
      <label className="space-y-1.5 text-[10px] text-slate-500 dark:text-slate-400"><span className="flex items-center gap-1"><ListFilter className="h-3 w-3" />وضعیت</span><select aria-label="وضعیت اقدامات" value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatusFilter)} className={control}><option value="all">همه وضعیت‌های فعال</option><option value="open">باز (تکمیل‌نشده)</option><option value="pending">در انتظار</option><option value="in_progress">در حال انجام</option><option value="completed">تکمیل‌شده</option><option value="archived">بایگانی</option></select></label>
      <label className="space-y-1.5 text-[10px] text-slate-500 dark:text-slate-400">اولویت<select aria-label="اولویت اقدامات" value={advanced.priority} onChange={e => onAdvancedChange({ priority: e.target.value as TaskPriorityFilter })} className={control}><option value="all">همه اولویت‌ها</option><option value="high">بالا</option><option value="medium">متوسط</option><option value="low">پایین</option></select></label>
      <label className="space-y-1.5 text-[10px] text-slate-500 dark:text-slate-400">اقدام‌کننده<select aria-label="اقدام‌کننده" value={advanced.assignee} onChange={e => onAdvancedChange({ assignee: e.target.value })} className={control}><option value="all">همه مسئول‌ها</option><option value="unassigned">بدون مسئول</option>{assignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label className="space-y-1.5 text-[10px] text-slate-500 dark:text-slate-400">پروژه شخصی<select aria-label="پروژه شخصی" value={personalProjectFilter} onChange={e => setPersonalProjectFilter(e.target.value)} className={control}><option value="all">همه پروژه‌های شخصی</option><option value="none">بدون پروژه شخصی</option>{personalProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="space-y-1.5 text-[10px] text-slate-500 dark:text-slate-400">پروژه سازمانی<select aria-label="پروژه سازمانی" value={advanced.managementProject} onChange={e => onAdvancedChange({ managementProject: e.target.value })} className={control}><option value="all">همه پروژه‌های سازمانی</option><option value="none">بدون پروژه سازمانی</option>{managementProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <p className="self-end pb-2 text-[10px] leading-5 text-slate-400">فیلترهای سررسید، اقدامات باز را براساس روز تهران نمایش می‌دهند. خروجی اکسل مطابق نتایج همین فیلترهاست.</p>
    </div>}
  </div>;
}
