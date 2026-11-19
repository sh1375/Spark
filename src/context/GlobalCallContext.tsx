import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck, Phone, PhoneOff } from 'lucide-react';
import { CallEngine, IncomingCallNotification } from '../components/Chat/CallEngine';
import type { CallSession } from '../components/Chat/CallEngine';
import type { UserProfile } from '../components/Chat/types';
import { setPendingE2EERing, getPendingE2EERing, type GlobalE2EERing } from '../lib/globalE2EERing';

interface ActiveCall {
  session: CallSession;
  otherUser: UserProfile;
  mode: 'caller' | 'callee';
  callType: 'audio' | 'video';
}

interface IncomingCallState {
  session: CallSession;
  callerProfile: UserProfile | null;
}

interface GlobalCallContextValue {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCallState | null;
  startCall: (callType: 'audio' | 'video', otherUser: UserProfile, conversationId: string) => Promise<void>;
  acceptCall: () => void;
  declineCall: () => void;
  endCall: () => void;
}

const GlobalCallContext = createContext<GlobalCallContextValue | null>(null);

export function useGlobalCall() {
  const ctx = useContext(GlobalCallContext);
  if (!ctx) throw new Error('useGlobalCall must be used inside GlobalCallProvider');
  return ctx;
}

interface ProviderProps {
  currentUserId: string | null;
  onNavigateToVideoConference?: () => void;
  children: React.ReactNode;
}

