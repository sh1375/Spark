import { createNotificationUnreadTracker } from '../models/notificationUnreadTracker';
import { notifyBrowser } from '../../../lib/pwaNotificationBridge';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import toast from 'react-hot-toast';

import type {
  PageId,
} from '../../../app/layout/types';
import { getCurrentAuthUserId } from '../../auth';
import { setMinuteIdInUrl } from '../../../lib/minutesNavigation';
import type {
  AppNotification,
} from '../types/appNotification';
import {
  prependIncomingNotification,
  replaceUpdatedNotification,
  markNotificationReadLocally,
  markAllNotificationsReadLocally,
} from '../models/notificationCollection';
import {
  resolveNotificationClickPage,
} from '../navigation/notificationNavigation';
import {
  deleteUserNotification,
  deleteAllUserNotifications,
  fetchUserNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllUserNotificationsAsRead,
} from '../repositories/notificationRepository';
import {
  subscribeToUserNotificationChanges,
} from '../services/notificationRealtime';
import {
  startNotificationBellLifecycle,
} from '../services/notificationBellLifecycle';
import {
  resetIncomingNotificationQueue,
  showIncomingNotification,
} from '../services/showIncomingNotification';

export interface UseNotificationBellResult {
  notifications:
    AppNotification[];

  unreadCount: number;
  loading: boolean;

  handleNotificationClick:
    (
      notification:
        AppNotification
    ) => Promise<boolean>;

  markAsRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  markAllAsRead: () => Promise<void>;
  deleteAll: () => Promise<void>;
  bulkActionPending: boolean;
}

