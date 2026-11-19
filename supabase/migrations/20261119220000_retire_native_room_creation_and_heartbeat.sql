-- Preserve historical rooms and reject attempts by older clients to provision new ones.
create or replace function private.block_conference_room_creation_when_disabled_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'VIDEO_CONFERENCE_DISABLED';
end;
$$;

drop trigger if exists trg_touch_conference_session_from_heartbeat on public.conference_participants;
drop function if exists private.touch_conference_session_from_participant_heartbeat() restrict;
drop function if exists public.touch_my_conference_session_activity(uuid) restrict;
drop function if exists private.touch_my_conference_session_activity(uuid) restrict;
drop function if exists private.create_conference_room(text,boolean) restrict;
drop function if exists public.get_video_conference_runtime_config() restrict;
drop function if exists public.is_video_conference_enabled() restrict;
notify pgrst, 'reload schema';
