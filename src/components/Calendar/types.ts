export type ViewMode = 'day' | '3-day' | '4-day' | 'work-week' | 'week' | 'month' | 'year' | 'schedule';

export interface MeetingData {
  /** Local display relationship; never grants database access. */
  personal_calendar_direct_access?: boolean;
  id: string;
  subject: string;
  request_date: string;
  request_jalaali_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  duration: string;
  location: string;
  representative: string;
  phone: string;
  notes: string | null;
  priority: string;
  status: string;
  status_type: string;
  created_at: string;
  user_id: string;
  calendar_id?: string | null;
  external_participants?: string[] | null;
  participant_user_ids?: string[] | null;
  series_id?: string | null;
  repeat_type?: string | null;
  repeat_interval?: number | null;
  repeat_end_date?: string | null;
  repeat_weekday?: number | null;
  reminder_minutes?: number | null;
  notify_users?: string[] | null;
  members_only?: boolean | null;
  meeting_manager?: string | null;
  is_online?: boolean | null;
  conference_room_id?: string | null;
  owner_delegate_user_id?: string | null;
  owner_delegate_name?: string | null;
  owner_delegate_status?: 'pending' | 'accepted' | 'declined' | null;
  owner_delegate_updated_at?: string | null;
}

export interface CalendarEntry {
  id: string;
  name: string;
  type: 'private' | 'public' | 'shared';
  description: string | null;
  is_active: boolean;
  enable_reminder: boolean;
  enable_overlap: boolean;
  color: string;
  created_at: string;
  user_id: string;
  is_occasions?: boolean;
  is_personal_public?: boolean;
}

export interface CalendarSubscription {
  id: string;
  calendar_id: string;
  user_id: string;
  permission: 'view' | 'edit';
  profile?: { full_name: string; email: string };
}

export interface ProfileEntry {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface PendingSchedule {
  meetingId: string;
  meeting: MeetingData;
}

export interface CalendarFormState {
  name: string;
  type: 'private' | 'public' | 'shared';
  description: string;
  is_active: boolean;
  enable_reminder: boolean;
  create_online_link: boolean;
  show_time_overlap: boolean;
  free_for_all: boolean;
  color: string;
}