export function useNotificationBell(
  onNavigate?: (
    page: PageId
  ) => void,
  initialUserId: string | null = null
): UseNotificationBellResult {
  const [notifications, setNotifications] =
    useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] =
    useState(0);
  const [loading, setLoading] =
    useState(true);
  const [currentUserId, setCurrentUserId] =
    useState<string | null>(initialUserId);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const bulkLock = useRef(false);
  const latestUserId = useRef(currentUserId);
  latestUserId.current = currentUserId;
  const deletedNotificationIds = useRef(new Set<string>());
  const onNavigateRef =
    useRef(onNavigate);
  const unreadTracker = useRef(createNotificationUnreadTracker());

  useEffect(() => {
    onNavigateRef.current =
      onNavigate;
  }, [onNavigate]);

  const refreshUnreadCount =
    useCallback(async (): Promise<
      number | null
    > => {
      if (!currentUserId) {
        unreadTracker.current.reset();
        setUnreadCount(0);
        return 0;
      }

      const token = unreadTracker.current.beginRequest();
      try {
        const count =
          await fetchUnreadNotificationCount(
            currentUserId
          );

        if (!unreadTracker.current.applyResponse(token, count)) return null;
        setUnreadCount(count);
        return count;
      } catch (error: unknown) {
        console.error(
          'NotificationBell unread count error:',
          error
        );
        return null;
      }
    }, [currentUserId]);

  useEffect(() => {
    return () => {
      resetIncomingNotificationQueue();
    };
  }, []);

  useEffect(() => {
    if (initialUserId) {
      setCurrentUserId(initialUserId);
      return;
    }

    let disposed = false;

    void (async () => {
      const userId =
        await getCurrentAuthUserId();
      if (!disposed && userId) {
        setCurrentUserId(userId);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [initialUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    let disposed = false;
    deletedNotificationIds.current.clear();
    unreadTracker.current.reset(); setUnreadCount(0);
    let unreadSyncTimer:
      number | null = null;

    const scheduleUnreadCountSync =
      () => {
        if (
          disposed ||
          unreadSyncTimer !== null
        ) {
          return;
        }

        unreadSyncTimer =
          window.setTimeout(
            () => {
              unreadSyncTimer = null;
              if (!disposed) {
                void refreshUnreadCount();
              }
            },
            80
          );
      };

    const cleanup =
      startNotificationBellLifecycle({
        userId: currentUserId,
        loadNotifications:
          fetchUserNotifications,
        subscribeToChanges:
          subscribeToUserNotificationChanges,
        onLoadingChange: setLoading,
        onNotificationsLoaded: (
          loaded
        ) => {
          const visible = loaded.filter(notification => !deletedNotificationIds.current.has(notification.id));
          unreadTracker.current.snapshot(visible);
          setNotifications(visible);
          // The list is capped at fifty; the badge must count all unread rows.
          void refreshUnreadCount();
        },
        onNotificationInserted: (
          notification
        ) => {
          if (deletedNotificationIds.current.has(notification.id)) return;
          setNotifications(
            (previous) =>
              prependIncomingNotification(
                previous,
                notification
              )
          );
          setUnreadCount(unreadTracker.current.inserted(notification));
          scheduleUnreadCountSync();

          void notifyBrowser(notification, currentUserId);

          showIncomingNotification(
            notification,
            (page) =>
              onNavigateRef.current?.(
                page
              )
          );
        },
        onNotificationUpdated: (
          notification
        ) => {
          if (deletedNotificationIds.current.has(notification.id)) return;
          setUnreadCount(unreadTracker.current.updated(notification));
          setNotifications(
            (previous) =>
              replaceUpdatedNotification(
                previous,
                notification
              )
          );
          scheduleUnreadCountSync();
        },
        onNotificationDeleted: id => {
          setUnreadCount(unreadTracker.current.deleted(id));
          deletedNotificationIds.current.add(id);
          setNotifications(previous => previous.filter(notification => notification.id !== id));
          scheduleUnreadCountSync();
        },
        onRealtimeError: (
          error
        ) => {
          console.error(
            'NotificationBell realtime error:',
            error
          );
        },
        onLoadError: (error) => {
          console.error(
            'NotificationBell fetch error:',
            error
          );
        },
      });

    return () => {
      disposed = true;
      unreadTracker.current.invalidate();

      if (
        unreadSyncTimer !== null
      ) {
        window.clearTimeout(
          unreadSyncTimer
        );
      }

      cleanup();
    };
  }, [
    currentUserId,
    refreshUnreadCount,
    reloadVersion,
  ]);

  const markAsRead = async (
    id: string
  ): Promise<void> => {
    if (!currentUserId) return;
    const original = notifications.find(notification => notification.id === id);
    if (original?.read) return;
    if (original) setUnreadCount(unreadTracker.current.updated({ ...original, read: true }));
    setNotifications((prev) =>
      markNotificationReadLocally(
        prev,
        id
      )
    );

    try {
      await markNotificationAsRead(
        id,
        currentUserId
      );
      void refreshUnreadCount();
    } catch {
      if (original) setUnreadCount(unreadTracker.current.updated(original));
      if (original) setNotifications(previous => previous.map(notification => notification.id === id ? { ...notification, read: original.read } : notification));
      void refreshUnreadCount();
      toast.error(
        'خطا در بروزرسانی اعلان'
      );
    }
  };

  const deleteNotification = async (id: string): Promise<void> => {
    if (!currentUserId) return;
    try {
      await deleteUserNotification(id, currentUserId);
      setUnreadCount(unreadTracker.current.deleted(id));
      deletedNotificationIds.current.add(id);
      setNotifications(previous => previous.filter(notification => notification.id !== id));
      void refreshUnreadCount();
    } catch {
      toast.error('حذف اعلان ناموفق بود؛ دوباره تلاش کنید');
    }
  };

  const handleNotificationClick = async (
    n: AppNotification
  ): Promise<boolean> => {
    const page =
      resolveNotificationClickPage(n);

    if (!page || !onNavigate) {
      return false;
    }

    try {
      if (!n.read)
        await markAsRead(n.id);
    } catch {
      /* swallow mark-read errors so navigation still runs */
    }

    if (
      page === 'minutes-detail' &&
      n.minute_id
    ) {
      setMinuteIdInUrl(n.minute_id);
    }

    onNavigate(page);
    return true;
  };

  const runBulkAction = async (action: 'read' | 'delete'): Promise<void> => {
    const userId = currentUserId;
    if (!userId || bulkLock.current) return;
    bulkLock.current = true;
    setBulkActionPending(true);
    try {
      if (action === 'delete') {
        await deleteAllUserNotifications(userId);
      } else {
        await markAllUserNotificationsAsRead(userId);
      }
      if (latestUserId.current !== userId) return;

      if (action === 'delete') {
        unreadTracker.current.reset();
        setNotifications([]);
      } else {
        unreadTracker.current.markAllRead();
        setNotifications(markAllNotificationsReadLocally);
      }
      setUnreadCount(0);
      // Reconcile against the server so inserts arriving during the mutation
      // are visible even if the client did not receive their realtime event.
      setReloadVersion(version => version + 1);
      toast.success(action === 'delete' ? 'همه اعلان‌ها حذف شدند' : 'همه اعلان‌ها خوانده شدند');
    } catch {
      if (latestUserId.current === userId) {
        toast.error(action === 'delete' ? 'حذف همه اعلان‌ها ناموفق بود' : 'خطا در بروزرسانی اعلان‌ها');
      }
    } finally {
      bulkLock.current = false;
      setBulkActionPending(false);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    handleNotificationClick,
    markAsRead,
    deleteNotification,
    markAllAsRead: () => runBulkAction('read'),
    deleteAll: () => runBulkAction('delete'),
    bulkActionPending,
  };
}
