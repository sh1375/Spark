import { UnreadBadge } from '../../features/messaging/UnreadBadge';
import { useMessageUnreadCounts } from '../../features/messaging/messageUnreadCounts';
import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState } from 'react';
import { Search, Plus, RefreshCw, SquareCheck as CheckSquare, Phone, MessageCircle, Settings2, Bookmark, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ConversationWithProfile } from './types';
import { ChatConversationItem } from './ChatConversationItem';

export type SidebarTab = 'chats' | 'calls';

interface Props {
  conversations: ConversationWithProfile[];
  activeId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  onRefresh: () => void;
  onTogglePin?: (convId: string) => void;
  onOpenSavedMessages?: () => void;
  onToggleActions: () => void;
  showActions: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onOpenSettings?: () => void;
  onMentionClick?: (convId: string, messageId: string) => void;
  onOpenWorkGroups?: () => void;
  onClearHistory?: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  currentUserId,
  onSelect,
  onNewConversation,
  onRefresh,
  onTogglePin,
  onOpenSavedMessages,
  onToggleActions,
  showActions,
  activeTab,
  onTabChange,
  onOpenSettings,
  onMentionClick,
  onOpenWorkGroups,
  onClearHistory,
}: Props) {
  const { directTotal, groupTotal } = useMessageUnreadCounts();
  const [search, setSearch] = useState('');
  const [presenceMap, setPresenceMap] = useState<Record<string, { last_seen: string | null; status: string | null }>>({});

  const filtered = conversations.filter(c =>
    c.otherUser.user_id !== currentUserId &&
    ((c.otherUser.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.otherUser.username || c.otherUser.email || '').toLowerCase().includes(search.toLowerCase()))
  );

  const pinned = filtered.filter(c => c.isPinned);
  const unpinned = filtered.filter(c => !c.isPinned);
  const unreadTotal = directTotal + (onOpenWorkGroups ? groupTotal : 0);
  const mentionTotal = conversations.filter(c => c.hasMention).length;

  useLiveData(LIVE_DATA.presence, async () => {
    const userIds = conversations.map(c => c.otherUser.user_id);
    if (!userIds.length) { setPresenceMap({}); return; }
    const { data, error } = await supabase.from('user_presence').select('user_id,last_seen,status').in('user_id', userIds);
    if (!error) setPresenceMap(Object.fromEntries((data || []).map(p => [p.user_id, { last_seen: p.last_seen, status: p.status ?? null }])));
  }, !!currentUserId, undefined, conversations.map(c => c.otherUser.user_id).sort().join(','));

  const renderConversation = (c: ConversationWithProfile) => (
    <ChatConversationItem
      key={c.id}
      conversation={{
        ...c,
        otherUser: {
          ...c.otherUser,
          status: presenceMap[c.otherUser.user_id]?.status ?? c.otherUser.status,
        },
      }}
      lastSeen={presenceMap[c.otherUser.user_id]?.last_seen ?? null}
      isActive={c.id === activeId}
      currentUserId={currentUserId}
      onClick={() => onSelect(c.id)}
      onMentionClick={msgId => onMentionClick?.(c.id, msgId)}
      onTogglePin={onTogglePin}
      onAction={onRefresh}
      onClearHistory={onClearHistory}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col" dir="rtl">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">چت سازمانی</h2>
            <UnreadBadge count={unreadTotal} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[9px] text-slate-400 dark:text-slate-500">
            <span>{filtered.length.toLocaleString('fa-IR')} گفتگو</span>
            {mentionTotal > 0 && <span className="font-bold text-amber-600 dark:text-amber-300">{mentionTotal.toLocaleString('fa-IR')} منشن</span>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            title="بازنشانی"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onNewConversation}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600 transition hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
            title="گفتگوی جدید"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            onClick={onToggleActions}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
              showActions
                ? 'border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300'
                : 'border-teal-100 bg-teal-50 text-teal-600 hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300'
            }`}
            title="اقدامات چت"
          >
            <CheckSquare className="h-4 w-4" />
          </button>

          <button
            onClick={onOpenSettings}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-600 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            title="تنظیمات چت"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mx-2.5 mt-2 flex flex-shrink-0 gap-1 rounded-xl bg-slate-100/90 p-1 dark:bg-slate-900">
        <button
          onClick={() => onTabChange('chats')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition ${
            activeTab === 'chats'
              ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          پیام‌ها <UnreadBadge count={directTotal} />
        </button>

        {onOpenWorkGroups && (
          <button
            onClick={onOpenWorkGroups}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <Users className="h-3.5 w-3.5" /> گروه‌ها <UnreadBadge count={groupTotal} />
          </button>
        )}

        <button
          onClick={() => onTabChange('calls')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition ${
            activeTab === 'calls'
              ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-300'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
          }`}
        >
          <Phone className="h-3.5 w-3.5" />
          تماس‌ها
        </button>
      </div>

      {activeTab === 'chats' && (
        <div className="flex-shrink-0 px-2.5 py-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input name="chat-contact-search" aria-label="جستجوی مخاطب"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="جستجوی مخاطب..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-3 pr-9 text-xs text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500/30"
            />
          </div>
        </div>
      )}

      {activeTab === 'chats' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {onOpenSavedMessages && (
            <button
              onClick={onOpenSavedMessages}
              className="mb-1 flex w-full items-center gap-2.5 rounded-xl border border-cyan-100 bg-cyan-50/60 px-2.5 py-2 text-right transition hover:bg-cyan-50 dark:border-cyan-500/15 dark:bg-cyan-500/[0.06] dark:hover:bg-cyan-500/10"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-sm">
                <Bookmark className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">پیام‌های ذخیره‌شده</p>
                <p className="mt-0.5 truncate text-[9px] text-slate-400 dark:text-slate-500">یادداشت‌ها و فایل‌های شخصی</p>
              </div>
            </button>
          )}

          {pinned.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                <span>سنجاق‌شده</span>
                <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
              </div>
              {pinned.map(renderConversation)}
            </>
          )}

          {unpinned.length > 0 && pinned.length > 0 && (
            <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[9px] font-bold text-slate-400 dark:text-slate-500">
              <span>گفتگوها</span>
              <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
          )}

          {unpinned.map(renderConversation)}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <MessageCircle className="h-8 w-8 text-slate-200 dark:text-slate-700" />
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">گفتگویی پیدا نشد</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}