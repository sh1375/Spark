import { ClearSavedHistoryButton } from './ClearSavedHistoryButton';
import { ChevronRight, Search, Phone, Video, Star, Bell, Info, Bookmark, CalendarDays } from 'lucide-react';
import { UserAvatar } from '../ChatConversationItem';
import type { ConversationWithProfile } from '../types';

export function ConversationHeader(props: {
  onBack: () => void;
  onClearSavedHistory: () => void;
  isSavedMessages: boolean;
  otherName: string;
  conversation: ConversationWithProfile;
  otherUserPresence: { last_seen: string | null } | null;
  isUserOnline: (lastSeen?: string | null) => boolean;
  getLastSeenText: (lastSeen?: string | null) => string;
  localStarredCount: number;
  remindersCount: number;
  showSearch: boolean;
  onToggleSearch: () => void;
  onOpenStarred: () => void;
  onOpenReminders: () => void;
  onStartCall?: (callType: 'audio' | 'video') => void;
  onJumpToDate: () => void;
  showInfoPanel: boolean;
  onToggleInfoPanel: () => void;
}) {
  const {
    onBack, onClearSavedHistory, isSavedMessages, otherName, conversation, otherUserPresence,
    isUserOnline, getLastSeenText, localStarredCount, remindersCount,
    showSearch, onToggleSearch, onOpenStarred, onOpenReminders,
    onStartCall, onJumpToDate, showInfoPanel, onToggleInfoPanel,
  } = props;

  const online = !isSavedMessages && isUserOnline(otherUserPresence?.last_seen);

  return (
    <div className="flex min-w-0 flex-shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/95 px-2.5 py-2 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 sm:px-3">
      <button
        onClick={onBack}
        className="chat-icon-button flex h-9 w-8 flex-shrink-0 items-center max-sm:border-transparent sm:h-8 justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        title="بازگشت"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="relative flex-shrink-0">
        {isSavedMessages ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-sm">
            <Bookmark className="h-4 w-4 text-white" />
          </div>
        ) : (
          <>
            <UserAvatar name={otherName} size="sm" avatarUrl={conversation.otherUser.avatar_url} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-950 ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{otherName}</h3>
        {isSavedMessages ? (
          <p className="mt-0.5 truncate text-[9px] text-cyan-600 dark:text-cyan-300">پیام‌های شخصی شما</p>
        ) : (
          <p className={`mt-0.5 truncate text-[9px] sm:text-[10px] ${online ? 'font-bold text-emerald-600 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500'}`}>
            {getLastSeenText(otherUserPresence?.last_seen)}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-0.5 sm:gap-1">
        {isSavedMessages && <ClearSavedHistoryButton key={conversation.id} conversationId={conversation.id} onCleared={onClearSavedHistory} />}
        <button
          onClick={onOpenStarred}
          className="chat-icon-button relative flex h-9 w-8 items-center justify-center rounded-full sm:h-8 sm:rounded-lg border max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-amber-100 bg-amber-50 text-amber-600 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
          title="پیام‌های نشانه‌دار"
        >
          <Star className={`h-3.5 w-3.5 ${localStarredCount > 0 ? 'fill-amber-400' : ''}`} />
          {localStarredCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-bold text-white">
              {localStarredCount > 9 ? '۹+' : localStarredCount.toLocaleString('fa-IR')}
            </span>
          )}
        </button>

        <button
          onClick={onOpenReminders}
          className="chat-icon-button relative flex h-9 w-8 items-center justify-center rounded-full sm:h-8 sm:rounded-lg border max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
          title="یادآوری‌ها"
        >
          <Bell className="h-3.5 w-3.5" />
          {remindersCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
              {remindersCount > 9 ? '۹+' : remindersCount.toLocaleString('fa-IR')}
            </span>
          )}
        </button>

        <button
          onClick={onToggleSearch}
          aria-pressed={showSearch}
          className={`chat-icon-button flex h-9 w-8 items-center justify-center rounded-full sm:h-8 sm:rounded-lg border transition ${showSearch ? 'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300' : 'max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-violet-100 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300'}`}
          title="جستجو در پیام‌ها"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        {!isSavedMessages && (
          <button
            onClick={() => onStartCall?.('audio')}
            className="chat-icon-button flex h-9 w-8 items-center justify-center rounded-full sm:h-8 sm:rounded-lg border max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
            title="تماس صوتی"
          >
            <Phone className="h-3.5 w-3.5" />
          </button>
        )}

        {!isSavedMessages && (
          <button
            onClick={() => onStartCall?.('video')}
            className="chat-icon-button flex h-9 w-8 items-center justify-center rounded-full sm:h-8 sm:rounded-lg border max-sm:border-transparent max-sm:bg-transparent max-sm:dark:bg-transparent border-cyan-100 bg-cyan-50 text-cyan-600 transition hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
            title="تماس تصویری"
          >
            <Video className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          onClick={onJumpToDate}
          className="hidden h-8 w-8 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100 sm:flex dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          title="رفتن به تاریخ"
        >
          <CalendarDays className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={onToggleInfoPanel}
          className={`hidden h-8 w-8 items-center justify-center rounded-lg border transition sm:flex ${showInfoPanel ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          title="اطلاعات"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}