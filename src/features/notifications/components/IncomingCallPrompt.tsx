import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import type { AppNotification } from '../types/appNotification';

type Invitation = { id: string; capability: 'audio' | 'video' | 'conference'; caller_name: string; expires_at: string };
const titles = { audio: 'تماس صوتی ورودی', video: 'تماس تصویری ورودی', conference: 'دعوت به ویدئوکنفرانس' };

export function IncomingCallPrompt({ userId, notifications }: { userId: string; notifications: AppNotification[] }) {
  const [pending, setPending] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const activeRequest = useRef(false);
  const [retry, setRetry] = useState(0);
  // Reuse the bell's authenticated realtime subscription. Ordinary notifications
  // and installations without an adapter generate no additional RPC requests.
  const signals = notifications.filter(n => n.user_id === userId && n.entity_type === 'external_call_invitation' && !n.metadata?.decision
    && Date.parse(String(n.metadata?.expires_at)) > Date.now())
    .map(n => n.id + String(n.read)).sort().join(',');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!signals) { setPending([]); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const lastExpiry = Math.max(...notifications.filter(n => n.user_id === userId && n.entity_type === 'external_call_invitation').map(n => Date.parse(String(n.metadata?.expires_at)) || 0));
    async function refresh() {
      const { data, error } = await (supabase as any).rpc('my_pending_external_calls');
      if (!active) return;
      if (error) {
        if (Date.now() < lastExpiry) timer = setTimeout(refresh, 5000);
        return;
      }
      setPending((data || []) as Invitation[]);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [signals, retry]);
  const invitation = pending[0];
  useEffect(() => {
    if (!invitation) return;
    const timer = setTimeout(() => setPending(rows => rows.filter(row => Date.parse(row.expires_at) > Date.now())),
      Math.max(0, Date.parse(invitation.expires_at) - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [invitation]);
  async function respond(accept: boolean) {
    if (activeRequest.current || !invitation) return;
    activeRequest.current = true;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('answer_external_call_invitation', { p_id: invitation.id, p_accept: accept });
      if (!mounted.current) return;
      if (error) {
        if (error.code === 'P0002') setPending(rows => rows.filter(row => row.id !== invitation.id));
        throw error;
      }
      if (accept) {
        const url = new URL(data);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid join URL');
        window.location.assign(url.href);
      }
      setPending(rows => rows.filter(row => row.id !== invitation.id));
    } catch {
      if (mounted.current) { toast.error('پاسخ به تماس ثبت یا تأیید نشد. وضعیت دعوت را بررسی کنید.'); setRetry(n => n + 1); }
    } finally {
      activeRequest.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!invitation || !signals) return null;
  return createPortal(<section dir="rtl" aria-label={titles[invitation.capability]} className="fixed inset-x-3 top-4 z-[10000] mx-auto max-w-sm rounded-2xl border bg-white p-4 shadow-xl dark:bg-slate-900">
    <p role="status" className="font-semibold">{titles[invitation.capability]} از {invitation.caller_name}</p>
    <div className="mt-3 flex gap-2">
      <button type="button" disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-white" onClick={() => void respond(true)}>قبول و ورود به سرویس تماس</button>
      <button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => void respond(false)}>رد تماس</button>
    </div>
  </section>, document.body);
}
