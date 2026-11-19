import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { requireFullAuthAccess } from '../_shared/requireFullAuthAccess.ts';
import { createDailyCall, joinDailyConference } from './daily.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, status = 200) => Response.json(body, { headers, status });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const auth = await requireFullAuthAccess(request);
  if (!auth.ok || !auth.userId) return reply({ error: 'access_denied' }, auth.error?.status ?? 403);
  const body = await request.json().catch(() => null);
  const capability = body?.capability;
  const recipient = body?.recipient;
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (capability === 'conference') {
    if (!validId(body.meetingId)) return reply({ error: 'invalid_meeting' }, 400);
    const { data, error } = await client.rpc('prepare_daily_meeting_conference', { p_meeting: body.meetingId, p_user: auth.userId });
    if (error) return reply({ error: 'conference_unavailable' }, error.code === '42501' ? 403 : 503);
    if (data.state !== 'ready') return reply({ available: false, state: data.state });
    try {
      const joinUrl = await joinDailyConference(data.key, data.room, auth.userId, data.exp, data.owner);
      return joinUrl ? reply({ available: true, joinUrl }) : reply({ available: false, state: 'waiting' });
    } catch { return reply({ error: 'provider_unavailable' }, 502); }
  }
  if (!['audio', 'video'].includes(capability) || !validId(recipient)) return reply({ error: 'invalid_call' }, 400);
  const { data: key, error } = await client.rpc('prepare_daily_chat_call', { p_caller: auth.userId, p_recipient: recipient, p_capability: capability });
  if (error) return reply({ error: 'call_unavailable' }, error.code === '54000' ? 429 : error.code === '42501' ? 403 : 503);
  if (!key) return reply({ available: false });
  try {
    const call = await createDailyCall(key, auth.userId, recipient, capability === 'audio');
    const { data: invitation, error: deliveryError } = await client.rpc('deliver_external_call_invitation', {
      p_capability: capability, p_provider_ref: call.roomName, p_caller_id: auth.userId, p_recipient_id: recipient,
      p_join_url: call.recipientUrl, p_expires_at: new Date(Date.now() + 90000).toISOString(),
    });
    if (deliveryError || !invitation) return reply({ error: 'delivery_failed' }, 503);
    return reply({ available: true, invitation, joinUrl: call.callerUrl });
  } catch { return reply({ error: 'provider_unavailable' }, 502); }
});
