import { startPwaNotificationBridge } from './lib/pwaNotificationBridge';
import { useLiveData, LIVE_DATA } from './shared/realtime/useLiveData';
import { lazy, Suspense, useState, useEffect } from 'react';
import { RestrictedAccessPage } from './components/RestrictedAccessPage';
import { SparkLoader } from './components/ui/SparkLoader';
import { supabase } from './lib/supabase';
import { Toaster } from 'react-hot-toast';
import { Wrench } from 'lucide-react';
import { useUserPreferences, UserPreferencesProvider } from './features/user-preferences';
import { useAuthSession } from './features/auth/hooks/useAuthSession';
import { useSessionHeartbeat } from './features/auth/hooks/useSessionHeartbeat';
import { useMeetingsData } from './features/meetings/hooks/useMeetingsData';
import { FirstRunOnboardingGate } from './features/onboarding';
import { useAppRuntimeConfig } from './app/hooks/useAppRuntimeConfig';
import { useNavigation, useAdminPathGuard } from './app/navigation/useNavigation';
import { useMinutesFollowupAccess } from './app/hooks/useMinutesFollowupAccess';
import { AppShell } from './app/layout/AppShell';
import type { SparkMeetingPrefill } from './components/Spark/SparkAssistant';
import type { Meeting } from './types';
import type { PageRendererProps } from './app/navigation/pageRendererTypes';
import { ThemeProvider } from './context/ThemeContext';
import { AuthenticatedThemeSync } from './context/AuthenticatedThemeSync';
import { canOpenPortalConfig } from './features/permissions/configPermissions';

const toasterProps = {
  position: 'top-center' as const,
  containerStyle: {
    zIndex: 2147483647,
    top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
  },
  toastOptions: { duration: 8000 },
};

function AppToaster() {
  return <Toaster {...toasterProps} />;
}

