import { useMessageUnreadCounts } from '../../features/messaging/messageUnreadCounts';
import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Hash, Plus, Users } from 'lucide-react';
import { ChannelSidebar } from './ChannelSidebar';
import { Channel, ChannelType, ChannelWithMeta, ChannelProfile, GroupTask } from './types';
import { usePermissions } from '../../context/PermissionsContext';

const ChannelConversationView = lazy(() => import('./ChannelConversationView').then((m) => ({ default: m.ChannelConversationView })));
const CreateChannelModal = lazy(() => import('./CreateChannelModal').then((m) => ({ default: m.CreateChannelModal })));
const ChannelActionsPanel = lazy(() => import('./ChannelActionsPanel').then((m) => ({ default: m.ChannelActionsPanel })));
const ChatSettingsPage = lazy(() => import('../Chat/ChatSettingsPage').then((m) => ({ default: m.ChatSettingsPage })));


interface Props {
  currentUserId: string | null;
  isAdmin: boolean;
  type?: ChannelType;
  onBackToChat?: () => void;
  onNavigateToTasks?: (messageBody: string, messageId: string) => void;
  onOpenDirectChat?: (userId: string) => void;
}

type SidebarPanel = 'settings' | 'actions' | null;

export function ChannelsPage({ currentUserId, isAdmin, type = 'channel', onBackToChat, onNavigateToTasks, onOpenDirectChat }: Props) {
  useLiveData([...LIVE_DATA.channels, ...LIVE_DATA.people], async () => { await Promise.all([fetchChannels(), fetchProfiles()]); });
  const { channels: unreadCounts } = useMessageUnreadCounts();
  const { hasPermission } = usePermissions();
  const [openGroups, setOpenGroups] = useState<{ id: string; name: string }[]>([]);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [allProfiles, setAllProfiles] = useState<ChannelProfile[]>([]);
  const isChannel = type === 'channel';
  const canCreate = isChannel ? isAdmin : isAdmin || hasPermission('channels_create_group');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConversation, setShowConversation] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles_public').select('user_id, full_name, username, avatar_url');
    if (data) setAllProfiles(data);
  }, []);

  const fetchChannels = useCallback(async () => {
    if (!currentUserId) { setLoading(false); return []; }
    try {
      const { data: memberRows, error: membErr } = await supabase
        .from('channel_members').select('channel_id, role').eq('user_id', currentUserId);
      if (membErr) throw membErr;
      const memberships = memberRows ?? [];
      if (type === 'group') {
        const myIds = new Set(memberships.map(row => row.channel_id));
        const { data: publicGroups, error: publicGroupsError } = await supabase
          .from('channels').select('id, name').eq('type', 'group').eq('is_private', false).order('name');
        if (publicGroupsError) toast.error('بارگذاری گروه‌های قابل عضویت انجام نشد');
        setOpenGroups((publicGroups ?? []).filter(group => !myIds.has(group.id)));
      }
      if (memberships.length === 0) { setChannels([]); return []; }

      const channelIds = memberships.map(m => m.channel_id);
      const { data: raw, error: chanErr } = await supabase
        .from('channels').select('*').in('id', channelIds).eq('type', type).order('created_at', { ascending: false });
      if (chanErr) throw chanErr;

      const roleMap = new Map(memberships.map(m => [m.channel_id, m.role]));

      const all: ChannelWithMeta[] = (raw || []).map((c: any) => ({
        ...c,
        myRole: roleMap.get(c.id) ?? null,
        unreadCount: 0,
      }));
      setChannels(all);
      return all;
    } catch (e: any) {
      toast.error(`خطا در بارگذاری: ${e?.message || e}`);
      setChannels([]);
      setOpenGroups([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentUserId, type]);

  useEffect(() => {
    fetchChannels();
    if (!currentUserId) return;
    const sub = supabase.channel(`channels-list-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => fetchChannels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members' }, () => fetchChannels())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [currentUserId, fetchChannels]);

  useEffect(() => {
    if (selectedChannel || sidebarPanel === 'actions') {
      void fetchProfiles();
    }
  }, [selectedChannel, sidebarPanel, fetchProfiles]);

  const handleCreate = async (data: { name: string; description: string; type: ChannelType; is_private: boolean }) => {
    if (!currentUserId || !canCreate || data.type !== type) return;

    const { data: channelId, error } = await supabase.rpc('create_channel', {
      p_name: data.name,
      p_description: data.description || null,
      p_type: data.type,
      p_is_private: data.is_private,
    });
    if (error) { toast.error(`خطا در ایجاد: ${error.message}`); throw error; }

    toast.success(`${data.type === 'channel' ? 'کانال' : 'گروه'} با موفقیت ایجاد شد`);
    setShowCreate(false);

    const all = await fetchChannels();

    const created = (all || []).find((c: any) => c.id === channelId);
    if (created) {
      setSelectedId(created.id);
      setSelectedChannel(created);
      setShowConversation(true);
    } else {
      const { data: ch } = await supabase.from('channels').select('*').eq('id', channelId).single();
      if (ch) {
        setSelectedId(ch.id);
        setSelectedChannel({ ...ch, last_message_at: null });
        setShowConversation(true);
      }
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    if (isChannel || !currentUserId || joiningGroupId) return;
    setJoiningGroupId(groupId);
    try {
      const { error } = await supabase.rpc('join_public_work_group_v1', { p_group_id: groupId });
      if (error) throw error;
      const joined = (await fetchChannels()).find(group => group.id === groupId);
      if (joined) {
        setSelectedId(joined.id);
        setSelectedChannel(joined);
        setShowConversation(true);
      }
      toast.success('به گروه پیوستید');
    } catch {
      toast.error('عضویت در گروه انجام نشد');
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const found = channels.find(c => c.id === id);
    if (found) setSelectedChannel(found);
    setShowConversation(true);
    setSidebarPanel(null);
  };

  const toggleSidebarPanel = (panel: SidebarPanel) => {
    setSidebarPanel(prev => prev === panel ? null : panel);
  };

  const emptyGroupTasks: GroupTask[] = [];

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none"
      dir="rtl"
    >
      <div className={`${showConversation ? 'hidden md:flex' : 'flex'} h-full w-full flex-shrink-0 flex-col border-l border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950 md:w-[300px] xl:w-[330px]`}>
        {sidebarPanel === 'settings' ? (
          <Suspense fallback={null}>
            <ChatSettingsPage onClose={() => setSidebarPanel(null)} />
          </Suspense>
        ) : sidebarPanel === 'actions' ? (
          <Suspense fallback={null}>
            <ChannelActionsPanel
            currentUserId={currentUserId!}
            channelId={selectedChannel?.id}
            channelName={selectedChannel?.name}
            allProfiles={allProfiles}
            groupTasks={emptyGroupTasks}
            onClose={() => setSidebarPanel(null)}
            onNavigateToMessage={(msgId) => {
              setScrollToMessageId(msgId);
              setSidebarPanel(null);
              setShowConversation(true);
            }}
            />
          </Suspense>
        ) : (
          <ChannelSidebar
            items={channels.map(c => ({ ...c, unreadCount: unreadCounts.get(c.id) ?? 0 }))}
            type={type}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCreate={canCreate ? () => setShowCreate(true) : undefined}
            onBackToChat={onBackToChat}
            openGroups={openGroups}
            joiningGroupId={joiningGroupId}
            onJoinGroup={handleJoinGroup}
            loading={loading}
            onOpenSettings={() => toggleSidebarPanel('settings')}
            onOpenActions={() => toggleSidebarPanel('actions')}
          />
        )}
      </div>

      <div className={`min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 ${!showConversation ? 'hidden md:flex' : 'flex'}`}>
        {selectedChannel ? (
          <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-slate-400">در حال آماده‌سازی گفتگو...</div>}>
            <ChannelConversationView
            key={selectedChannel.id}
            channel={selectedChannel}
            currentUserId={currentUserId}
            allProfiles={allProfiles}
            onBack={() => setShowConversation(false)}
            isMobile={showConversation}
            scrollToMessageId={scrollToMessageId}
            onScrollHandled={() => setScrollToMessageId(null)}
            onNavigateToTasks={onNavigateToTasks}
            onOpenDirectChat={onOpenDirectChat}
            />
          </Suspense>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40 px-6 text-center dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/15">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-500 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              {isChannel ? <Hash className="h-7 w-7" /> : <Users className="h-7 w-7" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{isChannel ? 'کانال‌های سازمانی' : 'گروه‌های کاری'}</h3>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {channels.length > 0 ? 'یک مورد را برای مشاهده پیام‌ها انتخاب کنید' : `هنوز ${isChannel ? 'کانالی' : 'گروهی'} برای شما وجود ندارد`}
              </p>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-1 flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-violet-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-[0_7px_20px_rgba(79,70,229,0.18)] transition hover:from-violet-500 hover:to-indigo-500"
              >
                <Plus className="h-4 w-4" />
                {isChannel ? 'کانال جدید' : 'گروه جدید'}
              </button>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <Suspense fallback={null}>
          <CreateChannelModal
          type={type}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          />
        </Suspense>
      )}
    </div>
  );
}
