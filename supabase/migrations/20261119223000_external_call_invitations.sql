-- Only a trusted provider adapter can submit an invitation after authenticating
-- the provider, mapping both identities and validating its participant URL.
create table private.external_call_invitations (
  id uuid primary key default gen_random_uuid(),
  capability text not null references private.external_call_connections(capability),
  provider_ref text not null check (length(provider_ref) between 1 and 256),
  caller_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  caller_name text not null,
  join_url text,
  expires_at timestamptz not null,
  decision text check (decision in ('accepted','declined')),
  unique (capability, provider_ref, recipient_id),
  check (caller_id <> recipient_id)
);
revoke all on private.external_call_invitations from public, anon, authenticated;
create index external_call_invitations_inbox on private.external_call_invitations(recipient_id, expires_at);
create index external_call_invitations_expiry on private.external_call_invitations(expires_at);

create function public.deliver_external_call_invitation(p_capability text,p_provider_ref text,
  p_caller_id uuid,p_recipient_id uuid,p_join_url text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_name text;
  invitation_id uuid;
begin
  if not exists (select 1 from private.external_call_connections c where c.capability=p_capability
    and c.endpoint<>'' and c.secret_id is not null) then
    raise exception 'Connection unavailable';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now()+interval '10 minutes'
     or p_join_url is null or length(p_join_url)>8192 or p_join_url !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[^[:space:][:cntrl:]]*)?$'
     or strpos(p_join_url,chr(92))>0 then raise exception 'Invalid invitation'; end if;
  select coalesce(nullif(p.full_name,''),'همکار شما') into strict caller_name from public.profiles p
    where p.user_id=p_caller_id and p.is_active and p.account_status='ACTIVE';
  perform 1 from public.profiles where user_id=p_recipient_id and is_active and account_status='ACTIVE';
  if not found then raise exception 'Recipient unavailable'; end if;
  insert into private.external_call_invitations(capability,provider_ref,caller_id,recipient_id,caller_name,join_url,expires_at)
    values (p_capability,p_provider_ref,p_caller_id,p_recipient_id,caller_name,p_join_url,p_expires_at)
    on conflict (capability,provider_ref,recipient_id) do nothing returning id into invitation_id;
  if invitation_id is null then
    select id into strict invitation_id from private.external_call_invitations where
      capability=p_capability and provider_ref=p_provider_ref and recipient_id=p_recipient_id and caller_id=p_caller_id;
    return invitation_id;
  end if;
  insert into public.notifications(user_id,title,message,type,sender_id,sender_name,action_url,entity_type,entity_id,metadata)
    values (p_recipient_id,case p_capability when 'conference' then 'دعوت به ویدئوکنفرانس' when 'video' then 'تماس تصویری ورودی' else 'تماس صوتی ورودی' end,
      caller_name || ' شما را دعوت کرده است. برای پاسخ، اسپارک را باز کنید.', 'chat', p_caller_id,caller_name,'chat','external_call_invitation',invitation_id,jsonb_build_object('expires_at',p_expires_at));
  return invitation_id;
end;
$$;
revoke all on function public.deliver_external_call_invitation(text,text,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.deliver_external_call_invitation(text,text,uuid,uuid,text,timestamptz) to service_role;

create function public.my_pending_external_calls()
returns table(id uuid, caller_name text, capability text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id,i.caller_name,i.capability,i.expires_at from private.external_call_invitations i
  where i.recipient_id=auth.uid() and i.decision is null and i.expires_at>now()
    and private.is_current_session_fully_authorized()
  order by i.expires_at,i.id
$$;

create function public.answer_external_call_invitation(p_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  invitation private.external_call_invitations;
  choice text := case when p_accept then 'accepted' else 'declined' end;
begin
  if p_accept is null or auth.uid() is null or not coalesce(private.is_current_session_fully_authorized(),false)
    then raise exception 'Access denied' using errcode='42501'; end if;
  select * into invitation from private.external_call_invitations where id=p_id and recipient_id=auth.uid() for update;
  if not found or invitation.expires_at<=clock_timestamp() or (invitation.decision is not null and invitation.decision<>choice)
    then raise exception 'Invitation unavailable' using errcode='P0002'; end if;
  if invitation.decision is null then
    update private.external_call_invitations set decision=choice,join_url=case when p_accept then join_url end where id=p_id;
    update public.notifications set read=true,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('decision',choice) where user_id=auth.uid() and entity_type='external_call_invitation' and entity_id=p_id;
  end if;
  return case when p_accept then invitation.join_url end;
end;
$$;
revoke all on function public.my_pending_external_calls(),public.answer_external_call_invitation(uuid,boolean) from public,anon;
grant execute on function public.my_pending_external_calls(),public.answer_external_call_invitation(uuid,boolean) to authenticated;

-- Remove expired bearer URLs even when there are no more incoming calls.
select cron.schedule('purge-expired-external-call-invitations','*/5 * * * *',
  $job$delete from private.external_call_invitations where expires_at<=now()$job$);
notify pgrst, 'reload schema';
