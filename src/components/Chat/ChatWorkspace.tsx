import { useState, type ReactNode } from 'react';
import { MessageCircle, Phone, Users } from 'lucide-react';
import { UnreadBadge } from '../../features/messaging/UnreadBadge';
import { useMessageUnreadCounts } from '../../features/messaging/messageUnreadCounts';

const tabs = [
  { id: 'chats', label: 'پیام‌ها', Icon: MessageCircle },
  { id: 'groups', label: 'گروه‌ها', Icon: Users },
  { id: 'calls', label: 'تماس‌ها', Icon: Phone },
] as const;

type Tab = typeof tabs[number]['id'];

export function ChatWorkspace({ canChat, openGroups, onOpenGroups, directUserId, renderChat, groups }: {
  canChat: boolean;
  openGroups: boolean;
  onOpenGroups: (open: boolean) => void;
  directUserId: string | null;
  renderChat: (showCalls: boolean, onOpenMessages: () => void) => ReactNode;
  groups?: ReactNode;
}) {
  const [showCalls, setShowCalls] = useState(false);
  const [visitedGroups, setVisitedGroups] = useState(openGroups);
  const { directTotal, groupTotal } = useMessageUnreadCounts();
  const availableTabs = tabs.filter(tab => tab.id === 'groups' ? !!groups : canChat || !groups);
  const active: Tab = groups && (!canChat || (openGroups && !directUserId))
    ? 'groups'
    : showCalls && !directUserId ? 'calls' : 'chats';
  const badges = { chats: directTotal, groups: groupTotal, calls: 0 };

  function select(tab: Tab) {
    if (tab === 'groups' || active === 'groups') setVisitedGroups(true);
    onOpenGroups(tab === 'groups');
    setShowCalls(tab === 'calls');
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" dir="rtl">
      {availableTabs.length > 1 && (
        <div role="tablist" aria-label="بخش‌های چت سازمانی" className="mx-1 flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900 sm:mx-0">
          {availableTabs.map(({ id, label, Icon }, index) => (
            <button
              key={id}
              id={`chat-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={active === id}
              aria-controls={`chat-panel-${id}`}
              tabIndex={active === id ? 0 : -1}
              onClick={() => select(id)}
              onKeyDown={event => {
                const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
                if (!step && event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? availableTabs.length - 1
                  : (index + step + availableTabs.length) % availableTabs.length;
                const next = availableTabs[nextIndex].id;
                select(next);
                document.getElementById(`chat-tab-${next}`)?.focus();
              }}
              className={`chat-icon-button flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-semibold transition-colors ${active === id ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300' : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800/70'}`}
            >
              <Icon className="size-4 shrink-0" /> {label} <UnreadBadge count={badges[id]} />
            </button>
          ))}
        </div>
      )}
      {(canChat || !groups) && (
        <div hidden={active === 'groups'} className="min-h-0 flex-1">
          {renderChat(active === 'calls', () => select('chats'))}
        </div>
      )}
      {groups && (
        <div hidden={active !== 'groups'} role="tabpanel" id="chat-panel-groups" aria-labelledby={availableTabs.length > 1 ? 'chat-tab-groups' : undefined} className="min-h-0 flex-1">
          {(visitedGroups || active === 'groups') && groups}
        </div>
      )}
    </div>
  );
}
