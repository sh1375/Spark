create table private.external_call_start_limits(
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_started_at timestamptz not null
);
revoke all on private.external_call_start_limits from public, anon, authenticated;

create function public.prepare_daily_chat_call(p_caller uuid, p_recipient uuid, p_capability text)
returns text language plpgsql security definer set search_path='' as $$
declare api_key text;
begin
  if p_caller=p_recipient or p_capability not in ('audio','video') or not exists(
    select 1 from public.chat_conversations c
    where (c.participant_a=p_caller and c.participant_b=p_recipient and not coalesce(c.deleted_for_a,false))
       or (c.participant_b=p_caller and c.participant_a=p_recipient and not coalesce(c.deleted_for_b,false))
  ) or (select count(distinct user_id) from public.profiles
    where user_id in (p_caller,p_recipient) and is_active and account_status='ACTIVE')<>2 then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;
  select s.decrypted_secret into api_key
  from private.external_call_connections c join vault.decrypted_secrets s on c.secret_id=s.id
  where c.capability=p_capability and c.endpoint in ('https://api.daily.co/v1','https://api.daily.co/v1/');
  if nullif(api_key,'') is null then return null; end if;
  insert into private.external_call_start_limits as limits values(p_caller,clock_timestamp())
    on conflict(user_id) do update set last_started_at=excluded.last_started_at
    where limits.last_started_at < clock_timestamp()-interval '15 seconds';
  if not found then raise exception 'Call rate exceeded' using errcode='54000'; end if;
  return api_key;
end;
$$;
revoke all on function public.prepare_daily_chat_call(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_daily_chat_call(uuid,uuid,text) to service_role;

create function public.get_my_outgoing_call_decision(p_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when expires_at<=now() then 'expired' else coalesce(decision,'pending') end
  from private.external_call_invitations where id=p_id and caller_id=auth.uid()
    and private.is_current_session_fully_authorized()
$$;
revoke all on function public.get_my_outgoing_call_decision(uuid) from public,anon;
grant execute on function public.get_my_outgoing_call_decision(uuid) to authenticated;
notify pgrst,'reload schema';
