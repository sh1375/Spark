import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const encoder = new TextEncoder();
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const respond = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('EXTERNAL_CALL_INBOUND_SECRET');
  const origin = Deno.env.get('EXTERNAL_CALL_INBOUND_JOIN_ORIGIN');
  if (!secret || secret.length < 32 || !origin) return respond(503, { error: 'bridge_unconfigured' });

  const timestamp = request.headers.get('X-Spark-Timestamp') ?? '';
  const signature = request.headers.get('X-Spark-Signature') ?? '';
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) {
    return respond(401, { error: 'invalid_signature' });
  }
  // Bound the body even when the sender omits Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return respond(400, { error: 'missing_body' });
  const raw = new Uint8Array(16384);
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.length > raw.length) {
      await reader.cancel();
      return respond(413, { error: 'body_too_large' });
    }
    raw.set(value, length);
    length += value.length;
  }

  const prefix = encoder.encode(timestamp + '.');
  const signed = new Uint8Array(prefix.length + length);
  signed.set(prefix);
  signed.set(raw.subarray(0, length), prefix.length);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const tag = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, tag, signed)) return respond(401, { error: 'invalid_signature' });

  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, length))); }
  catch { return respond(400, { error: 'invalid_json' }); }

  if (!['invite', 'decision'].includes(body?.action) || !['audio', 'video', 'conference'].includes(body.capability) ||
      typeof body.reference !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(body.reference) ||
      typeof body.recipientId !== 'string' || !idPattern.test(body.recipientId)) return respond(400, { error: 'invalid_request' });

  const reference = 'bridge:' + body.reference;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (body.action === 'decision') {
    const { data, error } = await client.rpc('get_external_bridge_decision', {
      p_capability: body.capability, p_ref: reference, p_recipient: body.recipientId,
    });
    return error ? respond(503, { error: 'decision_unavailable' }) :
      data ? respond(200, { decision: data }) : respond(404, { error: 'invitation_not_found' });
  }

  if (typeof body.callerId !== 'string' || !idPattern.test(body.callerId) || body.callerId.toLowerCase() === body.recipientId.toLowerCase() ||
      typeof body.joinUrl !== 'string' || body.joinUrl.length > 8192 || typeof body.expiresAt !== 'string') return respond(400, { error: 'invalid_invite' });
  let url;
  try { url = new URL(body.joinUrl); } catch { return respond(400, { error: 'invalid_url' }); }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) return respond(400, { error: 'invalid_url' });
  const expiry = Date.parse(body.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Number(timestamp) * 1000 + 300000) return respond(400, { error: 'invalid_expiry' });

  const { data, error } = await client.rpc('deliver_external_call_invitation', {
    p_capability: body.capability, p_provider_ref: reference, p_caller_id: body.callerId,
    p_recipient_id: body.recipientId, p_join_url: url.href, p_expires_at: new Date(expiry).toISOString(),
  });
  return error ? respond(422, { error: 'invitation_unavailable' }) : respond(200, { invitationId: data });
});
