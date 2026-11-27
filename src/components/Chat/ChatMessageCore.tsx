import { useEffect, useRef, useState, type CSSProperties } from 'react';
import moment from 'moment-jalaali';
import {
  Star, EllipsisVertical as MoreVertical, CreditCard as Edit2, Trash2, Bell, Copy,
  Play, Pause, Tag, Send, Check, Loader, Reply, X, Smile, ClipboardList, BellRing,
  Forward, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { EmojiPicker } from './EmojiPicker';
import type { MessageWithMeta, MessageStatus, UserProfile } from './types';
import { FALLBACK_NAME } from '../../lib/useOrgUsers';
import { UserAvatar } from './ChatConversationItem';
import { ForwardModal } from './ForwardModal';
import { supabase } from '../../lib/supabase';
import { loadChatTheme, type ChatThemeSettings } from './chatTheme';
import { useChatAttachmentUrl } from '../../lib/chatAttachments';
import { renderMarkdownBody } from './ChatMessageMarkdown';
import {
  ChatMessageMenuItem,
  ChatViewersModal,
  MentionProfilePopup,
  ReminderModal,
  TagModal,
} from './ChatMessageOverlays';

const DELETED_MESSAGE_TEXT = '⛔ این پیام حذف شده است';

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function useChatTheme(): ChatThemeSettings {
  const [theme, setTheme] = useState<ChatThemeSettings>(loadChatTheme);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) setTheme(detail as ChatThemeSettings);
      else setTheme(loadChatTheme());
    };
    window.addEventListener('chatThemeChanged', handler);
    return () => window.removeEventListener('chatThemeChanged', handler);
  }, []);
  return theme;
}

const TYPE_BORDER_CLASSES: Record<string, { own: string; other: string }> = {
  normal: { own: '', other: '' },
  important: { own: 'border-l-4', other: 'border-r-4' },
  urgent: { own: 'border-l-4', other: 'border-r-4' },
  confidential: { own: 'border-l-4', other: 'border-r-4' },
};

interface Props {
  message: MessageWithMeta;
  isOwn: boolean;
  currentUserId: string;
  allUsers: UserProfile[];
  onReply: () => void;
  onEdit: () => void;
  onStar: () => void;
  onDeleteForMe: () => void;
  onDeleteForAll: () => void;
  onReact: (emoji: string) => void;
  onStatusChange: (status: MessageStatus) => void;
  onScheduleMeeting: (mentionedIds: string[], body: string) => void;
  onTagsChanged: () => void;
  onReminderSet: () => void;
  onScrollToMessage?: (messageId: string) => void;
  onRegisterAsTask?: (messageBody: string, messageId: string) => void;
  onMentionClick?: (user: UserProfile) => void;
  onOpenDirectChat?: (userId: string) => void;
}

