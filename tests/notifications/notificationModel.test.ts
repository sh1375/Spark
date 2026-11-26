import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_PAGE_MAP,
  resolveNotificationClickPage,
  resolveNotificationToastPage,
} from '../../src/features/notifications/navigation/notificationNavigation';
import {
  countUnreadNotifications,
  prependIncomingNotification,
  reconcileNotificationSnapshot,
  replaceUpdatedNotification,
  markNotificationReadLocally,
  markAllNotificationsReadLocally,
  formatNotificationTimeAgo,
  groupNotificationsByDate,
} from '../../src/features/notifications/models/notificationCollection';
import type {
  AppNotification,
} from '../../src/features/notifications/types/appNotification';

function makeNotification(
  overrides: Partial<AppNotification> = {}
): AppNotification {
  return {
    id: 'n1',
    title: 'title',
    message: 'message',
    type: 'chat',
    read: false,
    created_at:
      '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

test('preserves notification click navigation precedence', () => {
  const actionUrl = makeNotification({
    action_url: 'chat',
    template_event_type: 'meeting',
    type: 'task',
  });
  assert.equal(
    resolveNotificationClickPage(actionUrl),
    'chat'
  );

  const templateOnly = makeNotification({
    action_url: null,
    template_event_type: 'meeting',
    type: 'task',
  });
  assert.equal(
    resolveNotificationClickPage(templateOnly),
    'meetings'
  );

  const typeOnly = makeNotification({
    action_url: null,
    template_event_type: null,
    type: 'task',
  });
  assert.equal(
    resolveNotificationClickPage(typeOnly),
    'tasks'
  );
});

test('uses only action URL for rich-toast navigation', () => {
  const withAction = makeNotification({
    action_url: 'chat',
    type: 'task',
  });
  assert.equal(
    resolveNotificationToastPage(withAction),
    'chat'
  );

  const noAction = makeNotification({
    action_url: null,
    type: 'task',
  });
  assert.equal(
    resolveNotificationToastPage(noAction),
    undefined
  );
});

test('preserves all Minutes and standard page mappings', () => {
  assert.equal(
    NOTIFICATION_PAGE_MAP['chat'],
    'chat'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['meeting'],
    'meetings'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['calendar'],
    'calendar'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['tasks'],
    'tasks'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['task'],
    'tasks'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['note'],
    'notes'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['notes'],
    'notes'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['conference'],
    'video-conference'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['video_conference'],
    'video-conference'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP[
      'minutes_approval_requested'
    ],
    'minutes-detail'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP[
      'decision_assigned'
    ],
    'minutes-detail'
  );
  assert.equal(
    NOTIFICATION_PAGE_MAP['unknown'],
    undefined
  );
});

test('counts unread notifications', () => {
  const items = [
    makeNotification({ id: '1', read: false }),
    makeNotification({ id: '2', read: true }),
    makeNotification({ id: '3', read: false }),
  ];
  assert.equal(
    countUnreadNotifications(items),
    2
  );
});

test('deduplicates an incoming notification by ID', () => {
  const items = [
    makeNotification({ id: '1' }),
    makeNotification({ id: '2' }),
  ];
  const incoming = makeNotification({
    id: '1',
  });
  const result =
    prependIncomingNotification(
      items,
      incoming
    );
  assert.equal(result.length, 2);
  assert.equal(result[0].id, '1');
  assert.equal(result[1].id, '2');
});

test('prepends an incoming notification and retains only fifty rows', () => {
  const items: AppNotification[] =
    Array.from(
      { length: 50 },
      (_, i) =>
        makeNotification({
          id: `existing-${i}`,
        })
    );
  const incoming = makeNotification({
    id: 'new-1',
  });
  const result =
    prependIncomingNotification(
      items,
      incoming
    );
  assert.equal(result.length, 50);
  assert.equal(result[0].id, 'new-1');
  assert.equal(
    result[1].id,
    'existing-0'
  );
  assert.equal(
    result[49].id,
    'existing-48'
  );
});

test('reconciles a server snapshot without dropping a realtime item', () => {
  const snapshot = [
    makeNotification({
      id: 'server-1',
      created_at:
        '2024-01-15T10:00:00.000Z',
    }),
  ];

  const current = [
    makeNotification({
      id: 'realtime-1',
      created_at:
        '2024-01-15T10:01:00.000Z',
    }),
    makeNotification({
      id: 'server-1',
      read: true,
      created_at:
        '2024-01-15T10:00:00.000Z',
    }),
  ];

  const result =
    reconcileNotificationSnapshot(
      current,
      snapshot
    );

  assert.equal(result.length, 2);
  assert.equal(
    result[0].id,
    'realtime-1'
  );
  assert.equal(
    result[1].id,
    'server-1'
  );
  assert.equal(
    result[1].read,
    true
  );
});

test('replaces a matching Realtime update without reordering', () => {
  const items = [
    makeNotification({ id: '1' }),
    makeNotification({ id: '2' }),
    makeNotification({ id: '3' }),
  ];
  const updated = makeNotification({
    id: '2',
    title: 'updated-title',
  });
  const result =
    replaceUpdatedNotification(
      items,
      updated
    );
  assert.equal(result.length, 3);
  assert.equal(result[0].id, '1');
  assert.equal(
    result[1].title,
    'updated-title'
  );
  assert.equal(result[2].id, '3');

  const missing = makeNotification({
    id: '999',
  });
  const result2 =
    replaceUpdatedNotification(
      items,
      missing
    );
  assert.equal(result2.length, 3);
  assert.equal(
    result2[0].id,
    '1'
  );
});

test('marks one notification as read locally', () => {
  const items = [
    makeNotification({
      id: '1',
      read: false,
    }),
    makeNotification({
      id: '2',
      read: false,
    }),
  ];
  const result =
    markNotificationReadLocally(
      items,
      '1'
    );
  assert.equal(
    result[0].read,
    true
  );
  assert.equal(
    result[1].read,
    false
  );
});

test('marks every notification as read locally', () => {
  const items = [
    makeNotification({
      id: '1',
      read: false,
    }),
    makeNotification({
      id: '2',
      read: true,
    }),
  ];
  const result =
    markAllNotificationsReadLocally(
      items
    );
  assert.equal(
    result[0].read,
    true
  );
  assert.equal(
    result[1].read,
    true
  );
});

test('formats legacy Persian relative time boundaries', () => {
  const now = new Date(
    '2024-01-15T12:00:00.000Z'
  ).getTime();

  const underMinute =
    formatNotificationTimeAgo(
      '2024-01-15T11:59:30.000Z',
      now
    );
  assert.equal(
    underMinute,
    'همین الان'
  );

  const minutes =
    formatNotificationTimeAgo(
      '2024-01-15T11:55:00.000Z',
      now
    );
  assert.equal(
    minutes,
    '5 دقیقه پیش'
  );

  const hours =
    formatNotificationTimeAgo(
      '2024-01-15T09:00:00.000Z',
      now
    );
  assert.equal(
    hours,
    '3 ساعت پیش'
  );

  const days =
    formatNotificationTimeAgo(
      '2024-01-13T12:00:00.000Z',
      now
    );
  assert.equal(
    days,
    '2 روز پیش'
  );
});

test('groups today and yesterday notifications in input order', () => {
  const now = new Date(
    '2024-01-15T12:00:00.000Z'
  ).getTime();

  const items = [
    makeNotification({
      id: '1',
      created_at:
        '2024-01-15T10:00:00.000Z',
    }),
    makeNotification({
      id: '2',
      created_at:
        '2024-01-15T08:00:00.000Z',
    }),
    makeNotification({
      id: '3',
      created_at:
        '2024-01-14T10:00:00.000Z',
    }),
  ];

  const groups =
    groupNotificationsByDate(
      items,
      now
    );
  assert.equal(groups.length, 2);
  assert.equal(
    groups[0].label,
    'امروز'
  );
  assert.equal(
    groups[0].items.length,
    2
  );
  assert.equal(
    groups[1].label,
    'دیروز'
  );
  assert.equal(
    groups[1].items.length,
    1
  );
});

test('preserves consecutive grouping instead of globally merging labels', () => {
  const now = new Date(
    '2024-01-15T12:00:00.000Z'
  ).getTime();

  const items = [
    makeNotification({
      id: '1',
      created_at:
        '2024-01-15T10:00:00.000Z',
    }),
    makeNotification({
      id: '2',
      created_at:
        '2024-01-14T10:00:00.000Z',
    }),
    makeNotification({
      id: '3',
      created_at:
        '2024-01-15T08:00:00.000Z',
    }),
  ];

  const groups =
    groupNotificationsByDate(
      items,
      now
    );
  assert.equal(groups.length, 3);
  assert.equal(
    groups[0].label,
    'امروز'
  );
  assert.equal(
    groups[1].label,
    'دیروز'
  );
  assert.equal(
    groups[2].label,
    'امروز'
  );
});

test('navigation rejects inherited or unknown page identifiers', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'unknown']) {
    const notification = makeNotification({ action_url: key, template_event_type: null, type: key as AppNotification['type'] });
    assert.equal(resolveNotificationToastPage(notification), undefined);
    assert.equal(resolveNotificationClickPage(notification), undefined);
  }
});
