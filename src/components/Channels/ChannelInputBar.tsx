import { ComposerToolButton as ToolBtn, composerToolbarClass, composerSendClass } from '../Chat/ChatControls';
import { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Mic, AtSign, Code, Loader as Loader2, X, Reply, CircleAlert as AlertCircle, TriangleAlert as AlertTriangle, Lock, MessageCircle, Bold, Italic, Quote, List, Link, Image, Undo, Redo, CircleStop as StopCircle, MicOff, Strikethrough } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { insertNotification } from '../../lib/notifications';
import { EmojiPicker } from '../Chat/EmojiPicker';
import toast from 'react-hot-toast';
import type { ChannelMessage, ChannelMessageType, ChannelProfile, ChannelType, MessageWithMeta } from './types';
import { MessageTypeOptionButton, pushEditorHistory } from '../../shared/chat/MessageInputPrimitives';
import { updateMessageBody } from '../../shared/chat/MessageInputPrimitives';

interface Props {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  currentUserId: string | null;
  allProfiles: ChannelProfile[];
  members: { user_id: string }[];
  replyTarget: ChannelMessage | null;
  editTarget: MessageWithMeta | null;
  canPost: boolean;
  onSent: () => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

const MESSAGE_TYPES: { key: ChannelMessageType; label: string; icon: React.ReactNode; color: string; desc: string }[] = [
  { key: 'normal', label: 'پیام عادی', icon: <MessageCircle className="w-4 h-4" />, color: 'text-gray-500', desc: '' },
  { key: 'important', label: 'پیام مهم', icon: <AlertCircle className="w-4 h-4" />, color: 'text-amber-500', desc: 'اعلان روی صفحه' },
  { key: 'urgent', label: 'پیام اورژانسی', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-500', desc: 'زنگ اعلان پخش می‌شود' },
  { key: 'confidential', label: 'پیام محرمانه', icon: <Lock className="w-4 h-4" />, color: 'text-gray-600', desc: 'تا کلیک مخاطب مخفی' },
];

type RecordingState = 'idle' | 'recording' | 'recorded';

export function ChannelInputBar({
  channelId, channelName, channelType, currentUserId, allProfiles, members,
  replyTarget, editTarget, canPost, onSent, onCancelReply, onCancelEdit,
}: Props) {
  const [body, setBody] = useState('');
  const [messageType, setMessageType] = useState<ChannelMessageType>('normal');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [loading, setSending] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isTranscribingRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>(['']);
  const historyIndexRef = useRef(0);

  useEffect(() => {
    if (editTarget) { setBody(editTarget.body || ''); textareaRef.current?.focus(); }
  }, [editTarget]);

  useEffect(() => { if (replyTarget) textareaRef.current?.focus(); }, [replyTarget]);

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
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { } recognitionRef.current = null; }
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
    if (historyIndexRef.current > 0) { historyIndexRef.current--; setBody(historyRef.current[historyIndexRef.current]); }
  };
  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) { historyIndexRef.current++; setBody(historyRef.current[historyIndexRef.current]); }
  };

  const extractMentionedUserIds = (text: string): string[] => {
    const ids: string[] = [];
    for (const p of allProfiles) {
      const name = p.full_name || p.email;
      if (name && text.includes(`@${name}`)) ids.push(p.user_id);
    }
    return [...new Set(ids)];
  };

  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart; const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const newVal = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    setBody(newVal); pushHistory(newVal);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, end + prefix.length); }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const newVal = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(newVal); pushHistory(newVal);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? body.length;
    const newVal = body.slice(0, start) + emoji + body.slice(start);
    setBody(newVal); pushHistory(newVal); setShowEmoji(false);
    setTimeout(() => { if (ta) { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); } }, 0);
  };

  const insertMention = (profile: ChannelProfile) => {
    const lastAt = body.lastIndexOf('@');
    const name = profile.full_name || profile.email || '';
    const newVal = body.slice(0, lastAt) + `@${name} `;
    setBody(newVal); pushHistory(newVal); setShowMentionMenu(false); textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); handleRedo(); }
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('**'); }
    if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrapSelection('_'); }
  };

  const resetText = () => {
    setBody(''); historyRef.current = ['']; historyIndexRef.current = 0;
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const notifyMembers = async (preview: string) => {
    if (!currentUserId) return;
    const senderProfile = allProfiles.find(p => p.user_id === currentUserId);
    const senderName = senderProfile?.full_name || senderProfile?.email || 'کاربر';
    const channelLabel = channelType === 'channel' ? 'کانال' : 'گروه';
    for (const m of members) {
      if (m.user_id === currentUserId) continue;
      insertNotification({
        userId: m.user_id,
        category: 'channel',
        eventType: 'new_message',
        fallbackTitle: `پیام جدید در ${channelLabel} ${channelName}`,
        fallbackMessage: `${senderName}: ${preview}`,
        placeholders: { sender_name: senderName, channel_name: channelName, channel_type: channelLabel, message_preview: preview },
        senderId: currentUserId,
        senderName,
        senderAvatarUrl: senderProfile?.avatar_url ?? null,
      }).catch(() => {});
    }
  };

  const handleSend = async () => {
    if ((!body.trim() && !audioBlob) || loading || !currentUserId) return;
    setSending(true);
    try {
      if (editTarget) {
        const { error } = await supabase.from('channel_messages')
          .update({ body: body.trim(), message_type: messageType, is_edited: true })
          .eq('id', editTarget.id);
        if (error) { toast.error('خطا در ویرایش: ' + error.message); return; }
        onCancelEdit(); resetText(); onSent();
      } else if (audioBlob) {
        await sendVoiceMessage();
      } else {
        const mentionedIds = extractMentionedUserIds(body.trim());
        const { error } = await supabase.from('channel_messages').insert({
          channel_id: channelId,
          sender_id: currentUserId,
          body: body.trim(),
          message_type: messageType,
          reply_to_id: replyTarget?.id || null,
          read_by: [currentUserId],
          mentioned_user_ids: mentionedIds.length > 0 ? mentionedIds : null,
        });
        if (error) { toast.error('خطا در ارسال: ' + error.message); return; }
        const preview = body.trim().length > 60 ? body.trim().slice(0, 60) + '...' : body.trim();
        await notifyMembers(preview);
        // Mention notifications for members who were @mentioned
        if (mentionedIds.length > 0) {
          const senderProfile = allProfiles.find(p => p.user_id === currentUserId);
          const senderName = senderProfile?.full_name || senderProfile?.email || 'کاربر';
          mentionedIds.filter(id => id !== currentUserId).forEach(uid => {
            insertNotification({
              userId: uid,
              category: 'channel',
              eventType: 'mention',
              fallbackTitle: `${senderName} شما را منشن کرد`,
              fallbackMessage: body.trim().slice(0, 120),
              placeholders: { sender_name: senderName, channel_name: channelName, channel_type: channelType === 'channel' ? 'کانال' : 'گروه', message_preview: body.trim().slice(0, 80) },
              senderId: currentUserId,
              senderName,
              senderAvatarUrl: senderProfile?.avatar_url ?? null,
            }).catch(() => {});
          });
        }
        onCancelReply(); resetText(); onSent();
      }
    } catch (err: any) {
      toast.error('خطا در ارسال پیام');
    } finally {
      setSending(false);
    }
  };

  const sendVoiceMessage = async () => {
    if (!audioBlob || !currentUserId) return;
    const ext = mimeToExt(audioBlob.type);
    const path = `channels/${channelId}/voice_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-attachments').upload(path, audioBlob, { contentType: audioBlob.type || 'audio/webm' });
    if (upErr) { toast.error('خطا در آپلود صدا: ' + upErr.message); return; }
    const { error } = await supabase.from('channel_messages').insert({
      channel_id: channelId,
      sender_id: currentUserId,
      body: body.trim() || null,
      message_type: messageType,
      voice_url: path,
      voice_duration: recordingSeconds,
      reply_to_id: replyTarget?.id || null,
      read_by: [currentUserId],
    });
    if (error) { toast.error('خطا در ارسال صدا: ' + error.message); return; }
    await notifyMembers('🎤 پیام صوتی');
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null); setRecordingSeconds(0); setRecordingState('idle');
    resetText(); onCancelReply(); onSent();
  };

  const getSupportedMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/aac'];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const mimeToExt = (mime: string): string => {
    if (mime.startsWith('audio/webm')) return 'webm';
    if (mime.startsWith('audio/ogg')) return 'ogg';
    if (mime.startsWith('audio/mp4')) return 'mp4';
    if (mime.startsWith('audio/aac')) return 'aac';
    return 'webm';
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) { toast.error('برای ضبط صدا نیاز به HTTPS است.'); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {}); }
      catch { recorder = new MediaRecorder(stream); }
      const actualMime = recorder.mimeType || mimeType;
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: actualMime || 'audio/webm' });
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop()); setRecordingState('recorded');
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecordingState('recording'); setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        toast.error('دسترسی به میکروفون رد شد.');
      } else {
        toast.error('ضبط صدا در این مرورگر پشتیبانی نمی‌شود.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const cancelRecording = () => {
    stopRecording(); setAudioBlob(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setRecordingSeconds(0); setRecordingState('idle');
  };

  const stopSpeechToText = () => {
    isTranscribingRef.current = false;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { } recognitionRef.current = null; }
    setIsTranscribing(false);
  };

  const startSpeechToText = async () => {
    if (isTranscribing) { stopSpeechToText(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!SpeechRecognition || isIOS) { toast.error('تبدیل صدا به متن در این دستگاه پشتیبانی نمی‌شود.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('برای استفاده از میکروفون نیاز به HTTPS است.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err: any) {
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      toast.error(isDenied ? 'دسترسی به میکروفون رد شد.' : 'میکروفون در دسترس نیست.');
      return;
    }
    isTranscribingRef.current = true; setIsTranscribing(true);
    const createAndStart = () => {
      if (!isTranscribingRef.current) return;
      const recognition = new SpeechRecognition();
      recognition.lang = 'fa-IR'; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onresult = (e: any) => {
        // Only take the FINAL result to avoid duplicate words on mobile
        const results = Array.from(e.results as any[]);
        const finalResults = results.filter((r: any) => r.isFinal);
        if (finalResults.length === 0) return;
        const transcript = finalResults.map((r: any) => r[0].transcript).join(' ').trim();
        if (transcript) {
          setBody(prev => { const newVal = prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript; pushHistory(newVal); return newVal; });
        }
      };
      recognition.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'permission-denied') { toast.error('دسترسی به میکروفون رد شد.'); stopSpeechToText(); }
        else if (e.error === 'network') { toast.error('برای تبدیل صدا به متن اینترنت لازم است.'); stopSpeechToText(); }
      };
      recognition.onend = () => { recognitionRef.current = null; if (isTranscribingRef.current) setTimeout(createAndStart, 300); };
      recognitionRef.current = recognition;
      try { recognition.start(); } catch { setTimeout(() => { if (isTranscribingRef.current) createAndStart(); }, 300); }
    };
    createAndStart();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;
    setSending(true);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
      const path = `channels/${channelId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('chat-attachments').upload(path, file, { contentType: file.type });
      if (upErr) { toast.error('خطا در آپلود فایل: ' + upErr.message); return; }
      const { error } = await supabase.from('channel_messages').insert({
        channel_id: channelId,
        sender_id: currentUserId,
        body: body.trim() || null,
        message_type: messageType,
        file_url: path,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        reply_to_id: replyTarget?.id || null,
        read_by: [currentUserId],
      });
      if (error) { toast.error('خطا در ارسال فایل: ' + error.message); return; }
      const label = file.type.startsWith('image') ? 'تصویر' : file.type.startsWith('video') ? 'ویدیو' : file.type.startsWith('audio') ? 'صدا' : 'فایل';
      await notifyMembers(`${label}: ${file.name}`);
      resetText(); onCancelReply(); onSent();
    } catch { toast.error('خطا در ارسال فایل'); }
    finally { setSending(false); e.target.value = ''; }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const currentType = MESSAGE_TYPES.find(t => t.key === messageType)!;
  const memberProfiles = members.map(m => allProfiles.find(p => p.user_id === m.user_id)).filter(Boolean) as ChannelProfile[];
  const mentionFiltered = memberProfiles.filter(p =>
    (p.full_name || '').toLowerCase().includes(mentionSearch.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(mentionSearch.toLowerCase())
  );
  const canSend = (body.trim().length > 0 || !!audioBlob) && !loading;

  if (!canPost) {
    return (
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center text-sm text-gray-400 flex-shrink-0">
        فقط مدیران این کانال می‌توانند پیام ارسال کنند
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700" dir="rtl">
      {/* Reply/Edit strip */}
      {(replyTarget || editTarget) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
          <Reply className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{editTarget ? 'ویرایش پیام' : 'پاسخ به'}</p>
            <p className="text-xs text-gray-500 truncate">{(editTarget || replyTarget)?.body || '📎 فایل'}</p>
          </div>
          <button onClick={editTarget ? onCancelEdit : onCancelReply} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded">
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
              <span className="text-xs text-gray-500 flex-1">در حال ضبط صدا...</span>
              <button onClick={stopRecording} className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors">
                <StopCircle className="w-3.5 h-3.5" /> توقف
              </button>
              <button onClick={cancelRecording} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-300 flex-shrink-0">صدا ضبط شد ({formatTime(recordingSeconds)})</span>
              {audioUrl && <audio src={audioUrl} controls className="h-8 flex-1 min-w-0 max-w-xs" />}
              <button onClick={handleSend} disabled={loading} className="flex items-center gap-1.5 text-xs bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} ارسال
              </button>
              <button onClick={cancelRecording} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> لغو</button>
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
          <EditorBtn title="لیست شماره‌دار" onClick={() => insertLine('1. ')}><span className="text-[11px] font-bold leading-none">1.</span></EditorBtn>
          <Sep />
          <EditorBtn title="لینک" onClick={() => wrapSelection('[', '](url)')}><Link className="w-3.5 h-3.5" /></EditorBtn>
          <EditorBtn title="تصویر" onClick={() => fileInputRef.current?.click()}><Image className="w-3.5 h-3.5" /></EditorBtn>
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
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => { handleBodyChange(e.target.value); adjustHeight(); }}
              onKeyDown={handleKeyDown}
              placeholder={isTranscribing ? 'در حال تشخیص صدا...' : 'پیام بنویسید...'}
              rows={2}
              className="w-full text-sm bg-transparent outline-none dark:text-white placeholder-gray-400 resize-none overflow-hidden leading-relaxed"
              style={{ minHeight: 44, maxHeight: 160 }}
            />

            {/* Mention popup */}
            {showMentionMenu && mentionFiltered.length > 0 && (
              <div className="absolute bottom-full mb-1 right-3 left-3 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-50 max-h-52 overflow-y-auto">
                {mentionFiltered.map(p => (
                  <button key={p.user_id} onClick={() => insertMention(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-right">
                    <span className="w-7 h-7 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(p.full_name || p.email || 'U').charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800 dark:text-white">{p.full_name || p.email}</p>
                      {p.full_name && <p className="truncate text-[11px] text-gray-400">{p.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className={composerToolbarClass}>
            <ToolBtn title="شکلک" active={showEmoji} onClick={() => setShowEmoji(true)}>
              <Smile className="size-[18px]" />
            </ToolBtn>
            {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}

            {/* Mention */}
            <ToolBtn title="منشن عضو" onClick={() => {
              const newVal = body + '@'; setBody(newVal); setShowMentionMenu(true); setMentionSearch(''); textareaRef.current?.focus();
            }}>
              <AtSign className="w-[18px] h-[18px]" />
            </ToolBtn>

            {/* Attach file */}
            <ToolBtn title="ارسال فایل یا عکس" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="w-[18px] h-[18px]" />
            </ToolBtn>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

            {/* Advanced editor toggle */}
            <ToolBtn title="ادیتور پیشرفته" active={showAdvancedEditor} onClick={() => setShowAdvancedEditor(v => !v)}>
              <Bold className="w-[18px] h-[18px]" />
            </ToolBtn>

            {/* Voice recording */}
            {recordingState === 'idle' ? (
              <ToolBtn title="ضبط صدا" onClick={startRecording}><Mic className="w-[18px] h-[18px]" /></ToolBtn>
            ) : recordingState === 'recording' ? (
              <ToolBtn title="توقف ضبط" active activeColor="text-red-500" onClick={stopRecording}><StopCircle className="w-[18px] h-[18px]" /></ToolBtn>
            ) : (
              <ToolBtn title="لغو صدا" activeColor="text-red-400" onClick={cancelRecording}><MicOff className="w-[18px] h-[18px]" /></ToolBtn>
            )}

            {/* Speech to text */}
            <ToolBtn
              title={isTranscribing ? 'توقف تشخیص صدا' : 'تبدیل صدا به متن'}
              active={isTranscribing} activeColor="text-blue-500"
              onClick={startSpeechToText}
            >
              <SpeakingPersonIcon />
            </ToolBtn>

            {/* Message type */}
            <div ref={typeMenuRef} className="relative">
              <ToolBtn title="اهمیت پیام" active={messageType !== 'normal'} activeColor={currentType.color} onClick={() => setShowTypeMenu(v => !v)}>
                <span className={messageType !== 'normal' ? currentType.color : ''}>{currentType.icon}</span>
              </ToolBtn>
              {showTypeMenu && (
                <div className="absolute bottom-full mb-2 left-0 w-56 sm:left-auto sm:right-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 z-[60]" dir="rtl">
                  {MESSAGE_TYPES.map(t => <MessageTypeOptionButton key={t.key} option={t} selected={messageType} onSelect={setMessageType} onClose={() => setShowTypeMenu(false)} />)}
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* Send button */}
            <button onClick={handleSend} disabled={!canSend} aria-label="ارسال پیام"
              className={`${composerSendClass} ${canSend ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
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
      <circle cx="9" cy="6" r="3" />
      <path d="M5 20v-4a4 4 0 0 1 8 0v4" />
      <path d="M17 9c.6.8 1 1.8 1 3s-.4 2.2-1 3" strokeWidth="1.8" />
      <path d="M20 7c1.2 1.5 2 3.3 2 5.5S21.2 16.5 20 18" strokeWidth="1.8" />
    </svg>
  );
}

function EditorBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />;
}
