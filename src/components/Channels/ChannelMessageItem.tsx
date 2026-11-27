import type { ChatTag } from '../Chat/types';
import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import moment from 'moment-jalaali';
import { EllipsisVertical as MoreVertical, CreditCard as Edit2, Trash2, Bell, Copy, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Lock, Play, Pause, Eye, Reply, X, Smile, ClipboardList, BellRing, Pin, Download, FileText, CheckCheck, Star, Users, Clock, AtSign, MessageSquare, Forward, Tag } from 'lucide-react';
import { EmojiPicker } from '../Chat/EmojiPicker';
import { ChatMessageMenu, ChatMessageMenuItem as MI, TagModal } from '../Chat/ChatMessageOverlays';
import { MessageStatusButton, messageActionClass, messageToolbarClass } from '../Chat/ChatControls';
import { ForwardModal } from '../Chat/ForwardModal';
import { supabase } from '../../lib/supabase';
import { insertNotification } from '../../lib/notifications';
import toast from 'react-hot-toast';
import type { MessageWithMeta, ChannelProfile, MemberRole, ChannelMessage } from './types';
import type { ChatThemeSettings } from '../Chat/chatTheme';
import { useChatAttachmentUrl } from '../../lib/chatAttachments';

export type MessageStatus = 'pending' | 'in_progress' | 'done' | null;

// Allowed image MIME prefixes for safe rendering
const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

function isSafeImageType(type: string | null): boolean {
  return SAFE_IMAGE_TYPES.some(t => type?.startsWith(t));
}

