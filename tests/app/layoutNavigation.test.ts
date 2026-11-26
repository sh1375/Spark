import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getVisiblePrimaryNavigationItems,
  getVisibleMinutesNavigationItems,
  isMinutesPage,
  resolveActiveMinutesPage,
} from '../../src/app/layout/navigationMenu';

test('preserves the primary navigation order', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: true,
    sparkVisible: true,
    userPermissions: null,
    managementDashboardAllowed: true,
    minutesFollowupAllowed: true,
    minutesFollowupAccessLoading: false,
  });

  assert.deepEqual(
    items.map(i => i.id),
    [
      'management-dashboard',
      'meetings',
      'calendar',
      'minutes-hub',
      'chat',
      'channels',
      'tasks',
      'notes',
      'contacts',
      'reports',
      'spark',
    ]
  );
});

test('hides Spark when the Spark visibility flag is false', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: true,
    sparkVisible: false,
    userPermissions: null,
    managementDashboardAllowed: true,
    minutesFollowupAllowed: true,
    minutesFollowupAccessLoading: false,
  });

  assert.ok(
    !items.some(i => i.id === 'spark')
  );
});

test('shows Spark when visible and permitted', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: false,
    sparkVisible: true,
    userPermissions: { spark: true },
    managementDashboardAllowed: false,
    minutesFollowupAllowed: false,
    minutesFollowupAccessLoading: false,
  });

  assert.ok(
    items.some(i => i.id === 'spark')
  );
});

test('shows management dashboard only when its dedicated access result is granted', () => {
  const allowed = getVisiblePrimaryNavigationItems({
    isAdmin: false,
    sparkVisible: true,
    userPermissions: {},
    managementDashboardAllowed: true,
  });
  const denied = getVisiblePrimaryNavigationItems({
    isAdmin: true,
    sparkVisible: true,
    userPermissions: null,
    managementDashboardAllowed: false,
  });

  assert.ok(allowed.some(i => i.id === 'management-dashboard'));
  assert.ok(!denied.some(i => i.id === 'management-dashboard'));
});

test('administrator access does not bypass the dedicated management dashboard gate', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: true,
    sparkVisible: true,
    userPermissions: undefined,
    managementDashboardAllowed: false,
  });

  assert.equal(items.length, 10);
  assert.ok(!items.some(i => i.id === 'video-conference'));
  assert.ok(!items.some(i => i.id === 'management-dashboard'));
});

test('null permissions remain full access except for the dedicated management dashboard gate', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: false,
    sparkVisible: true,
    userPermissions: null,
    managementDashboardAllowed: false,
  });

  assert.equal(items.length, 10);
  assert.ok(!items.some(i => i.id === 'video-conference'));
  assert.ok(!items.some(i => i.id === 'management-dashboard'));
});

test('hides permissioned primary items while permissions are loading', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: false,
    sparkVisible: true,
    userPermissions: undefined,
    managementDashboardAllowed: false,
    minutesFollowupAllowed: false,
    minutesFollowupAccessLoading: true,
  });

  assert.equal(items.length, 0);
});

test('preserves partial-permission filtering without sorting', () => {
  const items = getVisiblePrimaryNavigationItems({
    isAdmin: false,
    sparkVisible: true,
    userPermissions: {
      management_dashboard: true,
      meetings: true,
      tasks: true,
      reports: true,
    },
    managementDashboardAllowed: true,
    minutesFollowupAllowed: false,
    minutesFollowupAccessLoading: false,
  });

  assert.deepEqual(
    items.map(i => i.id),
    ['management-dashboard', 'meetings', 'tasks', 'reports']
  );
});

test('preserves Minutes navigation visibility and hub mapping', () => {
  const items = getVisibleMinutesNavigationItems({
    isAdmin: true,
    sparkVisible: false,
    userPermissions: undefined,
    minutesFollowupAllowed: true,
    minutesFollowupAccessLoading: false,
  });

  assert.equal(items.length, 6);

  assert.deepEqual(
    items.map(i => i.id),
    [
      'minutes-dashboard',
      'minutes',
      'minutes-approvals',
      'minutes-my-decisions',
      'minutes-followup',
      'minutes-reports',
    ]
  );

  assert.equal(
    resolveActiveMinutesPage('minutes-new'),
    'minutes'
  );
  assert.equal(
    resolveActiveMinutesPage('minutes-edit'),
    'minutes'
  );
  assert.equal(
    resolveActiveMinutesPage('minutes-detail'),
    'minutes'
  );
  assert.equal(
    resolveActiveMinutesPage('minutes-report'),
    'minutes-reports'
  );
  assert.equal(
    resolveActiveMinutesPage('minutes'),
    'minutes-hub'
  );
  assert.equal(
    isMinutesPage('minutes'),
    true
  );
  assert.equal(
    isMinutesPage('meetings'),
    false
  );
});
