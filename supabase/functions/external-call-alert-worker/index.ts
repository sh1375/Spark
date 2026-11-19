import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { deliverBaleNotification } from '../_shared/baleDelivery.ts';
import { normalizeIranPhone } from '../_shared/phone.ts';
import { invokeSmsHandler } from '../meeting-notification-worker/invokeSmsHandler.ts';
import { handleSendSms } from '../send-sms/handler.ts';

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const token = request.headers.get('X-Call-Alert-Token');
  if (!token) return new Response(null, { status: 401 });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('claim_external_call_alerts', { p_token: token });
  if (error) return new Response(null, { status: error.code === '42501' ? 403 : 503 });
  const results = await Promise.all(data.map(async (job: { id: string; channel: string; phone: string | null; message: string; expires_at: string; recipient_id: string }) => {
    let status = 'uncertain';
    let reason: string | null = null;
    try {
      if (Date.parse(job.expires_at) <= Date.now()) {
        status = 'skipped'; reason = 'EXPIRED';
      } else if (job.channel === 'bale') {
        const result = await deliverBaleNotification(client, job.recipient_id, job.message);
        status = result.status; reason = result.reason;
      } else {
        const phone = normalizeIranPhone(job.phone);
        if (!phone) { status = 'skipped'; reason = 'NO_VALID_PHONE'; }
        else {
          const result = await invokeSmsHandler(handleSendSms, key, { mode: 'send', mobiles: [phone], message: job.message });
          if (!result.error && result.data?.ok === true) status = 'sent';
          else { status = 'uncertain'; reason = 'SMS_DELIVERY_UNCONFIRMED'; }
        }
      }
    } catch { reason = 'DELIVERY_OUTCOME_UNKNOWN'; }
    const saved = await client.rpc('finish_external_call_alert', { p_id: job.id, p_status: status, p_code: reason });
    return !saved.error;
  }));
  return Response.json({ processed: results.length }, { status: results.every(Boolean) ? 200 : 503 });
});
