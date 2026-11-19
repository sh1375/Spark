import { UnreadBadge } from '../../features/messaging/UnreadBadge';
import React, { useState, useRef, useEffect } from 'react';
import moment from 'moment-jalaali';
import { EllipsisVertical as MoreVertical, Pin, Trash2, Clock, Bookmark } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { ConversationWithProfile } from './types';

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  busy: 'bg-amber-500',
  away: 'bg-sky-500',
  dnd: 'bg-rose-500',
  offline: 'bg-slate-400',
};

interface Props {
  conversation: ConversationWithProfile;
  isActive: boolean;
  currentUserId: string | null;
  lastSeen?: string | null;
  onClick: () => void;
  onMentionClick?: (messageId: string) => void;
  onTogglePin?: (convId: string) => void;
  onAction?: () => void;
  onClearHistory?: () => void;
}

function Avatar({ name, size = 'md', avatarUrl, status, isOnline }: {
  name: string;
  size?: 'sm' | 'md';
  avatarUrl?: string | null;
  status?: string | null;
  isOnline?: boolean | null;
}) {
  const colors = [
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-cyan-500',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-xs';
  const resolvedStatus = status ?? (isOnline ? 'online' : 'offline');
  const dotColor = STATUS_DOT[resolvedStatus] ?? STATUS_DOT.offline;

  return (
    <div className="relative flex-shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className={`${sz} rounded-xl object-cover ring-1 ring-slate-200/70 dark:ring-slate-700`} />
      ) : (
        <div className={`${sz} ${color} flex items-center justify-center rounded-xl font-bold text-white shadow-sm`}>
          {name.charAt(0)}
        </div>
      )}
      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-950 ${dotColor}`} />
    </div>
  );
}

export function UserAvatar({ name, size = 'md', avatarUrl }: { name: string; size?: 'sm' | 'md'; avatarUrl?: string | null }) {
  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-500'];
  return (
    <div className={`relative flex-shrink-0 ${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full rounded-xl object-cover ring-1 ring-slate-200/70 dark:ring-slate-700" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm ${colors[name.charCodeAt(0) % colors.length]}`}>
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  const m = moment(iso);
  const now = moment();
  if (m.isSame(now, 'day')) return m.format('HH:mm');
  if (m.isSame(now.clone().subtract(1, 'day'), 'day')) return 'دیروز';
  return m.format('jYYYY/jMM/jDD');
}

export function ChatConversationItem({ conversation: c, isActive, currentUserId, lastSeen, onClick, onMentionClick, onTogglePin, onAction, onClearHistory }: Props) {
  const isSavedMessages = c.otherUser.user_id === currentUserId;
  const name = isSavedMessages ? 'پیام‌های ذخیره‌شده' : (c.otherUser.full_name || c.otherUser.username || c.otherUser.email || 'کاربر');
  const isMine = c.last_message_sender_id === currentUserId;
  const preview = c.last_message_text
    ? (isMine ? `شما: ${c.last_message_text}` : c.last_message_text)
    : 'مکالمه جدید';
  const ONLINE_THRESHOLD = 3 * 60 * 1000;
  const isOnline = Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD);
  const hasUnread = c.unreadCount > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onTogglePin?.(c.id);
    await supabase.rpc('toggle_pin_chat', { p_conversation_id: c.id });
    onAction?.();
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const { error } = await supabase.rpc('clear_chat_for_user', { p_conversation_id: c.id });
    if (error) { toast.error('خطا در پاک کردن تاریخچه'); return; }
    onAction?.();
    onClearHistory?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    await supabase.rpc('delete_chat_for_user', { p_conversation_id: c.id });
    onAction?.();
  };

  const rowClass = isActive
    ? 'border-indigo-200 bg-indigo-50/90 ring-1 ring-inset ring-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:ring-indigo-500/10'
    : hasUnread
      ? 'border-violet-100 bg-violet-50/55 hover:bg-violet-50 dark:border-violet-500/15 dark:bg-violet-500/[0.06] dark:hover:bg-violet-500/10'
      : 'border-transparent bg-white hover:border-slate-100 hover:bg-slate-50/80 dark:bg-slate-950 dark:hover:border-slate-800 dark:hover:bg-slate-900/80';

  return (
    <div className="group relative mb-1" dir="rtl">
      <button
        onClick={onClick}
        className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 text-right transition ${rowClass}`}
      >
        {(isActive || hasUnread) && (
          <span className={`absolute inset-y-2 right-0 w-0.5 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-violet-500'}`} />
        )}

        <div className="relative flex-shrink-0">
          {isSavedMessages ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-sm">
              <Bookmark className="h-4 w-4 text-white" />
            </div>
          ) : (
            <Avatar
              name={name}
              avatarUrl={c.otherUser.avatar_url}
              status={c.otherUser.status}
              isOnline={isOnline}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 text-right">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${hasUnread ? 'font-bold text-slate-950 dark:text-white' : 'font-bold text-slate-800 dark:text-slate-100'}`}>
              {name}
            </span>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {c.isPinned && (
                <Pin className="h-3 w-3 flex-shrink-0 text-indigo-400" style={{ transform: 'rotate(45deg)' }} />
              )}
              {c.hasMention && c.mentionMessageId && (
                <button
                  onClick={e => { e.stopPropagation(); onClick(); onMentionClick?.(c.mentionMessageId!); }}
                  title="پیامی که شما را منشن کرده"
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm transition hover:bg-amber-600"
                >
                  @
                </button>
              )}
              <UnreadBadge count={c.unreadCount} />
              <span className={`text-[9px] ${hasUnread ? 'font-bold text-violet-600 dark:text-violet-300' : 'text-slate-400 dark:text-slate-500'}`}>
                {formatTime(c.last_message_at)}
              </span>
            </div>
          </div>

          <p className={`mt-0.5 truncate text-[10px] leading-5 ${hasUnread ? 'font-bold text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
            {preview}
          </p>
        </div>
      </button>

      <button
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
        className="absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition-all hover:bg-slate-50 focus:opacity-100 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        title="گزینه‌ها"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute left-2 top-full z-50 mt-0.5 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          dir="rtl"
        >
          {!isSavedMessages && (
            <button
              onClick={handlePin}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right text-xs text-slate-700 transition hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-indigo-500/10"
            >
              <Pin className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
              {c.isPinned ? 'برداشتن پین' : 'پین کردن'}
            </button>
          )}
          <button
            onClick={handleClear}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right text-xs text-slate-700 transition hover:bg-amber-50 dark:text-slate-300 dark:hover:bg-amber-500/10"
          >
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            پاک کردن تاریخچه
          </button>
          {!isSavedMessages && (
            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right text-xs text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
              حذف چت
            </button>
          )}
        </div>
      )}
    </div>
  );
}