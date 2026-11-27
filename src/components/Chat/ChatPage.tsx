import { useMessageUnreadCounts } from '../../features/messaging/messageUnreadCounts';
import { useLiveData, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageCircle, Plus, Loader as Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { ChatSidebar } from './ChatSidebar';
import type { ConversationWithProfile, UserProfile } from './types';

const ChatConversationView = lazy(() => import('./ChatConversationView').then((m) => ({ default: m.ChatConversationView })));
const ChatActionsPanel = lazy(() => import('./ChatActionsPanel').then((m) => ({ default: m.ChatActionsPanel })));
const ChatSettingsPage = lazy(() => import('./ChatSettingsPage').then((m) => ({ default: m.ChatSettingsPage })));
const CallHistoryPage = lazy(() => import('./CallHistoryPage').then((m) => ({ default: m.CallHistoryPage })));
const NewConversationModal = lazy(() => import('./NewConversationModal').then((m) => ({ default: m.NewConversationModal })));


interface Props {
  currentUserId?: string | null;
  onNavigateToCalendar?: (mentionedUserIds?: string[], bodyText?: string) => void;
  onNavigateToTasks?: (messageBody: string, messageId: string) => void;
  showCalls?: boolean;
  initialOpenUserId?: string | null;
  onInitialOpenUserConsumed?: () => void;
}

export function ChatPage({ currentUserId: providedCurrentUserId = null, onNavigateToCalendar, onNavigateToTasks, showCalls = false, initialOpenUserId, onInitialOpenUserConsumed }: Props) {
  const outgoingCall = useRef<AbortController | null>(null);
  useEffect(() => () => outgoingCall.current?.abort(), [providedCurrentUserId]);
  async function startCall(recipient: UserProfile, capability: 'audio' | 'video') {
    if (outgoingCall.current) return;
    const controller = new AbortController();
    outgoingCall.current = controller;
    const message = toast.loading('در حال ارسال دعوت تماس…');
    try {
      const { data, error } = await supabase.functions.invoke('start-external-call', { body: { recipient: recipient.user_id, capability } });
      if (controller.signal.aborted) return;
      if (error) throw error;
      if (!data?.available) { toast.error('سرویس تماس هنوز فعال نشده است', { id: message }); return; }
      toast.loading('در انتظار پاسخ مخاطب…', { id: message });
      for (let attempt = 0; attempt < 46 && !controller.signal.aborted; attempt++) {
        const { data: decision, error: decisionError } = await (supabase as any).rpc('get_my_outgoing_call_decision', { p_id: data.invitation });
        if (controller.signal.aborted) return;
        if (!decisionError && decision === 'accepted') { window.location.assign(data.joinUrl); return; }
        if (decision === 'declined') { toast.error('مخاطب تماس را رد کرد', { id: message }); return; }
        if (!decisionError && decision !== 'pending') break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!controller.signal.aborted) toast.error('تماس بدون پاسخ ماند', { id: message });
    } catch {
      if (!controller.signal.aborted) toast.error('ارسال دعوت تماس انجام نشد', { id: message });
    } finally {
      if (outgoingCall.current === controller) outgoingCall.current = null;
      if (controller.signal.aborted) toast.dismiss(message);
    }
  }
  const { direct: unreadCounts } = useMessageUnreadCounts();
  const [currentUserId, setCurrentUserId] = useState<string | null>(providedCurrentUserId);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [msgRefreshKey, setMsgRefreshKey] = useState(0);

  // Navigation from actions panel
  const [navToConvId, setNavToConvId] = useState<string | null>(null);
  const [navToMsgId, setNavToMsgId] = useState<string | null>(null);


  const conversationRequestRef = useRef(0);
  const pendingConvIdRef = useRef<string | null>(null);

  // ── Fetch conversations ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async (uid: string) => {
    const request = ++conversationRequestRef.current;
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participant_a.eq.${uid},participant_b.eq.${uid}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (request !== conversationRequestRef.current) return;
    if (error) { console.error('fetchConversations:', error.message); setLoadingConvs(false); return; }

    // Filter out conversations the current user has deleted
    const visibleData = (data || []).filter(c =>
      c.participant_a === uid ? !c.deleted_for_a : !c.deleted_for_b
    );

    if (visibleData.length === 0) { setConversations([]); setLoadingConvs(false); return; }

    const otherIds = [...new Set(
      visibleData.map(c => c.participant_a === uid ? c.participant_b : c.participant_a).filter(Boolean)
    )] as string[];

    const convIds = visibleData.map(c => c.id);
    const threshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    // Fetch profiles, presence, and mentions all in parallel
    const [profilesRes, presenceRes, mentionRes] = await Promise.all([
      supabase
        .from('profiles_public')
        .select('user_id, full_name, username, avatar_url')
        .in('user_id', otherIds),
      supabase
        .from('user_presence')
        .select('user_id, is_online, status, last_seen')
        .in('user_id', otherIds),
      supabase
        .from('chat_messages')
        .select('id, conversation_id')
        .in('conversation_id', convIds)
        .neq('sender_id', uid)
        .not('read_by', 'cs', `{${uid}}`)
        .contains('mentioned_user_ids', [uid])
        .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) {
      console.error('[ChatPage] profiles_public query failed', {
        message: profilesRes.error.message,
        code: profilesRes.error.code,
        details: profilesRes.error.details,
        requestedCount: otherIds.length,
      });
    }
    if (presenceRes.error) {
      console.error('[ChatPage] user_presence query failed', {
        message: presenceRes.error.message,
        code: presenceRes.error.code,
      });
    }

    const presenceMap = new Map<string, { is_online: boolean; status: string; last_seen: string }>(
      (presenceRes.data || []).map((p: any) => [p.user_id, {
        is_online: p.is_online && p.last_seen >= threshold,
        status: p.status || 'offline',
        last_seen: p.last_seen,
      }])
    );

    const profileMap = new Map<string, UserProfile>(
      (profilesRes.data || []).map((p: any) => {
        const presence = presenceMap.get(p.user_id);
        return [p.user_id, {
          ...p,
          status: presence?.status ?? 'offline',
          is_online: presence?.is_online ?? false,
          last_seen: presence?.last_seen ?? null,
        }];
      })
    );

    const unresolvedIds = otherIds.filter(id => !profileMap.has(id));
    if (unresolvedIds.length > 0) {
      console.warn('[ChatPage] unresolved profile IDs', {
        unresolvedCount: unresolvedIds.length,
        requestedCount: otherIds.length,
        returnedCount: profileMap.size,
        unresolvedIds,
        hasQueryError: !!profilesRes.error,
      });
    }

    // First unread mention per conversation
    const mentionMap = new Map<string, string>();
    for (const m of (mentionRes.data || [])) {
      if (!mentionMap.has(m.conversation_id)) mentionMap.set(m.conversation_id, m.id);
    }

    const mapped = visibleData.map(c => {
      const otherId = c.participant_a === uid ? c.participant_b : c.participant_a;
      return {
        ...c,
        otherUser: profileMap.get(otherId) ?? {
          user_id: otherId,
          full_name: null,
          username: null,
          email: null,
          avatar_url: null,
          status: 'offline',
          is_online: false,
          last_seen: null,
        },
        unreadCount: 0,
        hasMention: mentionMap.has(c.id),
        mentionMessageId: mentionMap.get(c.id) || null,
        isPinned: c.participant_a === uid ? !!c.pinned_for_a : !!c.pinned_for_b,
      };
    });
    if (request !== conversationRequestRef.current) return;
    setConversations(mapped);
    // If the active conversation was deleted, clear it and return to sidebar
    setActiveId(prev => prev && mapped.some(c => c.id === prev) ? prev : null);
    setLoadingConvs(false);
  }, []);

  useLiveData(LIVE_DATA.chat, async () => { if (currentUserId) await fetchConversations(currentUserId); }, !!currentUserId, undefined, currentUserId || '');

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let userId = providedCurrentUserId;
      let fallbackEmail: string | null = null;

      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        userId = user.id;
        fallbackEmail = user.email || null;
      }

      if (cancelled) return;
      setCurrentUserId(userId);

      const { data: profile } = await supabase
        .from('profiles_public')
        .select('user_id, full_name, username, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setCurrentUserProfile(profile || { user_id: userId, full_name: null, email: fallbackEmail });


    })();
    return () => {
      cancelled = true;
      conversationRequestRef.current++;

    };
  }, [providedCurrentUserId, fetchConversations]);

  // ── Activate pending conversation after fetch ────────────────────────────
  useEffect(() => {
    if (!pendingConvIdRef.current) return;
    const found = conversations.find(c => c.id === pendingConvIdRef.current);
    if (found) {
      setActiveId(pendingConvIdRef.current);
      pendingConvIdRef.current = null;
    }
  }, [conversations]);

  // ── When the active conversation is removed (e.g. deleted), show sidebar ──
  useEffect(() => {
    if (activeId === null) setShowSidebar(true);
  }, [activeId]);

  // ── Auto-open DM from external navigation ───────────────────────────────
  useEffect(() => {
    if (!initialOpenUserId || !currentUserId || loadingConvs) return;
    (async () => {
      const { data: convId, error } = await supabase.rpc('find_or_create_direct_conversation', {
        user_a: currentUserId,
        user_b: initialOpenUserId,
      });
      if (error || !convId) { toast.error('خطا در باز کردن چت'); return; }
      pendingConvIdRef.current = convId as string;
      await fetchConversations(currentUserId);
      setShowSidebar(false);
      onInitialOpenUserConsumed?.();
    })();
  }, [initialOpenUserId, currentUserId, loadingConvs]);

  // ── New conversation ─────────────────────────────────────────────────────
  const handleNewConv = async (user: UserProfile) => {
    if (!currentUserId) return;
    const { data: convId, error } = await supabase.rpc('find_or_create_direct_conversation', {
      user_a: currentUserId,
      user_b: user.user_id,
    });
    if (error || !convId) { toast.error('خطا: ' + (error?.message || 'ناشناس')); return; }
    setShowNewConv(false);
    pendingConvIdRef.current = convId as string;
    await fetchConversations(currentUserId);
    setShowSidebar(false);
  };

  // ── Optimistic pin toggle ─────────────────────────────────────────────────
  const handleTogglePin = useCallback((convId: string) => {
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, isPinned: !c.isPinned } : c
    ));
  }, []);

  // ── Open / create Saved Messages (self-chat) ──────────────────────────────
  const handleOpenSavedMessages = async () => {
    if (!currentUserId) return;
    const { data: convId, error } = await supabase.rpc('find_or_create_direct_conversation', {
      user_a: currentUserId,
      user_b: currentUserId,
    });
    if (error || !convId) { toast.error('خطا در باز کردن پیام‌های ذخیره‌شده'); return; }
    pendingConvIdRef.current = convId as string;
    await fetchConversations(currentUserId);
    setShowSidebar(false);
  };

  // ── Navigation from actions panel ────────────────────────────────────────
  const handleNavigateToMessage = (convId: string, msgId: string) => {
    setShowActions(false);
    setNavToConvId(convId);
    setNavToMsgId(msgId);
    if (activeId !== convId) {
      setActiveId(convId);
    }
    setShowSidebar(false);
  };

  const handleSelectConv = (id: string) => {
    setActiveId(id);
    setShowSidebar(false);
    setShowSettings(false);
  };

  const activeConv = conversations.find(c => c.id === activeId) || null;

  if (!currentUserId) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <>
    <div hidden={!showCalls} role="tabpanel" id="chat-panel-calls" aria-labelledby="chat-tab-calls" className="h-full min-h-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {showCalls && (
        <Suspense fallback={<div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-violet-500" /></div>}>
          <CallHistoryPage currentUserId={currentUserId} onStartCall={(recipient, capability) => void startCall(recipient, capability)} />
        </Suspense>
      )}
    </div>
    <div
      role="tabpanel"
      id="chat-panel-chats"
      aria-labelledby="chat-tab-chats"
      className={`${showCalls ? 'hidden' : 'flex'} h-full min-h-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none`}
      dir="rtl"
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className={`${showSidebar ? 'flex' : 'hidden lg:flex'} w-full flex-shrink-0 flex-col border-l border-slate-200/80 bg-white/95 dark:border-slate-800 dark:bg-slate-950 lg:w-[310px] xl:w-[340px]`}>
        {loadingConvs ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : showActions ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>}>
            <ChatActionsPanel
            currentUserId={currentUserId}
            onClose={() => setShowActions(false)}
            onNavigateToMessage={handleNavigateToMessage}
            />
          </Suspense>
        ) : showSettings ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>}>
            <ChatSettingsPage onClose={() => setShowSettings(false)} />
          </Suspense>
        ) : (
          <ChatSidebar
            conversations={conversations.map(c => ({ ...c, unreadCount: unreadCounts.get(c.id) ?? 0 }))}
            activeId={activeId}
            currentUserId={currentUserId}
            onSelect={handleSelectConv}
            onNewConversation={() => setShowNewConv(true)}
            onRefresh={() => fetchConversations(currentUserId)}
            onTogglePin={handleTogglePin}
            onOpenSavedMessages={handleOpenSavedMessages}
            onToggleActions={() => { setShowActions(v => !v); setShowSettings(false); }}
            showActions={showActions}
            onOpenSettings={() => { setShowSettings(true); setShowActions(false); }}
            onMentionClick={(convId, msgId) => {
              setActiveId(convId);
              setNavToConvId(convId);
              setNavToMsgId(msgId);
              setShowSidebar(false);
            }}
            onClearHistory={() => setMsgRefreshKey(k => k + 1)}
          />
        )}
      </div>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div className={`${!showSidebar ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950`}>
        {/* Conversation view */}
        {activeConv ? (
            <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>}>
              <ChatConversationView
              key={activeConv.id}
              conversation={activeConv}
              currentUserId={currentUserId}
              currentUserProfile={currentUserProfile}
              onBack={() => { setShowSidebar(true); setActiveId(null); }}
              onNavigateToCalendar={onNavigateToCalendar}
              onNavigateToTasks={onNavigateToTasks}
              onConversationUpdate={() => fetchConversations(currentUserId)}
              initialScrollToMessageId={navToConvId === activeConv.id ? navToMsgId : null}
              onScrollToMessageConsumed={() => { setNavToConvId(null); setNavToMsgId(null); }}
              onStartCall={capability => void startCall(activeConv.otherUser, capability)}
              msgRefreshKey={msgRefreshKey}
              onOpenDirectChat={async (userId) => {
                const { data: convId, error } = await supabase.rpc('find_or_create_direct_conversation', {
                  user_a: currentUserId,
                  user_b: userId,
                });
                if (error || !convId) { toast.error('خطا در باز کردن چت'); return; }
                pendingConvIdRef.current = convId as string;
                await fetchConversations(currentUserId);
                setShowSidebar(false);
              }}
              />
            </Suspense>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gradient-to-br from-white via-slate-50 to-violet-50/40 px-6 text-center dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/15">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-500 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <MessageCircle className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">یک مکالمه را انتخاب کنید</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">یا یک گفتگوی سازمانی جدید شروع کنید</p>
              </div>
              <button
                onClick={() => setShowNewConv(true)}
                className="mt-1 flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-violet-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-[0_7px_20px_rgba(79,70,229,0.18)] transition hover:from-violet-500 hover:to-indigo-500"
              >
                <Plus className="h-4 w-4" /> گفتگوی جدید
              </button>
            </div>
        )}

        {(showActions || showSettings) && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50/70 text-slate-400 dark:bg-slate-950 dark:text-slate-500">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <MessageCircle className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-xs">از پنل کناری یک گزینه را انتخاب کنید</p>
          </div>
        )}
      </div>

      {/* ── New conversation modal ───────────────────────────────────────── */}
      {showNewConv && (
        <Suspense fallback={null}>
          <NewConversationModal
          currentUserId={currentUserId}
          onSelect={handleNewConv}
          onClose={() => setShowNewConv(false)}
          />
        </Suspense>
      )}
    </div>
    </>
  );
}
