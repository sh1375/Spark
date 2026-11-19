import { supabase } from '../../../lib/supabase';
import type {
  AppNotification,
} from '../types/appNotification';

export async function fetchUserNotifications(
  userId: string
): Promise<AppNotification[]> {
  const {
    data,
    error,
  } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(50);

  if (error) {
    throw error;
  }

  return (
    data ?? []
  ) as AppNotification[];
}

export async function fetchUnreadNotificationCount(
  userId: string
): Promise<number> {
  const {
    count,
    error,
  } = await supabase
    .from('notifications')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function markNotificationAsRead(
  notificationId: string,
  userId: string | null
): Promise<void> {
  if (!userId) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.from('notifications').update({ read: true })
    .eq('id', notificationId).eq('user_id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('NOTIFICATION_NOT_FOUND');
}

export async function markAllUserNotificationsAsRead(
  userId: string
): Promise<void> {
  const { error } =
    await supabase
      .from('notifications')
      .update({
        read: true,
      })
      .eq(
        'user_id',
        userId
      )
      .eq(
        'read',
        false
      );

  if (error) {
    throw error;
  }
}


export async function deleteUserNotification(notificationId: string, userId: string): Promise<void> {
  const { data, error } = await supabase.from('notifications').delete()
    .eq('id', notificationId).eq('user_id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('NOTIFICATION_NOT_FOUND');
}

export async function deleteAllUserNotifications(userId: string): Promise<void> {
  if (!userId) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
}
