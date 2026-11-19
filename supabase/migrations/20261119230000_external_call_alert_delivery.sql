alter table private.external_call_connections add column alert_timing text not null default 'immediate'
  check (alert_timing in ('immediate','unanswered'));

create function public.get_external_call_connections_v2() returns table
(capability text, endpoint text, has_key boolean, sms_enabled boolean, bale_enabled boolean,
 sms_template text, bale_template text, alert_timing text)
language sql security definer set search_path='' as $$
 select s.*, c.alert_timing from public.get_external_call_connections() s
 join private.external_call_connections c using(capability) order by s.capability
$$;
create function public.save_external_call_connection_v2(p_capability text,p_endpoint text,p_key text,
 p_sms_enabled boolean,p_bale_enabled boolean,p_sms_template text,p_bale_template text,p_alert_timing text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.save_external_call_connection(p_capability,p_endpoint,p_key,p_sms_enabled,p_bale_enabled,p_sms_template,p_bale_template);
 update private.external_call_connections set alert_timing=p_alert_timing where capability=p_capability;
end;
$$;
revoke all on function public.get_external_call_connections_v2(),public.save_external_call_connection_v2(text,text,text,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.get_external_call_connections_v2(),public.save_external_call_connection_v2(text,text,text,boolean,boolean,text,text,text) to authenticated;

create table private.external_call_alert_jobs(
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null references private.external_call_invitations on delete cascade,
 channel text not null check(channel in ('sms','bale')), message text not null, available_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','skipped','failed','uncertain')),
 result_code text, unique(invitation_id,channel)
);
revoke all on private.external_call_alert_jobs from public,anon,authenticated;
create index external_call_alert_ready on private.external_call_alert_jobs(available_at) where status='pending';

-- An empty queue never starts an Edge invocation. Keep this credential scoped
-- to waking the dispatcher, independent of provider and user credentials.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'external_call_alert_worker_token');
create function private.wake_external_call_alert_worker() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from private.external_call_alert_jobs j join private.external_call_invitations i on i.id=j.invitation_id
   where status='pending' and available_at<=clock_timestamp() and i.decision is null and i.expires_at>clock_timestamp()) then return; end if;
 endpoint:=coalesce(nullif(private.safe_vault_secret('external_call_alert_worker_url'),''),
   regexp_replace(nullif(private.safe_vault_secret('meeting_notification_worker_url'),''),'/send-sms$','/external-call-alert-worker'),
   regexp_replace(nullif(private.safe_vault_secret('pwa_push_function_url'),''),'/pwa-push-worker$','/external-call-alert-worker'));
 if endpoint is null or endpoint !~ '^https://[^/?#@[:space:]]+/functions/v1/external-call-alert-worker$' then return; end if;
 token:=private.safe_vault_secret('external_call_alert_worker_token');
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Call-Alert-Token',token), body:='{}'::jsonb);
exception when others then raise warning 'Call alert wake failed; scheduled retry pending';
end;
$$;
revoke all on function private.wake_external_call_alert_worker() from public,anon,authenticated;

create function private.queue_external_call_alerts() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.external_call_alert_jobs(invitation_id,channel,message,available_at)
 select new.id, ch.name, replace(ch.template,'{caller}',new.caller_name),
   now()+case when c.alert_timing='unanswered' then interval '30 seconds' else interval '0' end
 from private.external_call_connections c cross join lateral (values
    ('sms',c.sms_enabled,c.sms_template),('bale',c.bale_enabled,c.bale_template)) ch(name,enabled,template)
 where c.capability=new.capability and ch.enabled;
 if found then perform private.wake_external_call_alert_worker(); end if;
 return new;
end;
$$;
revoke all on function private.queue_external_call_alerts() from public,anon,authenticated;
create trigger external_call_alert_channels after insert on private.external_call_invitations
 for each row execute function private.queue_external_call_alerts();
select cron.schedule('dispatch-external-call-alerts','10 seconds','select private.wake_external_call_alert_worker()');

create function public.claim_external_call_alerts(p_token text) returns table
(id uuid, channel text, message text, recipient_id uuid, phone text, expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if nullif(p_token,'') is null or p_token is distinct from private.safe_vault_secret('external_call_alert_worker_token')
 then raise exception 'Unauthorized' using errcode='42501'; end if;
 return query with batch as (
 select j.id from private.external_call_alert_jobs j join private.external_call_invitations i on j.invitation_id=i.id
 join private.external_call_connections c on c.capability=i.capability
 join public.profiles p on p.user_id=i.recipient_id and p.is_active and p.account_status='ACTIVE'
 where j.status='pending' and j.available_at<=clock_timestamp() and i.decision is null and i.expires_at>clock_timestamp()
 and case j.channel when 'sms' then c.sms_enabled else c.bale_enabled end
 order by j.available_at,j.id limit 20 for update of j skip locked
 ), claimed as (update private.external_call_alert_jobs j set status='processing' from batch b where j.id=b.id returning j.*)
 select j.id,j.channel,j.message,i.recipient_id,case when j.channel='sms' then p.phone::text end,i.expires_at
 from claimed j join private.external_call_invitations i on i.id=j.invitation_id join public.profiles p on p.user_id=i.recipient_id;
end;
$$;
create function public.finish_external_call_alert(p_id uuid,p_status text,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','skipped','failed','uncertain') then raise exception 'Invalid result'; end if;
 update private.external_call_alert_jobs set status=p_status,result_code=left(p_code,80) where id=p_id and status='processing';
end;
$$;
revoke all on function public.claim_external_call_alerts(text),public.finish_external_call_alert(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_external_call_alerts(text),public.finish_external_call_alert(uuid,text,text) to service_role;
notify pgrst,'reload schema';
