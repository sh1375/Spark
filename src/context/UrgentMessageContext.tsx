import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, X } from 'lucide-react';

export interface UrgentAlarmData {
  id: string;
  body?: string | null;
  sender_name: string;
  created_at?: string;
  conversation_id?: string;
}

const UrgentMessageContext = createContext<((data: UrgentAlarmData) => void) | null>(null);

export function useUrgentMessageAlarm() {
  const triggerAlarm = useContext(UrgentMessageContext);
  if (!triggerAlarm) throw new Error('UrgentMessageProvider is missing');
  return triggerAlarm;
}

function formatUrgentTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const time = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  return `${time} — ${get('year')}/${get('month')}/${get('day')}`;
}

function showUrgentMessageToast(
  messageType: string,
  senderName: string,
  body: string,
  onNavigate?: () => void,
) {
  const isUrgent = messageType === 'urgent';

  toast.custom(
    (t) => (
      <div
        onClick={() => {
          toast.dismiss(t.id);
          onNavigate?.();
        }}
        className={`flex items-start gap-3 shadow-2xl rounded-2xl p-3.5 border-2 max-w-sm w-full cursor-pointer transition-all ${
          isUrgent
            ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-600'
            : 'bg-orange-50 dark:bg-orange-950 border-orange-400 dark:border-orange-600'
        } ${t.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        dir="rtl"
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isUrgent ? 'bg-red-500 animate-pulse' : 'bg-orange-500'
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold leading-tight ${
              isUrgent
                ? 'text-red-700 dark:text-red-300'
                : 'text-orange-700 dark:text-orange-300'
            }`}
          >
            {isUrgent ? 'پیام اورژانسی' : 'پیام مهم'} از {senderName}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2 leading-relaxed">
            {body}
          </p>
          {onNavigate && (
            <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1 font-medium">
              برای رفتن کلیک کنید
            </p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t.id);
          }}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    ),
    { duration: isUrgent ? 15000 : 10000 },
  );

  // Browser notification for urgent messages
  if (
    isUrgent &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    const n = new window.Notification(`پیام اورژانسی از ${senderName}`, {
      body,
      icon: '/logo_spark.png',
    });
    n.onclick = () => {
      window.focus();
      onNavigate?.();
      n.close();
    };
  }
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + start + dur);
    };
    playTone(1100, 0, 0.15);
    playTone(880, 0.2, 0.15);
    playTone(1100, 0.4, 0.2);
  } catch { /* ignore */ }
}

interface ProviderProps {
  currentUserId: string | null;
  onNavigateToChat?: () => void;
  onNavigateToChannels?: () => void;
  children: React.ReactNode;
}

