import { Search, X } from 'lucide-react';

export function SearchBar({ searchQuery, setSearchQuery, resultCount }: {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  resultCount: number;
}) {
  return (
    <div className="flex-shrink-0 border-b border-violet-100 bg-violet-50/45 px-3 py-1.5 dark:border-violet-500/15 dark:bg-violet-500/[0.05]">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute right-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-violet-400" aria-hidden="true" />
        <input name="chat-conversation-search" aria-label="جستجوی پیام"
          autoFocus
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="جستجو در پیام‌های این گفتگو..."
          className="w-full min-w-0 rounded-lg border border-violet-100 bg-white py-1.5 pl-9 pr-9 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-500/10 dark:border-violet-500/20 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500/40"
          dir="rtl"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="پاک کردن جستجو"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {searchQuery && (
        <p className="mt-1 text-right text-[9px] text-violet-500 dark:text-violet-300">
          {resultCount.toLocaleString('fa-IR')} نتیجه
        </p>
      )}
    </div>
  );
}