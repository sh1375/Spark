import type { PageId } from './useNavigation';

type Loader = () => Promise<unknown>;

// Keep this map limited to user-navigable surfaces. Dynamic imports are shared
// with React.lazy chunks by Vite/browser module caching, so an intent preload
// warms the exact chunk that the later navigation will request.
const pageLoaders: Partial<Record<PageId, Loader>> = {
  'management-dashboard': () => import('../../components/ManagementDashboardPage'),
  meetings: () => import('../../features/meetings/pages/MeetingsPage'),
  calendar: () => import('../../components/CalendarPage'),
  chat: () => import('../../components/Chat/ChatPage'),
  channels: () => import('../../components/Channels/ChannelsPage'),
  tasks: () => import('../../components/TasksPage'),
  notes: () => import('../../components/NotesPage'),
  contacts: () => import('../../components/ContactsPage'),
  contacts_email: () => import('../../components/ContactsEmailPage'),
  reports: () => import('../../components/ReportsPage'),
  profile: () => import('../../components/ProfilePage'),
  tutorial: () => import('../../components/Tutorial'),
  spark: () => import('../../components/Spark/SparkPage'),
  groups: () => import('../../components/GroupsPage'),
  'portal-config': () => import('../../components/PortalConfigPage'),
  'minutes-hub': () => import('../../components/Minutes/MinutesHubPage'),
  'minutes-dashboard': () => import('../../components/Minutes/MinutesDashboardPage'),
  minutes: () => import('../../components/Minutes/MinutesListPage'),
  'minutes-new': () => import('../../components/Minutes/MinutesFormPage'),
  'minutes-edit': () => import('../../components/Minutes/MinutesFormPage'),
  'minutes-detail': () => import('../../components/Minutes/MinutesDetailPage'),
  'minutes-approvals': () => import('../../components/Minutes/MinutesApprovalsPage'),
  'minutes-my-decisions': () => import('../../components/Minutes/MyDecisionsPage'),
  'minutes-followup': () => import('../../components/Minutes/DecisionsFollowupPage'),
  'minutes-report': () => import('../../components/Minutes/MinutesMeetingReportPage'),
  'minutes-reports': () => import('../../components/Minutes/MinutesReportsPage'),
};

const warmedPages = new Set<PageId>();

export function preloadPage(page: PageId): void {
  const loader = pageLoaders[page];
  if (!loader || warmedPages.has(page)) return;

  warmedPages.add(page);
  void loader().catch(() => {
    // A transient preload failure must not poison the later real navigation.
    warmedPages.delete(page);
  });
}
