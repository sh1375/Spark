import { ChevronDown, ChevronUp } from 'lucide-react';
import { TABLE_LABEL } from './tablesConfig';

export type RestoreReportError = {
  row?: string | number;
  reason?: string;
  dependency?: string;
  id?: string;
  code?: string;
};

export type RestoreReportEntry = {
  success?: boolean;
  total?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: RestoreReportError[];
  deleteError?: string;
};

export function RestoreReport(props: {
  report: Record<string, RestoreReportEntry>;
  expandedTable: string | null;
  setExpandedTable: (v: string | null) => void;
}) {
  const { report, expandedTable, setExpandedTable } = props;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-1">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">گزارش بازیابی</p>
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />وارد شد</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />به‌روز شد</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />رد شد</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />ناموفق</span>
        </div>
      </div>
      <p className="text-xs text-gray-500">تعداد درج و به‌روزرسانی برآوردی است؛ گزارش جایگزین بررسی صحت داده‌ها نیست.</p>
      {Object.entries(report).map(([key, r]) => (
        <div key={key} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <button
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-right"
            onClick={() => setExpandedTable(expandedTable === key ? null : key)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{TABLE_LABEL[key] ?? key}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">کل: {(r.total ?? 0).toLocaleString('fa-IR')}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs">
              {(r.inserted ?? 0) > 0 && <span className="font-medium text-green-600 dark:text-green-400">+{(r.inserted ?? 0).toLocaleString('fa-IR')}</span>}
              {(r.updated ?? 0) > 0 && <span className="font-medium text-blue-600 dark:text-blue-400">↑{(r.updated ?? 0).toLocaleString('fa-IR')}</span>}
              {(r.skipped ?? 0) > 0 && <span className="font-medium text-amber-600 dark:text-amber-400">○{(r.skipped ?? 0).toLocaleString('fa-IR')}</span>}
              {(r.failed ?? 0) > 0 && <span className="font-medium text-red-600 dark:text-red-400">✗{(r.failed ?? 0).toLocaleString('fa-IR')}</span>}
              {(r.errors?.length ?? 0) > 0
                ? expandedTable === key
                  ? <ChevronUp className="w-3 h-3 text-gray-400" />
                  : <ChevronDown className="w-3 h-3 text-gray-400" />
                : null}
            </div>
          </button>
          {expandedTable === key && (r.errors?.length ?? 0) > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 max-h-52 overflow-y-auto">
              {r.errors?.slice(0, 100).map((e, ei) => (
                <div key={ei} className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0 bg-gray-50/50 dark:bg-gray-800/50">
                  <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-400">
                    {e.row || '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{e.reason || '(علت نامشخص)'}</p>
                    {e.dependency && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">{e.dependency}</p>}
                    {e.id && <p className="text-xs text-gray-300 dark:text-gray-600 font-mono truncate">{e.id}</p>}
                  </div>
                  {e.code && <span className="flex-shrink-0 text-xs text-gray-300 dark:text-gray-600 font-mono">{e.code}</span>}
                </div>
              ))}
              {(r.errors?.length ?? 0) > 100 && (
                <p className="px-3 py-2 text-center text-xs text-gray-400 dark:text-gray-500">
                  ... و {((r.errors?.length ?? 0) - 100).toLocaleString('fa-IR')} مورد دیگر
                </p>
              )}
            </div>
          )}
          {r.deleteError && (
            <p className="px-3 py-2 text-xs text-red-500 dark:text-red-400 border-t border-gray-100 dark:border-gray-700">
              حذف ناموفق: {r.deleteError}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
