import { ComposerToolButton as ToolBtn, composerToolbarClass, composerSendClass } from './ChatControls';
import { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Mic, AtSign, Code, Loader as Loader2, X, Reply, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Lock, MessageCircle, Bold, Italic, Quote, List, Link, Image, Undo, Redo, CircleStop as StopCircle, MicOff, Strikethrough } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { insertNotification } from '../../lib/notifications';
import { EmojiPicker } from './EmojiPicker';
import type { ChatMessage, ChatMessageType, UserProfile } from './types';
import toast from 'react-hot-toast';
import { usePermissions } from '../../context/PermissionsContext';
import { MessageTypeOptionButton, pushEditorHistory } from '../../shared/chat/MessageInputPrimitives';
import { updateMessageBody } from '../../shared/chat/MessageInputPrimitives';

interface Props {
  conversationId: string;
  currentUserId: string;
  currentUserName?: string | null;
  currentUserAvatarUrl?: string | null;
  otherUserId?: string | null;
  replyingTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  allUsers: UserProfile[];
  onSent: () => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onScheduleMeetingWithMentions?: (mentionedUserIds: string[]) => void;
}

const MESSAGE_TYPES: { key: ChatMessageType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { key: 'normal', label: 'پیام عادی', icon: <MessageCircle className="w-4 h-4" />, color: 'text-gray-500', desc: '' },
  { key: 'important', label: 'پیام مهم', icon: <AlertCircle className="w-4 h-4" />, color: 'text-amber-500', desc: 'اعلان روی صفحه نمایش داده می‌شود' },
  { key: 'urgent', label: 'پیام اورژانسی', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-500', desc: 'زنگ اعلان پخش می‌شود' },
  { key: 'confidential', label: 'پیام محرمانه', icon: <Lock className="w-4 h-4" />, color: 'text-gray-600', desc: 'پیام تا کلیک گیرنده مخفی می‌ماند' },
];

type RecordingState = 'idle' | 'recording' | 'recorded';

export function ChatInputBar({
  conversationId, currentUserId, currentUserName, currentUserAvatarUrl, otherUserId,
  replyingTo, editingMessage,
  allUsers, onSent, onCancelReply, onCancelEdit,
}: Props) {
  const { hasPermission } = usePermissions();
  const [body, setBody] = useState('');
  const [messageType, setMessageType] = useState<ChatMessageType>('normal');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [loading, setSending] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);

  // Voice recording
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Speech-to-text
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  // History for undo/redo
  const historyRef = useRef<string[]>(['']);
  const historyIndexRef = useRef(0);

  useEffect(() => {
    if (editingMessage) {
      const val = editingMessage.body || '';
      setBody(val);
      historyRef.current = [val];
      historyIndexRef.current = 0;
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) setShowTypeMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      isTranscribingRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };

  const pushHistory = (val: string) => pushEditorHistory(historyRef, historyIndexRef, val);

  const handleBodyChange = (val: string) => updateMessageBody(val, setBody, pushHistory, setShowMentionMenu, setMentionSearch);

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      setBody(historyRef.current[historyIndexRef.current]);
      setTimeout(adjustHeight, 0);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      setBody(historyRef.current[historyIndexRef.current]);
      setTimeout(adjustHeight, 0);
    }
  };

  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const newVal = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    setBody(newVal);
    pushHistory(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
      adjustHeight();
    }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const newVal = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(newVal);
    pushHistory(newVal);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); adjustHeight(); }, 0);
  };

  const insertLink = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const linkText = selected || 'متن لینک';
    const newVal = body.slice(0, start) + `[${linkText}](url)` + body.slice(end);
    setBody(newVal);
    pushHistory(newVal);
    setTimeout(() => {
      ta.focus();
      const urlStart = start + 1 + linkText.length + 2;
      ta.setSelectionRange(urlStart, urlStart + 3);
      adjustHeight();
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? body.length;
    const newVal = body.slice(0, start) + emoji + body.slice(start);
    setBody(newVal);
    pushHistory(newVal);
    setShowEmoji(false);
    setTimeout(() => {
      if (ta) { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }
    }, 0);
  };

  const insertMention = (user: UserProfile) => {
    const lastAt = body.lastIndexOf('@');
    const newVal = body.slice(0, lastAt) + `@${user.full_name || user.username || user.email} `;
    setBody(newVal);
    pushHistory(newVal);
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const extractMentionedUserIds = (text: string): string[] => {
    const ids: string[] = [];
    for (const user of allUsers) {
      const name = user.full_name || user.username || user.email;
      if (name && text.includes(`@${name}`)) {
        ids.push(user.user_id);
      }
    }
    return [...new Set(ids)];
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); handleRedo(); }
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('**'); }
    if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('_'); }
  };

  const resetText = () => {
    setBody('');
    historyRef.current = [''];
    historyIndexRef.current = 0;
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleSend = async () => {
    if ((!body.trim() && !audioBlob) || loading) return;
    setSending(true);
    try {
      if (editingMessage) {
        const { error } = await supabase.from('chat_messages')
          .update({ body: body.trim(), is_edited: true, updated_at: new Date().toISOString() })
          .eq('id', editingMessage.id);
        if (error) { toast.error('خطا در ویرایش پیام: ' + error.message); return; }
        onCancelEdit();
        resetText();
        onSent();
      } else if (audioBlob) {
        await sendVoiceMessage();
      } else {
        const mentionedIds = extractMentionedUserIds(body.trim());
        const { error } = await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body: body.trim(),
          message_type: messageType,
          reply_to_id: replyingTo?.id || null,
          mentioned_user_ids: mentionedIds.length > 0 ? mentionedIds : null,
        }).select().single();
        if (error) { toast.error('خطا در ارسال پیام: ' + error.message); return; }
        // Notify recipient (direct message)
        if (otherUserId) {
          insertNotification({
            userId: otherUserId,
            category: 'chat',
            eventType: 'message',
            fallbackTitle: currentUserName || 'پیام جدید',
            fallbackMessage: body.trim().slice(0, 120),
            placeholders: {
              sender_name: currentUserName || '',
              message_preview: body.trim().slice(0, 80),
            },
            senderId: currentUserId,
            senderName: currentUserName || null,
            senderAvatarUrl: currentUserAvatarUrl || null,
            actionUrl: 'chat',
          });
        }
        // Mention notifications — only for users other than sender & recipient (avoid double-notifying in DM)
        const mentionTargets = mentionedIds.filter(id => id !== currentUserId && id !== otherUserId);
        if (mentionTargets.length > 0) {
          mentionTargets.forEach(uid => {
            insertNotification({
              userId: uid,
              category: 'chat',
              eventType: 'mention',
              fallbackTitle: `${currentUserName || 'کاربر'} شما را منشن کرد`,
              fallbackMessage: body.trim().slice(0, 120),
              placeholders: {
                sender_name: currentUserName || '',
                message_preview: body.trim().slice(0, 80),
              },
              senderId: currentUserId,
              senderName: currentUserName || null,
              senderAvatarUrl: currentUserAvatarUrl || null,
              actionUrl: 'chat',
            });
          });
        }
        // Also notify otherUser in DM if they are mentioned (already notified above but add mention indicator)
        if (otherUserId && mentionedIds.includes(otherUserId)) {
          insertNotification({
            userId: otherUserId,
            category: 'chat',
            eventType: 'mention',
            fallbackTitle: `${currentUserName || 'کاربر'} شما را منشن کرد`,
            fallbackMessage: body.trim().slice(0, 120),
            placeholders: {
              sender_name: currentUserName || '',
              message_preview: body.trim().slice(0, 80),
            },
            senderId: currentUserId,
            senderName: currentUserName || null,
            senderAvatarUrl: currentUserAvatarUrl || null,
            actionUrl: 'chat',
          });
        }
        onCancelReply();
        resetText();
        onSent();
      }
    } catch (err: any) {
      toast.error('خطا در ارسال پیام');
    } finally {
      setSending(false);
    }
  };

  const sendVoiceMessage = async () => {
    if (!audioBlob) return;
    const ext = mimeToExt(audioBlob.type);
    const path = `${currentUserId}/voice_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('chat-attachments')
      .upload(path, audioBlob, { contentType: audioBlob.type || 'audio/webm' });
    if (upErr) {
      toast.error('خطا در آپلود صدا: ' + upErr.message);
      return;
    }
    const { error: messageError } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: body.trim() || null,
      message_type: messageType,
      voice_url: path,
      voice_duration: recordingSeconds,
      reply_to_id: replyingTo?.id || null,
    });
    if (messageError) {
      await supabase.storage.from('chat-attachments').remove([path]);
      toast.error('خطا در ثبت پیام صوتی؛ صدا برای تلاش مجدد حفظ شد');
      return;
    }
    // Notify recipient about voice message
    if (otherUserId) {
      insertNotification({
        userId: otherUserId,
        category: 'chat',
        eventType: 'message',
        fallbackTitle: currentUserName || 'پیام صوتی',
        fallbackMessage: '🎤 پیام صوتی',
        placeholders: {
          sender_name: currentUserName || '',
          message_preview: 'پیام صوتی',
        },
        senderId: currentUserId,
        senderName: currentUserName || null,
        senderAvatarUrl: currentUserAvatarUrl || null,
        actionUrl: 'chat',
      });
    }
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingSeconds(0);
    setRecordingState('idle');
    resetText();
    onCancelReply();
    onSent();
  };

  // Pick the best supported audio mime type for this browser/device
  const getSupportedMimeType = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/aac',
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; // browser default
  };

  // Derive a safe file extension from a mime type string
  const mimeToExt = (mime: string): string => {
    if (mime.startsWith('audio/webm')) return 'webm';
    if (mime.startsWith('audio/ogg')) return 'ogg';
    if (mime.startsWith('audio/mp4')) return 'mp4';
    if (mime.startsWith('audio/aac')) return 'aac';
    return 'webm';
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('برای ضبط صدا نیاز به اتصال HTTPS است.');
        return;
      }
      // Request permission first — important on Android
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorderOptions = mimeType ? { mimeType } : {};
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch {
        // Fallback: let browser choose format
        recorder = new MediaRecorder(stream);
      }
      const actualMime = recorder.mimeType || mimeType;
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: actualMime || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
        setRecordingState('recorded');
      };
      // Request data every second so we don't lose audio if the tab is backgrounded
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecordingState('recording');
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        toast.error('دسترسی به میکروفون رد شد. لطفاً در تنظیمات مرورگر مجوز میکروفون را فعال کنید.');
      } else {
        toast.error('ضبط صدا در این مرورگر پشتیبانی نمی‌شود.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setRecordingSeconds(0);
    setRecordingState('idle');
  };

  // isTranscribingRef mirrors the state but is accessible inside recognition callbacks
  const isTranscribingRef = useRef(false);

  const stopSpeechToText = () => {
    isTranscribingRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsTranscribing(false);
  };

  const startSpeechToText = async () => {
    if (isTranscribing) {
      stopSpeechToText();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!SpeechRecognition || isIOS) {
      toast.error('تبدیل صدا به متن در این دستگاه پشتیبانی نمی‌شود. از دکمه ضبط صدا استفاده کنید.');
      return;
    }

    // Request mic permission explicitly — required before SpeechRecognition on Android
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('برای استفاده از میکروفون نیاز به اتصال HTTPS است.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err: any) {
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      toast.error(isDenied
        ? 'دسترسی به میکروفون رد شد. لطفاً در تنظیمات مرورگر مجوز دهید.'
        : 'میکروفون در دسترس نیست.');
      return;
    }

    isTranscribingRef.current = true;
    setIsTranscribing(true);

    const createAndStart = () => {
      if (!isTranscribingRef.current) return;

      const recognition = new SpeechRecognition();
      // Android Chrome: continuous=false + manual restart is more reliable than continuous=true
      recognition.lang = 'fa-IR';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results as any[])
          .map((r: any) => r[0].transcript)
          .join(' ')
          .trim();
        if (transcript) {
          setBody(prev => {
            const newVal = prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript;
            pushHistory(newVal);
            return newVal;
          });
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'permission-denied') {
          toast.error('دسترسی به میکروفون رد شد.');
          stopSpeechToText();
        } else if (e.error === 'network') {
          toast.error('برای تبدیل صدا به متن به اینترنت نیاز است.');
          stopSpeechToText();
        }
        // 'no-speech', 'aborted', 'audio-capture' — let onend handle restart
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        // Restart if still active — Android stops after each utterance
        if (isTranscribingRef.current) {
          setTimeout(createAndStart, 100);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // recognition.start() throws if called while already starting — retry after delay
        setTimeout(() => {
          if (isTranscribingRef.current) createAndStart();
        }, 300);
      }
    };

    createAndStart();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
      const path = `${currentUserId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { contentType: file.type });
      if (upErr) { toast.error('خطا در آپلود فایل: ' + upErr.message); return; }
      const fileType = file.type.startsWith('image') ? 'image'
        : file.type.startsWith('video') ? 'video'
        : file.type.startsWith('audio') ? 'audio'
        : 'document';
      const { error: messageError } = await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        body: body.trim() || null,
        message_type: messageType,
        file_url: path,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        reply_to_id: replyingTo?.id || null,
      });
      if (messageError) {
        await supabase.storage.from('chat-attachments').remove([path]);
        toast.error('خطا در ثبت پیام فایل؛ دوباره تلاش کنید');
        return;
      }
      if (otherUserId) {
        const fileTypeLabel = file.type.startsWith('image') ? 'تصویر'
          : file.type.startsWith('video') ? 'ویدیو'
          : file.type.startsWith('audio') ? 'صدا'
          : 'فایل';
        insertNotification({
          userId: otherUserId,
          category: 'chat',
          eventType: 'message',
          fallbackTitle: currentUserName || 'فایل جدید',
          fallbackMessage: `${fileTypeLabel}: ${file.name}`,
          placeholders: { sender_name: currentUserName || '', message_preview: `${fileTypeLabel}: ${file.name}` },
          senderId: currentUserId,
          senderName: currentUserName || null,
          senderAvatarUrl: currentUserAvatarUrl || null,
          actionUrl: 'chat',
        });
      }
      resetText();
      onCancelReply();
      onSent();
    } catch (err: any) {
      toast.error('خطا در ارسال فایل: ' + (err?.message || String(err)));
    } finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const currentType = MESSAGE_TYPES.find(t => t.key === messageType)!;
  const mentionFiltered = allUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(mentionSearch.toLowerCase()) ||
    (u.username || u.email || '').toLowerCase().includes(mentionSearch.toLowerCase())
  );
  const hasSpeechAPI = true; // always show button; iOS shows helpful fallback message
  const canSend = (body.trim().length > 0 || !!audioBlob) && !loading;

  return (
    <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700" dir="rtl">
      {/* Reply/Edit strip */}
      {(replyingTo || editingMessage) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
          <Reply className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {editingMessage ? 'ویرایش پیام' : 'پاسخ به'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-300 truncate">{(editingMessage || replyingTo)?.body || '📎 فایل'}</p>
          </div>
          <button onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded">
            <X className="w-4 h-4 text-blue-500" />
          </button>
        </div>
      )}

      {/* Voice recording bar */}
      {recordingState !== 'idle' && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/30">
          {recordingState === 'recording' ? (
            <>
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-sm font-mono text-red-600 dark:text-red-400 tabular-nums">{formatTime(recordingSeconds)}</span>
              <span className="text-xs text-gray-500 dark:text-gray-300 flex-1">در حال ضبط صدا...</span>
              <button onClick={stopRecording}
                className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors touch-manipulation">
                <StopCircle className="w-3.5 h-3.5" /> توقف
              </button>
              <button onClick={cancelRecording}
                className="p-2 text-gray-400 hover:text-red-500 touch-manipulation">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-300 flex-shrink-0">
                صدا ضبط شد ({formatTime(recordingSeconds)})
              </span>
              {audioUrl && <audio src={audioUrl} controls className="h-8 flex-1 min-w-0 max-w-xs" />}
              <button onClick={handleSend} disabled={loading}
                className="flex items-center gap-1.5 text-xs bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                ارسال
              </button>
              <button onClick={cancelRecording} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> لغو
              </button>
            </>
          )}
        </div>
      )}

      {/* Advanced editor toolbar */}
      {showAdvancedEditor && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-wrap" dir="ltr">
          <EditorBtn title="پررنگ (Ctrl+B)" onClick={() => wrapSelection('**')}><Bold className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="کج (Ctrl+I)" onClick={() => wrapSelection('_')}><Italic className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="خط‌خورده" onClick={() => wrapSelection('~~')}><Strikethrough className="w-3.5 h-3.5" /></EditorBtn>
          <Sep />
          <EditorBtn title="نقل قول" onClick={() => insertLine('> ')}><Quote className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="کد خطی" onClick={() => wrapSelection('`')}><Code className="w-3.5 h-3.5" /></EditorBtn>
          <Sep />
          <EditorBtn title="لیست نقطه‌ای" onClick={() => insertLine('• ')}><List className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="لیست شماره‌دار" onClick={() => insertLine('1. ')}>
            <span className="text-[11px] font-bold leading-none">1.</span>
          </EditorBtn>
          <Sep />
          <EditorBtn title="لینک" onClick={insertLink}><Link className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="تصویر (از فایل)" onClick={() => fileInputRef.current?.click()}><Image className="w-3.5 h-3.5" /></EditorBtn>
          <Sep />
          <EditorBtn title="بازگشت (Ctrl+Z)" onClick={handleUndo}><Undo className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="جلو (Ctrl+Shift+Z)" onClick={handleRedo}><Redo className="w-3.5 h-3.5" /></EditorBtn>
        </div>
      )}

      {/* Main composer */}
      <div className="p-2.5">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-sm">
          {/* Textarea */}
          <div className="relative px-3 pt-2.5">
            <textarea name="chat-message" aria-label="متن پیام"
              ref={textareaRef}
              value={body}
              onChange={e => { handleBodyChange(e.target.value); adjustHeight(); }}
              onKeyDown={handleKeyDown}
              placeholder={isTranscribing ? 'در حال تشخیص صدا...' : 'پیام بنویسید...'}
              rows={2}
              className="w-full text-sm bg-transparent outline-none dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none overflow-hidden leading-relaxed"
              style={{ minHeight: 44, maxHeight: 160 }}
            />

            {/* Mention popup — renders above the input box */}
            {showMentionMenu && mentionFiltered.length > 0 && (
              <div className="absolute bottom-full mb-1 right-3 left-3 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-50 max-h-52 overflow-y-auto">
                {mentionFiltered.map(u => (
                  <button key={u.user_id} onClick={() => insertMention(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-right">
                    <span className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(u.full_name || u.username || u.email || 'U').charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800 dark:text-white">{u.full_name || u.username || u.email}</p>
                      {u.full_name && <p className="truncate text-[11px] text-gray-400 dark:text-gray-400">{u.username || u.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className={composerToolbarClass}>
            <ToolBtn title="شکلک" active={showEmoji} onClick={() => setShowEmoji(true)}>
              <Smile className="w-[18px] h-[18px]" />
            </ToolBtn>
            {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}

            {/* Mention */}
            <ToolBtn title="منشن کاربر" onClick={() => {
              const newVal = body + '@';
              setBody(newVal);
              setShowMentionMenu(true);
              setMentionSearch('');
              textareaRef.current?.focus();
            }}>
              <AtSign className="w-[18px] h-[18px]" />
            </ToolBtn>

            {/* Attach file */}
            <ToolBtn title="ارسال فایل یا عکس" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="w-[18px] h-[18px]" />
            </ToolBtn>
            <input name="chat-attachment" aria-label="پیوست پیام" ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

            {/* Advanced editor toggle */}
            <ToolBtn title="ادیتور پیشرفته" active={showAdvancedEditor} onClick={() => setShowAdvancedEditor(v => !v)}>
              <Bold className="w-[18px] h-[18px]" />
            </ToolBtn>

            {/* Voice recording */}
            {recordingState === 'idle' ? (
              <ToolBtn title="ضبط صدا" onClick={startRecording}>
                <Mic className="w-[18px] h-[18px]" />
              </ToolBtn>
            ) : recordingState === 'recording' ? (
              <ToolBtn title="توقف ضبط" active activeColor="text-red-500" onClick={stopRecording}>
                <StopCircle className="w-[18px] h-[18px]" />
              </ToolBtn>
            ) : (
              <ToolBtn title="لغو صدا" activeColor="text-red-400" onClick={cancelRecording}>
                <MicOff className="w-[18px] h-[18px]" />
              </ToolBtn>
            )}

            {/* Speech to text */}
            {hasSpeechAPI && (
              <ToolBtn
                title={isTranscribing ? 'توقف تشخیص صدا' : 'تبدیل صدا به متن'}
                active={isTranscribing}
                activeColor="text-blue-500"
                onClick={startSpeechToText}
              >
                <SpeakingPersonIcon />
              </ToolBtn>
            )}

            {/* Message importance — opens UPWARD and OUTSIDE the box */}
            <div ref={typeMenuRef} className="relative">
              <ToolBtn
                title="اهمیت پیام"
                active={messageType !== 'normal'}
                activeColor={currentType.color}
                onClick={() => setShowTypeMenu(v => !v)}
              >
                <span className={messageType !== 'normal' ? currentType.color : ''}>{currentType.icon}</span>
              </ToolBtn>
              {showTypeMenu && (
                <div
                  className="absolute bottom-full mb-2 left-0 w-56 sm:left-auto sm:right-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-[60]"
                  dir="rtl"
                >
                  {MESSAGE_TYPES.filter(t => {
                    if (t.key === 'urgent') return hasPermission('chat_send_urgent');
                    if (t.key === 'confidential') return hasPermission('chat_send_confidential');
                    return true;
                  }).map(t => <MessageTypeOptionButton key={t.key} option={t} selected={messageType} onSelect={setMessageType} onClose={() => setShowTypeMenu(false)} />)}
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="ارسال پیام"
              className={`${composerSendClass} ${
                canSend ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
  
              {/* متن ارسال فقط در دسکتاپ یا صفحات بزرگتر دیده شود */}
              <span className="hidden sm:inline">ارسال</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakingPersonIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Head */}
      <circle cx="9" cy="6" r="3" />
      {/* Body */}
      <path d="M5 20v-4a4 4 0 0 1 8 0v4" />
      {/* Sound waves from mouth area */}
      <path d="M17 9c.6.8 1 1.8 1 3s-.4 2.2-1 3" strokeWidth="1.8" />
      <path d="M20 7c1.2 1.5 2 3.3 2 5.5S21.2 16.5 20 18" strokeWidth="1.8" />
    </svg>
  );
}

function EditorBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />;
}
