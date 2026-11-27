import { useLiveData } from '../../shared/realtime/useLiveData';
import { useState, useEffect } from 'react';
import { X, Search, Send, Bookmark, Users, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { UserProfile } from './types';
import { UserAvatar } from './ChatConversationItem';

interface ForwardTarget {
  conversationId: string;
  isSelf: boolean;
  name: string;
  avatarUrl?: string | null;
}

interface BroadcastTarget {
  type: 'user' | 'channel';
  id: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string;
}

interface Props {
  body: string | null;
  fileUrl: string | null;
  fileName?: string | null;
  fileType?: string | null;
  currentUserId: string;
  allUsers: UserProfile[];
  senderName: string | null;
  onClose: () => void;
}

export function ForwardModal({ body, fileUrl, fileName, fileType, currentUserId, allUsers, senderName, onClose }: Props) {
  const [tab, setTab] = useState<'chats' | 'all'>('chats');

  // Tab 1: existing conversations
  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [sendingChat, setSendingChat] = useState<string | null>(null);

  // Tab 2: all users + channels
  const [broadcastTargets, setBroadcastTargets] = useState<BroadcastTarget[]>([]);
  const [loadingBroadcast, setLoadingBroadcast] = useState(true);
  const [sendingBroadcast, setSendingBroadcast] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const [selfConversationId, setSelfConversationId] = useState<string | null>(null);
  useEffect(() => { let disposed = false;
    setTargets([]); setBroadcastTargets([]); setLoadingChats(true); setLoadingBroadcast(true); setSelfConversationId(null);
    void supabase.rpc('find_or_create_direct_conversation', { user_a: currentUserId, user_b: currentUserId }).then(({data}) => { if (!disposed) setSelfConversationId(data as string | null); });
    return () => { disposed = true; };
  }, [currentUserId]);

  const loadChatTargets = async () => {
      const { data: convs, error: convError } = await supabase
        .from('chat_conversations')
        .select('id, participant_a, participant_b, deleted_for_a, deleted_for_b')
        .or(`participant_a.eq.${currentUserId},participant_b.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (convError) return;
      const list: ForwardTarget[] = [];
      if (selfConversationId) {
        list.push({ conversationId: selfConversationId, isSelf: true, name: 'پیام‌های ذخیره‌شده' });
      }
      for (const c of (convs || [])) {
        const isDeleted = c.participant_a === currentUserId ? c.deleted_for_a : c.deleted_for_b;
        if (isDeleted) continue;
        const otherId = c.participant_a === currentUserId ? c.participant_b : c.participant_a;
        if (otherId === currentUserId) continue;
        const profile = allUsers.find(u => u.user_id === otherId);
        list.push({
          conversationId: c.id,
          isSelf: false,
          name: profile?.full_name || profile?.username || profile?.email || 'کاربر',
          avatarUrl: profile?.avatar_url,
        });
      }
      setTargets(list);
      setLoadingChats(false);
  };

  const loadBroadcastTargets = async () => {
    // All profiles except self
    const userList: BroadcastTarget[] = allUsers
      .filter(u => u.user_id !== currentUserId)
      .map(u => ({
        type: 'user' as const,
        id: u.user_id,
        name: u.full_name || u.username || u.email || 'کاربر',
        avatarUrl: u.avatar_url,
        subtitle: 'کاربر',
      }));

    // Channels/groups where current user is member
    const { data: memberships, error: membershipError } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', currentUserId);

    if (membershipError) return;
    const channelIds = (memberships || []).map((m: any) => m.channel_id);
    let channelList: BroadcastTarget[] = [];
    if (channelIds.length > 0) {
      const { data: channels, error: channelError } = await supabase
        .from('channels')
        .select('id, name, type')
        .in('id', channelIds);
      if (channelError) return;
      channelList = (channels || []).map((c: any) => ({
        type: 'channel' as const,
        id: c.id,
        name: c.name,
        subtitle: c.type === 'group' ? 'گروه' : 'کانال',
      }));
    }

    setBroadcastTargets([...channelList, ...userList]);
    setLoadingBroadcast(false);
  };

  useLiveData(['chat_conversations','profiles'], loadChatTargets, !!currentUserId, undefined, `${currentUserId}:${selfConversationId || ''}`);
  useLiveData(['channels','channel_members','profiles'], loadBroadcastTargets, tab === 'all', undefined, currentUserId);
  useEffect(() => { void loadChatTargets(); if (tab === 'all') void loadBroadcastTargets(); }, [allUsers, selfConversationId]);

  const handleForwardToChat = async (target: ForwardTarget) => {
    setSendingChat(target.conversationId);
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: target.conversationId,
      sender_id: currentUserId,
      body: body || null,
      message_type: 'normal',
      is_forwarded: true,
      forwarded_from_name: senderName,
      file_url: fileUrl || null,
      file_name: fileName || null,
      file_type: fileType || null,
    });
    setSendingChat(null);
    if (error) {
      toast.error('خطا در ارسال پیام');
    } else {
      toast.success(`پیام به "${target.name}" ارسال شد`);
      onClose();
    }
  };

  const handleBroadcastSend = async (target: BroadcastTarget) => {
    setSendingBroadcast(target.id);
    try {
      if (target.type === 'channel') {
        const { error } = await supabase.from('channel_messages').insert({
          channel_id: target.id,
          sender_id: currentUserId,
          body: body || null,
          message_type: 'normal',
          is_forwarded: true,
          forwarded_from_name: senderName,
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_type: fileType || null,
        });
        if (error) throw error;
      } else {
        // Create/find conversation then send
        const { data: convId, error: convErr } = await supabase.rpc('find_or_create_direct_conversation', {
          user_a: currentUserId,
          user_b: target.id,
        });
        if (convErr || !convId) throw convErr || new Error('خطا در ایجاد گفتگو');
        const { error } = await supabase.from('chat_messages').insert({
          conversation_id: convId,
          sender_id: currentUserId,
          body: body || null,
          message_type: 'normal',
          is_forwarded: true,
          forwarded_from_name: senderName,
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_type: fileType || null,
        });
        if (error) throw error;
      }
      toast.success(`پیام به "${target.name}" ارسال شد`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'خطا در ارسال');
    } finally {
      setSendingBroadcast(null);
    }
  };

  const filteredChats = targets.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const filteredBroadcast = broadcastTargets.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full sm:w-96 max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">ارسال پیام</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setTab('chats')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${tab === 'chats' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            گفتگوها
          </button>
          <button
            onClick={() => setTab('all')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${tab === 'all' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Users className="w-3.5 h-3.5" />
            ارسال به دیگران
          </button>
        </div>

        {/* Message preview */}
        {body && (
          <div className="mx-4 mt-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{body}</p>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="جستجو..."
              className="w-full pr-9 pl-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-400 dark:text-white"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-64 pb-2">
          {tab === 'chats' ? (
            loadingChats ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredChats.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">گفتگویی یافت نشد</p>
            ) : (
              filteredChats.map(t => (
                <button
                  key={t.conversationId}
                  onClick={() => handleForwardToChat(t)}
                  disabled={sendingChat !== null}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right disabled:opacity-60"
                >
                  {t.isSelf ? (
                    <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <Bookmark className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <UserAvatar name={t.name} size="sm" avatarUrl={t.avatarUrl} />
                  )}
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{t.name}</span>
                  {sendingChat === t.conversationId ? (
                    <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <Send className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )
          ) : loadingBroadcast ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredBroadcast.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">نتیجه‌ای یافت نشد</p>
          ) : (
            filteredBroadcast.map(t => (
              <button
                key={`${t.type}-${t.id}`}
                onClick={() => handleBroadcastSend(t)}
                disabled={sendingBroadcast !== null}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right disabled:opacity-60"
              >
                {t.type === 'channel' ? (
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <UserAvatar name={t.name} size="sm" avatarUrl={t.avatarUrl} />
                )}
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{t.name}</p>
                  {t.subtitle && <p className="text-[10px] text-gray-400">{t.subtitle}</p>}
                </div>
                {sendingBroadcast === t.id ? (
                  <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <Send className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