export function GlobalCallProvider({
  currentUserId,
  onNavigateToVideoConference,
  children,
}: ProviderProps) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [e2eeRing, setE2eeRing] = useState<GlobalE2EERing | null>(null);

  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const e2eeInboxChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const e2eeRingAudioRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onNavigateToVideoConferenceRef = useRef(onNavigateToVideoConference);
  onNavigateToVideoConferenceRef.current = onNavigateToVideoConference;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  // ── E2EE ring ringtone ──────────────────────────────────────────────────────
  const playE2EERingTone = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const play = (freq: number, t: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.35);
        setTimeout(() => ctx.close().catch(() => {}), (t + 0.5) * 1000);
      };
      play(880, 0); play(1100, 0.4); play(880, 0.8);
    } catch { /* ignore */ }
  };

  // ── E2EE global ring listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;

    const ch = supabase.channel(`e2ee-global-inbox-${currentUserId}`, {
      config: { broadcast: { self: false } },
    });
    e2eeInboxChannelRef.current = ch;

    ch.on('broadcast', { event: 'e2ee-ring' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;

      if (p.targetUserId !== currentUserId) return;
      if (typeof p.from        !== 'string' || p.from.length > 200)        return;
      if (typeof p.sessionId   !== 'string' || p.sessionId.length > 100)   return;
      if (typeof p.callerName  !== 'string' || p.callerName.length > 200)  return;
      if (typeof p.callerId    !== 'string' || p.callerId.length > 200)    return;
      if (typeof p.acceptToken !== 'string' || p.acceptToken.length !== 32) return;
      if (typeof p.expiresAt   !== 'number') return;
      if (Date.now() > (p.expiresAt as number)) return;

      const ring: GlobalE2EERing = {
        from:        p.from        as string,
        sessionId:   p.sessionId   as string,
        callerName:  p.callerName  as string,
        callerId:    p.callerId    as string,
        expiresAt:   p.expiresAt   as number,
        acceptToken: p.acceptToken as string,
      };

      setPendingE2EERing(ring);
      setE2eeRing(ring);

      // Start repeating ringtone
      playE2EERingTone();
      if (e2eeRingAudioRef.current) clearInterval(e2eeRingAudioRef.current);
      e2eeRingAudioRef.current = setInterval(playE2EERingTone, 3000);

      // Auto-dismiss when invite expires
      const ttl = (p.expiresAt as number) - Date.now();
      setTimeout(() => {
        setE2eeRing(r => r?.sessionId === ring.sessionId ? null : r);
        const pending = getPendingE2EERing();
        if (pending?.sessionId === ring.sessionId) {
          setPendingE2EERing(null);
          if (e2eeRingAudioRef.current) { clearInterval(e2eeRingAudioRef.current); e2eeRingAudioRef.current = null; }
        }
      }, Math.max(0, ttl));
    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
      e2eeInboxChannelRef.current = null;
      if (e2eeRingAudioRef.current) { clearInterval(e2eeRingAudioRef.current); e2eeRingAudioRef.current = null; }
    };
  }, [currentUserId]);

  const dismissE2EERing = () => {
    setE2eeRing(null);
    setPendingE2EERing(null);
    if (e2eeRingAudioRef.current) { clearInterval(e2eeRingAudioRef.current); e2eeRingAudioRef.current = null; }
  };

  const rejectE2EERing = () => {
    const ring = e2eeRing;
    dismissE2EERing();
    if (!ring) return;

    const ch = supabase.channel(`e2ee-sess-${ring.sessionId}`, { config: { broadcast: { self: false } } });
    let sent = false;
    const cleanup = () => { void supabase.removeChannel(ch); };
    const timeout = window.setTimeout(cleanup, 5000);

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !sent) {
        sent = true;
        void ch.send({
          type: 'broadcast',
          event: 'e2ee-signal',
          payload: {
            type: 'rejected',
            from: currentUserIdRef.current || 'callee',
            session: ring.sessionId,
            data: {},
          },
        }).finally(() => {
          window.clearTimeout(timeout);
          window.setTimeout(cleanup, 250);
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(timeout);
        cleanup();
      }
    });
  };

  const acceptE2EERing = () => {
    if (e2eeRingAudioRef.current) { clearInterval(e2eeRingAudioRef.current); e2eeRingAudioRef.current = null; }
    // Mark autoAccept so useE2EECall calls acceptCall immediately on mount
    const ring = getPendingE2EERing();
    if (ring) setPendingE2EERing({ ...ring, autoAccept: true });
    setE2eeRing(null);
    onNavigateToVideoConferenceRef.current?.();
  };

  // ── Incoming call listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;

    callChannelRef.current = supabase
      .channel(`incoming-calls-${currentUserId}`)
      .on('broadcast', { event: 'incoming_call' }, async ({ payload }: any) => {
        if (!payload?.session_id) return;
        const { data: session } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', payload.session_id)
          .eq('status', 'ringing')
          .maybeSingle();
        if (!session) return;
        const { data: callerProfile } = await supabase
          .from('profiles_public')
          .select('user_id, full_name, username, avatar_url')
          .eq('user_id', session.caller_id)
          .maybeSingle();
        setIncomingCall({ session: session as CallSession, callerProfile: callerProfile || null });
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${currentUserId}` },
        async (payload) => {
          const session = payload.new as CallSession;
          if (session.status !== 'ringing') return;
          setIncomingCall((prev) => (prev ? prev : { session, callerProfile: null }));
          const { data: callerProfile } = await supabase
            .from('profiles_public')
            .select('user_id, full_name, username, avatar_url')
            .eq('user_id', session.caller_id)
            .maybeSingle();
          setIncomingCall((prev) => {
            if (!prev || prev.session.id !== session.id) return prev;
            return { ...prev, callerProfile: callerProfile || null };
          });
        },
      )
      .subscribe();

    return () => {
      if (callChannelRef.current) {
        supabase.removeChannel(callChannelRef.current);
        callChannelRef.current = null;
      }
    };
  }, [currentUserId]);

  // ── Call actions ──────────────────────────────────────────────────────────
  const startCall = async (
    callType: 'audio' | 'video',
    otherUser: UserProfile,
    conversationId: string,
  ) => {
    if (!currentUserId) return;
    const { data: session, error } = await supabase
      .from('call_sessions')
      .insert({
        caller_id: currentUserId,
        callee_id: otherUser.user_id,
        call_type: callType,
        status: 'ringing',
        conversation_id: conversationId,
      })
      .select()
      .maybeSingle();
    if (error || !session) return;

    await supabase.channel(`incoming-calls-${otherUser.user_id}`).send({
      type: 'broadcast',
      event: 'incoming_call',
      payload: { session_id: session.id, caller_id: currentUserId },
    });

    setActiveCall({ session: session as CallSession, otherUser, mode: 'caller', callType });
  };

  const acceptCall = () => {
    if (!incomingCall || !currentUserId) return;
    const { session, callerProfile } = incomingCall;
    const otherUser: UserProfile = callerProfile ?? {
      user_id: session.caller_id,
      full_name: null,
      username: null,
      email: null,
    };
    supabase.from('call_sessions').update({ status: 'active' }).eq('id', session.id);
    setIncomingCall(null);
    setActiveCall({ session, otherUser, mode: 'callee', callType: session.call_type });
  };

  const declineCall = () => {
    if (!incomingCall) return;
    supabase.from('call_sessions').update({ status: 'declined' }).eq('id', incomingCall.session.id);
    setIncomingCall(null);
  };

  const endCall = () => setActiveCall(null);

  return (
    <GlobalCallContext.Provider value={{ activeCall, incomingCall, startCall, acceptCall, declineCall, endCall }}>
      {children}

      {/* Global E2EE incoming call overlay */}
      {e2eeRing && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="w-full max-w-sm bg-gray-900 rounded-3xl shadow-2xl border border-emerald-500/40 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gradient-to-r from-emerald-900 to-gray-900 px-6 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center animate-pulse flex-shrink-0">
                <ShieldCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-lg truncate">{e2eeRing.callerName}</p>
                <p className="text-emerald-300 text-sm">تماس با رمزنگاری سرتاسری</p>
              </div>
            </div>
            <div className="px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={rejectE2EERing}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <PhoneOff className="w-4 h-4" /> رد کردن
              </button>
              <button
                type="button"
                onClick={acceptE2EERing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Phone className="w-4 h-4" /> پاسخ دادن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global incoming call overlay */}
      {incomingCall && (
        <IncomingCallNotification
          session={incomingCall.session}
          callerProfile={incomingCall.callerProfile}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

      {/* Global call engine */}
      {activeCall && currentUserId && (
        <CallEngine
          currentUserId={currentUserId}
          otherUser={activeCall.otherUser}
          callType={activeCall.callType}
          mode={activeCall.mode}
          session={activeCall.session}
          onEnd={endCall}
        />
      )}
    </GlobalCallContext.Provider>
  );
}
