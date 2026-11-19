import { useVisibleMessageReads } from '../../features/messaging/useVisibleMessageReads';
import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ChatMessage } from './ChatMessage';
import { createChatRealtimeSync } from './chatRealtimeSync';
import { ChatInputBar } from './ChatInputBar';
import { loadChatTheme, type ChatThemeSettings } from './chatTheme';
import moment from 'moment-jalaali';
import toast from 'react-hot-toast';
import { useUrgentMessageAlarm } from '../../context/UrgentMessageContext';
import { useOrgUsers, resolveUserDisplay, FALLBACK_NAME } from '../../lib/useOrgUsers';
import type {
  ConversationWithProfile, MessageWithMeta, ChatMessage as ChatMsg,
  UserProfile, ReactionCount, MessageStatus, ChatReminder,
} from './types';

import { MentionsBar } from './Conversation/MentionsBar';
import type { StarredItem } from './Conversation/StarredMessagesModal';

const ConversationModals = lazy(() => import('./Conversation/ConversationModals').then((m) => ({ default: m.ConversationModals })));
const ReminderAlarmModal = lazy(() => import('./Conversation/ReminderAlarmModal').then((m) => ({ default: m.ReminderAlarmModal })));

import { ConversationHeader } from './Conversation/ConversationHeader';
import { SearchBar } from './Conversation/SearchBar';
import { MessageList } from './Conversation/MessageList';

interface Props {
  conversation: ConversationWithProfile;
  currentUserId: string;
  currentUserProfile: UserProfile | null;
  onBack: () => void;
  onNavigateToCalendar?: (mentionedUserIds?: string[], bodyText?: string) => void;
  onNavigateToTasks?: (messageBody: string, messageId: string) => void;
  onConversationUpdate: () => void;
  initialScrollToMessageId?: string | null;
  onScrollToMessageConsumed?: () => void;
  onStartCall?: (callType: 'audio' | 'video') => void;
  onStartE2EECall?: () => void;
  onOpenDirectChat?: (userId: string) => void;
  msgRefreshKey?: number;
}

