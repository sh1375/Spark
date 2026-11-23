import { usePermissions } from '../../../context/PermissionsContext';
import { UnreadBadge, unreadLabel } from '../../../features/messaging/UnreadBadge';
import { useMessageUnreadCounts } from '../../../features/messaging/messageUnreadCounts';
import { useRef } from 'react';
import { useMobileNavigation } from '../hooks/useMobileNavigation';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  LayoutDashboard,
  Grid2X2,
  SquareCheck as CheckSquare,
  ChartBar as FileBarChart2,
  StickyNote,
  Phone,
  Menu,
  ChevronRight,
  Calendar,
  MessageCircle,
  Video,
  Bot,
  MessagesSquare,
  FileText,
  ClipboardList,
  SquareCheck as DecisionIcon,
  TrendingUp,
  ChartBar as BarChart2,
  X,
} from 'lucide-react';

import type {
  LayoutUserPermissions,
  PageId,
} from '../types';
import {
  getVisiblePrimaryNavigationItems,
  isMinutesPage,
} from '../navigationMenu';
import { preloadPage } from '../../navigation/preloadPage';

const ICON_MAP: Partial<Record<PageId, typeof LayoutDashboard>> = {
  'management-dashboard': Grid2X2,
  'meetings': LayoutDashboard,
  'calendar': Calendar,
  'chat': MessageCircle,
  'channels': MessagesSquare,
  'video-conference': Video,
  'tasks': CheckSquare,
  'notes': StickyNote,
  'contacts': Phone,
  'reports': FileBarChart2,
  'spark': Bot,
  'minutes-dashboard': LayoutDashboard,
  'minutes': FileText,
  'minutes-approvals': ClipboardList,
  'minutes-my-decisions': DecisionIcon,
  'minutes-followup': TrendingUp,
  'minutes-reports': BarChart2,
  'minutes-hub': FileText,
};

export interface LayoutSidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  isAdmin: boolean;
  sparkVisible: boolean;
  userPermissions: LayoutUserPermissions;
  managementDashboardAllowed: boolean;
  minutesFollowupAllowed: boolean;
  minutesFollowupAccessLoading: boolean;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  isMobileMenuOpen: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
  accentColor: string;
}

export function LayoutSidebar({
  activePage,
  onNavigate,
  isAdmin,
  sparkVisible,
  userPermissions,
  managementDashboardAllowed,
  isCollapsed,
  onCollapsedChange,
  isMobileMenuOpen,
  onMobileMenuOpenChange,
  accentColor,
}: LayoutSidebarProps) {
  const mobileNavigation = useMobileNavigation();
  const { hasPermission } = usePermissions();
  const { directTotal, groupTotal, channelTotal } = useMessageUnreadCounts();
  const drawerRef = useRef<HTMLDivElement>(null);
  useModalFocus(mobileNavigation && isMobileMenuOpen, drawerRef, () => onMobileMenuOpenChange(false));

  const menuItems = getVisiblePrimaryNavigationItems({
    isAdmin,
    sparkVisible: !!sparkVisible,
    userPermissions,
    managementDashboardAllowed,
  }).map((item) => ({
    ...item,
    icon: ICON_MAP[item.id] ?? LayoutDashboard,
  }));

  // A mobile drawer is always expanded; the persisted desktop collapsed state
  // must never remove labels from a touch-device drawer.
  const showExpandedLabels = mobileNavigation || !isCollapsed;

  return (
    <>
      {/* Mobile Overlay. Global navigation intentionally sits above every
          page-local toolbar, dropdown and floating action button. */}
      {mobileNavigation && isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-[9000] bg-slate-950/35 touch-none"
          onClick={() => onMobileMenuOpenChange(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        inert={mobileNavigation && !isMobileMenuOpen ? true : undefined}
        aria-hidden={mobileNavigation && !isMobileMenuOpen ? true : undefined}
        className={`${
          mobileNavigation
            ? `w-72 max-w-[86vw] fixed right-0 top-0 rounded-l-2xl ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} z-[9010]`
            : `${isCollapsed ? 'w-16' : 'w-52'} relative translate-x-0 z-50`
        } bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 h-full flex flex-col flex-shrink-0`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: mobileNavigation ? '100dvh' : undefined }}
        role={mobileNavigation ? 'dialog' : undefined}
        aria-modal={mobileNavigation && isMobileMenuOpen ? true : undefined}
        aria-label={mobileNavigation ? 'منوی اصلی' : undefined}
      >
        {/* Sidebar header */}
        <div className={`flex items-center px-3 h-14 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 relative ${mobileNavigation ? 'justify-between' : 'justify-center'}`}>
          {mobileNavigation ? (
            <>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">منوی اصلی</p>
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">اسپارک</p>
              </div>
              <button
                type="button"
                onClick={() => onMobileMenuOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="بستن منوی اصلی"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                const next = !isCollapsed;
                onCollapsedChange(next);
                localStorage.setItem('sidebar_collapsed', String(next));
              }}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex flex-shrink-0"
              aria-label={isCollapsed ? 'باز کردن نوار کناری' : 'بستن نوار کناری'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              ) : (
                <Menu className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              )}
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            const unread = item.id === 'chat'
              ? (hasPermission('chat') ? directTotal : 0) + (hasPermission('channels') ? groupTotal : 0)
              : item.id === 'channels' ? channelTotal : 0;
            const isActive =
              activePage === item.id ||
              (activePage === 'create-meeting' && item.id === 'meetings') ||
              (item.id === 'minutes-hub' && isMinutesPage(activePage));
            const warm = () => preloadPage(item.id);
            return (
              <button
                key={item.id}
                onMouseEnter={warm}
                onFocus={warm}
                onTouchStart={warm}
                onClick={() => {
                  onNavigate(item.id);
                  if (mobileNavigation) onMobileMenuOpenChange(false);
                }}
                className={`w-full flex items-center gap-2.5 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  showExpandedLabels ? 'px-2.5' : 'justify-center px-2'
                } ${
                  isActive
                    ? 'shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
                style={isActive ? { backgroundColor: accentColor + '18', color: accentColor } : {}}
                title={unread > 0 ? `${item.title}، ${unreadLabel(unread)}` : !showExpandedLabels ? item.title : undefined}
                aria-label={unread > 0 ? `${item.title}، ${unreadLabel(unread)}` : item.title}
              >
                <span className="relative shrink-0">
                  <Icon className="w-5 h-5" />
                  {!showExpandedLabels && <UnreadBadge count={unread} className="absolute -end-2 -top-2" />}
                </span>
                {showExpandedLabels && <span className="truncate">{item.title}</span>}
                {showExpandedLabels && <UnreadBadge count={unread} className="ms-auto" />}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
