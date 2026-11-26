import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryLabel } from '../../src/components/Notes/reminderDeliveryStatusModel';

test('unlinked Bale accounts and disabled SMS rules give specific recipient-facing reasons', () => {
  assert.equal(deliveryLabel({ recipient_id: 'owner', channel: 'bale', status: 'skipped', reason: 'BALE_NOT_LINKED' }), 'حساب بله این کاربر متصل نیست');
  assert.equal(deliveryLabel({ recipient_id: 'manager', channel: 'sms', status: 'skipped', reason: 'SMS_RULE_NOT_FOUND' }), 'ارسال پیامک یادداشت در گروه کاربری این شخص فعال نیست');
});

test('pending or unknown delivery is never presented as successful sending', () => {
  assert.equal(deliveryLabel({ recipient_id: 'owner', channel: 'sms', status: 'pending', reason: null }), 'در صف ارسال');
  assert.ok(deliveryLabel({ recipient_id: 'owner', channel: 'sms', status: 'uncertain', reason: 'DELIVERY_OUTCOME_UNKNOWN' }).includes('نتیجه ارسال مشخص نیست'));
  assert.equal(deliveryLabel({ recipient_id: 'owner', channel: 'sms', status: 'sent', reason: null }), 'ارسال شد');
});
