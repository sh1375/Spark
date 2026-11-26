import type {
  PageId,
} from '../../../app/layout/types';
import type {
  AppNotification,
} from '../types/appNotification';

export const NOTIFICATION_PAGE_MAP:
  Readonly<
    Record<string, PageId>
  > = {
  chat: 'chat',

  meeting: 'meetings',
  calendar: 'calendar',

  tasks: 'tasks',
  task: 'tasks',

  note: 'notes',
  notes: 'notes',

  conference:
    'video-conference',

  video_conference:
    'video-conference',

  minutes_approval_requested:
    'minutes-detail',

  minutes_all_approved:
    'minutes-detail',

  minutes_changes_requested:
    'minutes-detail',

  minutes_resubmitted:
    'minutes-detail',

  minutes_secretary_confirmed:
    'minutes-detail',

  minutes_published:
    'minutes-detail',

  decision_assigned:
    'minutes-detail',

  decision_completed:
    'minutes-detail',

  decision_due_soon:
    'minutes-detail',

  decision_followup:
    'minutes-detail',

  decision_followup_due:
    'minutes-detail',

  decision_obstacle:
    'minutes-detail',

  decision_obstacle_resolved:
    'minutes-detail',

  decision_overdue:
    'minutes-detail',

  decision_progress_updated:
    'minutes-detail',

  decision_reopened:
    'minutes-detail',

  decision_status_changed:
    'minutes-detail',

  decision_waiting_approval:
    'minutes-detail',

  decision_stopped:
    'minutes-detail',
};

function lookupPage(key: string): PageId | undefined {
  return Object.hasOwn(NOTIFICATION_PAGE_MAP, key)
    ? NOTIFICATION_PAGE_MAP[key]
    : undefined;
}

function resolveActionUrlPage(
  actionUrl: string | null | undefined
): PageId | undefined {
  const raw = actionUrl?.trim();
  if (!raw) return undefined;

  const directPage = lookupPage(raw);
  if (directPage) return directPage;

  const normalized = raw
    .replace(/^#/, '')
    .replace(/^\//, '')
    .split('?')[0];

  return lookupPage(normalized);
}

function resolveEventPage(
  notification: AppNotification
): PageId | undefined {
  const eventKey =
    notification.template_event_type ||
    notification.type;

  return lookupPage(eventKey);
}

export function resolveNotificationClickPage(
  notification:
    AppNotification
): PageId | undefined {
  return (
    resolveActionUrlPage(
      notification.action_url
    ) ||
    resolveEventPage(notification)
  );
}

export function resolveNotificationToastPage(
  notification:
    AppNotification
): PageId | undefined {
  return resolveActionUrlPage(notification.action_url);
}
