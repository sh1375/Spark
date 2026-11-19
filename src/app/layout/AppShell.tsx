import { MessageUnreadProvider } from '../../features/messaging/messageUnreadCounts';
import { lazy, Suspense, useEffect, useState } from 'react';
import { PermissionsProvider } from '../../context/PermissionsContext';
import { UrgentMessageProvider } from '../../context/UrgentMessageContext';
import { SplashScreen } from '../../components/SplashScreen';
import { SparkLoader } from '../../components/ui/SparkLoader';
import type { SparkMeetingPrefill } from '../../components/Spark/SparkAssistant';
import type { PageId } from '../navigation/useNavigation';
import { Layout } from '../../components/Layout';
import { renderContent } from '../navigation/PageRenderer';
import type { PageRendererProps } from '../navigation/pageRendererTypes';

const SparkAssistant = lazy(() =>
  import('../../components/Spark/SparkAssistant').then((m) => ({ default: m.SparkAssistant })),
);

function PageLoadingFallback() {
  return (
    <SparkLoader
      fullScreen={false}
      compact
      message="در حال آماده‌سازی صفحه..."
    />
  );
}

interface AppShellProps {
  isAdmin: boolean;
  currentUserId: string | null;
  userPermissions: Record<string, boolean> | null | undefined;
  activePage: PageId;
  navigate: (page: PageId) => void;
  showSplash: boolean;
  splashDone: boolean;
  onSplashDone: () => void;
  sparkVisible: boolean;
  minutesFollowupAllowed: boolean;
  minutesFollowupAccessLoading: boolean;
  rendererProps: PageRendererProps;
  sparkProps: {
    sparkExternalCommand: string | null;
    onExternalCommandConsumed: () => void;
    onSetCalendarView: (view: string) => void;
    onOpenMeetingForm: (prefill: SparkMeetingPrefill) => void;
    onOpenCalendarMeetingForm: (prefill: unknown) => void;
    onNavigateToDate: (jy: number, jm: number, jd: number, view?: string) => void;
  };
}

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function AppShell(props: AppShellProps) {
  const {
    isAdmin, currentUserId, userPermissions,
    activePage, navigate,
    showSplash, splashDone, onSplashDone,
    sparkVisible,
    minutesFollowupAllowed,
    minutesFollowupAccessLoading,
    rendererProps, sparkProps,
  } = props;
  const [assistantReady, setAssistantReady] = useState(false);

  useEffect(() => {
    if (!currentUserId || !sparkVisible) {
      setAssistantReady(false);
      return;
    }

    // If the user explicitly opens Spark, do not defer it. Everywhere else the
    // primary page wins the startup race and the global assistant warms only
    // after the browser becomes idle (or after a short timeout fallback).
    if (activePage === 'spark') {
      setAssistantReady(true);
      return;
    }

    const idleWindow = window as IdleCapableWindow;
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(() => setAssistantReady(true), { timeout: 1600 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(() => setAssistantReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [currentUserId, sparkVisible, activePage]);

  return (
    <PermissionsProvider isAdmin={isAdmin} userPermissions={userPermissions}>
      <UrgentMessageProvider currentUserId={currentUserId} onNavigateToChat={() => navigate('chat')} onNavigateToChannels={() => navigate('channels')}>
        {showSplash && !splashDone && (
          <SplashScreen onDone={onSplashDone} />
        )}
        <MessageUnreadProvider key={currentUserId} userId={currentUserId}>
          <Layout
            currentUserId={currentUserId}
            activePage={activePage}
            onPageChange={(p) => navigate(p as PageId)}
            isAdmin={isAdmin}
            userPermissions={userPermissions}
            managementDashboardAllowed={rendererProps.managementDashboardAllowed}
            sparkVisible={sparkVisible}
            minutesFollowupAllowed={minutesFollowupAllowed}
            minutesFollowupAccessLoading={minutesFollowupAccessLoading}
          >
            <Suspense fallback={<PageLoadingFallback />}>
              {renderContent(rendererProps)}
            </Suspense>
          </Layout>
        </MessageUnreadProvider>
        {currentUserId && sparkVisible && assistantReady && (
          <Suspense fallback={null}>
            <SparkAssistant
              currentUserId={currentUserId}
              onNavigate={(page) => navigate(page as PageId)}
              onSetCalendarView={(view) => { sparkProps.onSetCalendarView(view); navigate('calendar'); }}
              onOpenMeetingForm={(prefill) => {
                sparkProps.onOpenMeetingForm(prefill);
                navigate('create-meeting');
              }}
              onOpenCalendarMeetingForm={(prefill) => {
                sparkProps.onOpenCalendarMeetingForm(prefill);
                navigate('calendar');
              }}
              onNavigateToDate={(jy, jm, jd, view) => {
                sparkProps.onNavigateToDate(jy, jm, jd, view);
                navigate('calendar');
              }}
              externalCommand={sparkProps.sparkExternalCommand}
              onExternalCommandConsumed={sparkProps.onExternalCommandConsumed}
            />
          </Suspense>
        )}
      </UrgentMessageProvider>
    </PermissionsProvider>
  );
}
