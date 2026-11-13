export interface PersonalCalendarMeeting {
  id: string;
  user_id: string;
  calendar_id?: string | null;
  participant_user_ids?: string[] | null;
  notify_users?: string[] | null;
  members_only?: boolean | null;
}

export function isPersonalCalendarMeetingVisible(
  meeting: PersonalCalendarMeeting,
  userId: string,
  inboxStatus: string | undefined,
  ownedCalendarIds: ReadonlySet<string>,
  subscribedCalendarIds: ReadonlySet<string>,
  publicCalendarOwnerIds: ReadonlySet<string>,
): boolean {
  if (meeting.user_id === userId) return true;
  if (inboxStatus === 'pending' || inboxStatus === 'declined') return false;
  if (meeting.participant_user_ids?.includes(userId) || meeting.notify_users?.includes(userId)) return true;
  if (inboxStatus === 'accepted' || inboxStatus === 'delegated') return true;
  if (meeting.calendar_id) {
    return ownedCalendarIds.has(meeting.calendar_id)
      || (!meeting.members_only && subscribedCalendarIds.has(meeting.calendar_id));
  }
  return !meeting.members_only && [meeting.user_id, ...(meeting.participant_user_ids || [])]
    .some(id => publicCalendarOwnerIds.has(id));
}
