import { UnreadBadge, unreadLabel } from '../../../features/messaging/UnreadBadge';
import { useMessageUnreadCounts } from '../../../features/messaging/messageUnreadCounts';
import { PRIMARY_NAVIGATION_ITEMS } from '../navigationMenu';
import {
  Menu,
  Settings,
  Download,
} from 'lucide-react';

import { NotificationBell } from '../../../features/notifications';
import type { PageId } from '../types';
import type {
  BeforeInstallPromptEvent,
  PwaInstallChoice,
} from '../types/pwa';
import type {
  LayoutUserProfile,
} from '../types/layoutUser';
import { ProfileDropdown } from './ProfileDropdown';
import { usePermissions } from '../../../context/PermissionsContext';
import { canOpenPortalConfig } from '../../../features/permissions/configPermissions';

function PortalButton({
  activePage,
  onPageChange,
}: {
  activePage: PageId;
  onPageChange: (p: PageId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPageChange('portal-config')}
      title="پیکربندی"
      aria-label="پیکربندی"
      aria-current={activePage === 'portal-config' ? 'page' : undefined}
      className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-xl transition-colors ${
        activePage === 'portal-config'
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
      }`}
    >
      <Settings className="w-5 h-5" />
    </button>
  );
}

export interface LayoutTopBarProps {
  mobileNavigation?: boolean;
  onOpenMobileMenu?: () => void;
  currentUserId?: string | null;
  userProfile: LayoutUserProfile | null;
  onPageChange: (page: PageId) => void;
  onLogout: () => void;
  isAdmin: boolean;
  activePage: PageId;
  accentColor: string;
  installPrompt: BeforeInstallPromptEvent | null;
  onPromptInstall: () => Promise<
    PwaInstallChoice['outcome'] | null
  >;
}

export function LayoutTopBar({
  mobileNavigation = false,
  onOpenMobileMenu,
  currentUserId = null,
  userProfile,
  onPageChange,
  onLogout,
  isAdmin,
  activePage,
  accentColor,
  installPrompt,
  onPromptInstall,
}: LayoutTopBarProps) {
  const { userPermissions, hasPermission } = usePermissions();
  const { directTotal, groupTotal, channelTotal } = useMessageUnreadCounts();
  const unread = (hasPermission('chat') ? directTotal : 0)
    + (hasPermission('channels') ? groupTotal + channelTotal : 0);
  const showPortalConfig = canOpenPortalConfig(isAdmin, userPermissions);

  return (
    <div
      className="relative z-[100] flex-shrink-0 overflow-visible bg-white dark:bg-gray-800"
      style={{
        borderBottom: `2px solid ${accentColor}22`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Accent line at top */}
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(to left, ${accentColor}, ${accentColor}44)`,
        }}
      />
      <div
        className="flex items-center gap-2 px-2.5 shadow-sm sm:px-4"
        style={{ height: '52px' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mobileNavigation && (
            <button type="button" onClick={onOpenMobileMenu} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={unread > 0 ? `باز کردن منوی اصلی، ${unreadLabel(unread)}` : "باز کردن منوی اصلی"} aria-haspopup="dialog">
              <Menu className="h-5 w-5" />
              <UnreadBadge count={unread} className="absolute end-0 top-0" />
            </button>
          )}
          <p className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
            {PRIMARY_NAVIGATION_ITEMS.find(item => item.id === activePage)?.title || 'اسپارک'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {installPrompt && !mobileNavigation && (
            <button
              onClick={() => void onPromptInstall()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="نصب اپلیکیشن"
              aria-label="نصب اپلیکیشن"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          <NotificationBell currentUserId={currentUserId} onNavigate={onPageChange} />
          {showPortalConfig && (
            <PortalButton
              activePage={activePage}
              onPageChange={onPageChange}
            />
          )}
          <div className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-700" />
          <ProfileDropdown
            compact={mobileNavigation}
            currentUserId={currentUserId}
            userProfile={userProfile}
            onPageChange={onPageChange}
            onLogout={onLogout}
            installPrompt={installPrompt}
            onPromptInstall={onPromptInstall}
          />
        </div>
      </div>
    </div>
  );
}