// URL safety: reject data: and javascript: schemes
function isSafeUrl(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trimStart();
  return !lower.startsWith('javascript:') && !lower.startsWith('data:');
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Boundary-aware mention matching — character after name must be whitespace, punctuation, or EOL
const MENTION_BOUNDARY_RE = /^[\s,،.!?;:()[\]{}'"؟«»\-]|^$/;

function renderBodyWithMentions(
  body: string,
  currentUserId: string | null,
  sortedProfiles: Array<{ profile: ChannelProfile; name: string }>,
  onMentionClick: (user: ChannelProfile) => void
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = body;
  let key = 0;

  while (remaining.length > 0) {
    const atIdx = remaining.indexOf('@');
    if (atIdx === -1) { parts.push(remaining); break; }
    if (atIdx > 0) parts.push(remaining.slice(0, atIdx));

    const afterAt = remaining.slice(atIdx + 1);
    const matched = sortedProfiles.find(({ name }) => {
      if (!afterAt.startsWith(name)) return false;
      const next = afterAt[name.length] ?? '';
      return MENTION_BOUNDARY_RE.test(next);
    });

    if (matched) {
      const { profile, name } = matched;
      const isMe = profile.user_id === currentUserId;
      parts.push(
        <span
          key={key++}
          onClick={(e) => { e.stopPropagation(); onMentionClick(profile); }}
          className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-semibold text-xs cursor-pointer hover:opacity-80 transition-opacity ${
            isMe
              ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          }`}
        >@{name}</span>
      );
      remaining = afterAt.slice(name.length);
    } else {
      parts.push('@');
      remaining = afterAt;
    }
  }
  return <>{parts}</>;
}

// Purely presentational — data comes from parent via readLogData prop
function ReadReceiptsModal({
  readBy,
  allMembers,
  seenLog,
  onClose,
}: {
  readBy: string[];
  allMembers: ChannelProfile[];
  seenLog: Array<{ user_id: string; seen_at: string }>;
  onClose: () => void;
}) {
  const seenProfiles = readBy
    .map(id => allMembers.find(m => m.user_id === id))
    .filter(Boolean) as ChannelProfile[];

  const unseenMembers = allMembers.filter(m => !readBy.includes(m.user_id));

  const getSeenAt = (uid: string) => {
    const entry = seenLog.find(l => l.user_id === uid);
    if (!entry) return null;
    return moment(entry.seen_at).format('jYYYY/jMM/jDD - HH:mm');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[400] flex items-end sm:items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="w-full sm:w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">مشاهده‌کنندگان پیام</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {seenProfiles.length > 0 ? (
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-3">
                <CheckCheck className="w-3.5 h-3.5" /> دیده شده توسط ({seenProfiles.length})
              </p>
              {seenProfiles.map(p => {
                const seenAt = getSeenAt(p.user_id);
                return (
                  <div key={p.user_id} className="flex items-center gap-3 py-2">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(p.full_name || p.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{p.full_name || p.email || 'کاربر'}</p>
                      {seenAt ? (
                        <p className="text-[11px] text-teal-500 dark:text-teal-400 mt-0.5">{seenAt}</p>
                      ) : (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">زمان نامشخص</p>
                      )}
                    </div>
                    <CheckCheck className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">هنوز کسی این پیام را ندیده</p>
          )}
          {unseenMembers.length > 0 && (
            <div className="px-4 pt-1 pb-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-2 mt-2">
                <Clock className="w-3.5 h-3.5" /> دیده نشده ({unseenMembers.length})
              </p>
              {unseenMembers.map(p => (
                <div key={p.user_id} className="flex items-center gap-3 py-1.5">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 opacity-50" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {(p.full_name || p.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{p.full_name || p.email || 'کاربر'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TYPE_BORDER_CLASS: Record<string, string> = {
  normal: '',
  important: 'border-r-4 border-amber-400',
  urgent: 'border-r-4 border-red-500',
  confidential: 'border-r-4 border-gray-400',
};

interface Props {
  msg: MessageWithMeta;
  currentUserId: string | null;
  myRole: MemberRole | null;
  allMembers: ChannelProfile[];
  allProfiles: ChannelProfile[];
  isChannelType: boolean;
  isPrivatelyPinned?: boolean;
  theme: ChatThemeSettings;
  isDark: boolean;
  readLogData?: Array<{ user_id: string; seen_at: string }>;
  tags?: ChatTag[];
  onTagsChanged?: () => void;
  onReply: (msg: ChannelMessage) => void;
  onReact: (msgId: string, emoji: string) => void;
  onPin: (msgId: string, pinned: boolean) => void;
  onDelete: (msgId: string) => void;
  onEdit: (msg: MessageWithMeta) => void;
  onStar: (msgId: string, starred: boolean) => void;
  onScrollToMessage?: (messageId: string) => void;
  onRegisterAsTask?: (messageBody: string, messageId: string) => void;
  onGroupTask?: (msg: MessageWithMeta, mentionedUsers: ChannelProfile[]) => void;
  onScheduleMeeting?: (mentionedIds: string[], body: string) => void;
  onMentionClick?: (user: ChannelProfile) => void;
  onOpenDirectChat?: (userId: string) => void;
}

function ChannelMessageItemInner({
  msg, currentUserId, myRole, allMembers, allProfiles, isChannelType, isPrivatelyPinned,
  theme, isDark, readLogData, tags, onTagsChanged,
  onReply, onReact, onPin, onDelete, onEdit, onStar,
  onScrollToMessage, onRegisterAsTask, onGroupTask, onScheduleMeeting, onMentionClick, onOpenDirectChat,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [confidentialRevealed, setConfidentialRevealed] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [msgStatus, setMsgStatus] = useState<MessageStatus>(null);
  const [showReadReceipts, setShowReadReceipts] = useState(false);
  const [mentionPopupUser, setMentionPopupUser] = useState<ChannelProfile | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.ontimeupdate = null;
        audioRef.current.onended = null;
        audioRef.current = null;
      }
    };
  }, []);

  // Memoize sorted profiles for mention parsing — avoid sorting on every render
  const sortedProfiles = useMemo(
    () =>
      allProfiles
        .map(p => ({ profile: p, name: p.full_name || p.email || '' }))
        .filter(x => x.name)
        .sort((a, b) => b.name.length - a.name.length),
    [allProfiles]
  );

  const isOwn = msg.sender_id === currentUserId;
  const isConfidential = msg.message_type === 'confidential';
  // When confidential and not own and not revealed: show placeholder only — do NOT put body in DOM
  const shouldHideBody = isConfidential && !isOwn && !confidentialRevealed;

  const reactions = msg.reactions ?? [];
  const readByExcludingSelf = (msg.read_by ?? []).filter(id => id !== msg.sender_id);
  const seenCount = readByExcludingSelf.length;
  const anySeenByOther = isOwn && seenCount > 0;

  // Memoize mention extraction — only recompute when body or profiles change
  const mentionedUsers = useMemo(
    () => sortedProfiles
      .filter(({ name }) => {
        if (!msg.body || !name) return false;
        const idx = msg.body.indexOf(`@${name}`);
        if (idx === -1) return false;
        const next = msg.body[idx + name.length + 1] ?? '';
        return MENTION_BOUNDARY_RE.test(next);
      })
      .map(({ profile }) => profile),
    [msg.body, sortedProfiles]
  );
  const hasMentions = mentionedUsers.length > 0;

  const myProfile = useMemo(
    () => allProfiles.find(p => p.user_id === currentUserId),
    [allProfiles, currentUserId]
  );
  const mentionsMe = useMemo(() => {
    if (!myProfile || !msg.body) return false;
    const name = myProfile.full_name || myProfile.email || '';
    if (!name) return false;
    const idx = msg.body.indexOf(`@${name}`);
    if (idx === -1) return false;
    const next = msg.body[idx + name.length + 1] ?? '';
    return MENTION_BOUNDARY_RE.test(next);
  }, [myProfile, msg.body]);

  // Memoize rendered body to avoid re-parsing on every render
  const renderedBody = useMemo(() => {
    if (!msg.body || shouldHideBody) return null;
    return renderBodyWithMentions(msg.body, currentUserId, sortedProfiles, (user) => {
      if (onMentionClick) onMentionClick(user);
      else setMentionPopupUser(user);
    });
  }, [msg.body, currentUserId, sortedProfiles, shouldHideBody, onMentionClick]);

  const fileUrl = useChatAttachmentUrl(msg.file_url);
  const voiceUrl = useChatAttachmentUrl(msg.voice_url);

  const toggleVoice = useCallback(() => {
    if (!voiceUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(voiceUrl);
      audio.ontimeupdate = () => {
        if (audioRef.current) setVoiceProgress(audio.currentTime / (audio.duration || 1));
      };
      audio.onended = () => { setIsPlayingVoice(false); setVoiceProgress(0); };
      audioRef.current = audio;
    }
    if (isPlayingVoice) { audioRef.current.pause(); setIsPlayingVoice(false); }
    else { audioRef.current.play(); setIsPlayingVoice(true); }
  }, [voiceUrl, isPlayingVoice]);

  const typeLabel = msg.message_type !== 'normal' && msg.message_type !== 'system' ? ({
    important: { text: 'پیام مهم!', icon: <AlertCircle className="w-3.5 h-3.5" />, cls: 'text-amber-600 dark:text-amber-400' },
    urgent: { text: 'پیام اورژانسی!', icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: 'text-red-600 dark:text-red-400' },
    confidential: { text: 'محرمانه', icon: <Lock className="w-3.5 h-3.5" />, cls: 'text-gray-600 dark:text-gray-400' },
  } as Record<string, { text: string; icon: React.ReactNode; cls: string }>)[msg.message_type] : null;

  if (msg.message_type === 'system') {
    return (
      <div className="flex justify-center my-2 px-4">
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/60 px-3 py-1 rounded-full">{msg.body}</span>
      </div>
    );
  }

  if (msg.deleted_for_all) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 px-2 sm:px-3`} dir="rtl">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 italic bg-gray-100 dark:bg-gray-700/50 px-3 py-2 rounded-xl">
          <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>این پیام حذف شده است</span>
        </div>
      </div>
    );
  }

  // Status square cycling
  const cycleStatus = () => {
    const cycle: MessageStatus[] = [null, 'pending', 'in_progress', 'done'];
    setMsgStatus(cycle[(cycle.indexOf(msgStatus) + 1) % cycle.length]);
  };

  const ReadTick = () => {
    if (!isOwn) return null;
    if (isChannelType) {
      return (
        <button onClick={() => setShowReadReceipts(true)} className="flex items-center gap-0.5 hover:opacity-80 transition-opacity flex-shrink-0" title={anySeenByOther ? 'مشاهده شده' : 'رسیده، دیده نشده'}>
          <CheckCheck className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${anySeenByOther ? 'text-teal-500' : 'text-gray-300 dark:text-gray-600'}`} />
          {anySeenByOther && seenCount > 1 && <span className="text-[10px] text-teal-500 font-medium">{seenCount}</span>}
        </button>
      );
    }
    return (
      <button
        onClick={() => setShowReadReceipts(true)}
        className={`${messageActionClass} hover:bg-black/10 dark:hover:bg-white/10`}
        title={anySeenByOther ? 'دیده شده — کلیک برای جزئیات' : 'دیده نشده'}
      >
        <Eye className={`w-3.5 h-3.5 ${anySeenByOther ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'}`} />
      </button>
    );
  };

  return (
    <>
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 px-2 sm:px-3`} dir="rtl">
        <div className={`relative flex items-end gap-1.5 sm:gap-2 w-full sm:w-[75%] md:w-[65%] sm:min-w-[240px] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Urgent bell */}
          {msg.message_type === 'urgent' && (
            <span className="absolute -top-3 z-10 pointer-events-none" style={{ [isOwn ? 'left' : 'right']: '2.5rem' }}>
              <BellRing className="w-5 h-5 text-red-500 drop-shadow-lg animate-bounce" />
            </span>
          )}

          {/* Mention indicator */}
          {mentionsMe && (
            <span className="absolute -top-2 z-10 pointer-events-none" style={{ [isOwn ? 'right' : 'left']: '2.5rem' }}>
              <AtSign className="w-3.5 h-3.5 text-blue-500" />
            </span>
          )}

          {/* Avatar */}
          <div className="flex-shrink-0 mb-1">
            {msg.senderProfile?.avatar_url ? (
              <img src={msg.senderProfile.avatar_url} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-white dark:ring-gray-800" />
            ) : (
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-white ring-2 ring-white dark:ring-gray-800 ${isOwn ? 'bg-teal-500' : 'bg-blue-500'}`}>
                {(msg.senderProfile?.full_name || msg.senderProfile?.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {/* Reply preview */}
            {msg.replyTarget && (
              <div
                className="text-xs px-3 py-1.5 rounded-t-xl border-r-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-gray-600 dark:text-gray-300 truncate cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                onClick={() => onScrollToMessage?.(msg.replyTarget!.id)}
              >
                <span className="font-medium text-blue-600 dark:text-blue-400 block text-[10px] mb-0.5">پاسخ به</span>
                {msg.replyTarget.body || '📎 فایل'}
              </div>
            )}

            {/* Card */}
            <div
              className={`relative rounded-xl ${msg.replyTarget ? 'rounded-tr-none' : ''} border border-gray-200 dark:border-gray-600 shadow-sm ${TYPE_BORDER_CLASS[msg.message_type] || ''}`}
              style={{ backgroundColor: isOwn ? (isDark ? '#2a453d' : theme.sentBubbleColor) : (isDark ? '#4d5049' : theme.receivedBubbleColor) }}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-3 pt-2.5 pb-1 gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-1.5 min-w-0 flex-wrap ${isOwn ? 'flex-row-reverse' : ''}`}>
                  {!isOwn && (
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 truncate">
                      {msg.senderProfile?.full_name || msg.senderProfile?.email || 'کاربر'}
                    </span>
                  )}
                  {typeLabel && (
                    <span className={`flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ${typeLabel.cls}`}>
                      {typeLabel.icon} {typeLabel.text}
                    </span>
                  )}
                  {msg.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                  {msg.is_pinned && <Pin className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                  {!msg.is_pinned && isPrivatelyPinned && <Pin className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{formatTime(msg.created_at)}</span>
              </div>

              {/* Body */}
              <div className="px-3 pb-2.5">
                {/* Voice */}
                {voiceUrl && isSafeUrl(voiceUrl) && (
                  <div className="flex items-center gap-2.5 min-w-[140px] sm:min-w-[160px] py-1.5">
                    <button onClick={toggleVoice}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 transition-colors">
                      {isPlayingVoice ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="relative h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden cursor-pointer">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${voiceProgress * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{msg.voice_duration ? formatDuration(msg.voice_duration) : '0:00'}</span>
                    </div>
                  </div>
                )}

                {/* Confidential placeholder — body NOT rendered in DOM when hidden */}
                {shouldHideBody ? (
                  <div className="relative py-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/60 rounded-lg py-3 px-4">
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                      <button
                        onClick={() => setConfidentialRevealed(true)}
                        className="underline hover:no-underline transition-all"
                      >
                        نمایش پیام محرمانه
                      </button>
                    </div>
                  </div>
                ) : msg.body && (
                  <p
                    className="whitespace-pre-wrap break-words leading-relaxed py-0.5 text-gray-800 dark:text-white"
                    style={{ fontSize: theme.fontSize === 'sm' ? 12 : theme.fontSize === 'lg' ? 16 : 14 }}
                  >{renderedBody}</p>
                )}

                {/* File attachment */}
                {fileUrl && !voiceUrl && isSafeUrl(fileUrl) && (
                  isSafeImageType(msg.file_type) ? (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
                      <img src={fileUrl} alt={msg.file_name || 'تصویر'} className="max-w-full rounded-lg max-h-48 object-cover" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 mt-1.5 px-2.5 py-2 bg-gray-100 dark:bg-gray-600 rounded-lg">
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-200">{msg.file_name}</p>
                        {msg.file_size && <p className="text-[10px] text-gray-400">{formatFileSize(msg.file_size)}</p>}
                      </div>
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-500">
                        <Download className="w-4 h-4 text-gray-500" />
                      </a>
                    </div>
                  )
                )}
              </div>

              <div className={`${messageToolbarClass} ${isOwn ? 'flex-row-reverse' : ''}`}>
                {!isChannelType && <MessageStatusButton status={msgStatus} onClick={cycleStatus} className="hover:bg-black/10 dark:hover:bg-white/10" />}
                <ActionBtn onClick={() => onStar(msg.id, !msg.isStarred)} title={msg.isStarred ? 'برداشتن نشانه' : 'نشانه‌دار کردن'} active={msg.isStarred} activeColor="text-yellow-500">
                  <Star className={`size-4 ${msg.isStarred ? 'fill-yellow-400' : ''}`} />
                </ActionBtn>
                {!isChannelType && (
                  <ActionBtn onClick={() => setShowTags(true)} title="تگ‌های پیام"><Tag className="size-4" /></ActionBtn>
                )}
                <ActionBtn onClick={() => setShowReactPicker(true)} title="واکنش به پیام">
                  <Smile className="size-4" />
                </ActionBtn>
                {msg.is_edited && <span className="mx-1 hidden text-[10px] text-gray-500 sm:inline">ویرایش شده</span>}
                <div className="flex-1" />
                <ReadTick />
                {!isChannelType && (
                  <ActionBtn onClick={() => setShowMenu(true)} title="گزینه‌های پیام">
                    <MoreVertical className="size-4" />
                  </ActionBtn>
                )}
              </div>
              {!isChannelType && !!tags?.length && (
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {tags.map(tag => (
                    <button type="button" key={tag.id} onClick={() => setShowTags(true)} title="مدیریت تگ‌های پیام"
                      className="chat-icon-button inline-flex max-w-full items-center gap-1 rounded-full bg-slate-900/5 px-2 text-xs [overflow-wrap:anywhere] dark:bg-white/10">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reactions */}
            {reactions.length > 0 && (
              <div className={`flex flex-wrap gap-1 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {reactions.map(r => (
                  <button key={r.emoji} onClick={() => onReact(msg.id, r.emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${r.reactedByMe ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                    {r.emoji} <span className="text-gray-600 dark:text-gray-300">{r.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showTags && <TagModal messageId={msg.id} currentTags={tags ?? []} currentUserId={currentUserId}
        assignmentTable="channel_message_tag_assignments" onClose={() => setShowTags(false)}
        onChanged={() => { setShowTags(false); onTagsChanged?.(); }} />}
      {showReactPicker && <EmojiPicker onSelect={emoji => { onReact(msg.id, emoji); setShowReactPicker(false); }} onClose={() => setShowReactPicker(false)} />}
      {showForward && (
        <ForwardModal body={msg.body} fileUrl={msg.file_url} fileName={msg.file_name} fileType={msg.file_type}
          currentUserId={currentUserId} allUsers={allProfiles} senderName={msg.senderProfile?.full_name || null} onClose={() => setShowForward(false)} />
      )}
      {showMenu && !isChannelType && (
        <ChatMessageMenu onClose={() => setShowMenu(false)}>
          {msg.body && (
            <div className="px-4 py-2 mb-1 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{msg.body}</p>
            </div>
          )}

          {onRegisterAsTask && (
            <MI icon={<ClipboardList className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
              label="ایجاد اقدام" labelClass="text-teal-600 dark:text-teal-400 font-medium"
              onClick={() => { onRegisterAsTask(msg.body || '', msg.id); setShowMenu(false); }} />
          )}

          {hasMentions && onGroupTask && (
            <MI icon={<Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
              label={`ایجاد اقدام گروهی (${mentionedUsers.length} نفر)`}
              labelClass="text-blue-600 dark:text-blue-400 font-medium"
              onClick={() => { onGroupTask(msg, mentionedUsers); setShowMenu(false); }} />
          )}

          {hasMentions && onScheduleMeeting && (
            <MI icon={<span className="text-teal-500 text-sm">📅</span>}
              label="تنظیم جلسه با منشن‌ها"
              labelClass="text-teal-600 dark:text-teal-400 font-medium"
              onClick={() => { onScheduleMeeting(mentionedUsers.map(u => u.user_id), msg.body || ''); setShowMenu(false); }} />
          )}

          <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
            <MI icon={<Bell className="w-4 h-4" />} label="ارسال اعلان پیگیری"
              onClick={() => { sendFollowUp(); setShowMenu(false); }} />
            <MI icon={<Reply className="w-4 h-4" />} label="پاسخ"
              onClick={() => { onReply(msg); setShowMenu(false); }} />
            {!isConfidential && (msg.body || msg.file_url) && (
              <MI icon={<Forward className="size-4" />} label="ارسال به دیگران"
                onClick={() => { setShowMenu(false); setShowForward(true); }} />
            )}
            {msg.body && (
              <MI icon={<Copy className="w-4 h-4" />} label="کپی متن"
                onClick={() => { navigator.clipboard.writeText(msg.body!); toast.success('کپی شد'); setShowMenu(false); }} />
            )}
            {isOwn && msg.body && (
              <MI icon={<Edit2 className="w-4 h-4" />} label="ویرایش"
                onClick={() => { onEdit(msg); setShowMenu(false); }} />
            )}
            {(() => {
              const isPinned = myRole === 'admin' ? msg.is_pinned : !!isPrivatelyPinned;
              return (
                <MI icon={<Pin className="w-4 h-4" />} label={isPinned ? 'برداشتن پین' : 'پین کردن'}
                  onClick={() => { onPin(msg.id, !isPinned); setShowMenu(false); }} />
              );
            })()}
            <MI icon={<Star className={`w-4 h-4 ${msg.isStarred ? 'fill-yellow-400 text-yellow-500' : ''}`} />}
              label={msg.isStarred ? 'برداشتن نشانه' : 'نشانه‌دار کردن'}
              onClick={() => { onStar(msg.id, !msg.isStarred); setShowMenu(false); }} />
            <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
            {isOwn && (
              <MI icon={<Trash2 className="w-4 h-4 text-red-500" />} label="حذف برای همه" labelClass="text-red-500"
                onClick={() => { onDelete(msg.id); setShowMenu(false); }} />
            )}
          </div>
        </ChatMessageMenu>
      )}

      {/* Read receipts modal — purely presentational */}
      {showReadReceipts && (
        <ReadReceiptsModal
          readBy={readByExcludingSelf}
          allMembers={allMembers}
          seenLog={readLogData ?? []}
          onClose={() => setShowReadReceipts(false)}
        />
      )}

      {mentionPopupUser && (
        <ChannelMentionPopup
          user={mentionPopupUser}
          currentUserId={currentUserId}
          onClose={() => setMentionPopupUser(null)}
          onOpenDirectChat={onOpenDirectChat}
        />
      )}
    </>
  );

  async function sendFollowUp() {
    if (!currentUserId) return;
    const senderProfile = allMembers.find(p => p.user_id === currentUserId);
    const senderName = senderProfile?.full_name || senderProfile?.email || 'کاربر';
    const targets = allMembers.filter(m => m.user_id !== currentUserId);

    await Promise.allSettled(
      targets.map(m =>
        insertNotification({
          userId: m.user_id,
          category: 'channel',
          eventType: 'new_message',
          fallbackTitle: `پیگیری از ${senderName}`,
          fallbackMessage: `پیگیری: "${(msg.body || '').slice(0, 80)}"`,
          placeholders: { sender_name: senderName, message_preview: (msg.body || '').slice(0, 80) },
          senderId: currentUserId,
          senderName,
          senderAvatarUrl: senderProfile?.avatar_url ?? null,
        }).catch(() => {})
      )
    );
    toast.success('اعلان پیگیری ارسال شد');
  }
}

export const ChannelMessageItem = memo(ChannelMessageItemInner);

function ActionBtn({ children, title, onClick, active, activeColor }: {
  children: React.ReactNode; title: string; onClick: () => void; active?: boolean; activeColor?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`${messageActionClass} ${
        active
          ? `bg-gray-100 dark:bg-gray-600 ${activeColor || 'text-teal-500'}`
          : 'text-slate-600 hover:bg-black/10 dark:text-slate-300 dark:hover:bg-white/10'
      }`}>
      {children}
    </button>
  );
}

function ChannelMentionPopup({ user, currentUserId, onClose, onOpenDirectChat }: {
  user: ChannelProfile;
  currentUserId: string | null;
  onClose: () => void;
  onOpenDirectChat?: (userId: string) => void;
}) {
  const [positionTitle, setPositionTitle] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [loadingPosition, setLoadingPosition] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('org_position_members')
          .select('org_positions(title, org_units(name))')
          .eq('user_id', user.user_id)
          .eq('is_primary', true)
          .maybeSingle();
        if (cancelled) return;
        const pos = (data as any)?.org_positions;
        setPositionTitle(pos?.title || null);
        setUnitName(pos?.org_units?.name || null);
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoadingPosition(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.user_id]);

  const name = user.full_name || user.email || 'کاربر';
  const initial = name.charAt(0).toUpperCase();
  const isSelf = user.user_id === currentUserId;

  const handleDM = () => {
    if (onOpenDirectChat) {
      onOpenDirectChat(user.user_id);
      onClose();
    } else {
      toast('برای چت خصوصی به بخش چت سازمانی بروید', { icon: '💬' });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">پروفایل کاربر</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex items-center gap-4">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-gray-900 dark:text-white truncate">{name}</p>
            {loadingPosition ? (
              <div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1.5" />
            ) : positionTitle ? (
              <p className="text-sm text-teal-600 dark:text-teal-400 font-medium mt-0.5 truncate">{positionTitle}</p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">بدون سمت سازمانی</p>
            )}
            {!loadingPosition && unitName && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{unitName}</p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 pt-1 space-y-2">
          {!isSelf && (
            <button
              onClick={handleDM}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl transition-colors font-medium"
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">پیام خصوصی</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
