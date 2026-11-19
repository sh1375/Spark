import type { supabase } from '../../lib/supabase';
import type { Json } from '../../types/supabase';

export async function persistCalendarChanges(client: typeof supabase, ids: string[], patch: Json, notify: boolean) {
  const { data, error } = await client.rpc('save_calendar_meeting_changes_v1', {
    p_ids: ids, p_patch: patch, p_notify: notify,
  });
  if (error) throw error;
  if (!data || data.length !== ids.length) throw new Error('MEETING_TIMING_NOT_SAVED');
  return data;
}

export async function persistCalendarTiming(client: typeof supabase, id: string, updates: Record<string, string>, notify: boolean) {
  const [saved] = await persistCalendarChanges(client, [id], updates, notify);
  if (saved.id !== id || !saved.start_time || !saved.end_time) throw new Error('MEETING_TIMING_NOT_SAVED');
  return saved;
}
export function meetingTimingPlaceholders(meeting: {id:string;start_time:string|null;end_time:string|null}) {
  return {meeting_id:meeting.id,start_time:meeting.start_time||'',end_time:meeting.end_time||''};
}
