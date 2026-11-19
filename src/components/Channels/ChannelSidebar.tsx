import { UnreadBadge } from '../../features/messaging/UnreadBadge';
import { useState } from 'react';
import { Search, Plus, Users, Hash, Settings, ListTodo, LockKeyhole } from 'lucide-react';
import { ChannelWithMeta, ChannelType } from './types';

interface Props {
  channels: ChannelWithMeta[];
  groups: ChannelWithMeta[];
  activeTab: 'channels' | 'groups';
  selectedId: string | null;
  isAdmin: boolean;
  loading: boolean;
  canCreateChannel?: boolean;
  canCreateGroup?: boolean;
  onTabChange: (tab: 'channels' | 'groups') => void;
  onSelect: (id: string) => void;
  onCreateChannel: (type: ChannelType) => void;
  onOpenSettings: () => void;
  onOpenActions: () => void;
}

function ChannelItem({ ch, selected, onClick }: { ch: ChannelWithMeta; selected: boolean; onClick: () => void }) {
  const hasUnread = ch.unreadCount > 0;
  const isPrivate = Boolean((ch as any).is_private);

  return (
    <button
      onClick={onClick}
      className={`relative mb-1 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-right transition-all ${
        selected
          ? 'border-violet-200 bg-violet-50 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/10'
          : hasUnread
            ? 'border-violet-100 bg-violet-50/45 hover:bg-violet-50 dark:border-violet-500/15 dark:bg-violet-500/[0.06] dark:hover:bg-violet-500/10'
            : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-900'
      }`}
    >
      {(selected || hasUnread) && (
        <span className={`absolute inset-y-2 right-0 w-0.5 rounded-full ${selected ? 'bg-violet-600' : 'bg-violet-400'}`} />
      )}

      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${
        selected
          ? 'border-violet-200 bg-white text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-300'
          : ch.type === 'group'
            ? 'border-cyan-100 bg-cyan-50 text-cyan-600 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
            : 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300'
      }`}>
        {ch.type === 'group' ? <Users className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`truncate text-xs ${hasUnread || selected ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              {ch.name}
            </span>
            {isPrivate && <LockKeyhole className="h-3 w-3 flex-shrink-0 text-slate-400 dark:text-slate-500" />}
          </div>
          <UnreadBadge count={ch.unreadCount} />
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500">
          <span className="flex flex-shrink-0 items-center gap-1">
            <Users className="h-3 w-3" />
            {Number(ch.member_count || 0).toLocaleString('fa-IR')}
          </span>
          {ch.last_message_preview && (
            <>
              <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className={`truncate ${hasUnread ? 'font-bold text-slate-600 dark:text-slate-300' : ''}`}>{ch.last_message_preview}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export function ChannelSidebar({
  channels, groups, activeTab, selectedId, isAdmin, loading,
  canCreateChannel = true, canCreateGroup = true,
  onTabChange, onSelect, onCreateChannel, onOpenSettings, onOpenActions,
}: Props) {
  const [search, setSearch] = useState('');

  const items = activeTab === 'channels' ? channels : groups;
  const filtered = search ? items.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : items;
  const canCreate = activeTab === 'channels' ? canCreateChannel : canCreateGroup;
  const channelTotal = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);
  const groupTotal = groups.reduce((sum, ch) => sum + ch.unreadCount, 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-slate-950" dir="rtl">
      <div className="flex-shrink-0 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">کانال‌ها</h2>
              <UnreadBadge count={channelTotal} />
            </div>
            <p className="mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">
              {items.length.toLocaleString('fa-IR')} {activeTab === 'channels' ? 'کانال' : 'گروه'}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenActions}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              title="اقدامات جاری"
            >
              <ListTodo className="h-4 w-4" />
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              title="تنظیمات"
            >
              <Settings className="h-4 w-4" />
            </button>
            {(isAdmin || canCreate) && (
              <button
                onClick={() => onCreateChannel(activeTab === 'channels' ? 'channel' : 'group')}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500"
                title={activeTab === 'channels' ? 'کانال جدید' : 'گروه جدید'}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 rounded-xl bg-slate-100/90 p-1 dark:bg-slate-900">
          <button
            onClick={() => onTabChange('channels')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold transition ${
              activeTab === 'channels'
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-500'
            }`}
          >
            <Hash className="h-3.5 w-3.5" /> کانال‌های من <UnreadBadge count={channelTotal} />
          </button>
          <button
            onClick={() => onTabChange('groups')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold transition ${
              activeTab === 'groups'
                ? 'bg-white text-cyan-700 shadow-sm dark:bg-slate-800 dark:text-cyan-300'
                : 'text-slate-500 dark:text-slate-500'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> گروه‌های من <UnreadBadge count={groupTotal} />
          </button>
        </div>

        <div className="relative mt-2">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="جستجوی کانال یا گروه..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-3 pr-9 text-xs text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500/30"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              {activeTab === 'channels' ? <Hash className="h-5 w-5 text-slate-400" /> : <Users className="h-5 w-5 text-slate-400" />}
            </div>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              {search ? 'موردی یافت نشد' : `هنوز ${activeTab === 'channels' ? 'کانالی' : 'گروهی'} ندارید`}
            </p>
          </div>
        ) : (
          filtered.map(ch => (
            <ChannelItem key={ch.id} ch={ch} selected={selectedId === ch.id} onClick={() => onSelect(ch.id)} />
          ))
        )}
      </div>
    </div>
  );
}
