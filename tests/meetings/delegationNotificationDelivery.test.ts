import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dispatchDelegationSms } from '../../supabase/functions/process-notification-outbox/delegationSms';
import { handleDispatchMode } from '../../supabase/functions/send-sms/requestModes';
import { TEMPLATE_EVENTS } from '../../src/config/templateCatalog';

const eventType = 'meeting_invitation_delegate_selected';
const sql = readFileSync(new URL('../../supabase/migrations/20261113013213_meeting_delegate_organizer_delivery.sql', import.meta.url), 'utf8');
const smsBody = sql.match(/INSERT INTO public\.sms_templates[\s\S]*?'انتخاب جانشین دعوت جلسه',\n'([^']+)'/)![1];

test('organizer delegation event is configurable for SMS and in-app delivery', () => {
  const event = TEMPLATE_EVENTS.find(e => e.key === eventType)!;
  assert.ok(event.supportedChannels.includes('sms'));
  assert.ok(event.supportedChannels.includes('notification'));
  assert.ok(event.audiences.includes('organizer'));
});

test('queued selection reaches the creator provider with rendered Persian text and a stable receipt on retry', async () => {
  const patches: any[] = [];
  const keys: string[] = [];
  let sent = false;
  let providerCalls = 0;
  const db = {
    functions: { invoke() { throw new Error('The Database node has no Functions runtime'); } },
    rpc: async (name: string, args: any) => {
      if (name === 'claim_sms_dispatch_v1') {
        keys.push(args.p_dispatch_key);
        assert.equal(args.p_target_user_id, 'creator');
        assert.equal(args.p_meeting_id, 'meeting');
        return { data: [{ log_id: 'log', claimed: !sent, existing_status: sent ? 'sent' : 'pending' }], error: null };
      }
      assert.equal(name, 'get_sms_dispatch_info');
      assert.equal(args.target_user_id, 'creator');
      return { data: [{ provider_id: 'provider', phone: '09123456789' }], error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q: any = {
        select() { return q; }, eq(key: string, value: unknown) { filters[key] = value; return q; },
        maybeSingle: async () => ({ data: table === 'profiles'
          ? { full_name: 'حامد عرب خالقی', phone: '09123456789', is_active: true }
          : table === 'sms_templates'
            ? filters.audience === 'all' ? { id: 'template', body: smsBody } : null
            : table === 'meetings'
              ? { subject: 'شورای معاونت', request_date: '2026-11-10', start_time: '15:30', end_time: '16:00', user_id: 'creator' }
              : { id: 'provider', title: 'درگاه آزمایشی' } }),
        update(patch: any) { patches.push(patch); if (patch.status === 'sent') sent = true; return q; },
        then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return q;
    },
  };
  const originalDeno = (globalThis as any).Deno;
  (globalThis as any).Deno = { env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-key' : 'https://database.invalid' } };
  const body = {
    mode: 'dispatch', targetUserId: 'creator', category: 'meeting', eventType,
    audience: 'organizer', meetingId: 'meeting', eventKey: 'durable-selection-key', triggeredByUserId: 'delegator',
    context: { meeting_subject: 'شورای معاونت', represented_person_name: 'مجید خان محمدزاده',
      representative_name: 'یوسف لشگری', recipient_greeting: 'حامد عرب خالقی گرامی', sms_policy_deferred_delivery: true },
  };
  const handler = async (request: Request) => {
    assert.equal(request.headers.get('Authorization'), 'Bearer fixture-key');
    return handleDispatchMode({ supabase: db, body: await request.json(), caller: { userId: 'service', isAdmin: true },
      json: (data: unknown, status = 200) => Response.json(data, { status }),
      sendRequest: async (_url, init) => {
        providerCalls++;
        const send = JSON.parse(init.body as string);
        assert.equal(send.providerId, 'provider');
        assert.deepEqual(send.mobiles, ['09123456789']);
        for (const name of ['حامد عرب خالقی', 'مجید خان محمدزاده', 'یوسف لشگری', 'شورای معاونت']) assert.ok(send.message.includes(name));
        assert.ok(!send.message.includes('{{'));
        return Response.json({ ok: true, returnIds: ['fixture-provider-receipt'] });
      },
    });
  };
  try {
    const first = await dispatchDelegationSms(handler, 'fixture-key', body);
    assert.equal(first.data.status, 'sent');
    const retry = await dispatchDelegationSms(handler, 'fixture-key', body);
    assert.equal(retry.data.status, 'sent');
    assert.equal(providerCalls, 1);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.ok(patches.some(p => p.status === 'sent'));
  } finally { (globalThis as any).Deno = originalDeno; }
});

test('a pending duplicate is never misreported as delivered', async () => {
  const result = await dispatchDelegationSms(async () => Response.json({
    ok: true, status: 'skipped', reason: 'DUPLICATE_SMS_DISPATCH', existingStatus: 'pending',
  }), 'fixture-key', {});
  assert.equal(result.data.status, 'skipped');
});
