import { useVisibleMessageReads } from '../../features/messaging/useVisibleMessageReads';
import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { insertNotification } from '../../lib/notifications';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import moment from 'moment-jalaali';
import {
  Channel, ChannelMessage, ChannelMember, ChannelProfile,
  MessageWithMeta, MemberRole, GroupTask, GroupTaskAssignment,
} from './types';
import { ChannelMessageItem } from './ChannelMessageItem';
import { ChannelInputBar } from './ChannelInputBar';
import { ChannelMembersModal } from './ChannelMembersModal';
import { WorkTopicsPanel } from './WorkTopicsPanel';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { loadChatTheme, type ChatThemeSettings } from '../Chat/chatTheme';

import { GroupTaskModal } from './Conversation/GroupTaskModal';
import { PinnedPopup, StarredPanel, ChannelMentionsBar } from './Conversation/Panels';
import { ChannelHeader, ChannelSearchBar, ChannelDescription, FloatingPinButton, FloatingStarButton } from './Conversation/ChannelHeader';

moment.loadPersian({ dialect: 'persian-modern', usePersianDigits: false });

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function useChatTheme(): ChatThemeSettings {
  const [theme, setTheme] = useState<ChatThemeSettings>(loadChatTheme);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTheme(detail ? (detail as ChatThemeSettings) : loadChatTheme());
    };
    window.addEventListener('chatThemeChanged', handler);
    return () => window.removeEventListener('chatThemeChanged', handler);
  }, []);
  return theme;
}

interface Props {
  channel: Channel;
  currentUserId: string | null;
  allProfiles: ChannelProfile[];
  onBack: () => void;
  isMobile: boolean;
  scrollToMessageId?: string | null;
  onScrollHandled?: () => void;
  onNavigateToTasks?: (messageBody: string, messageId: string) => void;
  onOpenDirectChat?: (userId: string) => void;
}

type MemberWithProfile = ChannelMember & { profile: ChannelProfile | null };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toJalali(iso: string): string {
  return moment(iso).format('jYYYY/jMM/jDD HH:mm');
}

function buildMeta(
  msgs: ChannelMessage[],
  reactions: { message_id: string; user_id: string; emoji: string }[],
  stars: { message_id: string }[],
  profiles: ChannelProfile[],
  currentUserId: string | null
): MessageWithMeta[] {
  const profileMap = new Map(profiles.map(p => [p.user_id, p]));
  const msgMap = new Map(msgs.map(m => [m.id, m]));
  const reactionsByMsg = new Map<string, { emoji: string; user_id: string }[]>();
  for (const r of reactions) {
    if (!reactionsByMsg.has(r.message_id)) reactionsByMsg.set(r.message_id, []);
    reactionsByMsg.get(r.message_id)!.push(r);
  }
  const starredIds = new Set(stars.map(s => s.message_id));

  return msgs
    .map(m => {
      const raw = reactionsByMsg.get(m.id) || [];
      const emojiMap = new Map<string, { count: number; reactedByMe: boolean }>();
      for (const r of raw) {
        const e = emojiMap.get(r.emoji) || { count: 0, reactedByMe: false };
        e.count++;
        if (r.user_id === currentUserId) e.reactedByMe = true;
        emojiMap.set(r.emoji, e);
      }
      return {
        ...m,
        senderProfile: m.sender_id ? (profileMap.get(m.sender_id) || null) : null,
        reactions: Array.from(emojiMap.entries()).map(([emoji, v]) => ({ emoji, ...v })),
        replyTarget: m.reply_to_id ? (msgMap.get(m.reply_to_id) || null) : null,
        isStarred: starredIds.has(m.id),
      };
    });
}

