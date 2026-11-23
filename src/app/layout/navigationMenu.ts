import type {
  LayoutUserPermissions,
  PageId,
} from './types';
import { VIDEO_CONFERENCE_ENABLED } from '../../config/featureFlags';

export interface LayoutNavigationItem {
  id: PageId;
  title: string;
  permissionKey?: string;
  requiresSparkVisible?: boolean;
}

export const PRIMARY_NAVIGATION_ITEMS: LayoutNavigationItem[] = [
  { id: 'management-dashboard', title: 'داشبورد مدیریتی', permissionKey: 'management_dashboard' },
  { id: 'meetings',         title: 'درخواست جلسه',   permissionKey: 'meetings' },
  { id: 'calendar',         title: 'تقویم',           permissionKey: 'calendar' },
  { id: 'minutes-hub',      title: 'صورت‌جلسات و مصوبات', permissionKey: 'minutes_view' },
  { id: 'chat',             title: 'چت سازمانی',      permissionKey: 'chat' },
  { id: 'channels',         title: 'کانال‌ها',         permissionKey: 'channels' },
  { id: 'video-conference', title: 'ویدیو کنفرانس',   permissionKey: 'video_conference' },
  { id: 'tasks',            title: 'اقدامات',         permissionKey: 'tasks' },
  { id: 'notes',            title: 'یادداشت‌ها',      permissionKey: 'notes' },
  { id: 'contacts',         title: 'مخاطبین',         permissionKey: 'contacts' },
  { id: 'reports',          title: 'گزارشات',         permissionKey: 'reports' },
  { id: 'spark',            title: 'اسپارک (دستیار)', permissionKey: 'spark', requiresSparkVisible: true },
];

export const MINUTES_NAVIGATION_ITEMS: LayoutNavigationItem[] = [
  { id: 'minutes-dashboard',    title: 'داشبورد',       permissionKey: 'minutes_view' },
  { id: 'minutes',              title: 'صورت‌جلسات',     permissionKey: 'minutes_view' },
  { id: 'minutes-approvals',    title: 'کارتابل تأیید',  permissionKey: 'minutes_approve' },
  { id: 'minutes-my-decisions', title: 'مصوبات من',      permissionKey: 'minutes_view' },
  { id: 'minutes-followup',     title: 'پیگیری مصوبات', permissionKey: 'minutes_decisions.track' },
  { id: 'minutes-reports',      title: 'گزارش‌ها',       permissionKey: 'minutes_reports' },
];

export const MINUTES_HUB_PAGE_ID: PageId = 'minutes-hub';

export const MINUTES_PAGES: Set<PageId> = new Set([
  'minutes', 'minutes-new', 'minutes-edit', 'minutes-detail',
  'minutes-approvals', 'minutes-my-decisions', 'minutes-followup',
  'minutes-report', 'minutes-reports', 'minutes-dashboard',
  'minutes-hub',
]);

export const MINUTES_INTERNAL_PAGE_MAP: Record<string, PageId> = {
  'minutes-new':    'minutes',
  'minutes-edit':   'minutes',
  'minutes-detail': 'minutes',
  'minutes-report': 'minutes-reports',
  'minutes-dashboard': 'minutes-hub',
  'minutes': 'minutes-hub',
  'minutes-approvals': 'minutes-hub',
  'minutes-my-decisions': 'minutes-hub',
  'minutes-followup': 'minutes-hub',
  'minutes-reports': 'minutes-hub',
};

export interface NavigationVisibilityContext {
  isAdmin: boolean;
  sparkVisible: boolean;
  userPermissions: LayoutUserPermissions;
  minutesFollowupAllowed: boolean;
  minutesFollowupAccessLoading: boolean;
}

export function getVisiblePrimaryNavigationItems(
  context: Pick<NavigationVisibilityContext, 'isAdmin' | 'sparkVisible' | 'userPermissions'> & { managementDashboardAllowed: boolean }
): LayoutNavigationItem[] {
  return PRIMARY_NAVIGATION_ITEMS.filter(item => {
    if (item.id === 'video-conference' && !VIDEO_CONFERENCE_ENABLED) return false;
    if (item.requiresSparkVisible && !context.sparkVisible) return false;
    if (item.id === 'management-dashboard') return context.managementDashboardAllowed;
    if (context.isAdmin) return true;
    if (!item.permissionKey) return true;
    if (context.userPermissions === null) return true;
    if (context.userPermissions === undefined) return false;
    if (item.id === 'chat') return Boolean(context.userPermissions.chat || context.userPermissions.channels);
    return !!context.userPermissions[item.permissionKey];
  });
}

export function getVisibleMinutesNavigationItems(
  context: NavigationVisibilityContext
): LayoutNavigationItem[] {
  return MINUTES_NAVIGATION_ITEMS.filter(item => {
    if (item.id === 'minutes-followup') {
      if (context.minutesFollowupAccessLoading) return false;
      return context.minutesFollowupAllowed;
    }
    if (context.isAdmin) return true;
    if (!item.permissionKey) return true;
    if (context.userPermissions === null) return true;
    if (context.userPermissions === undefined) return false;
    return !!context.userPermissions[item.permissionKey];
  });
}

export function isMinutesPage(page: PageId): boolean {
  return MINUTES_PAGES.has(page);
}

export function resolveActiveMinutesPage(page: PageId): PageId {
  return MINUTES_INTERNAL_PAGE_MAP[page] ?? page;
}
