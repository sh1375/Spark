-- Keep an external recipient's schedule in the message itself. Split long
-- invitations into numbered jobs and preserve the prior schedule on each change.
CREATE FUNCTION private.external_meeting_occurrence_label(p_occurrence jsonb)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
 SELECT (ARRAY['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'])[extract(dow FROM local_date)::int+1]
  ||' '||replace(private.format_jalali_date(local_date),'-','/')
  ||coalesce('، ساعت '||nullif(p_occurrence->>'start_time',''),'')
  ||coalesce(' تا '||nullif(p_occurrence->>'end_time',''),'')
 FROM (SELECT private.meeting_local_date(p_occurrence->>'request_date') local_date) d
$$;

CREATE FUNCTION private.external_meeting_series_schedule(p_meetings jsonb,p_event text,p_part bigint,p_parts bigint)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
 SELECT CASE p_event
  WHEN 'invite' THEN
   'برنامه جلسات به وقت تهران'||CASE WHEN p_parts>1 THEN ' (بخش '||p_part||' از '||p_parts||')' ELSE '' END
   ||E':\n'||(SELECT string_agg(private.external_meeting_occurrence_label(m),E'\n' ORDER BY position)
                FROM jsonb_array_elements(p_meetings) WITH ORDINALITY AS x(m,position))
  WHEN 'change' THEN
   'زمان قبلی: '||private.external_meeting_occurrence_label(p_meetings->0->'_previous_schedule')
   ||E'\nزمان جدید: '||private.external_meeting_occurrence_label(p_meetings->0)||' (به وقت تهران)'
  WHEN 'cancel' THEN
   'زمان نوبت لغوشده: '||private.external_meeting_occurrence_label(p_meetings->0)||' (به وقت تهران)'
   ||E'\nزمان جایگزین تعیین نشده است.'
 END
$$;

