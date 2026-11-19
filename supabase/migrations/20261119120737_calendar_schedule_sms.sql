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
  if j.event_key LIKE 'calendar-schedule:%' then
   v_allowed:=exists(
    select 1 from public.meetings m
    cross join lateral private.meeting_recipients(to_jsonb(m)) r
    where m.id=j.series_id and m.series_id is null and m.status<>'closed'
      and r.target_phone=j.target_phone
      and (m.request_local_date,m.start_time,m.end_time) is not distinct from
          (private.meeting_local_date(j.meetings->0->>'request_date'),j.meetings->0->>'start_time',j.meetings->0->>'end_time')
   );
  elsif j.event_type<>'series_cancel' then
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
  if j.target_phone is not null and j.event_type='series_change' and jsonb_array_length(v_valid)=1 then
   v_context:=v_context||jsonb_build_object('meeting_id',v_valid->0->>'id');
  end if;
  if v_context is not null and j.context ? 'delivery_retry' then
   v_context:=v_context||jsonb_build_object('delivery_retry',j.context->'delivery_retry');
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

CREATE FUNCTION public.save_calendar_meeting_changes_v1(p_ids uuid[], p_patch jsonb, p_notify boolean)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_old public.meetings;
  v_new public.meetings;
  v_columns text;
  v_values text;
  v_previous_notify text := current_setting('spark.series_notify',true);
  v_previous jsonb;
  v_current jsonb;
  v_timing_changed boolean;
  v_updated integer := 0;
BEGIN
  IF v_user IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT p.is_admin INTO v_admin FROM public.profiles p WHERE p.user_id=v_user;
  IF cardinality(coalesce(p_ids,ARRAY[]::uuid[])) NOT BETWEEN 1 AND 600
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_UPDATE';
  END IF;
  IF EXISTS (
    SELECT FROM jsonb_object_keys(p_patch) k
    WHERE k <> ALL(ARRAY['subject','request_date','request_jalaali_date','duration','request_duration',
      'location','representative','phone','notes','priority','status','status_type','start_time','end_time',
      'notify_users','participant_user_ids','external_participants','external_informees','repeat_type',
      'repeat_interval','repeat_end_date','repeat_weekday','reminder_minutes','send_sms','meeting_manager',
      'calendar_id','members_only','is_online','conference_room_id'])
  ) THEN RAISE EXCEPTION 'INVALID_UPDATE_FIELD'; END IF;
  SELECT string_agg(quote_ident(k),',' ORDER BY k),string_agg('r.'||quote_ident(k),',' ORDER BY k)
    INTO v_columns,v_values FROM jsonb_object_keys(p_patch) k;
  IF v_columns IS NULL THEN RAISE EXCEPTION 'INVALID_UPDATE'; END IF;

  PERFORM set_config('spark.series_notify', CASE WHEN p_notify IS TRUE THEN 'on' ELSE 'off' END,true);
  FOR v_old IN SELECT * FROM public.meetings m WHERE m.id=ANY(p_ids)
    AND (m.user_id=v_user OR v_admin IS TRUE) ORDER BY m.id FOR UPDATE
  LOOP
    EXECUTE 'UPDATE public.meetings m SET ('||v_columns||')=(SELECT '||v_values||
      ' FROM jsonb_populate_record(m,$1) r) WHERE m.id=$2 RETURNING m.*'
      INTO STRICT v_new USING p_patch,v_old.id;
    v_updated:=v_updated+1;
    v_timing_changed:=nullif(v_old.start_time,'') IS NOT NULL AND nullif(v_old.end_time,'') IS NOT NULL
      AND nullif(v_new.start_time,'') IS NOT NULL AND nullif(v_new.end_time,'') IS NOT NULL
      AND v_old.status<>'closed' AND v_new.status<>'closed'
      AND (v_old.request_local_date,v_old.start_time,v_old.end_time) IS DISTINCT FROM
          (v_new.request_local_date,v_new.start_time,v_new.end_time);

    IF p_notify IS TRUE AND v_new.series_id IS NULL AND v_timing_changed THEN
      v_previous:=to_jsonb(v_old);
      v_current:=to_jsonb(v_new)||jsonb_build_object('_previous_schedule',v_previous);
      INSERT INTO private.meeting_notification_jobs(event_key,series_id,event_type,audience,target_phone,actor_id,meetings,context,status)
      SELECT 'calendar-schedule:'||v_new.id||':'||txid_current()||':'||r.identity,v_new.id,
        CASE WHEN r.audience='external_observers' THEN
          CASE WHEN old.target_phone IS NULL THEN 'informee_invite' ELSE 'informee_change' END
        ELSE CASE WHEN old.target_phone IS NULL THEN 'invite' ELSE 'change' END END,
        r.audience,r.target_phone,v_user,jsonb_build_array(v_current),
        private.meeting_series_message_context(jsonb_build_array(v_current),'series_change',NULL)
          ||jsonb_build_object('meeting_id',v_new.id,
            'external_schedule', CASE WHEN old.target_phone IS NOT NULL
              THEN private.external_meeting_series_schedule(jsonb_build_array(v_current),'change',NULL,NULL) END),
        'pending'
      FROM private.meeting_recipients(v_current) r
      LEFT JOIN private.meeting_recipients(v_previous) old ON old.target_phone=r.target_phone
      WHERE r.target_phone IS NOT NULL
      ON CONFLICT (event_key) DO NOTHING;
    END IF;
    RETURN NEXT jsonb_build_object('id',v_new.id,'series_id',v_new.series_id,'request_date',v_new.request_date,
      'start_time',v_new.start_time,'end_time',v_new.end_time,'duration',v_new.duration,'timing_changed',v_timing_changed);
  END LOOP;
  IF v_updated<>cardinality(p_ids) THEN RAISE EXCEPTION 'MEETING_NOT_SAVED' USING ERRCODE='42501'; END IF;
  PERFORM set_config('spark.series_notify',coalesce(v_previous_notify,''),true);
END;
$$;

CREATE FUNCTION public.retry_calendar_schedule_sms_v1(p_meeting_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  UPDATE private.meeting_notification_jobs j
  SET status='pending',available_at=now(),lease=NULL,processed_at=NULL,
    context=j.context||jsonb_build_object('delivery_retry',coalesce((j.context->>'delivery_retry')::integer,0)+1)
  FROM public.meetings m
  WHERE m.id=p_meeting_id AND j.actor_id=v_user AND (m.user_id=v_user OR EXISTS (
    SELECT FROM public.profiles p WHERE p.user_id=v_user AND p.is_admin IS TRUE))
    AND j.status='failed' AND j.target_phone IS NOT NULL AND jsonb_array_length(j.meetings)=1
    AND j.meetings->0->>'id'=m.id::text AND j.series_id=coalesce(m.series_id,m.id)
    AND (j.event_key LIKE 'calendar-schedule:%' OR j.event_type='series_change')
    AND j.context->>'external_schedule' LIKE 'زمان قبلی:%'
    AND (m.request_local_date,m.start_time,m.end_time) IS NOT DISTINCT FROM
      (private.meeting_local_date(j.meetings->0->>'request_date'),j.meetings->0->>'start_time',j.meetings->0->>'end_time');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_calendar_meeting_changes_v1(uuid[],jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.retry_calendar_schedule_sms_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_calendar_meeting_changes_v1(uuid[],jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_calendar_schedule_sms_v1(uuid) TO authenticated;
