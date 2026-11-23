import type { AgendaItem } from '../../types';
import type { MeetingChangeSet } from '../../lib/meetingEditDiff';

export interface CalendarEntry {
  id: string;
  name: string;
  color: string;
  type: 'private' | 'public' | 'shared';
  user_id?: string;
  is_occasions?: boolean;
  is_personal_public?: boolean;
}

export type SeriesEditScope = 'following' | 'all';

export type CommitSnapshot = {
  operationId: string;
  updateRecord: Record<string, any>;
  scopedSeriesEdit?: {
    scope: SeriesEditScope;
    agendaChanged: boolean;
    patch: import('../../types/supabase').Json;
    recipients: import('../../types/supabase').Json;
  };
  baseFields: Record<string, any> | null;
  isFirstSchedule: boolean;
  senderName: string;
  meetingDateStr: string;
  meetingTimeStr: string;
  smsPlaceholders: Record<string, string>;
  agendaSummary: string;
  participantNameMap: Record<string, string>;
  observerIds: string[];
  prevNotifyUserIds: string[];
  previousNotifyUserIdsByMeetingId: Record<string, string[]>;
  changeSetsByMeetingId: Record<string, MeetingChangeSet>;
  prevAgendaByMeetingId: Record<string, AgendaItem[]>;
  gregDate: string;
  selectedParticipantIds: string[];
  selectedExternal: string[];
  selectedExternalInformees: string[];
  sendSms: boolean;
  agendaEnabled: boolean;
  agendaItems: AgendaItem[];
  prevExternalByMeetingId: Record<string, string[]>;
  prevExternalInformeesByMeetingId: Record<string, string[]>;
  prevParticipantIds: string[];
  prevObserverIds: string[];
};

export interface CalendarMeetingFormProps {
  onSuccess: (subject?: string, isUpdate?: boolean) => void;
  onCancel: () => void;
  calendars?: CalendarEntry[];
  prefillData?: {
    mode?: 'create';
    subject?: string;
    location?: string;
    representative?: string;
    phone?: string;
    notes?: string;
    priority?: string;
    meetingId?: string;
    startTime?: string;
    endTime?: string;
    dateJy?: number;
    dateJm?: number;
    dateJd?: number;
    calendarId?: string;
    membersOnly?: boolean;
    participantUserIds?: string[];
    notifyUserIds?: string[];
    externalParticipants?: string[];
    externalInformees?: string[];
    meetingManager?: string;
    reminderMinutes?: number;
    isOnline?: boolean;
    agendaItems?: Array<{
      title: string;
      presenter?: string | null;
      duration_minutes?: number | null;
      description?: string | null;
      source_decision_id?: string | null;
    }>;
    repeatEnabled?: boolean;
    repeatType?: 'weekly' | 'monthly';
    repeatInterval?: number;
    repeatEndDate?: string;
    repeatWeekday?: number;
    editAllIds?: string[];
    seriesEditScope?: SeriesEditScope;
  } | null;
}
