import { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import type { PageId } from '../../../app/layout/types';
import { useModalFocus } from '../../../app/layout/hooks/useModalFocus';
import { useNotificationBell } from '../hooks/useNotificationBell';
import { groupNotificationsByDate } from '../models/notificationCollection';
import { notificationPanelLayout } from '../models/notificationPanelLayout';
import { NotificationPanelContent } from './NotificationPanelContent';

export interface NotificationBellProps {
  onNavigate?: (page: PageId) => void;
  currentUserId?: string | null;
}

export function NotificationBell({ onNavigate, currentUserId = null }: NotificationBellProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [placement, setPlacement] = useState({ width: 320, left: 8, top: 60, maxHeight: 420 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, handleNotificationClick, markAllAsRead, markAsRead, deleteNotification, deleteAll, bulkActionPending } = useNotificationBell(onNavigate, currentUserId);
  useModalFocus(showPanel, panelRef, () => setShowPanel(false));

  useLayoutEffect(() => {
    if (!showPanel) return;
    const position = () => {
      const trigger = triggerRef.current;
      if (trigger) setPlacement(notificationPanelLayout(window.innerWidth, window.visualViewport?.height || window.innerHeight, trigger.getBoundingClientRect()));
    };
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); };
  }, [showPanel]);

  const grouped = groupNotificationsByDate(notifications);
  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setShowPanel(value => !value)}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        aria-label="اعلان‌ها"
        aria-haspopup="dialog"
        aria-expanded={showPanel}
        aria-controls={showPanel ? 'spark-notification-panel' : undefined}
      >
        <Bell className={`h-5 w-5 ${unreadCount ? 'text-blue-600 dark:text-blue-400' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-gray-800">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {showPanel && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[8500] touch-none bg-slate-950/15 sm:bg-transparent" aria-hidden="true" onClick={() => setShowPanel(false)} />
          <div
            id="spark-notification-panel"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="اعلان‌ها"
            className="fixed z-[8501] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-gray-800"
            style={placement}
            dir="rtl"
          >
            <NotificationPanelContent
              loading={loading} groups={grouped} unreadCount={unreadCount} notifications={notifications}
              onMarkAllAsRead={markAllAsRead} onDeleteAll={deleteAll} bulkActionPending={bulkActionPending} onMarkAsRead={markAsRead} onDelete={deleteNotification} onClose={() => setShowPanel(false)}
              onNotificationClick={notification => { setShowPanel(false); void handleNotificationClick(notification); }}
            />
          </div>
        </>, document.body,
      )}
    </div>
  );
}
