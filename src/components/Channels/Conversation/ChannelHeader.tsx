import { ArrowRight, Users, Pin, Search, X, Info, Star, GitFork, Settings, Hash } from 'lucide-react';
import type { Channel } from '../types';

export function ChannelHeader(props: {
  channel: Channel;
  isMobile: boolean;
  onBack: () => void;
  memberCount: number;
  showSearch: boolean;
  onToggleSearch: () => void;
  openGroupTasksCount: number;
  onShowTopics: () => void;
  onShowMembers: () => void;
  isAdmin: boolean;
  onShowSettings: () => void;
}) {
  const {
    channel, isMobile, onBack, memberCount, showSearch, onToggleSearch,
    openGroupTasksCount, onShowTopics, onShowMembers, isAdmin, onShowSettings,
  } = props;
  const isGroup = channel.type === 'group';

  return (
    <div className="flex min-w-0 flex-shrink-0 items-center gap-2 border-b border-slate-100 bg-white/95 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950 sm:px-3">
      {isMobile && (
        <button
          onClick={onBack}
          className="chat-icon-button flex h-9 w-8 flex-shrink-0 items-center justify-center sm:h-8 rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          title="بازگشت"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${
        isGroup
          ? 'border-cyan-100 bg-cyan-50 text-cyan-600 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
          : 'max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300'
      }`}>
        {isGroup ? <Users className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{channel.name}</h2>
          {(channel as any).is_private && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">خصوصی</span>
          )}
        </div>
        <p className="mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">
          {(memberCount || channel.member_count || 0).toLocaleString('fa-IR')} عضو · {isGroup ? 'گروه کاری' : 'کانال سازمانی'}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={onToggleSearch}
          aria-pressed={showSearch}
          className={`chat-icon-button flex h-9 w-8 items-center justify-center rounded-full border sm:h-8 sm:rounded-lg transition ${
            showSearch
              ? 'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300'
              : 'max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-violet-100 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300'
          }`}
          title="جستجو در پیام‌ها"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        {isGroup && (
          <button
            onClick={onShowTopics}
            className="relative chat-icon-button flex h-9 w-8 items-center justify-center rounded-full border sm:h-8 sm:rounded-lg max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
            title="موضوعات و اقدامات گروه"
          >
            <GitFork className="h-3.5 w-3.5" />
            {openGroupTasksCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white">
                {openGroupTasksCount > 9 ? '۹+' : openGroupTasksCount.toLocaleString('fa-IR')}
              </span>
            )}
          </button>
        )}

        <button
          onClick={onShowMembers}
          className="chat-icon-button flex h-9 w-8 items-center justify-center rounded-full border sm:h-8 sm:rounded-lg max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-indigo-100 bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          title="اعضا"
        >
          <Users className="h-3.5 w-3.5" />
        </button>

        {isAdmin && (
          <button
            onClick={onShowSettings}
            className="chat-icon-button flex h-9 w-8 items-center justify-center rounded-full border max-sm:border-transparent sm:h-8 sm:rounded-lg border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            title={isGroup ? 'تنظیمات گروه' : 'تنظیمات کانال'}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ChannelSearchBar({ searchQuery, setSearchQuery }: {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="flex-shrink-0 border-b border-slate-100 bg-white/95 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950 sm:px-3">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute right-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-violet-400" />
        <input
          autoFocus
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="جستجو در پیام‌های کانال..."
          className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-9 text-xs text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500/30"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-1.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="پاک کردن جستجو"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ChannelDescription({ description }: { description: string }) {
  return (
    <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <Info className="h-3 w-3 flex-shrink-0 text-indigo-400" />
        <span className="truncate">{description}</span>
      </p>
    </div>
  );
}

export function FloatingPinButton({ count, active, onClick, topClass }: {
  count: number; active: boolean; onClick: () => void; topClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute left-2.5 ${topClass} z-10 flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold shadow-md transition-all ${
        active
          ? 'border-amber-500 bg-amber-500 text-white'
          : 'border-amber-200 bg-white/95 text-amber-600 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-slate-900/95 dark:text-amber-300 dark:hover:bg-amber-500/10'
      }`}
      title="پیام‌های پین شده"
    >
      <Pin className="h-3.5 w-3.5" />
      <span>{count.toLocaleString('fa-IR')}</span>
    </button>
  );
}

export function FloatingStarButton({ count, active, onClick, topClass }: {
  count: number; active: boolean; onClick: () => void; topClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute left-2.5 ${topClass} z-10 flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold shadow-md transition-all ${
        active
          ? 'border-yellow-400 bg-yellow-400 text-white'
          : 'border-yellow-200 bg-white/95 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-500/30 dark:bg-slate-900/95 dark:text-yellow-300 dark:hover:bg-yellow-500/10'
      }`}
      title="پیام‌های نشان‌دار"
    >
      <Star className={`h-3.5 w-3.5 ${active ? 'fill-white' : 'fill-yellow-400'}`} />
      <span>{count.toLocaleString('fa-IR')}</span>
    </button>
  );
}
