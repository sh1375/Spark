import { useState, useCallback } from 'react';
import { Zap, Play, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';
import type { SparkModuleConfig } from './types';
import { MODULE_META } from './constants';

export function TestCommandPanel({
  config, meta,
}: { config: SparkModuleConfig; meta: typeof MODULE_META[string] }) {
  const [testText, setTestText] = useState(meta.sampleCommand);
  const [testResult, setTestResult] = useState<{ matched: boolean; score: number; reason: string } | null>(null);

  const runTest = useCallback(() => {
    if (!testText.trim()) return;
    const lo = testText.toLowerCase();
    let score = 0;
    const reasons: string[] = [];

    if (!config.enabled) {
      setTestResult({ matched: false, score: 0, reason: 'این ماژول غیرفعال است.' });
      return;
    }

    const dbKws = config.trigger_keywords || [];
    const hitDbKws: string[] = [];
    for (const kw of dbKws) {
      if (lo.includes(kw.toLowerCase())) { score += 2; hitDbKws.push(kw); }
    }
    const hitBuiltin: string[] = [];
    for (const phrase of meta.defaultPhrases) {
      if (lo.includes(phrase.toLowerCase())) { score += 1; hitBuiltin.push(phrase); }
    }

    if (hitDbKws.length > 0) reasons.push(`کلیدواژه‌های پیکربندی: «${hitDbKws.join('»، «')}»`);
    if (hitBuiltin.length > 0) reasons.push(`عبارات پیش‌فرض: «${hitBuiltin.join('»، «')}»`);

    const matched = score >= 1;
    const reason = reasons.length > 0 ? `تطابق: ${reasons.join(' | ')}` : 'هیچ کلیدواژه‌ای شناسایی نشد.';
    setTestResult({ matched, score, reason });
  }, [testText, config, meta]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
        <Zap className="w-3.5 h-3.5 text-yellow-500" />
        آزمایش کلیدواژه‌ها
      </div>
      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 space-y-2">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">یک دستور نمونه وارد کنید تا ببینید آیا این ماژول فعال می‌شود:</p>
        <div className="flex gap-2">
          <input name="spark-test-command" aria-label="متن دستور آزمایشی"
            type="text"
            value={testText}
            onChange={e => { setTestText(e.target.value); setTestResult(null); }}
            placeholder="مثلاً: یک جلسه بزار با موضوع..."
            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={runTest}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 dark:bg-gray-600 hover:bg-gray-700 dark:hover:bg-gray-500 text-white rounded-xl text-xs font-medium transition-colors flex-shrink-0"
          >
            <Play className="w-3 h-3" /> آزمایش
          </button>
        </div>
        {testResult && (
          <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs ${testResult.matched ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
            {testResult.matched
              ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{testResult.matched ? `فعال می‌شود (امتیاز: ${testResult.score})` : 'فعال نمی‌شود'}</p>
              <p className="mt-0.5 opacity-80">{testResult.reason}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
