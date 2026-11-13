import assert from 'node:assert/strict';
import test from 'node:test';
import { isPersonalCalendarMeetingVisible } from '../../src/components/Calendar/personalCalendarVisibility';

const base = { id: 'meeting', user_id: 'owner', calendar_id: 'unshared', members_only: false };
const none = new Set<string>();
const visible = (meeting = base, status?: string, owned = none, subscribed = none, publicOwners = none) =>
  isPersonalCalendarMeetingVisible(meeting, 'reader', status, owned, subscribed, publicOwners);

test('monitoring data without personal membership is never a personal calendar event', () => {
  assert.equal(visible(), false);
  assert.equal(visible(base, undefined, none, new Set(['different-calendar'])), false);
  assert.equal(visible(base, undefined, none, none, new Set(['owner'])), false);
});
test('calendar owner and exact subscribers retain access while members-only stays limited', () => {
  assert.equal(visible(base, undefined, new Set(['unshared'])), true);
  assert.equal(visible(base, undefined, none, new Set(['unshared'])), true);
  assert.equal(visible({ ...base, members_only: true }, undefined, none, new Set(['unshared'])), false);
});
test('direct participant, observer and accepted invitations do not require calendar subscription', () => {
  assert.equal(visible({ ...base, participant_user_ids: ['reader'] } as any), true);
  assert.equal(visible({ ...base, notify_users: ['reader'] } as any), true);
  assert.equal(visible(base, 'accepted'), true);
  assert.equal(visible(base, 'delegated'), true);
  assert.equal(visible(base, 'pending', new Set(['unshared'])), false);
  assert.equal(visible(base, 'declined', none, new Set(['unshared'])), false);
});
test('only explicit public-calendar following grants legacy calendarless meetings', () => {
  const legacy = { ...base, calendar_id: null } as any;
  assert.equal(visible(legacy), false);
  assert.equal(visible(legacy, undefined, none, new Set(['shared'])), false);
  assert.equal(visible(legacy, undefined, none, none, new Set(['owner'])), true);
  assert.equal(visible({ ...legacy, members_only: true }, undefined, none, none, new Set(['owner'])), false);
});