function AuthorizedApp({ authSession }: { authSession: ReturnType<typeof useAuthSession> }) {
  useLiveData([...LIVE_DATA.people, ...LIVE_DATA.config], async () => { await authSession.refreshAccessState(); });
  const { prefs, loading: prefsLoading } = useUserPreferences();
  const { currentUserId, isAdmin, userPermissions } = authSession;
  useEffect(() => {
    if (!currentUserId || prefsLoading) return;
    return startPwaNotificationBridge(currentUserId, prefs.notifications_enabled);
  }, [currentUserId, prefsLoading, prefs.notifications_enabled]);
  const { activePage, navigate } = useNavigation(true, prefsLoading, prefs.default_landing_page);

  useEffect(() => {
    const conferenceCode = new URLSearchParams(window.location.search).get('conference');
    if (conferenceCode) navigate('video-conference');
  }, [navigate]);
  const { maintenanceMode, sparkVisible } = useAppRuntimeConfig();

  const meetingsDataEnabled = activePage === 'meetings';
  const { meetings, pendingMeetingsCount, fetchMeetings, fetchPendingMeetingsCount } =
    useMeetingsData(meetingsDataEnabled, currentUserId);

  const canOpenConfig = canOpenPortalConfig(isAdmin, userPermissions);
  useAdminPathGuard(true, canOpenConfig, navigate);

  const [managementDashboardAllowed, setManagementDashboardAllowed] = useState(false);
  const [managementDashboardAccessLoading, setManagementDashboardAccessLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let idleId: number | null = null;

    if (!currentUserId) {
      setManagementDashboardAllowed(false);
      setManagementDashboardAccessLoading(false);
      return () => { cancelled = true; };
    }

    setManagementDashboardAccessLoading(true);
    const load = async () => {
      const { data, error } = await supabase.rpc('has_management_dashboard_access_v1');
      if (cancelled) return;
      setManagementDashboardAllowed(!error && data === true);
      setManagementDashboardAccessLoading(false);
    };

    if (activePage === 'management-dashboard') {
      void load();
    } else {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(() => void load(), { timeout: 1800 });
      } else {
        timer = window.setTimeout(() => void load(), 1000);
      }
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (idleId !== null) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
    };
  }, [currentUserId, activePage]);

  const [showSplash, setShowSplash] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => { setSplashDone(true); }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'archived'>('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showPendingMeetingsModal, setShowPendingMeetingsModal] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{ meetingId: string; meeting: Meeting } | null>(null);
  const [chatMentionParticipants, setChatMentionParticipants] = useState<string[]>([]);
  const [chatMeetingNotes, setChatMeetingNotes] = useState('');
  const [taskPrefillDescription, setTaskPrefillDescription] = useState('');
  const [taskPrefillMessageId, setTaskPrefillMessageId] = useState('');
  const [sparkMeetingPrefill, setSparkMeetingPrefill] = useState<SparkMeetingPrefill | null>(null);
  const [sparkExternalCommand, setSparkExternalCommand] = useState<string | null>(null);
  const [sparkCalendarView, setSparkCalendarView] = useState<string | null>(null);
  const [sparkNavigateDate, setSparkNavigateDate] = useState<{ jy: number; jm: number; jd: number; view?: string } | null>(null);
  const [sparkCalendarMeetingPrefill, setSparkCalendarMeetingPrefill] = useState<unknown>(null);
  const [openWorkGroups, setOpenWorkGroups] = useState(false);
  const [chatInitUserId, setChatInitUserId] = useState<string | null>(null);

  const canQueryMinutesFollowup =
    isAdmin || userPermissions === null || userPermissions?.['minutes_decisions.track'] === true;
  const minutesFollowupAccess = useMinutesFollowupAccess({
    isAuthenticated: canQueryMinutesFollowup,
    userId: currentUserId,
    immediate: activePage === 'minutes-followup' || activePage === 'minutes-hub',
  });

  if (maintenanceMode && !isAdmin) {
    return (
      <div className="spark-auth-flow flex min-h-screen items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:border-amber-500/20 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="mt-3 space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">سیستم در حال تعمیر است</h1>
            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
              در حال حاضر سیستم به دلیل عملیات نگهداری در دسترس نیست. لطفاً کمی بعد مجدداً تلاش کنید.
            </p>
          </div>
          <button onClick={() => supabase.auth.signOut({ scope: 'local' })} className="mt-4 h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            خروج از حساب
          </button>
        </div>
      </div>
    );
  }

  const rendererProps: PageRendererProps = {
    activePage, navigate, isAdmin, currentUserId, userPermissions,
    meetings, pendingMeetingsCount, fetchMeetings, fetchPendingMeetingsCount,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter,
    priorityFilter, setPriorityFilter,
    showPendingMeetingsModal, setShowPendingMeetingsModal,
    pendingSchedule, setPendingSchedule,
    chatMentionParticipants, setChatMentionParticipants,
    chatMeetingNotes, setChatMeetingNotes,
    taskPrefillDescription, setTaskPrefillDescription,
    taskPrefillMessageId, setTaskPrefillMessageId,
    sparkMeetingPrefill, setSparkMeetingPrefill,
    sparkExternalCommand, setSparkExternalCommand,
    sparkCalendarView, setSparkCalendarView,
    sparkNavigateDate, setSparkNavigateDate,
    sparkCalendarMeetingPrefill, setSparkCalendarMeetingPrefill,
    chatInitUserId, setChatInitUserId,
    openWorkGroups, setOpenWorkGroups,
    sparkVisible,
    managementDashboardAllowed,
    managementDashboardAccessLoading,
    minutesFollowupAllowed: minutesFollowupAccess.allowed,
    minutesFollowupAccessLoading: minutesFollowupAccess.loading,
  };

  return (
    <AppShell
      isAdmin={isAdmin}
      currentUserId={currentUserId}
      userPermissions={userPermissions}
      activePage={activePage}
      navigate={navigate}
      showSplash={showSplash}
      splashDone={splashDone}
      onSplashDone={() => { setShowSplash(false); setSplashDone(true); }}
      sparkVisible={sparkVisible}
      minutesFollowupAllowed={minutesFollowupAccess.allowed}
      minutesFollowupAccessLoading={minutesFollowupAccess.loading}
      rendererProps={rendererProps}
      sparkProps={{
        sparkExternalCommand,
        onExternalCommandConsumed: () => setSparkExternalCommand(null),
        onSetCalendarView: (view) => { setSparkCalendarView(view); },
        onOpenMeetingForm: (prefill) => { setSparkMeetingPrefill(prefill); },
        onOpenCalendarMeetingForm: (prefill) => { setSparkCalendarMeetingPrefill(prefill); },
        onNavigateToDate: (jy, jm, jd, view) => { setSparkNavigateDate({ jy, jm, jd, view }); },
      }}
    />
  );
}

export default function AuthenticatedApp() {
  return (
    <ThemeProvider>
      <AuthenticatedAppContent />
    </ThemeProvider>
  );
}

function AuthenticatedAppContent() {
  const authSession = useAuthSession();
  useSessionHeartbeat(authSession.hasSession && authSession.isFullyAuthorized);

  const {
    loading,
    hasSession,
    isFullyAuthorized,
    reasonCode,
    nextStep,
    currentUserId,
    refreshAccessState,
  } = authSession;

  if (loading) {
    return <SparkLoader message="در حال بررسی نشست و دسترسی‌ها..." />;
  }

  if (!hasSession) {
    return <SparkLoader message="در حال خروج..." />;
  }

  const authenticatedContent = !isFullyAuthorized ? (
    <div className="spark-auth-flow min-h-screen">
      <RestrictedAccessPage
        reasonCode={reasonCode}
        nextStep={nextStep}
        onRefresh={refreshAccessState}
        onSignOut={async () => {
          await supabase.auth.signOut({ scope: 'local' });
        }}
      />
    </div>
  ) : (
    <UserPreferencesProvider userId={currentUserId}>
      <AuthenticatedThemeSync />
      <AuthorizedApp authSession={authSession} />
    </UserPreferencesProvider>
  );

  const onboardingEnabled = Boolean(currentUserId) && (
    isFullyAuthorized || nextStep === 'complete_profile'
  );

  return (
    <>
      <AppToaster />
      {currentUserId ? (
        <FirstRunOnboardingGate
          userId={currentUserId}
          enabled={onboardingEnabled}
          profileCompletionRequired={nextStep === 'complete_profile'}
        >
          {authenticatedContent}
        </FirstRunOnboardingGate>
      ) : authenticatedContent}
    </>
  );
}