export function ChannelConversationView({ channel, currentUserId, allProfiles, onBack, isMobile, scrollToMessageId, onScrollHandled, onNavigateToTasks, onOpenDirectChat }: Props) {
  useLiveData(LIVE_DATA.channels, async () => { await Promise.all([fetchMessages(), fetchMembers(), fetchPinned(), fetchGroupTasks(), fetchMentionBar()]); });
  const theme = useChatTheme();
  const isDark = useDarkMode();
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [reactions, setReactions] = useState<{ message_id: string; user_id: string; emoji: string }[]>([]);
  const [_stars, setStars] = useState<{ message_id: string }[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [pinnedMsgs, setPinnedMsgs] = useState<ChannelMessage[]>([]);
  const [privatePins, setPrivatePins] = useState<ChannelMessage[]>([]);
  const [groupTasks, setGroupTasks] = useState<GroupTask[]>([]);
  const [replyTarget, setReplyTarget] = useState<ChannelMessage | null>(null);
  const [editTarget, setEditTarget] = useState<MessageWithMeta | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPinnedPopup, setShowPinnedPopup] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [groupTaskTarget, setGroupTaskTarget] = useState<{ msg: MessageWithMeta; mentionedUsers: ChannelProfile[] } | null>(null);
  const [mentionBarItems, setMentionBarItems] = useState<{ id: string; body: string | null; senderName: string }[]>([]);
  const [readLogMap, setReadLogMap] = useState<Record<string, Array<{ user_id: string; seen_at: string }>>>({});
  const [dismissedMentionIds, setDismissedMentionIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`dismissed_mentions_ch_${channel.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);

  const profileMap = new Map(allProfiles.map(p => [p.user_id, p]));
  const memberProfiles: ChannelProfile[] = members.map(m => m.profile).filter(Boolean) as ChannelProfile[];

  const canPost = channel.type === 'group'
    ? (myRole !== null && !(channel as any).is_locked)
    : (myRole === 'admin' || channel.created_by === currentUserId);

  const isAdmin = myRole === 'admin';

  const starredMessages = messages.filter(m => m.isStarred);

  const fetchMessages = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('channel_messages').select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false });

    const msgIds = (msgs || []).map(m => m.id);
    const [{ data: reacts }, { data: starsData }] = await Promise.all([
      msgIds.length
        ? supabase.from('channel_message_reactions').select('message_id, user_id, emoji').in('message_id', msgIds)
        : Promise.resolve({ data: [] }),
      currentUserId && msgIds.length
        ? supabase.from('channel_message_stars').select('message_id').in('message_id', msgIds).eq('user_id', currentUserId)
        : Promise.resolve({ data: [] }),
    ]);

    const raw = (msgs || []).slice().reverse();
    setReactions(reacts || []);
    setStars(starsData || []);
    setMessages(buildMeta(raw, reacts || [], starsData || [], allProfiles, currentUserId));

    if (currentUserId) {
      const ownMsgIds = raw.filter(m => m.sender_id === currentUserId).map(m => m.id);
      if (ownMsgIds.length) fetchReadLog(ownMsgIds);
    }
  }, [channel.id, allProfiles, currentUserId]);

  const fetchMembers = useCallback(async () => {
    const { data: memberRows, error: membErr } = await supabase
      .from('channel_members')
      .select('channel_id, user_id, role, joined_at')
      .eq('channel_id', channel.id);
    if (membErr || !memberRows) return;

    const userIds = memberRows.map((m: any) => m.user_id);
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles_public').select('user_id, full_name, username, avatar_url').in('user_id', userIds)
      : { data: [] as any[] };

    const freshProfileMap = new Map((profileRows || []).map((p: any) => [p.user_id, p]));

    const withProfiles: MemberWithProfile[] = memberRows.map((m: any) => ({
      ...m,
      id: m.user_id,
      profile: freshProfileMap.get(m.user_id) || null,
    }));
    setMembers(withProfiles);
    const me = memberRows.find((m: any) => m.user_id === currentUserId);
    setMyRole(me?.role || null);
  }, [channel.id, currentUserId]);

  const fetchPinned = useCallback(async () => {
    const { data: adminPinned } = await supabase.from('channel_messages').select('*')
      .eq('channel_id', channel.id).eq('is_pinned', true).eq('deleted_for_all', false)
      .order('created_at', { ascending: false });
    setPinnedMsgs(adminPinned || []);

    if (currentUserId) {
      const { data: myPins } = await supabase
        .from('channel_message_private_pins')
        .select('message_id')
        .eq('user_id', currentUserId);
      if (myPins && myPins.length > 0) {
        const ids = myPins.map((p: any) => p.message_id);
        const { data: privateMsgs } = await supabase.from('channel_messages').select('*')
          .in('id', ids).eq('deleted_for_all', false);
        setPrivatePins(privateMsgs || []);
      } else {
        setPrivatePins([]);
      }
    }
  }, [channel.id, currentUserId]);

  const fetchGroupTasks = useCallback(async () => {
    if (channel.type !== 'group') return;
    const { data: tasks } = await supabase.from('channel_group_tasks').select('*')
      .eq('channel_id', channel.id).order('created_at', { ascending: false });
    if (!tasks || tasks.length === 0) { setGroupTasks([]); return; }

    const taskIds = tasks.map((t: any) => t.id);
    const [{ data: assignments }, { data: activities }] = await Promise.all([
      supabase.from('channel_group_task_assignments').select('*').in('group_task_id', taskIds),
      supabase.from('channel_group_task_activities').select('*').in('group_task_id', taskIds).order('created_at', { ascending: true }),
    ]);

    const grouped = tasks.map((t: any) => ({
      ...t,
      assignments: (assignments || []).filter((a: any) => a.group_task_id === t.id),
      activities: (activities || []).filter((a: any) => a.group_task_id === t.id),
      creatorProfile: profileMap.get(t.created_by) || null,
    }));
    setGroupTasks(grouped as GroupTask[]);
  }, [channel.id, channel.type, allProfiles]);

  const fetchMentionBar = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('channel_messages')
      .select('id, body, sender_id')
      .eq('channel_id', channel.id)
      .eq('deleted_for_all', false)
      .neq('sender_id', currentUserId)
      .contains('mentioned_user_ids', [currentUserId])
      .order('created_at', { ascending: false })
      .limit(20);
    if (!data || data.length === 0) return;
    const senderMap = new Map(allProfiles.map(p => [p.user_id, p]));
    setMentionBarItems(data.map((m: any) => ({
      id: m.id,
      body: m.body,
      senderName: senderMap.get(m.sender_id)?.full_name || senderMap.get(m.sender_id)?.email || 'کاربر',
    })));
  };

  const fetchReadLog = useCallback(async (msgIds: string[]) => {
    if (!msgIds.length) return;
    try {
      const { data } = await supabase
        .from('channel_message_read_log')
        .select('message_id, user_id, seen_at')
        .in('message_id', msgIds);
      if (!data) return;
      const grouped: Record<string, Array<{ user_id: string; seen_at: string }>> = {};
      for (const row of data) {
        (grouped[row.message_id] ??= []).push({ user_id: row.user_id, seen_at: row.seen_at });
      }
      setReadLogMap(grouped);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchMembers();
    fetchPinned();
    fetchGroupTasks();
    if (currentUserId) fetchMentionBar();

    const sub = supabase.channel(`ch-rt-${channel.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channel.id}` }, () => { fetchMessages(); fetchPinned(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_message_reactions' }, fetchMessages)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_message_stars' }, fetchMessages)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members', filter: `channel_id=eq.${channel.id}` }, fetchMembers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_group_tasks', filter: `channel_id=eq.${channel.id}` }, fetchGroupTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_group_task_assignments' }, fetchGroupTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_group_task_activities' }, fetchGroupTasks)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!scrollToMessageId) return;
    handleScrollToMessage(scrollToMessageId);
    onScrollHandled?.();
  }, [scrollToMessageId]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const container = msgContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).style.backgroundColor = 'rgba(20, 184, 166, 0.15)';
      setTimeout(() => { (el as HTMLElement).style.backgroundColor = ''; }, 1500);
    }
  }, []);

  const handleReact = async (msgId: string, emoji: string) => {
    if (!currentUserId) return;
    const existing = reactions.find(r => r.message_id === msgId && r.user_id === currentUserId && r.emoji === emoji);
    if (existing) {
      await supabase.from('channel_message_reactions').delete().eq('message_id', msgId).eq('user_id', currentUserId).eq('emoji', emoji);
    } else {
      await supabase.from('channel_message_reactions').insert({ message_id: msgId, user_id: currentUserId, emoji });
    }
    fetchMessages();
  };

  const handlePin = async (msgId: string, pinned: boolean) => {
    if (!currentUserId) return;
    if (isAdmin) {
      await supabase.from('channel_messages').update({
        is_pinned: pinned,
        pinned_by: pinned ? currentUserId : null,
      }).eq('id', msgId);
    } else {
      if (pinned) {
        await supabase.from('channel_message_private_pins')
          .upsert({ message_id: msgId, user_id: currentUserId }, { onConflict: 'message_id,user_id' });
      } else {
        await supabase.from('channel_message_private_pins')
          .delete().eq('message_id', msgId).eq('user_id', currentUserId);
      }
    }
    fetchMessages(); fetchPinned();
  };

  const handleStar = async (msgId: string, starred: boolean) => {
    if (!currentUserId) return;
    if (starred) {
      const { error } = await supabase.from('channel_message_stars')
        .upsert({ message_id: msgId, user_id: currentUserId }, { onConflict: 'message_id,user_id' });
      if (error) { toast.error('خطا در نشانه‌گذاری: ' + error.message); return; }
    } else {
      await supabase.from('channel_message_stars').delete().eq('message_id', msgId).eq('user_id', currentUserId);
    }
    await fetchMessages();
  };

  const handleDelete = async (msgId: string) => {
    const { error } = await supabase.rpc('delete_channel_message', { p_message_id: msgId });
    if (error) { toast.error('خطا در حذف پیام: ' + error.message); return; }
    fetchMessages(); fetchPinned();
  };

  const handleEdit = (msg: MessageWithMeta) => {
    setEditTarget(msg); setReplyTarget(null);
  };

  const handleRegisterTask = (messageBody: string, messageId: string) => {
    if (!currentUserId) return;
    onNavigateToTasks?.(messageBody, messageId);
  };

  const handleGroupTask = (msg: MessageWithMeta, mentionedUsers: ChannelProfile[]) => {
    setGroupTaskTarget({ msg, mentionedUsers });
  };

  const handleCompleteTask = async (taskId: string) => {
    await supabase.from('channel_group_tasks').update({ status: 'done' }).eq('id', taskId);
    await supabase.from('channel_group_task_assignments').update({ status: 'archived' }).eq('group_task_id', taskId);
    fetchGroupTasks();
  };

  const handleArchiveTask = async (taskId: string) => {
    await supabase.from('channel_group_tasks').update({ status: 'archived' }).eq('id', taskId);
    fetchGroupTasks();
  };

  const handleUpdateAssignment = async (assignmentId: string, status: GroupTaskAssignment['status']) => {
    await supabase.from('channel_group_task_assignments').update({ status }).eq('id', assignmentId);
    fetchGroupTasks();
  };

  const handleAddActivity = async (taskId: string, note: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('channel_group_task_activities').insert({
      group_task_id: taskId,
      user_id: currentUserId,
      note,
    });
    if (error) { toast.error('خطا در ثبت: ' + error.message); return; }
    fetchGroupTasks();
  };

  const handleAddMember = async (userId: string) => {
    const { error } = await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: userId, role: 'member' });
    if (error) { toast.error(`خطا: ${error.message}`); return; }
    const name = profileMap.get(userId)?.full_name || 'کاربر';
    await supabase.rpc('insert_channel_system_message', {
      p_channel_id: channel.id,
      p_body: `${name} به ${channel.type === 'channel' ? 'کانال' : 'گروه'} اضافه شد`,
    });
    insertNotification({
      userId, category: 'channel', eventType: 'member_added',
      fallbackTitle: `به ${channel.name} اضافه شدید`,
      fallbackMessage: `شما به ${channel.type === 'channel' ? 'کانال' : 'گروه'} ${channel.name} اضافه شدید`,
      placeholders: { channel_name: channel.name, channel_type: channel.type === 'channel' ? 'کانال' : 'گروه' },
      senderId: currentUserId,
    }).catch(() => {});
    fetchMembers();
  };

  const handleRemoveMember = async (userId: string) => {
    await supabase.from('channel_members').delete().eq('channel_id', channel.id).eq('user_id', userId);
    fetchMembers();
  };

  const handleChangeRole = async (userId: string, role: MemberRole) => {
    await supabase.from('channel_members').update({ role }).eq('channel_id', channel.id).eq('user_id', userId);
    fetchMembers();
  };

  const displayMessages = searchQuery
    ? messages.filter(m => m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  useVisibleMessageReads(msgContainerRef, messages, currentUserId, channel.id, true, searchQuery);
  const grouped: { date: string; msgs: MessageWithMeta[] }[] = [];
  for (const msg of displayMessages) {
    const d = formatDate(msg.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) grouped.push({ date: d, msgs: [msg] });
    else last.msgs.push(msg);
  }

  const openGroupTasksCount = groupTasks.filter(t => t.status === 'open').length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 relative" dir="rtl">
        <ChannelHeader
          channel={channel}
          isMobile={isMobile}
          onBack={onBack}
          memberCount={members.length}
          showSearch={showSearch}
          onToggleSearch={() => setShowSearch(v => !v)}
          openGroupTasksCount={openGroupTasksCount}
          onShowTopics={() => setShowTopics(true)}
          onShowMembers={() => setShowMembers(true)}
          isAdmin={isAdmin}
          onShowSettings={() => setShowSettings(true)}
        />

        {showSearch && (
          <ChannelSearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        )}

        {channel.description && (
          <ChannelDescription description={channel.description} />
        )}

        {/* Messages + floating buttons */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={msgContainerRef} className="h-full overflow-y-auto py-2 overscroll-contain">
            {grouped.map(({ date, msgs: grpMsgs }) => (
              <div key={date}>
                <div className="flex justify-center my-3">
                  <span className="text-[11px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{date}</span>
                </div>
                {grpMsgs.map(msg => (
                  <div key={msg.id} data-msg-id={msg.id}
                    data-unread-message-id={msg.sender_id !== currentUserId && !msg.deleted_for_all && !(msg.read_by || []).includes(currentUserId) ? msg.id : undefined}
                    style={{ transition: 'background-color 0.6s ease' }}>
                    <ChannelMessageItem
                      msg={msg}
                      currentUserId={currentUserId}
                      myRole={myRole}
                      allMembers={memberProfiles}
                      allProfiles={allProfiles}
                      isChannelType={channel.type === 'channel'}
                      isPrivatelyPinned={privatePins.some(p => p.id === msg.id)}
                      theme={theme}
                      isDark={isDark}
                      readLogData={readLogMap[msg.id]}
                      onReply={m => { setReplyTarget(m); setEditTarget(null); }}
                      onReact={handleReact}
                      onPin={handlePin}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onStar={handleStar}
                      onScrollToMessage={handleScrollToMessage}
                      onRegisterAsTask={handleRegisterTask}
                      onGroupTask={channel.type === 'group' ? handleGroupTask : undefined}
                      onOpenDirectChat={onOpenDirectChat}
                    />
                  </div>
                ))}
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <Users className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-400">هنوز پیامی ارسال نشده</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {(pinnedMsgs.length > 0 || privatePins.length > 0) && (
            <FloatingPinButton
              count={pinnedMsgs.length + privatePins.length}
              active={showPinnedPopup}
              onClick={() => setShowPinnedPopup(v => !v)}
              topClass="top-3"
            />
          )}

          {starredMessages.length > 0 && (
            <FloatingStarButton
              count={starredMessages.length}
              active={showStarred}
              onClick={() => setShowStarred(v => !v)}
              topClass={pinnedMsgs.length > 0 || privatePins.length > 0 ? 'top-14' : 'top-3'}
            />
          )}

          {showPinnedPopup && (
            <PinnedPopup
              pinnedMsgs={pinnedMsgs}
              privatePins={privatePins}
              profiles={allProfiles}
              onScrollTo={handleScrollToMessage}
              onClose={() => setShowPinnedPopup(false)}
            />
          )}
        </div>

        {mentionBarItems.filter(m => !dismissedMentionIds.has(m.id)).length > 0 && (
          <ChannelMentionsBar
            items={mentionBarItems.filter(m => !dismissedMentionIds.has(m.id))}
            onScrollTo={id => handleScrollToMessage(id)}
            onDismiss={id => setDismissedMentionIds(prev => {
              const next = new Set([...prev, id]);
              try { localStorage.setItem(`dismissed_mentions_ch_${channel.id}`, JSON.stringify([...next])); } catch {}
              return next;
            })}
            onDismissAll={() => {
              const all = new Set(mentionBarItems.map(m => m.id));
              try { localStorage.setItem(`dismissed_mentions_ch_${channel.id}`, JSON.stringify([...all])); } catch {}
              setDismissedMentionIds(all);
            }}
          />
        )}
        <ChannelInputBar
          channelId={channel.id}
          channelName={channel.name}
          channelType={channel.type}
          currentUserId={currentUserId}
          allProfiles={allProfiles}
          members={members}
          replyTarget={replyTarget}
          editTarget={editTarget}
          canPost={canPost}
          onSent={fetchMessages}
          onCancelReply={() => setReplyTarget(null)}
          onCancelEdit={() => setEditTarget(null)}
        />

      {showStarred && (
        <StarredPanel
          starredMsgs={starredMessages}
          onScrollTo={id => { handleScrollToMessage(id); setShowStarred(false); }}
          onClose={() => setShowStarred(false)}
        />
      )}

      {showMembers && (
        <ChannelMembersModal
          members={members}
          allProfiles={allProfiles}
          currentUserId={currentUserId}
          myRole={myRole}
          onClose={() => setShowMembers(false)}
          onAdd={handleAddMember}
          onRemove={handleRemoveMember}
          onChangeRole={handleChangeRole}
        />
      )}

      {showSettings && (
        <ChannelSettingsModal
          channel={channel}
          myRole={myRole}
          currentUserId={currentUserId}
          members={members}
          allProfiles={allProfiles}
          onClose={() => setShowSettings(false)}
          onUpdated={fetchMembers}
          onDeleted={() => { setShowSettings(false); }}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onChangeRole={handleChangeRole}
        />
      )}

      {showTopics && channel.type === 'group' && (
        <WorkTopicsPanel
          tasks={groupTasks}
          members={memberProfiles}
          currentUserId={currentUserId}
          channelId={channel.id}
          allProfiles={allProfiles}
          onClose={() => setShowTopics(false)}
          onCompleteTask={handleCompleteTask}
          onArchiveTask={handleArchiveTask}
          onUpdateAssignment={handleUpdateAssignment}
          onAddActivity={handleAddActivity}
          onTaskCreated={fetchGroupTasks}
        />
      )}

      {groupTaskTarget && (
        <GroupTaskModal
          msg={groupTaskTarget.msg}
          mentionedUsers={groupTaskTarget.mentionedUsers}
          channelId={channel.id}
          currentUserId={currentUserId}
          onClose={() => setGroupTaskTarget(null)}
          onCreated={() => { fetchGroupTasks(); setGroupTaskTarget(null); }}
        />
      )}
    </div>
  );
}