export function ChatConversationView({
  conversation, currentUserId, currentUserProfile, onBack, onNavigateToCalendar, onNavigateToTasks,
  onConversationUpdate, onStartCall, onStartE2EECall,
  onOpenDirectChat, msgRefreshKey,
}: Props) {
  useLiveData([...LIVE_DATA.chat, ...LIVE_DATA.people], async () => { await Promise.all([fetchReminders(), fetchGlobalStarred()]); if (conversation.otherUser.user_id === currentUserId) await fetchMessages(); });
  const globalTriggerUrgentAlarm = useUrgentMessageAlarm();

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* audio not available */ }
  };
  const { usersById, allUsers: orgUsers, loading: orgUsersLoading } = useOrgUsers(currentUserId);
  const resolveName = useCallback((uid: string) => resolveUserDisplay(usersById, uid, undefined, orgUsersLoading), [usersById, orgUsersLoading]);
  const buildSenderProfile = useCallback((uid: string): UserProfile | null => {
    const u = usersById[uid];
    if (!u) return null;
    return { user_id: u.user_id, full_name: u.full_name, email: null, avatar_url: u.avatar_url };
  }, [usersById]);

  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMsg | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMsg | null>(null);
  const [reminderAlarm, setReminderAlarm] = useState<ChatReminder | null>(null);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [reminders, setReminders] = useState<ChatReminder[]>([]);
  const [globalStarred, setGlobalStarred] = useState<StarredItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatThemeSettings>(loadChatTheme);
  const ONLINE_THRESHOLD = 3 * 60 * 1000;
  const isUserOnline = (lastSeen?: string | null) => {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD;
  };
  const getLastSeenText = (lastSeen?: string | null) => {
  if (!lastSeen) return 'آفلاین';

  const diff = Date.now() - new Date(lastSeen).getTime();

  if (diff < ONLINE_THRESHOLD) return 'آنلاین';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} دقیقه پیش`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ساعت پیش`;

  return moment(lastSeen).format('jYYYY/jMM/jDD');
  };
  const [otherUserPresence, setOtherUserPresence] = useState<{ last_seen: string | null } | null>(null);
  // Mention bar: messages in this conversation that mention the current user
  const [mentionBarItems, setMentionBarItems] = useState<{ id: string; body: string | null; senderName: string }[]>([]);
  const [dismissedMentionIds, setDismissedMentionIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`dismissed_mentions_conv_${conversation.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const reminderCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedReminderIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRequestRef = useRef(0);
  const refreshMessagesRef = useRef<() => Promise<void>>(async () => {});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [jumpPickerDate, setJumpPickerDate] = useState<{ jy: number; jm: number; jd: number } | null>(null);

  useEffect(() => {
    fetchMessages();
    const sync = createChatRealtimeSync(() => refreshMessagesRef.current());
    subscribeToMessages(sync);
    fetchReminders();
    fetchMentionBar();
    return () => {
      messageRequestRef.current++;
      sync.dispose();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reminderCheckRef.current) clearInterval(reminderCheckRef.current);
    };
  }, [conversation.id]);

  // Re-fetch messages after the user clears their chat history.
  // Realtime UPDATE events are suppressed by RLS for the clearing user, so
  // we drive the refresh explicitly via msgRefreshKey.
  useEffect(() => {
    if (!msgRefreshKey) return;
    fetchMessages();
  }, [msgRefreshKey]);

  useEffect(() => {
    if (!currentUserId) return;
    const updatePresence = async () => {
      await supabase
        .from('user_presence')
        .upsert({
          user_id: currentUserId,
          last_seen: new Date().toISOString(),
          is_online: true,
        }, { onConflict: 'user_id' });
    };
    updatePresence();
    const interval = setInterval(updatePresence, 20000);
    return () => clearInterval(interval);
  }, [currentUserId]);
  
  useLiveData(['user_presence'], async () => {
    const { data, error } = await supabase.from('user_presence').select('last_seen').eq('user_id', conversation.otherUser.user_id).maybeSingle();
    if (!error) setOtherUserPresence(data || { last_seen: null });
  }, true, undefined, conversation.otherUser.user_id);
  // Reminder alarm: check every 30s if any reminder's time has passed
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const r of reminders) {
        if (firedReminderIds.current.has(r.id)) continue;
        if (new Date(r.remind_at).getTime() <= now) {
          firedReminderIds.current.add(r.id);
          setReminderAlarm(r);
          playBeep();
        }
      }
    };
    reminderCheckRef.current = setInterval(check, 30_000);
    check(); // also check immediately when reminders update
    return () => { if (reminderCheckRef.current) clearInterval(reminderCheckRef.current); };
  }, [reminders]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setChatTheme(detail as ChatThemeSettings);
      else setChatTheme(loadChatTheme());
    };
    window.addEventListener('chatThemeChanged', handler);
    return () => window.removeEventListener('chatThemeChanged', handler);
  }, []);

  const fetchMentionBar = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, body, sender_id')
      .eq('conversation_id', conversation.id)
      .eq('deleted_for_all', false)
      .or(`and(sender_id.eq.${currentUserId},deleted_for_sender.eq.false),and(sender_id.neq.${currentUserId},deleted_for_receiver.eq.false)`)
      .neq('sender_id', currentUserId)
      .contains('mentioned_user_ids', [currentUserId])
      .order('created_at', { ascending: false })
      .limit(20);
    if (!data) return;
    setMentionBarItems(data.map((m: any) => ({
      id: m.id,
      body: m.body,
      senderName: resolveName(m.sender_id),
    })));
  };

  const fetchReminders = async () => {
    const { data } = await supabase
      .from('chat_reminders')
      .select('*, chat_messages(id, body, conversation_id)')
      .eq('user_id', currentUserId)
      .eq('is_dismissed', false)
      .order('remind_at', { ascending: true });
    setReminders((data || []) as any);
  };

  const fetchGlobalStarred = async () => {
    // Get all starred messages by this user across all conversations
    const { data: stars } = await supabase
      .from('chat_message_stars')
      .select('message_id')
      .eq('user_id', currentUserId);
    if (!stars || stars.length === 0) { setGlobalStarred([]); return; }
    const msgIds = stars.map((s: any) => s.message_id);
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .in('id', msgIds)
      .eq('deleted_for_all', false)
      .or(`and(sender_id.eq.${currentUserId},deleted_for_sender.eq.false),and(sender_id.neq.${currentUserId},deleted_for_receiver.eq.false)`);
    if (!msgs) { setGlobalStarred([]); return; }

    // Get conversation info for each message
    const convIds = [...new Set(msgs.map((m: any) => m.conversation_id))];
    const { data: convs } = await supabase
      .from('chat_conversations')
      .select('id, participant_a, participant_b')
      .in('id', convIds);
    const otherUserIds = (convs || []).map((c: any) =>
      c.participant_a === currentUserId ? c.participant_b : c.participant_a
    );
    const convMap = new Map((convs || []).map((c: any) => [c.id, c]));

    const items: StarredItem[] = msgs.map((m: any) => {
      const conv = convMap.get(m.conversation_id);
      const otherId = conv ? (conv.participant_a === currentUserId ? conv.participant_b : conv.participant_a) : null;
      return {
        message: { ...m, senderProfile: null, reactions: [], isStarred: true, replyTarget: null, tags: [], status: m.status || 'pending', read_by: m.read_by || [] },
        conversationId: m.conversation_id,
        otherUserName: otherId ? resolveName(otherId) : FALLBACK_NAME,
      };
    });
    setGlobalStarred(items);
  };

  const fetchMessages = useCallback(async () => {
    const request = ++messageRequestRef.current;
    const scroll = scrollRef.current;
    const shouldScroll = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 100;
    const { data: msgs, error: msgsError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .eq('deleted_for_all', false)
      .or(`and(sender_id.eq.${currentUserId},deleted_for_sender.eq.false),and(sender_id.neq.${currentUserId},deleted_for_receiver.eq.false)`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (request !== messageRequestRef.current || msgsError || !msgs) return;

    // Empty conversation — no further queries needed
    if (msgs.length === 0) { setMessages([]); setTimeout(() => scrollToBottom(), 50); return; }

    const msgIds = msgs.map(m => m.id);
    const senderIds = [...new Set(msgs.map(m => m.sender_id))];

    const [reactionsRes, starsRes, tagsAssignRes] = await Promise.all([
      supabase.from('chat_message_reactions').select('*').in('message_id', msgIds),
      supabase.from('chat_message_stars').select('*').eq('user_id', currentUserId).in('message_id', msgIds),
      supabase.from('chat_message_tag_assignments')
        .select('message_id, chat_tags(id, name, color, user_id)')
        .eq('user_id', currentUserId)
        .in('message_id', msgIds),
    ]);

    const reactionsMap = new Map<string, ReactionCount[]>();
    for (const r of (reactionsRes.data || [])) {
      const arr = reactionsMap.get(r.message_id) || [];
      const existing = arr.find(x => x.emoji === r.emoji);
      if (existing) { existing.count++; if (r.user_id === currentUserId) existing.reactedByMe = true; }
      else arr.push({ emoji: r.emoji, count: 1, reactedByMe: r.user_id === currentUserId });
      reactionsMap.set(r.message_id, arr);
    }

    const starredIds = new Set((starsRes.data || []).map((s: any) => s.message_id));
    const tagsMap = new Map<string, any[]>();
    for (const a of (tagsAssignRes.data || [])) {
      const existing = tagsMap.get(a.message_id) || [];
      if ((a as any).chat_tags) existing.push((a as any).chat_tags);
      tagsMap.set(a.message_id, existing);
    }

    const replyIds = msgs.filter(m => m.reply_to_id).map(m => m.reply_to_id);
    const replyTargetMap = new Map<string, ChatMsg>();
    if (replyIds.length > 0) {
      const { data: replyMsgs } = await supabase.from('chat_messages').select('*').in('id', replyIds);
      (replyMsgs || []).forEach((m: ChatMsg) => replyTargetMap.set(m.id, m));
    }

    const enriched: MessageWithMeta[] = msgs
      .filter(m => !(m.deleted_for_sender && m.sender_id === currentUserId))
      .filter(m => !(m.deleted_for_receiver && m.sender_id !== currentUserId))
      .map(m => ({
        ...m,
        status: m.status || 'pending',
        read_by: m.read_by || [],
        senderProfile: buildSenderProfile(m.sender_id),
        reactions: reactionsMap.get(m.id) || [],
        isStarred: starredIds.has(m.id),
        replyTarget: m.reply_to_id ? replyTargetMap.get(m.reply_to_id) || null : null,
        tags: tagsMap.get(m.id) || [],
      }))
      .reverse();

    if (request !== messageRequestRef.current) return;
    setMessages(enriched);
    if (shouldScroll) setTimeout(() => { if (request === messageRequestRef.current) scrollToBottom(); }, 50);

    const unreadIncoming = msgs.filter(m => m.sender_id !== currentUserId && !(m.read_by || []).includes(currentUserId));
    if (unreadIncoming.length > 0 && document.visibilityState === 'visible') {
      // Show full-screen alarm for any unread urgent messages (uses global dedup to prevent re-firing)
      const urgentUnread = unreadIncoming.filter(m => m.message_type === 'urgent');
      if (urgentUnread.length > 0) {
        const latest = urgentUnread[0];
        globalTriggerUrgentAlarm({
          id: latest.id,
          body: latest.body,
          sender_name: resolveName(latest.sender_id) || conversation.otherUser.full_name || FALLBACK_NAME,
          created_at: latest.created_at,
          conversation_id: conversation.id,
        });
      }
    }
  }, [conversation.id, currentUserId, buildSenderProfile, resolveName, globalTriggerUrgentAlarm]);
  refreshMessagesRef.current = async () => { await fetchMessages(); await fetchMentionBar(); };

  const subscribeToMessages = (sync: ReturnType<typeof createChatRealtimeSync>) => {

  // جلوگیری از duplicate channel
  if (channelRef.current) {
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }

  const channel = supabase
    .channel(`chat-msgs-${conversation.id}`)

    // NEW MESSAGE
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversation.id}`
      },
      (payload) => {
        const newMsg = payload.new as any;

        if (newMsg.sender_id !== currentUserId) {
          if (newMsg.message_type === 'important') {
            toast('پیام مهم دریافت شد', {
              duration: 4000,
              icon: '⚠️'
            });
          }
        }

        void sync.request();
      }
    )

    // UPDATE MESSAGE
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversation.id}`
      },
      () => {
        void sync.request();
      }
    )

    // DELETE MESSAGE
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversation.id}`
      },
      () => {
        void sync.request();
      }
    )

    // REACTIONS
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_message_reactions'
      },
      () => {
        void sync.request();
      }
    )

    // READ RECEIPTS
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_message_read_receipts',
        filter: `conversation_id=eq.${conversation.id}`
      },
      () => {
        void sync.request();
      }
    )

    .subscribe(status => sync.onStatus(status));

  channelRef.current = channel;
};

  const dismissReminderAlarm = async () => {
    if (reminderAlarm) {
      await supabase.from('chat_reminders').update({ is_dismissed: true }).eq('id', reminderAlarm.id);
      fetchReminders();
    }
    setReminderAlarm(null);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };


  const scrollToMessage = async (messageId: string) => {
    const tryScroll = () => {
      const el = messageRefs.current.get(messageId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-1');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-1'), 2000);
        return true;
      }
      return false;
    };

    if (tryScroll()) return;

    // Message not in DOM — fetch it from DB and inject into messages list
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();
    if (!msg) return;

    const injected: MessageWithMeta = {
      ...msg,
      status: msg.status || 'pending',
      read_by: msg.read_by || [],
      senderProfile: buildSenderProfile(msg.sender_id),
      reactions: [],
      isStarred: false,
      replyTarget: null,
      tags: [],
    };

    setMessages(prev => {
      if (prev.some(m => m.id === messageId)) return prev;
      const insertIdx = prev.findIndex(m => m.created_at > msg.created_at);
      if (insertIdx === -1) return [...prev, injected];
      return [...prev.slice(0, insertIdx), injected, ...prev.slice(insertIdx)];
    });

    // Wait for render then scroll
    setTimeout(() => tryScroll(), 150);
  };

  const jumpToDate = async (jy: number, jm: number, jd: number) => {
    setJumpPickerDate(null);
    const startIso = moment(`${jy}/${jm}/${jd}`, 'jYYYY/jMM/jDD').toISOString();
    const endIso = moment(`${jy}/${jm}/${jd}`, 'jYYYY/jMM/jDD').endOf('day').toISOString();
    // Try to find first message on that day in current loaded messages
    const inMem = messages.find(m => m.created_at >= startIso && m.created_at <= endIso);
    if (inMem) { scrollToMessage(inMem.id); return; }
    // Fetch from DB
    const { data } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('deleted_for_all', false)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .limit(1);
    if (data?.length) {
      scrollToMessage(data[0].id);
    } else {
      toast('پیامی در این تاریخ یافت نشد', { icon: '📅' });
    }
  };


  const handleReact = async (messageId: string, emoji: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const existing = msg.reactions.find(r => r.emoji === emoji && r.reactedByMe);
    if (existing) {
      await supabase.from('chat_message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUserId).eq('emoji', emoji);
    } else {
      await supabase.from('chat_message_reactions').insert({ message_id: messageId, user_id: currentUserId, emoji });
    }
    fetchMessages();
  };

  const handleStar = async (messageId: string, isStarred: boolean) => {
    if (isStarred) {
      await supabase.from('chat_message_stars').delete().eq('message_id', messageId).eq('user_id', currentUserId);
    } else {
      await supabase.from('chat_message_stars').insert({ message_id: messageId, user_id: currentUserId });
      // Notification
      await supabase.rpc('create_notification', { p_user_id: currentUserId, p_title: 'پیام نشانه‌دار شد', p_message: 'یک پیام را نشانه‌دار کردید', p_type: 'chat' });
    }
    fetchMessages();
  };

  const handleDeleteForMe = async (messageId: string) => {
    const { error } = await supabase.rpc('delete_chat_message_for_me', { p_message_id: messageId });
    if (error) {
      toast.error('خطا در حذف پیام');
    } else {
      fetchMessages();
    }
  };

  const handleDeleteForAll = async (messageId: string) => {
    const { error } = await supabase.rpc('delete_chat_message_for_all', { p_message_id: messageId });
    if (error) {
      toast.error('خطا در حذف برای همه');
    } else {
      fetchMessages(); onConversationUpdate();
    }
  };

  const handleStatusChange = async (messageId: string, status: MessageStatus) => {
    await supabase.from('chat_messages').update({ status }).eq('id', messageId);
    fetchMessages();
    // Notify
    await supabase.rpc('create_notification', {
      p_user_id: currentUserId,
      p_title: 'وضعیت پیام تغییر کرد',
      p_message: status === 'done' ? 'پیام به وضعیت رسیدگی شده تغییر یافت' : status === 'in_progress' ? 'پیام در حال رسیدگی است' : 'وضعیت پیام بازنشانی شد',
      p_type: 'chat',
    });
  };

  const handleScheduleMeeting = (mentionedIds: string[], bodyText: string) => {
    onNavigateToCalendar?.(mentionedIds, bodyText);
  };

  const dismissReminder = async (reminderId: string) => {
    await supabase.from('chat_reminders').update({ is_dismissed: true }).eq('id', reminderId);
    fetchReminders();
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  useVisibleMessageReads(scrollRef, messages, currentUserId, conversation.id, false, searchQuery);
  const grouped: { date: string; messages: MessageWithMeta[] }[] = [];
  for (const msg of filteredMessages) {
    const date = moment(msg.created_at).format('jYYYY/jMM/jDD');
    const last = grouped[grouped.length - 1];
    if (last && last.date === date) last.messages.push(msg);
    else grouped.push({ date, messages: [msg] });
  }

  const formatDate = (jDate: string) => {
    const today = moment().format('jYYYY/jMM/jDD');
    const yesterday = moment().subtract(1, 'day').format('jYYYY/jMM/jDD');
    if (jDate === today) return 'امروز';
    if (jDate === yesterday) return 'دیروز';
    return jDate;
  };

  const isSavedMessages = conversation.otherUser.user_id === currentUserId;
  const otherName = isSavedMessages ? 'پیام‌های ذخیره‌شده' : (conversation.otherUser.full_name || resolveName(conversation.otherUser.user_id));
  const localStarredCount = messages.filter(m => m.isStarred).length;

  return (
    <div className="flex flex-col h-full overflow-hidden" dir="rtl">
      {reminderAlarm && (
        <Suspense fallback={null}>
          <ReminderAlarmModal reminderAlarm={reminderAlarm} onDismiss={dismissReminderAlarm} />
        </Suspense>
      )}

      <ConversationHeader
        onBack={onBack}
        onClearSavedHistory={() => {
          setMessages([]); setReplyingTo(null); setEditingMessage(null); setSearchQuery('');
          void fetchMessages(); void fetchGlobalStarred(); void fetchReminders();
          onConversationUpdate();
        }}
        isSavedMessages={isSavedMessages}
        otherName={otherName}
        conversation={conversation}
        otherUserPresence={otherUserPresence}
        isUserOnline={isUserOnline}
        getLastSeenText={getLastSeenText}
        localStarredCount={localStarredCount}
        remindersCount={reminders.length}
        showSearch={showSearch}
        onToggleSearch={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}
        onOpenStarred={() => { setShowStarredModal(true); fetchGlobalStarred(); }}
        onOpenReminders={() => { setShowRemindersModal(true); fetchReminders(); }}
        onStartCall={onStartCall}
        onStartE2EECall={onStartE2EECall}
        onJumpToDate={() => {
          const now = moment();
          setJumpPickerDate({ jy: now.jYear(), jm: now.jMonth() + 1, jd: now.jDate() });
        }}
        showInfoPanel={showInfoPanel}
        onToggleInfoPanel={() => setShowInfoPanel(v => !v)}
      />

      {showSearch && (
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          resultCount={messages.filter(m => m.body?.toLowerCase().includes(searchQuery.toLowerCase())).length}
        />
      )}

      {/* Mentions bar — shows unread @mentions in this conversation */}
      {mentionBarItems.filter(m => !dismissedMentionIds.has(m.id)).length > 0 && (
        <MentionsBar
          items={mentionBarItems.filter(m => !dismissedMentionIds.has(m.id))}
          onScrollTo={id => scrollToMessage(id)}
          onDismiss={id => setDismissedMentionIds(prev => {
            const next = new Set([...prev, id]);
            try { localStorage.setItem(`dismissed_mentions_conv_${conversation.id}`, JSON.stringify([...next])); } catch {}
            return next;
          })}
          onDismissAll={() => {
            const all = new Set(mentionBarItems.map(m => m.id));
            try { localStorage.setItem(`dismissed_mentions_conv_${conversation.id}`, JSON.stringify([...all])); } catch {}
            setDismissedMentionIds(all);
          }}
        />
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        grouped={grouped}
        scrollRef={scrollRef}
        messageRefs={messageRefs}
        chatTheme={chatTheme}
        currentUserId={currentUserId}
        orgUsers={orgUsers}
        setJumpPickerDate={setJumpPickerDate}
        setReplyingTo={setReplyingTo}
        setEditingMessage={setEditingMessage}
        handleStar={handleStar}
        handleDeleteForMe={handleDeleteForMe}
        handleDeleteForAll={handleDeleteForAll}
        handleReact={handleReact}
        handleStatusChange={handleStatusChange}
        handleScheduleMeeting={handleScheduleMeeting}
        fetchMessages={fetchMessages}
        fetchReminders={fetchReminders}
        scrollToMessage={scrollToMessage}
        onNavigateToTasks={onNavigateToTasks}
        onOpenDirectChat={onOpenDirectChat}
        formatDate={formatDate}
      />

      {/* Input bar */}
      <ChatInputBar
        conversationId={conversation.id}
        currentUserId={currentUserId}
        currentUserName={currentUserProfile?.full_name || null}
        currentUserAvatarUrl={currentUserProfile?.avatar_url || null}
        otherUserId={conversation.otherUser.user_id || null}
        replyingTo={replyingTo}
        editingMessage={editingMessage}
        allUsers={orgUsers}
        onSent={() => { fetchMessages(); onConversationUpdate(); scrollToBottom(); }}
        onCancelReply={() => setReplyingTo(null)}
        onCancelEdit={() => setEditingMessage(null)}
        onScheduleMeetingWithMentions={onNavigateToCalendar ? (ids) => onNavigateToCalendar(ids) : undefined}
      />

      {/* Modals & panels */}
      {(showStarredModal || showRemindersModal || showInfoPanel || jumpPickerDate) && (
        <Suspense fallback={null}>
          <ConversationModals
            showStarredModal={showStarredModal}
            globalStarred={globalStarred}
            onCloseStarred={() => setShowStarredModal(false)}
            onGoToStarred={(item) => setShowStarredModal(false)}
            conversationId={conversation.id}
            scrollToMessage={scrollToMessage}
            showRemindersModal={showRemindersModal}
            reminders={reminders}
            onCloseReminders={() => setShowRemindersModal(false)}
            onDismissReminder={dismissReminder}
            showInfoPanel={showInfoPanel}
            conversation={conversation}
            otherName={otherName}
            isSavedMessages={isSavedMessages}
            isUserOnline={isUserOnline}
            getLastSeenText={getLastSeenText}
            otherUserPresence={otherUserPresence}
            localStarredCount={localStarredCount}
            onCloseInfoPanel={() => setShowInfoPanel(false)}
            jumpPickerDate={jumpPickerDate}
            onJumpToDate={jumpToDate}
            onCloseJumpPicker={() => setJumpPickerDate(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