export function UrgentMessageProvider({ currentUserId, onNavigateToChat, onNavigateToChannels, children }: ProviderProps) {
  const [urgentAlarm, setUrgentAlarm] = useState<UrgentAlarmData | null>(null);
  const [alarmVisible, setAlarmVisible] = useState(false);
  const urgentChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedUrgentIds = useRef<Set<string>>(new Set());

  // Keep navigate callbacks in refs so subscription effects never need to re-run
  const onNavigateToChatRef = useRef(onNavigateToChat);
  onNavigateToChatRef.current = onNavigateToChat;
  const onNavigateToChannelsRef = useRef(onNavigateToChannels);
  onNavigateToChannelsRef.current = onNavigateToChannels;
  // Keep currentUserId in a ref so alarm callbacks don't capture a stale value
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const dismissAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (urgentAlarm) {
      try {
        const key = `urgent_dismissed_${currentUserIdRef.current}`;
        const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (!existing.includes(urgentAlarm.id)) existing.push(urgentAlarm.id);
        localStorage.setItem(key, JSON.stringify(existing.slice(-200)));
      } catch { /* ignore */ }
      if (urgentAlarm.conversation_id) {
        supabase.rpc('mark_conversation_messages_read', {
          p_conversation_id: urgentAlarm.conversation_id,
        }).then(() => {});
      }
    }
    setAlarmVisible(false);
    setUrgentAlarm(null);
  };

  const triggerUrgentAlarm = (data: UrgentAlarmData) => {
    // In-memory dedup: same session
    if (firedUrgentIds.current.has(data.id)) return;

    // Persistent dedup: already dismissed in a previous session
    try {
      const key = `urgent_dismissed_${currentUserIdRef.current}`;
      const dismissed: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (dismissed.includes(data.id)) {
        firedUrgentIds.current.add(data.id);
        return;
      }
    } catch { /* ignore */ }

    firedUrgentIds.current.add(data.id);
    setUrgentAlarm(data);
    setAlarmVisible(true);
    playBeep();
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(playBeep, 1500);
  };

  // ── On login: check for existing unread urgent messages ──────────────────
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('id, body, sender_id, created_at, conversation_id, message_type')
        .eq('message_type', 'urgent')
        .neq('sender_id', currentUserId)
        .not('read_by', 'cs', `{${currentUserId}}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!msgs?.length) return;
      const senderIds = [...new Set(msgs.map((m: any) => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('user_id, full_name')
        .in('user_id', senderIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
      for (const msg of msgs) {
        const senderName = profileMap.get(msg.sender_id) || 'کاربر';
        triggerUrgentAlarm({
          id: msg.id,
          body: msg.body,
          sender_name: senderName,
          created_at: msg.created_at,
          conversation_id: msg.conversation_id,
        });
        break; // Show one alarm at a time; user dismisses to see next
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Global urgent message listener (fires on every page) ─────────────────
  useEffect(() => {
    if (!currentUserId) return;

    urgentChannelRef.current = supabase
      .channel(`urgent-msgs-${currentUserId}-${Date.now()}`)
      // Direct chat messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const msg = payload.new as any;
        if (!['urgent', 'important'].includes(msg.message_type)) return;
        if (msg.sender_id === currentUserId) return;
        const { data: sender } = await supabase
          .from('profiles_public')
          .select('full_name')
          .eq('user_id', msg.sender_id)
          .maybeSingle<{ full_name: string | null }>();
        const senderName = sender?.full_name || 'کاربر';
        showUrgentMessageToast(
          msg.message_type,
          senderName,
          msg.body || '',
          () => onNavigateToChatRef.current?.(),
        );
        if (msg.message_type === 'urgent') {
          triggerUrgentAlarm({
            id: msg.id,
            body: msg.body,
            sender_name: senderName,
            created_at: msg.created_at,
            conversation_id: msg.conversation_id,
          });
        }
      })
      // Channel messages
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, async (payload) => {
        const msg = payload.new as any;
        if (!['urgent', 'important'].includes(msg.message_type)) return;
        if (msg.sender_id === currentUserId) return;
        const { data: sender } = await supabase
          .from('profiles_public')
          .select('full_name')
          .eq('user_id', msg.sender_id)
          .maybeSingle<{ full_name: string | null }>();
        const senderName = sender?.full_name || 'کاربر';
        showUrgentMessageToast(
          msg.message_type,
          senderName,
          msg.body || '',
          () => onNavigateToChannelsRef.current?.(),
        );
        if (msg.message_type === 'urgent') {
          triggerUrgentAlarm({
            id: msg.id,
            body: msg.body,
            sender_name: senderName,
            created_at: msg.created_at,
          });
        }
      })
      .subscribe();

    return () => {
      if (urgentChannelRef.current) {
        supabase.removeChannel(urgentChannelRef.current);
        urgentChannelRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  return (
    <UrgentMessageContext.Provider value={triggerUrgentAlarm}>
      {children}

      {/* Global urgent alarm — visible on EVERY page */}
      {alarmVisible && urgentAlarm && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto"
          style={{ zIndex: 9999, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-96 h-96 rounded-full border-4 border-red-500 animate-ping opacity-20" />
          </div>
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border-4 border-red-500">
            <div className="bg-red-500 px-6 py-5 flex items-center gap-3">
              <AlertTriangle className="w-9 h-9 text-white animate-bounce flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-xl">پیام اورژانسی!</p>
                <p className="text-red-100 text-sm mt-0.5">از طرف: {urgentAlarm.sender_name}</p>
              </div>
            </div>
            <div className="px-6 py-6" dir="rtl">
              <p className="text-gray-800 dark:text-white text-base leading-relaxed whitespace-pre-wrap font-medium">
                {urgentAlarm.body || '📎 فایل'}
              </p>
              {urgentAlarm.created_at && (
                <p className="text-xs text-gray-400 mt-3">
                  {formatUrgentTimestamp(urgentAlarm.created_at)}
                </p>
              )}
              <p className="text-xs text-red-400 mt-2 text-center animate-pulse">
                برای ادامه کار باید این پیام را تایید کنید
              </p>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={dismissAlarm}
                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-3.5 rounded-2xl transition-colors text-base shadow-lg"
              >
                <CheckCircle className="w-5 h-5" /> متوجه شدم — قطع آلارم
              </button>
            </div>
          </div>
        </div>
      )}

    </UrgentMessageContext.Provider>
  );
}