REVOKE EXECUTE ON FUNCTION private.external_meeting_occurrence_label(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.external_meeting_series_schedule(jsonb,text,bigint,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.meeting_series_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_new jsonb:='[]'; v_old jsonb:='[]'; m jsonb; o jsonb; r record; v_event text; v_events jsonb:='[]'; v_scheduled boolean; v_old_scheduled boolean; v_important boolean;
begin
 if current_setting('spark.series_notify',true)='off' then return null; end if;
 if tg_op<>'DELETE' then select coalesce(jsonb_agg(to_jsonb(n)),'[]') into v_new from new_meetings n where n.series_id is not null; end if;
 if tg_op<>'INSERT' then select coalesce(jsonb_agg(to_jsonb(previous_row)),'[]') into v_old from old_meetings previous_row where previous_row.series_id is not null; end if;
 for m in select value from jsonb_array_elements(case when tg_op='DELETE' then v_old else v_new end) loop
  o:=null;
  if tg_op='UPDATE' then select value into o from jsonb_array_elements(v_old) where value->>'id'=m->>'id'; end if;
  v_scheduled:=nullif(m->>'start_time','') is not null and nullif(m->>'end_time','') is not null and m->>'status'<>'closed';
  v_old_scheduled:=o is not null and nullif(o->>'start_time','') is not null and nullif(o->>'end_time','') is not null and o->>'status'<>'closed';
  if tg_op='DELETE' then v_scheduled:=false; v_old_scheduled:=true; o:=m; end if;
  if not v_scheduled and not v_old_scheduled then continue; end if;
  v_important:=o is null or (private.meeting_local_date(m->>'request_date'),m->>'start_time',m->>'end_time',m->>'location',m->>'subject',m->>'is_online',m->>'conference_room_id') is distinct from (private.meeting_local_date(o->>'request_date'),o->>'start_time',o->>'end_time',o->>'location',o->>'subject',o->>'is_online',o->>'conference_room_id');
  for r in
   with nr as (select * from private.meeting_recipients(m) where v_scheduled), orr as (select * from private.meeting_recipients(o) where v_old_scheduled)
   select coalesce(nr.identity,orr.identity) identity,coalesce(nr.recipient_id,orr.recipient_id) recipient_id,coalesce(nr.target_phone,orr.target_phone) target_phone,coalesce(nr.audience,orr.audience) audience,nr.identity is not null present,orr.identity is not null was_present
   from nr full join orr using(identity)
  loop
   v_event:=case when not r.present then 'cancel' when not r.was_present then 'invite' when v_important then 'change' else null end;
   if v_event is null then continue; end if;
   v_events:=v_events||jsonb_build_array(jsonb_build_object('series',m->>'series_id','event',v_event,'identity',r.identity,'recipient',r.recipient_id,'phone',r.target_phone,'audience',r.audience,'actor',m->>'user_id','meeting',case when v_event='cancel' then coalesce(o,m) when v_event='change' and r.target_phone is not null then
    m||jsonb_build_object('_previous_schedule',jsonb_build_object(
     'request_date',o->>'request_date','start_time',o->>'start_time','end_time',o->>'end_time'))
    else m end));
  end loop;
 end loop;
 perform private.queue_meeting_series_events(v_events);
 return null;
end $function$;

CREATE OR REPLACE FUNCTION private.queue_meeting_series_events(p_events jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g record; v_first jsonb; v_event text; v_context jsonb; v_key text; v_policy private.recurring_notification_policy; v_in_app boolean; v_sms boolean; v_id uuid; v_name text; v_rendered jsonb;
begin
 select * into v_policy from private.recurring_notification_policy;
 for g in
 with events as (
  select e->>'series' series,e->>'event' event,e->>'identity' identity,(e->>'recipient')::uuid recipient,
   e->>'phone' phone,e->>'audience' audience,(e->>'actor')::uuid actor,e->'meeting' meeting
  from jsonb_array_elements(p_events) e
 ), numbered as (
  select *,case
   when phone is not null and event='invite' then
    (row_number() over recipient_order-1)/5+1
   when event='reminder' or (phone is not null and event in ('change','cancel')) then
    row_number() over recipient_order
   else 0 end as batch,
   case when phone is not null and event='invite' then
    (count(*) over (partition by series,event,identity,recipient,phone,actor)+4)/5
   end as batch_count
  from events
  window recipient_order as (partition by series,event,identity,recipient,phone,actor
   order by private.meeting_local_date(meeting->>'request_date'),meeting->>'start_time',meeting->>'id')
 )
 select series,event,identity,recipient,phone,min(audience) audience,actor,batch,batch_count,
  jsonb_agg(meeting order by private.meeting_local_date(meeting->>'request_date'),meeting->>'start_time',meeting->>'id') meetings
 from numbered group by series,event,identity,recipient,phone,actor,batch,batch_count
 loop
  v_first:=g.meetings->0;
  v_event:='series_'||g.event;
  v_context:=private.meeting_series_message_context(g.meetings,v_event,g.recipient,nullif(current_setting('spark.series_pattern',true),''));
  if g.phone is not null then
   select c.name into v_name from public.contacts_email c
   where c.user_id=(v_first->>'user_id')::uuid and private.meeting_phone(c.phone)=g.phone
    and (coalesce(v_first->'external_participants','[]') ? c.name or coalesce(v_first->'external_informees','[]') ? c.name)
   order by case when coalesce(v_first->'external_participants','[]') ? c.name then 0 else 1 end,c.id limit 1;
   if nullif(btrim(v_name),'') is not null then
    v_context:=v_context||jsonb_build_object('full_name',v_name,'recipient_greeting',v_name||' گرامی','formal_recipient_greeting',v_name||' گرامی');
   end if;
  end if;
  if g.phone is not null and g.event in ('invite','change','cancel') then
   v_context:=v_context||jsonb_build_object(
    'external_schedule',private.external_meeting_series_schedule(g.meetings,g.event,g.batch,g.batch_count),
    'external_schedule_part',g.batch,'external_schedule_parts',g.batch_count);
  end if;
  v_in_app:=case when g.event='invite' then v_policy.invite_in_app when g.event='reminder' then v_policy.reminder_in_app else v_policy.change_in_app end;
  v_sms:=case when g.event='invite' then v_policy.invite_sms when g.event='reminder' then case when g.phone is not null then v_policy.external_reminder_sms else v_policy.reminder_sms end else v_policy.change_sms end;
  -- Recurring delivery uses the dedicated series policy for every audience.
  -- send_sms is a legacy single-meeting flag and is false in the request form.
  v_key:='series:'||g.series||':'||g.event||':'||txid_current()::text||':'||g.identity;
  if g.phone is not null and g.event in ('change','cancel') or g.batch_count>1 then
   v_key:=v_key||':'||(v_first->>'id');
  end if;
  if g.event='reminder' then v_key:='series-reminder:'||(v_first->>'id')||':'||md5(coalesce(v_first->>'request_date','')||coalesce(v_first->>'start_time','')||coalesce(v_first->>'reminder_minutes',''))||':'||g.identity; end if;
  insert into private.meeting_notification_jobs(event_key,series_id,event_type,audience,recipient_id,target_phone,actor_id,meetings,context,status)
  values(v_key,g.series::uuid,v_event,g.audience,g.recipient,g.phone,coalesce(auth.uid(),g.actor),g.meetings,v_context,case when v_sms then 'pending' else 'skipped' end)
  on conflict(event_key) do nothing returning id into v_id;
  if v_id is null then continue; end if;
  if v_in_app and g.recipient is not null and exists(
   select from public.notification_templates where category='meeting' and event_type=v_event
   and audience in(g.audience,'all') and is_active) then
   v_rendered:=private.render_notification_template('meeting',v_event,g.audience,v_context);
   insert into public.notifications(user_id,title,message,type,read,sender_id,action_url,template_id,template_category,template_event_type,template_audience,event_key,metadata)
   values(g.recipient,v_rendered->>'title',v_rendered->>'message','meeting',false,coalesce(auth.uid(),g.actor),'calendar',(v_rendered->>'template_id')::uuid,'meeting',v_event,g.audience,v_key||':in_app',v_context)
   on conflict(event_key) where event_key is not null do nothing;
   INSERT INTO private.meeting_notification_jobs(event_key,series_id,event_type,audience,recipient_id,actor_id,meetings,context,status,channel)
   VALUES(v_key||':bale',g.series::uuid,v_event,g.audience,g.recipient,coalesce(auth.uid(),g.actor),g.meetings,
    v_context||jsonb_build_object('notification_title',v_rendered->>'title','notification_message',v_rendered->>'message'),'pending','bale')
   ON CONFLICT(event_key) DO NOTHING;
  end if;
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.claim_meeting_delivery_jobs(p_limit integer, p_actor_id uuid DEFAULT NULL::uuid, p_series_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j private.meeting_notification_jobs; v_valid jsonb; v_context jsonb; v_policy private.recurring_notification_policy; v_allowed boolean; v_rendered jsonb;
begin
 select * into v_policy from private.recurring_notification_policy;
 -- A lost worker response may already have delivered SMS. Never blindly retry it.
 update private.meeting_notification_jobs set status='uncertain',last_error='DELIVERY_OUTCOME_UNKNOWN',processed_at=now() where status='processing' and available_at<now()-interval '5 minutes' AND (p_actor_id IS NULL OR actor_id=p_actor_id) AND (p_series_id IS NULL OR series_id=p_series_id) AND (p_channel IS NULL OR channel=p_channel);
 for j in select * from private.meeting_notification_jobs where status='pending' and available_at<=now() AND (p_actor_id IS NULL OR actor_id=p_actor_id) AND (p_series_id IS NULL OR series_id=p_series_id) AND (p_channel IS NULL OR channel=p_channel) order by created_at limit least(greatest(p_limit,1),100) for update skip locked loop
  v_valid:=null; v_context:=null;
  v_allowed:=case when j.channel='bale' then case j.event_type when 'series_invite' then v_policy.invite_in_app when 'series_reminder' then v_policy.reminder_in_app else v_policy.change_in_app end when j.event_type='series_invite' then v_policy.invite_sms when j.event_type='series_reminder' then case when j.target_phone is not null then v_policy.external_reminder_sms else v_policy.reminder_sms end else v_policy.change_sms end;
  if j.event_type<>'series_cancel' then
   select jsonb_agg(
    case when e ? '_previous_schedule' then
     to_jsonb(m)||jsonb_build_object('_previous_schedule',e->'_previous_schedule')
    else to_jsonb(m) end order by m.request_local_date,m.start_time,m.id) into v_valid from jsonb_array_elements(j.meetings) e join public.meetings m on m.id=(e->>'id')::uuid
   where m.series_id=j.series_id and m.status<>'closed' and exists(select 1 from private.meeting_recipients(to_jsonb(m)) r where r.recipient_id=j.recipient_id or r.target_phone=j.target_phone)
   and (m.request_local_date,m.start_time,m.end_time,m.location,m.subject,m.is_online,m.conference_room_id) is not distinct from (private.meeting_local_date(e->>'request_date'),e->>'start_time',e->>'end_time',e->>'location',e->>'subject',(e->>'is_online')::boolean,nullif(e->>'conference_room_id','')::uuid)
   and (j.event_type<>'series_reminder' or not exists(select 1 from public.meeting_inbox i where i.meeting_id=m.id and i.user_id=j.recipient_id and i.status in ('pending','declined')))
   and (j.event_type<>'series_reminder' or ((private.meeting_local_date(m.request_date)+m.start_time::time) at time zone 'Asia/Tehran')>now());
   if v_valid is null then v_allowed:=false; end if;
  end if;
  if not v_allowed then update private.meeting_notification_jobs set status='skipped',processed_at=now(),last_error='POLICY_DISABLED_OR_EVENT_SUPERSEDED' where id=j.id; continue; end if;
  if v_valid is not null then v_context:=private.meeting_series_message_context(v_valid,j.event_type,j.recipient_id,j.context->>'series_pattern'); end if;
  -- Keep the external recipient name from the event snapshot when refreshing dates.
  if j.target_phone is not null and v_context is not null then
   v_context:=v_context||jsonb_build_object(
    'full_name',coalesce(nullif(j.context->>'full_name',''),v_context->>'full_name'),
    'recipient_greeting',coalesce(nullif(j.context->>'recipient_greeting',''),v_context->>'recipient_greeting'),
    'formal_recipient_greeting',coalesce(nullif(j.context->>'formal_recipient_greeting',''),v_context->>'formal_recipient_greeting'));
  end if;
  if j.target_phone is not null and v_valid is not null and j.context ? 'external_schedule' then
   v_context:=v_context||jsonb_build_object(
    'external_schedule',private.external_meeting_series_schedule(
     v_valid,substring(j.event_type from 8),(j.context->>'external_schedule_part')::bigint,
     (j.context->>'external_schedule_parts')::bigint),
    'external_schedule_part',j.context->'external_schedule_part',
    'external_schedule_parts',j.context->'external_schedule_parts');
  end if;
  IF j.channel='bale' AND j.event_type<>'series_cancel' THEN
   IF NOT EXISTS(SELECT FROM public.notification_templates WHERE category='meeting' AND event_type=j.event_type AND audience IN(j.audience,'all') AND is_active) THEN
    UPDATE private.meeting_notification_jobs SET status='skipped',processed_at=now(),last_error='NOTIFICATION_TEMPLATE_DISABLED' WHERE id=j.id; CONTINUE;
   END IF;
   v_rendered:=private.render_notification_template('meeting',j.event_type,j.audience,coalesce(v_context,j.context));
   v_context:=coalesce(v_context,j.context)||jsonb_build_object('notification_title',v_rendered->>'title','notification_message',v_rendered->>'message');
  END IF;
  update private.meeting_notification_jobs set meetings=coalesce(v_valid,j.meetings),context=coalesce(v_context,j.context),status='processing',attempts=attempts+1,available_at=now(),lease=gen_random_uuid() where id=j.id returning * into j;
  return next to_jsonb(j)-'meetings';
 end loop;
end $function$;
