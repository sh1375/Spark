import { MessageCircle, CalendarDays } from 'lucide-react';
import moment from 'moment-jalaali';
import { ChatMessage } from '../ChatMessage';
import type { MessageWithMeta } from '../types';

export interface ChatThemeSettings {
  backgroundStyle: 'none' | 'dots' | 'lines' | 'gradient';
  backgroundGradientFrom: string;
  backgroundGradientTo: string;
}

export function MessageList(props: {
  messages: MessageWithMeta[];
  grouped: { date: string; messages: MessageWithMeta[] }[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatTheme: ChatThemeSettings;
  currentUserId: string;
  orgUsers: any[];
  setJumpPickerDate: React.Dispatch<React.SetStateAction<{ jy: number; jm: number; jd: number } | null>>;
  setReplyingTo: React.Dispatch<React.SetStateAction<MessageWithMeta | null>>;
  setEditingMessage: React.Dispatch<React.SetStateAction<MessageWithMeta | null>>;
  handleStar: (id: string, isStarred: boolean) => void;
  handleDeleteForMe: (id: string) => void;
  handleDeleteForAll: (id: string) => void;
  handleReact: (id: string, emoji: string) => void;
  handleStatusChange: (id: string, status: any) => void;
  handleScheduleMeeting: (ids: string[], body: string) => void;
  fetchMessages: () => void;
  fetchReminders: () => void;
  scrollToMessage: (id: string) => void;
  onNavigateToTasks?: (body: string, id: string) => void;
  onOpenDirectChat?: (userId: string) => void;
  formatDate: (jDate: string) => string;
}) {
  const {
    messages, grouped, scrollRef, messageRefs, chatTheme, currentUserId, orgUsers,
    setJumpPickerDate, setReplyingTo, setEditingMessage,
    handleStar, handleDeleteForMe, handleDeleteForAll, handleReact, handleStatusChange,
    handleScheduleMeeting, fetchMessages, fetchReminders, scrollToMessage, onNavigateToTasks, onOpenDirectChat, formatDate,
  } = props;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-slate-50/60 py-2.5 dark:from-slate-950 dark:via-[#17191f] dark:to-slate-950"
      style={(() => {
        const dotColor = document.documentElement.classList.contains('dark') ? '#30343b' : '#e7eaf0';
        const lineColor = document.documentElement.classList.contains('dark') ? '#292d33' : '#edf0f4';
        if (chatTheme.backgroundStyle === 'dots')
          return { backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`, backgroundSize: '20px 20px' };
        if (chatTheme.backgroundStyle === 'lines')
          return { backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 19px, ${lineColor} 19px, ${lineColor} 20px)` };
        if (chatTheme.backgroundStyle === 'gradient')
          return { background: `linear-gradient(135deg, ${chatTheme.backgroundGradientFrom}, ${chatTheme.backgroundGradientTo})` };
        return {};
      })()}
    >
      {grouped.map(group => {
        const jDate = moment(group.date, 'jYYYY/jMM/jDD');
        const jy = jDate.jYear();
        const jm = jDate.jMonth() + 1;
        const jd = jDate.jDate();
        return (
          <div key={group.date}>
            <div className="my-2 flex items-center justify-center px-3">
              <div className="h-px max-w-24 flex-1 bg-slate-200/70 dark:bg-slate-800" />
              <button
                onClick={() => setJumpPickerDate({ jy, jm, jd })}
                className="mx-2 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[9px] text-slate-500 shadow-sm transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <CalendarDays className="h-3 w-3 flex-shrink-0 text-indigo-400" />
                {formatDate(group.date)} · {group.date}
              </button>
              <div className="h-px max-w-24 flex-1 bg-slate-200/70 dark:bg-slate-800" />
            </div>

            {group.messages.map(msg => (
              <div
                key={msg.id}
                data-unread-message-id={msg.sender_id !== currentUserId && !msg.read_by.includes(currentUserId) ? msg.id : undefined}
                ref={el => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                className="rounded-xl transition-all duration-300"
              >
                <ChatMessage
                  message={msg}
                  isOwn={msg.sender_id === currentUserId}
                  currentUserId={currentUserId}
                  allUsers={orgUsers}
                  onReply={() => setReplyingTo(msg)}
                  onEdit={() => setEditingMessage(msg)}
                  onStar={() => handleStar(msg.id, msg.isStarred)}
                  onDeleteForMe={() => handleDeleteForMe(msg.id)}
                  onDeleteForAll={() => handleDeleteForAll(msg.id)}
                  onReact={emoji => handleReact(msg.id, emoji)}
                  onStatusChange={status => handleStatusChange(msg.id, status)}
                  onScheduleMeeting={handleScheduleMeeting}
                  onTagsChanged={fetchMessages}
                  onReminderSet={fetchReminders}
                  onScrollToMessage={scrollToMessage}
                  onRegisterAsTask={onNavigateToTasks}
                  onOpenDirectChat={onOpenDirectChat}
                />
              </div>
            ))}
          </div>
        );
      })}

      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-400 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
            <MessageCircle className="h-6 w-6" />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">اولین پیام را ارسال کنید</p>
        </div>
      )}
    </div>
  );
}