import { useMobileNavigation } from '../app/layout/hooks/useMobileNavigation';
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import { PRIMARY_NAVIGATION_ITEMS, MINUTES_NAVIGATION_ITEMS } from '../app/layout/navigationMenu';
import { logAudit } from '../lib/audit';
import { useTheme, ACCENT_COLORS } from '../context/ThemeContext';
import type { LayoutUserPermissions, PageId } from '../app/layout/types';
import { fetchSidebarDefaultCollapsed } from '../app/layout/repositories/layoutUserRepository';
import { useLayoutUserPresence } from '../app/layout/hooks/useLayoutUserPresence';
import { usePwaInstallPrompt } from '../app/layout/hooks/usePwaInstallPrompt';
import { signOutCurrentUser } from '../features/auth';
import { LayoutSidebar } from '../app/layout/components/LayoutSidebar';
import { LayoutTopBar } from '../app/layout/components/LayoutTopBar';

export type { PageId } from '../app/layout/types';

export interface LayoutProps {
  children: React.ReactNode;
  currentUserId?: string | null;
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  isAdmin?: boolean;
  sparkVisible?: boolean;
  userPermissions?: LayoutUserPermissions;
  managementDashboardAllowed?: boolean;
  minutesFollowupAllowed?: boolean;
  minutesFollowupAccessLoading?: boolean;
}

export function Layout({
  children,
  currentUserId,
  activePage,
  onPageChange,
  isAdmin = false,
  userPermissions,
  managementDashboardAllowed = false,
  sparkVisible = false,
  minutesFollowupAllowed = false,
  minutesFollowupAccessLoading = false,
}: LayoutProps) {
  const lastVisit = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUserId) { lastVisit.current = null; return; }
    const key = `${currentUserId}:${activePage}`;
    if (lastVisit.current === key) return;
    lastVisit.current = key;
    const title = [...PRIMARY_NAVIGATION_ITEMS,...MINUTES_NAVIGATION_ITEMS].find(item => item.id === activePage)?.title || (activePage === 'portal-config' ? 'پیکربندی' : activePage);
    void logAudit({ module: 'navigation', action: 'page_view', entity_name: title, details: `بازدید از صفحهٔ ${title}` });
  }, [currentUserId,activePage]);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved !== null ? saved === 'true' : true;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavigation = useMobileNavigation();
  const userProfile = useLayoutUserPresence(currentUserId);
  const {
    installPrompt,
    showInstallBanner,
    promptInstall,
    dismissInstallBanner,
  } = usePwaInstallPrompt();
  const { accent } = useTheme();
  const accentColor = ACCENT_COLORS.find((c) => c.key === accent)?.hex ?? '#0d9488';

  useEffect(() => {
    if (localStorage.getItem('sidebar_collapsed') !== null) return;
    (async () => {
      const defaultCollapsed = await fetchSidebarDefaultCollapsed();
      if (defaultCollapsed !== null) {
        setIsCollapsed(defaultCollapsed);
        localStorage.setItem('sidebar_collapsed', String(defaultCollapsed));
      }
    })();
  }, []);

  const pageContentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = pageContentRef.current?.animate?.(
      [{ opacity: 0.86 }, { opacity: 1 }],
      { duration: 160, easing: 'ease-out' },
    );
    return () => animation?.cancel();
  }, [activePage]);

  const handleInstall = async () => {
    await promptInstall();
    dismissInstallBanner();
  };

  const handleLogout = async () => {
    logAudit({ module: 'auth', action: 'logout', details: 'خروج از سامانه', severity: 'info' });
    await signOutCurrentUser();
  };

  const handlePageChange = (page: typeof activePage) => {
    onPageChange(page);
    setIsMobileMenuOpen(false);
    if (page === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else if (window.location.pathname.includes('/admin')) {
      window.history.pushState({}, '', '/');
    }
  };

  const isFullHeightPage =
    activePage === 'calendar' ||
    activePage === 'chat' ||
    activePage === 'channels' ||
    activePage === 'video-conference' ||
    activePage === 'portal-config';
  const isScrollableFullHeightPage = activePage === 'video-conference';

  return (
    <div
      className="flex w-full max-w-full bg-gray-100 dark:bg-gray-900 rtl transition-colors overflow-hidden"
      style={{ height: '100dvh' }}
      dir="rtl"
    >
      {showInstallBanner && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[9999] p-2 sm:p-3 pointer-events-none"
          dir="rtl"
        >
          <div className="w-full max-w-sm mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 flex items-center gap-2 sm:gap-3 pointer-events-auto min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
              <img src="/logo-ui.webp" alt="Spark" width={40} height={40} decoding="async" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-white">نصب اپلیکیشن</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">برای دسترسی سریع‌تر نصب کنید</p>
            </div>
            <button
              onClick={handleInstall}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors touch-manipulation flex-shrink-0"
            >
              نصب
            </button>
            <button
              onClick={dismissInstallBanner}
              className="p-1.5 text-gray-400 hover:text-gray-600 touch-manipulation flex-shrink-0"
              aria-label="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <LayoutSidebar
        activePage={activePage}
        onNavigate={handlePageChange}
        isAdmin={isAdmin}
        sparkVisible={!!sparkVisible}
        userPermissions={userPermissions ?? null}
        managementDashboardAllowed={managementDashboardAllowed}
        minutesFollowupAllowed={minutesFollowupAllowed}
        minutesFollowupAccessLoading={minutesFollowupAccessLoading}
        isCollapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuOpenChange={setIsMobileMenuOpen}
        accentColor={accentColor}
      />

      <div
        className="flex-1 flex flex-col overflow-hidden min-w-0 max-w-full"
        style={{ height: '100dvh' }}
      >
        <LayoutTopBar
          mobileNavigation={mobileNavigation}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          currentUserId={currentUserId}
          userProfile={userProfile}
          onPageChange={handlePageChange}
          onLogout={handleLogout}
          isAdmin={isAdmin}
          activePage={activePage}
          accentColor={accentColor}
          installPrompt={installPrompt}
          onPromptInstall={promptInstall}
        />

        {isFullHeightPage ? (
          <main
            ref={pageContentRef}
            className={`app-responsive-content flex-1 min-h-0 min-w-0 max-w-full ${
              isScrollableFullHeightPage ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
            }`}
          >
            {children}
          </main>
        ) : (
          <main
            ref={pageContentRef}
            className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 max-w-full"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="app-responsive-content max-w-[95rem] mx-auto px-2.5 sm:px-4 lg:px-6 w-full min-w-0 py-3 sm:py-6">
              <div className="min-w-0 max-w-full lg:pr-2">{children}</div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
