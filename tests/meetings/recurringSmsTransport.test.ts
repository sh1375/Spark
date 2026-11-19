import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeSmsHandler } from '../../supabase/functions/meeting-notification-worker/invokeSmsHandler';
import { processMeetingNotificationJobs } from '../../supabase/functions/meeting-notification-worker/processJobs';
import { handleDispatchMode, handleExternalMode } from '../../supabase/functions/send-sms/requestModes';

test('split deployment dispatch reaches the shared SMS handler without contacting the Database gateway', async () => {
  const completions: any[] = [];
  const client = {
    functions: { invoke() { throw new Error('Database node does not host Functions'); } },
    rpc: async (_name: string, args: any) => { completions.push(args); return { error: null }; },
  };
  let sends = 0;
  const handler = async (req: Request) => {
    sends++;
    assert.equal(req.headers.get('Authorization'), 'Bearer server-only-fixture');
    const body = await req.json();
    assert.equal(body.eventKey, 'stable-series-event');
    assert.equal(body.mode, 'dispatch');
    assert.equal(body.context.summary, 'سه نوبت');
    return Response.json({ status: 'sent' });
  };
  await processMeetingNotificationJobs(client, [{
    id: 'job', lease: 'lease', recipient_id: 'recipient', actor_id: 'owner',
    event_type: 'series_invite', event_key: 'stable-series-event',
    created_at: new Date().toISOString(), context: { summary: 'سه نوبت' },
  }], body => invokeSmsHandler(handler, 'server-only-fixture', body), {
    loadPolicy: async () => ({} as any),
    evaluatePolicy: () => ({ sendNow: true, nextAllowedAt: null }) as any,
  });
  assert.equal(sends, 1);
  assert.equal(completions[0].p_status, 'sent');
  assert.equal(completions[0].p_lease, 'lease');
});

test('local handler failures retain an unknown outcome and never retry', async () => {
  let calls = 0;
  const result = await invokeSmsHandler(async () => {
    calls++;
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }, 'server-only-fixture', {});
  assert.equal(result.error?.status, 503);
  assert.equal(calls, 1);
  await assert.rejects(invokeSmsHandler(async () => {
    calls++;
    return Response.json({ status: 'sent' });
  }, '', {}), /SMS_SERVICE_CREDENTIAL_MISSING/);
  assert.equal(calls, 1);
});

for (const [name, audience, handler] of [
  ['internal', 'participants', handleDispatchMode],
  ['external invitee', 'external', handleExternalMode],
  ['external observer', 'external_observers', handleExternalMode],
] as const) {
  test(`${name}: recurring template and provider rules reach the injected sender and record the receipt`, async () => {
    const schedule = 'برنامه جلسات به وقت تهران:\nشنبه 1405/10/12، ساعت 09:00 تا 10:00\nیکشنبه 1405/10/20، ساعت 11:30 تا 12:30';
    const patches: any[] = [];
    const db = {
      rpc: async (name: string) => ({ data: name === 'claim_sms_dispatch_v1'
        ? [{ log_id: 'log', claimed: true, existing_status: 'pending' }]
        : [{ provider_id: 'provider', phone: '09123456789' }], error: null }),
      from(table: string) {
        const q: any = {
          select() { return q; }, eq() { return q; },
          maybeSingle: async () => ({ data: table === 'profiles'
            ? { phone: '09123456789', full_name: 'همکار', is_active: true }
            : table === 'sms_templates' ? { id: 'template', body: name === 'internal'
              ? '{{summary}}'
              : '{{summary}}\nجزئیات و برنامه جلسات در تقویم سامانه اسپارک قابل مشاهده است.' }
            : { id: 'provider', title: 'درگاه فعلی' } }),
          update(patch: any) { patches.push(patch); return q; },
          then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); },
        };
        return q;
      },
    };
    let sends = 0;
    const previousDeno = (globalThis as any).Deno;
    (globalThis as any).Deno = { env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'server-only-fixture' : 'http://database.invalid' } };
    try {
      const response = await handler({ supabase: db, caller: { userId: 'service', isAdmin: true },
        json: (body: unknown, status = 200) => Response.json(body, { status }), isAuthOtp: false,
        body: { targetUserId: 'recipient', mobiles: ['09123456789'], category: 'meeting',
          eventType: 'series_invite', eventKey: 'stable-event', audience,
          context: { summary: 'سه نوبت', external_schedule: schedule, sms_policy_deferred_delivery: true } },
        sendRequest: async (_url, init) => {
          sends++;
          const body = JSON.parse(init.body as string);
          assert.equal(body.mode, 'send');
          assert.equal(body.message, name === 'internal' ? 'سه نوبت' : `سه نوبت\n\n${schedule}`);
          assert.equal(body.providerId, 'provider');
          assert.equal(body.bypassDeliveryPolicy, true);
          return Response.json({ ok: true, returnIds: ['provider-receipt'] });
        },
      });
      assert.equal(response.status, 200);
      assert.equal(sends, 1);
      assert.ok(patches.some(p => p.status === 'sent'));
    } finally { (globalThis as any).Deno = previousDeno; }
  });
}
