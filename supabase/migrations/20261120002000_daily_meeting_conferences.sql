create table private.external_meeting_conferences (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  room_name text not null,
  expires_at timestamptz not null
);
revoke all on private.external_meeting_conferences from public,anon,authenticated;

create function public.prepare_daily_meeting_conference(p_meeting uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  meeting public.meetings;
  room private.external_meeting_conferences;
  api_key text;
begin
  select * into meeting from public.meetings where id=p_meeting;
  if not found or meeting.is_online is not true or meeting.status in ('cancelled','canceled')
    or meeting.status_type in ('rejected','cancelled','canceled') or not coalesce(
      meeting.user_id=p_user or p_user=any(meeting.participant_user_ids) or p_user=any(meeting.notify_users),false)
    or not exists(select 1 from public.profiles where user_id=p_user and is_active and account_status='ACTIVE')
    then raise exception 'Meeting unavailable' using errcode='42501'; end if;
  select s.decrypted_secret into api_key from private.external_call_connections c
    join vault.decrypted_secrets s on s.id=c.secret_id where c.capability='conference'
    and c.endpoint in ('https://api.daily.co/v1','https://api.daily.co/v1/');
  if nullif(api_key,'') is null then return jsonb_build_object('state','unconfigured'); end if;
  if meeting.user_id=p_user then
    insert into private.external_meeting_conferences as r values
      (p_meeting,'spark-'||replace(gen_random_uuid()::text,'-',''),now()+interval '3 hours')
      on conflict(meeting_id) do update set room_name=excluded.room_name,expires_at=excluded.expires_at
      where r.expires_at <= now();
  end if;
  select * into room from private.external_meeting_conferences where meeting_id=p_meeting and expires_at>now();
  if not found then return jsonb_build_object('state','waiting'); end if;
  return jsonb_build_object('state','ready','key',api_key,'room',room.room_name,
    'exp',floor(extract(epoch from room.expires_at)),'owner',meeting.user_id=p_user);
end;
$$;
revoke all on function public.prepare_daily_meeting_conference(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_daily_meeting_conference(uuid,uuid) to service_role;
notify pgrst,'reload schema';
