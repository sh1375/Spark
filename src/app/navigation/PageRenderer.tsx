import { lazy } from 'react';
import type { ReactNode } from 'react';
import type { PageId } from '../navigation/useNavigation';
import { PAGE_PERMISSION_KEY, checkPermission, AccessDenied, canOpenPortalConfig } from '../../features/permissions';
import type { PageRendererProps } from './pageRendererTypes';

const ManagementDashboardPage = lazy(() => import('../../components/ManagementDashboardPage').then((m) => ({ default: m.ManagementDashboardPage })));
const TasksPage = lazy(() => import('../../components/TasksPage').then((m) => ({ default: m.TasksPage })));
const ReportsPage = lazy(() => import('../../components/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotesPage = lazy(() => import('../../components/NotesPage').then((m) => ({ default: m.NotesPage })));
const ProfilePage = lazy(() => import('../../components/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ContactsPage = lazy(() => import('../../components/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const ContactsEmailPage = lazy(() => import('../../components/ContactsEmailPage').then((m) => ({ default: m.ContactsEmailPage })));
const CalendarPage = lazy(() => import('../../components/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const TutorialPage = lazy(() => import('../../components/Tutorial').then((m) => ({ default: m.TutorialPage })));
const ChatPage = lazy(() => import('../../components/Chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const PortalConfigPage = lazy(() => import('../../components/PortalConfigPage').then((m) => ({ default: m.PortalConfigPage })));
const SparkPage = lazy(() => import('../../components/Spark/SparkPage').then((m) => ({ default: m.SparkPage })));
const GroupsPage = lazy(() => import('../../components/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const ChannelsPage = lazy(() => import('../../components/Channels/ChannelsPage').then((m) => ({ default: m.ChannelsPage })));
const MinutesDashboardPage = lazy(() => import('../../components/Minutes/MinutesDashboardPage').then((m) => ({ default: m.MinutesDashboardPage })));
const MinutesHubPage = lazy(() => import('../../components/Minutes/MinutesHubPage').then((m) => ({ default: m.MinutesHubPage })));
const MinutesListPage = lazy(() => import('../../components/Minutes/MinutesListPage').then((m) => ({ default: m.MinutesListPage })));
const MinutesFormPage = lazy(() => import('../../components/Minutes/MinutesFormPage').then((m) => ({ default: m.MinutesFormPage })));
const MinutesDetailPage = lazy(() => import('../../components/Minutes/MinutesDetailPage').then((m) => ({ default: m.MinutesDetailPage })));
const MinutesApprovalsPage = lazy(() => import('../../components/Minutes/MinutesApprovalsPage').then((m) => ({ default: m.MinutesApprovalsPage })));
const MyDecisionsPage = lazy(() => import('../../components/Minutes/MyDecisionsPage').then((m) => ({ default: m.MyDecisionsPage })));
const DecisionsFollowupPage = lazy(() => import('../../components/Minutes/DecisionsFollowupPage').then((m) => ({ default: m.DecisionsFollowupPage })));
const MinutesMeetingReportPage = lazy(() => import('../../components/Minutes/MinutesMeetingReportPage').then((m) => ({ default: m.MinutesMeetingReportPage })));
const MinutesReportsPage = lazy(() => import('../../components/Minutes/MinutesReportsPage').then((m) => ({ default: m.MinutesReportsPage })));
const MeetingsPage = lazy(() => import('../../features/meetings/pages/MeetingsPage').then((m) => ({ default: m.MeetingsPage })));
const CreateMeetingPage = lazy(() => import('../../features/meetings/pages/CreateMeetingPage').then((m) => ({ default: m.CreateMeetingPage })));

function modernPage(content: ReactNode): ReactNode {
  return <div className="spark-modern-page h-full min-h-0">{content}</div>;
}

export function renderContent(props: PageRendererProps): ReactNode {
  const {
    activePage, navigate, isAdmin, currentUserId, userPermissions,
    fetchMeetings,
    pendingSchedule, setPendingSchedule,
    chatMentionParticipants, setChatMentionParticipants,
    chatMeetingNotes, setChatMeetingNotes,
    taskPrefillDescription, setTaskPrefillDescription,
    taskPrefillMessageId, setTaskPrefillMessageId,
    sparkMeetingPrefill, setSparkMeetingPrefill,
    setSparkExternalCommand,
    sparkCalendarView, setSparkCalendarView,
    sparkNavigateDate, setSparkNavigateDate,
    sparkCalendarMeetingPrefill, setSparkCalendarMeetingPrefill,
    chatInitUserId, setChatInitUserId,
    openWorkGroups, setOpenWorkGroups,
    sparkVisible,
    managementDashboardAllowed,
    managementDashboardAccessLoading,
    minutesFollowupAllowed,
    minutesFollowupAccessLoading,
  } = props;

  if (userPermissions === undefined && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (activePage === 'minutes-followup') {
    if (minutesFollowupAccessLoading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
          <span className="mr-3 text-sm text-slate-500 dark:text-slate-400">در حال بررسی دسترسی...</span>
        </div>
      );
    }
    if (!minutesFollowupAllowed) {
      return <AccessDenied onReturn={() => navigate('profile')} />;
    }
  }

  if (activePage === 'management-dashboard') {
    if (managementDashboardAccessLoading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
          <span className="mr-3 text-sm text-slate-500 dark:text-slate-400">در حال بررسی دسترسی...</span>
        </div>
      );
    }
    if (!managementDashboardAllowed) {
      return <AccessDenied onReturn={() => navigate('profile')} />;
    }
  }

  const canOpenDirectChat = checkPermission('chat', isAdmin, userPermissions);
  const canOpenWorkGroups = checkPermission('channels', isAdmin, userPermissions);
  const permKey = activePage === 'management-dashboard' || (activePage === 'chat' && canOpenWorkGroups)
    ? undefined : PAGE_PERMISSION_KEY[activePage];
  if (permKey && !checkPermission(permKey, isAdmin, userPermissions)) {
    return <AccessDenied onReturn={() => navigate('profile')} />;
  }

  switch (activePage) {
    case 'management-dashboard':
      return <ManagementDashboardPage onNavigate={navigate} />;
    case 'calendar':
      return <CalendarPage
        currentUserId={currentUserId}
        pendingSchedule={pendingSchedule}
        onScheduleComplete={() => { setPendingSchedule(null); void fetchMeetings(); }}
        pendingMentionParticipants={chatMentionParticipants.length > 0 ? chatMentionParticipants : undefined}
        pendingMentionNotes={chatMeetingNotes || undefined}
        onPendingMentionConsumed={() => { setChatMentionParticipants([]); setChatMeetingNotes(''); }}
        initialView={sparkCalendarView || undefined}
        onViewConsumed={() => setSparkCalendarView(null)}
        sparkNavigateDate={sparkNavigateDate}
        onSparkNavigateDateConsumed={() => setSparkNavigateDate(null)}
        sparkCalendarMeetingPrefill={sparkCalendarMeetingPrefill}
        onSparkCalendarMeetingPrefillConsumed={() => setSparkCalendarMeetingPrefill(null)}
        onRegisterMinutes={(meetingId, existingMinuteId) => {
          try {
            const url = new URL(window.location.href);
            if (existingMinuteId) {
              url.searchParams.set('minute', existingMinuteId);
              url.searchParams.delete('meeting');
              window.history.replaceState({}, '', url.toString());
              navigate('minutes-detail');
            } else {
              url.searchParams.set('meeting', meetingId);
              url.searchParams.delete('minute');
              window.history.replaceState({}, '', url.toString());
              navigate('minutes-new');
            }
          } catch (err) {
            if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
              console.error('[PageRenderer] onRegisterMinutes navigation failed:', err);
            }
          }
        }}
      />;
    case 'chat':
      if (canOpenWorkGroups && (!canOpenDirectChat || (openWorkGroups && !chatInitUserId))) {
        return <ChannelsPage key="groups" type="group" currentUserId={currentUserId} isAdmin={isAdmin}
          onBackToChat={canOpenDirectChat ? () => setOpenWorkGroups(false) : undefined}
          onNavigateToTasks={(body, id) => {
            setTaskPrefillDescription(body);
            setTaskPrefillMessageId(id);
            navigate('tasks');
          }}
          onOpenDirectChat={canOpenDirectChat ? (userId) => {
            setOpenWorkGroups(false);
            setChatInitUserId(userId);
          } : undefined} />;
      }
      return <ChatPage
        currentUserId={currentUserId}
        onNavigateToCalendar={(ids, bodyText) => {
          if (ids && ids.length > 0) setChatMentionParticipants(ids);
          if (bodyText) setChatMeetingNotes(bodyText);
          navigate('calendar');
        }}
        onNavigateToTasks={(messageBody, messageId) => {
          setTaskPrefillDescription(messageBody);
          setTaskPrefillMessageId(messageId);
          navigate('tasks');
        }}
        onOpenWorkGroups={canOpenWorkGroups ? () => setOpenWorkGroups(true) : undefined}
        initialOpenUserId={chatInitUserId}
        onInitialOpenUserConsumed={() => { setOpenWorkGroups(false); setChatInitUserId(null); }}
      />;
    case 'create-meeting':
      return modernPage(<CreateMeetingPage
        currentUserId={currentUserId}
        prefillData={sparkMeetingPrefill}
        setActivePage={navigate}
        setSparkMeetingPrefill={setSparkMeetingPrefill}
        fetchMeetings={fetchMeetings}
      />);
    case 'video-conference':
      return modernPage(<p role="status">سرویس ویدئوکنفرانس هنوز فعال نشده است.</p>);
    case 'portal-config':
      return currentUserId && canOpenPortalConfig(isAdmin, userPermissions)
        ? modernPage(<PortalConfigPage currentUserId={currentUserId} />)
        : <AccessDenied onReturn={() => navigate('profile')} />;
    case 'tasks':
      return <TasksPage
        prefillDescription={taskPrefillDescription || undefined}
        prefillSourceMessageId={taskPrefillMessageId || undefined}
        onPrefillConsumed={() => { setTaskPrefillDescription(''); setTaskPrefillMessageId(''); }}
        currentUserId={currentUserId}
      />;
    case 'reports':
      return <ReportsPage />;
    case 'notes':
      return <NotesPage currentUserId={currentUserId} />;
    case 'profile':
      return modernPage(<ProfilePage currentUserId={currentUserId} />);
    case 'contacts':
      return <ContactsPage currentUserId={currentUserId} />;
    case 'contacts_email':
      return modernPage(<ContactsEmailPage currentUserId={currentUserId} />);
    case 'tutorial':
      return modernPage(<TutorialPage onAskSpark={(cmd) => { setSparkExternalCommand(cmd); }} />);
    case 'spark':
      if (!sparkVisible) { navigate('calendar'); return null; }
      return modernPage(<SparkPage onSendToAssistant={(cmd) => { setSparkExternalCommand(cmd); navigate('spark'); }} />);
    case 'groups':
      return modernPage(<GroupsPage currentUserId={currentUserId} isAdmin={isAdmin} />);
    case 'channels':
      return <ChannelsPage currentUserId={currentUserId} isAdmin={isAdmin}
        onNavigateToTasks={(body, id) => {
        setTaskPrefillDescription(body);
        setTaskPrefillMessageId(id);
        navigate('tasks');
      }} onOpenDirectChat={(userId) => {
        setChatInitUserId(userId);
        navigate('chat');
      }} />;
    case 'minutes-hub': {
      const hubCards = new Set<PageId>();
      if (checkPermission('minutes_view', isAdmin, userPermissions)) {
        hubCards.add('minutes-dashboard');
        hubCards.add('minutes');
        hubCards.add('minutes-my-decisions');
      }
      if (checkPermission('minutes_approve', isAdmin, userPermissions)) {
        hubCards.add('minutes-approvals');
      }
      if (checkPermission('minutes_reports', isAdmin, userPermissions)) {
        hubCards.add('minutes-reports');
      }
      if (minutesFollowupAllowed) {
        hubCards.add('minutes-followup');
      }
      return (
        <MinutesHubPage
          onNavigate={(p) => navigate(p as PageId)}
          visibleCards={hubCards}
          canCreateMinute={checkPermission('minutes_create', isAdmin, userPermissions)}
        />
      );
    }
    case 'minutes-dashboard':
      return modernPage(<MinutesDashboardPage onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes':
      return modernPage(<MinutesListPage onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-new':
      return modernPage(<MinutesFormPage mode="new" onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-edit':
      return modernPage(<MinutesFormPage mode="edit" onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-detail':
      return modernPage(<MinutesDetailPage onNavigate={(p) => navigate(p as PageId)} currentUserId={currentUserId || undefined} isAdmin={isAdmin} />);
    case 'minutes-approvals':
      return modernPage(<MinutesApprovalsPage onNavigate={(p) => navigate(p as PageId)} currentUserId={currentUserId || undefined} />);
    case 'minutes-my-decisions':
      return modernPage(<MyDecisionsPage onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-followup':
      return modernPage(<DecisionsFollowupPage onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-report':
      return modernPage(<MinutesMeetingReportPage onNavigate={(p) => navigate(p as PageId)} />);
    case 'minutes-reports':
      return modernPage(<MinutesReportsPage onNavigate={(p) => navigate(p as PageId)} />);
    default:
      return <MeetingsPage
        meetings={props.meetings}
        pendingMeetingsCount={props.pendingMeetingsCount}
        fetchMeetings={props.fetchMeetings}
        fetchPendingMeetingsCount={props.fetchPendingMeetingsCount}
        searchTerm={props.searchTerm}
        setSearchTerm={props.setSearchTerm}
        statusFilter={props.statusFilter}
        setStatusFilter={props.setStatusFilter}
        priorityFilter={props.priorityFilter}
        setPriorityFilter={props.setPriorityFilter}
        showPendingMeetingsModal={props.showPendingMeetingsModal}
        setShowPendingMeetingsModal={props.setShowPendingMeetingsModal}
        setActivePage={props.navigate}
        setPendingSchedule={props.setPendingSchedule}
        isAdmin={props.isAdmin}
        userPermissions={props.userPermissions}
        currentUserId={props.currentUserId}
      />;
  }
}