export function ChatMessage({
  message, isOwn, currentUserId, allUsers,
  onReply, onEdit, onStar, onDeleteForMe, onDeleteForAll,
  onReact, onStatusChange, onScheduleMeeting, onTagsChanged, onReminderSet,
  onScrollToMessage, onRegisterAsTask, onMentionClick, onOpenDirectChat,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [emojiPickerStyle, setEmojiPickerStyle] = useState<CSSProperties>({});
  const [confidentialRevealed, setConfidentialRevealed] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showViewersModal, setShowViewersModal] = useState(false);
  const [mentionPopupUser, setMentionPopupUser] = useState<UserProfile | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const openEmojiPicker = () => {
    if (reactRef.current) {
      const rect = reactRef.current.getBoundingClientRect();
      const pickerW = Math.min(288, window.innerWidth - 16);
      let left = rect.left;
      if (left + pickerW > window.innerWidth - 8) left = window.innerWidth - pickerW - 8;
      if (left < 8) left = 8;
      const style: CSSProperties = { position: 'fixed', left, zIndex: 9999 };
      if (rect.top >= 348) style.bottom = window.innerHeight - rect.top + 4;
      else style.top = rect.bottom + 4;
      setEmojiPickerStyle(style);
    }
    setShowReactPicker(value => !value);
  };

  const fileUrl = useChatAttachmentUrl(message.file_url);
  const voiceUrl = useChatAttachmentUrl(message.voice_url);
  const isConfidential = message.message_type === 'confidential';
  const shouldBlur = isConfidential && !isOwn && !confidentialRevealed;
  const seenByOther = isOwn && (message.read_by?.some(id => id !== currentUserId) ?? false);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (reactRef.current && !reactRef.current.contains(event.target as Node)) setShowReactPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleVoice = () => {
    if (!voiceUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceUrl);
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) setVoiceProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
      };
      audioRef.current.onended = () => { setIsPlayingVoice(false); setVoiceProgress(0); };
    }
    if (isPlayingVoice) {
      audioRef.current.pause();
      setIsPlayingVoice(false);
    } else {
      audioRef.current.play();
      setIsPlayingVoice(true);
    }
  };

  const extractMentionIds = (text: string | null): string[] => {
    if (!text) return [];
    return allUsers
      .filter(user => {
        const name = user.full_name || user.username || user.email;
        return name && text.includes(`@${name}`);
      })
      .map(user => user.user_id);
  };

  const timeStr = moment(message.created_at).format('HH:mm');
  const mentionIds = extractMentionIds(message.body);
  const hasMentions = mentionIds.length > 0;
  const tags = message.tags || [];
  const isDeleted = message.body === DELETED_MESSAGE_TEXT;
  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  const cycleStatus = () => {
    const next: Record<MessageStatus, MessageStatus> = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
    onStatusChange(next[message.status || 'pending']);
  };

  const status = message.status || 'pending';
  const statusLabel = {
    pending: 'در انتظار',
    in_progress: 'در حال رسیدگی',
    done: 'رسیدگی شده',
  }[status];

  const theme = useChatTheme();
  const isDark = useDarkMode();

  const removeTag = async (tagId: string) => {
    await supabase.from('chat_message_tag_assignments')
      .delete().eq('message_id', message.id).eq('tag_id', tagId).eq('user_id', currentUserId);
    onTagsChanged();
  };

  const cardStyle = isOwn
    ? { backgroundColor: isDark ? '#2a453d' : theme.sentBubbleColor }
    : { backgroundColor: isDark ? '#4d5049' : theme.receivedBubbleColor };
  const cardBg = 'text-gray-900 dark:text-white';
  const borderClass = 'border-gray-200 dark:border-gray-700';
  const actionButtonClass = 'chat-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors sm:h-7 sm:w-7';
  const iconClass = 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white';

  const typeBorderStyle: CSSProperties = {};
  if (message.message_type === 'important') typeBorderStyle[isOwn ? 'borderLeftColor' : 'borderRightColor'] = theme.importantColor;
  else if (message.message_type === 'urgent') typeBorderStyle[isOwn ? 'borderLeftColor' : 'borderRightColor'] = theme.urgentColor;
  else if (message.message_type === 'confidential') typeBorderStyle[isOwn ? 'borderLeftColor' : 'borderRightColor'] = theme.confidentialColor;

  const typeLabel = message.message_type !== 'normal' ? {
    text: message.message_type === 'important' ? 'پیام مهم!' : message.message_type === 'urgent' ? 'پیام اورژانسی!' : 'محرمانه',
    style: { color: message.message_type === 'important' ? theme.importantColor : message.message_type === 'urgent' ? theme.urgentColor : theme.confidentialColor },
  } : null;

  const fontSize = theme.fontSize === 'sm' ? '12px' : theme.fontSize === 'lg' ? '16px' : '14px';
  const bubbleRadiusClass = theme.bubbleRadius === 'sharp' ? 'rounded-lg' : theme.bubbleRadius === 'pill' ? 'rounded-3xl' : 'rounded-xl';

  return (
    <>
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2.5 px-3`} dir="rtl">
        <div className={`relative flex items-end gap-2 w-full sm:w-[65%] sm:min-w-[220px] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {message.message_type === 'urgent' && (
            <span className="absolute -top-2.5 z-10 pointer-events-none" style={{ [isOwn ? 'left' : 'right']: '2.5rem' }}>
              <BellRing className="w-5 h-5 text-red-500 drop-shadow-lg animate-bounce" />
            </span>
          )}

          <div className="flex-shrink-0 mb-1">
            <UserAvatar name={message.senderProfile?.full_name || 'U'} size="sm" avatarUrl={message.senderProfile?.avatar_url} />
          </div>

          <div className="min-w-0 flex-1 flex flex-col">
            {message.replyTarget && (
              <button onClick={() => onScrollToMessage?.(message.replyTarget!.id)} className="w-full text-right text-xs px-3 py-1.5 rounded-t-xl border-r-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-gray-600 dark:text-gray-300 truncate hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer">
                {message.replyTarget.body || '📎 فایل'}
              </button>
            )}

            <div className={`relative ${bubbleRadiusClass} ${message.replyTarget ? 'rounded-tr-none' : ''} ${cardBg} shadow-sm border ${borderClass} ${TYPE_BORDER_CLASSES[message.message_type]?.[isOwn ? 'own' : 'other'] ?? ''}`} style={{ ...cardStyle, ...typeBorderStyle, fontSize }}>
              <div className={`flex items-center justify-between px-3 pt-2 pb-0.5 gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-2 min-w-0 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  {!isOwn && message.senderProfile && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">{message.senderProfile.full_name || FALLBACK_NAME}</span>
                  )}
                  {typeLabel && <span className="text-[11px] flex-shrink-0 font-semibold" style={typeLabel.style}>{typeLabel.text}</span>}
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{timeStr}</span>
              </div>

              {message.is_forwarded && (
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-0.5">
                  <Forward className="w-3 h-3 text-teal-500 flex-shrink-0" />
                  <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium truncate">ارسال‌شده از {message.forwarded_from_name || 'کاربر'}</span>
                </div>
              )}

              <div className="px-3 pb-1">
                {voiceUrl && (
                  <div className="flex items-center gap-2 min-w-[150px] py-1">
                    <button onClick={toggleVoice} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 transition-colors">
                      {isPlayingVoice ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="relative h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${voiceProgress * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{message.voice_duration ? formatDuration(message.voice_duration) : '0:00'}</span>
                    </div>
                  </div>
                )}

                {shouldBlur ? (
                  <div className="relative py-1">
                    <p className="text-sm blur-sm select-none pointer-events-none">{message.body}</p>
                    <button onClick={() => setConfidentialRevealed(true)} className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-gray-700/80 rounded-lg backdrop-blur-sm hover:bg-white/95 transition-colors">
                      <Eye className="w-3.5 h-3.5" /> نمایش پیام محرمانه
                    </button>
                  </div>
                ) : message.body && (
                  isDeleted ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>این پیام حذف شده است</span>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed py-0.5 break-words">
                      {renderMarkdownBody(message.body, currentUserId, allUsers, user => {
                        if (onMentionClick) onMentionClick(user);
                        else setMentionPopupUser(user);
                      })}
                    </div>
                  )
                )}

                {fileUrl && !voiceUrl && (
                  message.file_type === 'image' ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="block mt-1">
                      <img src={fileUrl} alt={message.file_name || 'تصویر'} className="max-w-full rounded-lg max-h-48 object-cover" />
                    </a>
                  ) : (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 mt-1 px-2.5 py-2 bg-black/5 dark:bg-white/10 rounded-lg text-xs hover:bg-black/10 transition-colors">
                      <span>📎</span>
                      <span className="truncate max-w-[200px]">{message.file_name || 'فایل'}</span>
                    </a>
                  )
                )}
              </div>

              {!isDeleted && (
                <div className={`flex items-center gap-0.5 px-2 pb-1 sm:gap-1 sm:pb-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  <button
                    onClick={cycleStatus}
                    title={`تغییر وضعیت رسیدگی: ${statusLabel}`}
                    className={`${actionButtonClass} ${iconClass}`}
                  >
                    {status === 'pending' && <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-500 dark:border-slate-400" />}
                    {status === 'in_progress' && <Loader className="h-4 w-4 text-amber-600 dark:text-amber-400 motion-safe:animate-spin" />}
                    {status === 'done' && <Check className="h-4 w-4 text-teal-700 dark:text-teal-400" />}
                  </button>
                  <button onClick={onStar} title={message.isStarred ? 'برداشتن ستاره' : 'نشانه‌دار'} className={`${actionButtonClass} ${message.isStarred ? 'text-yellow-500' : iconClass}`}>
                    <Star className={`w-4 h-4 ${message.isStarred ? 'fill-yellow-400' : ''}`} />
                  </button>
                  <button onClick={() => setShowTagModal(true)} title="تگ" className={`${actionButtonClass} ${iconClass}`}><Tag className="w-4 h-4" /></button>
                  <div ref={reactRef}>
                    <button onClick={openEmojiPicker} title="ایموجی" className={`${actionButtonClass} ${iconClass}`}><Smile className="w-4 h-4" /></button>
                    {showReactPicker && (
                      <div style={emojiPickerStyle}>
                        <EmojiPicker onSelect={emoji => { onReact(emoji); setShowReactPicker(false); }} onClose={() => setShowReactPicker(false)} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1" />
                  {isOwn && (
                    <button onClick={() => setShowViewersModal(true)} className={`${actionButtonClass} ${iconClass}`} title={seenByOther ? 'دیده شده — کلیک برای جزئیات' : 'دیده نشده'}>
                      <Eye className={`w-3.5 h-3.5 ${seenByOther ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'}`} />
                    </button>
                  )}
                  <div className="relative" ref={menuRef}>
                    <button onClick={() => setShowMenu(value => !value)} aria-label="گزینه‌های پیام" aria-expanded={showMenu} className={`${actionButtonClass} ${iconClass}`}><MoreVertical className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              {!isDeleted && tags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap px-3 pb-2">
                  {tags.slice(0, 3).map(tag => (
                    <button key={tag.id} onClick={() => removeTag(tag.id)} title="کلیک برای حذف تگ" className="chat-icon-button inline-flex max-w-full items-center [overflow-wrap:anywhere] gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white leading-none hover:opacity-75 transition-opacity group" style={{ backgroundColor: tag.color }}>
                      {tag.name}<X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                  {tags.length > 3 && <span className="text-[10px] text-gray-400">+{tags.length - 3}</span>}
                </div>
              )}
            </div>

            {!isDeleted && message.reactions.length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {message.reactions.map(reaction => (
                  <button key={reaction.emoji} onClick={() => onReact(reaction.emoji)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${reaction.reactedByMe ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}>
                    {reaction.emoji} <span className="text-gray-600 dark:text-gray-300">{reaction.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {mentionPopupUser && <MentionProfilePopup user={mentionPopupUser} currentUserId={currentUserId} onClose={() => setMentionPopupUser(null)} onOpenDirectChat={onOpenDirectChat} />}
      {showReminderModal && <ReminderModal messageId={message.id} messageBody={message.body} currentUserId={currentUserId} onClose={() => setShowReminderModal(false)} onSaved={() => { setShowReminderModal(false); onReminderSet(); }} />}
      {showTagModal && <TagModal messageId={message.id} currentTags={tags} currentUserId={currentUserId} onClose={() => setShowTagModal(false)} onChanged={() => { setShowTagModal(false); onTagsChanged(); }} />}
      {showForwardModal && <ForwardModal body={message.body} fileUrl={message.file_url} fileName={message.file_name} fileType={message.file_type} currentUserId={currentUserId} allUsers={allUsers} senderName={message.senderProfile?.full_name || null} onClose={() => setShowForwardModal(false)} />}
      {showViewersModal && <ChatViewersModal messageId={message.id} conversationId={message.conversation_id} messageCreatedAt={message.created_at} currentUserId={currentUserId} allUsers={allUsers} readBy={message.read_by || []} onClose={() => setShowViewersModal(false)} />}

      {showMenu && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setShowMenu(false)} dir="rtl">
          <div className="w-full sm:w-64 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 py-2 mb-0 sm:mb-0 overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="flex justify-center mb-1 sm:hidden"><div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" /></div>
            {message.body && <div className="px-4 py-2 mb-1 border-b border-gray-100 dark:border-gray-800"><p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{message.body}</p></div>}
            {onRegisterAsTask && <ChatMessageMenuItem icon={<ClipboardList className="w-4 h-4 text-teal-600 dark:text-teal-400" />} label="ثبت در اقدام" labelClass="text-teal-600 dark:text-teal-400 font-medium" onClick={() => { onRegisterAsTask(message.body || '', message.id); setShowMenu(false); }} />}
            <ChatMessageMenuItem icon={<Bell className="w-4 h-4" />} label="تنظیم یادآوری" onClick={() => { setShowReminderModal(true); setShowMenu(false); }} />
            <ChatMessageMenuItem icon={<Send className="w-4 h-4" />} label="ارسال اعلان پیگیری" onClick={() => { sendFollowUp(); setShowMenu(false); }} />
            <ChatMessageMenuItem icon={<Reply className="w-4 h-4" />} label="پاسخ" onClick={() => { onReply(); setShowMenu(false); }} />
            <ChatMessageMenuItem icon={<Forward className="w-4 h-4" />} label="ارسال به دیگران (Forward)" onClick={() => { setShowForwardModal(true); setShowMenu(false); }} />
            {message.body && <ChatMessageMenuItem icon={<Copy className="w-4 h-4" />} label="کپی متن" onClick={() => { navigator.clipboard.writeText(message.body!); toast.success('کپی شد'); setShowMenu(false); }} />}
            {isOwn && <ChatMessageMenuItem icon={<Edit2 className="w-4 h-4" />} label="ویرایش" onClick={() => { onEdit(); setShowMenu(false); }} />}
            {hasMentions && <ChatMessageMenuItem icon={<span className="text-teal-500 text-xs font-bold">📅</span>} label="تنظیم جلسه با منشن‌ها" labelClass="text-teal-600 dark:text-teal-400 font-medium" onClick={() => { onScheduleMeeting(mentionIds, message.body || ''); setShowMenu(false); }} />}
            <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
            <ChatMessageMenuItem icon={<Trash2 className="w-4 h-4 text-red-500" />} label="حذف برای من" labelClass="text-red-500" onClick={() => { onDeleteForMe(); setShowMenu(false); }} />
            {isOwn && <ChatMessageMenuItem icon={<Trash2 className="w-4 h-4 text-red-600" />} label="حذف برای همه" labelClass="text-red-600" onClick={() => { onDeleteForAll(); setShowMenu(false); }} />}
          </div>
        </div>
      )}
    </>
  );

  async function sendFollowUp() {
    const conversationId = message.conversation_id;
    const { data: conversation } = await supabase
      .from('chat_conversations')
      .select('participant_a, participant_b')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conversation) {
      toast.error('گفتگو یافت نشد');
      return;
    }
    const recipientId = conversation.participant_a === currentUserId ? conversation.participant_b : conversation.participant_a;
    const senderProfile = allUsers.find(user => user.user_id === currentUserId);
    await supabase.rpc('create_notification', {
      p_user_id: recipientId,
      p_title: senderProfile?.full_name || 'پیگیری پیام',
      p_message: `پیگیری: "${(message.body || '').slice(0, 80)}"`,
      p_type: 'chat',
      p_action_url: 'chat',
    });
    toast.success('اعلان پیگیری ارسال شد');
  }
}
