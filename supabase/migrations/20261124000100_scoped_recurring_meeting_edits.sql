CREATE FUNCTION private.recurring_occurrence_has_started(p_date text, p_time text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE WHEN p_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    THEN ((private.meeting_local_date(p_date) + p_time::time) AT TIME ZONE 'Asia/Tehran') <= now()
    ELSE private.meeting_local_date(p_date) < (now() AT TIME ZONE 'Asia/Tehran')::date
  END
$$;

REVOKE ALL ON FUNCTION private.recurring_occurrence_has_started(text, text) FROM PUBLIC, anon;

-- Creation records the original occurrence order even if a meeting is later moved.
CREATE FUNCTION private.editable_meeting_series_ids(p_meeting_id uuid, p_scope text)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_position integer;
  v_series uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('following', 'all') THEN
    RAISE EXCEPTION 'INVALID_SERIES_SCOPE' USING ERRCODE = '22023';
  END IF;

  SELECT b.meeting_ids, b.id INTO v_ids, v_series
  FROM private.meeting_series_batches b
  JOIN public.meetings m ON m.series_id = b.id AND m.user_id = b.owner_id
  WHERE m.id = p_meeting_id AND b.owner_id = auth.uid();

  v_position := array_position(v_ids, p_meeting_id);
  IF v_position IS NULL THEN
    RAISE EXCEPTION 'SERIES_ORDER_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'all' THEN RETURN v_ids; END IF;

  RETURN ARRAY(
    SELECT m.id FROM unnest(v_ids[v_position:]) WITH ORDINALITY AS occurrence(id, position)
    JOIN public.meetings m ON m.id = occurrence.id AND m.series_id = v_series AND m.user_id = auth.uid()
    WHERE m.id = p_meeting_id
      OR (m.status <> 'closed' AND NOT coalesce(private.recurring_occurrence_has_started(m.request_date, m.start_time), false))
    ORDER BY occurrence.position
  );
END
$$;

REVOKE ALL ON FUNCTION private.editable_meeting_series_ids(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.editable_meeting_series_ids(uuid, text) TO authenticated;

CREATE FUNCTION public.update_meeting_series_scope_v1(
  p_meeting_id uuid, p_scope text, p_patch jsonb, p_recipients jsonb, p_notify boolean
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_series uuid;
  v_field text;
  v_delta jsonb;
  v_recipients jsonb := '{}'::jsonb;
  v_columns text;
  v_values text;
  v_count integer;
  v_updated integer;
  v_previous_notify text := current_setting('spark.series_notify', true);
  v_previous_scoped text := current_setting('spark.series_future_notices', true);
BEGIN
  v_ids := private.editable_meeting_series_ids(p_meeting_id, p_scope);
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_recipients) IS DISTINCT FROM 'object'
    OR EXISTS (
      SELECT FROM jsonb_object_keys(p_patch) AS f(field)
      WHERE f.field NOT IN ('subject','location','representative','phone','notes','priority',
        'start_time','end_time','repeat_type','repeat_interval','repeat_end_date','repeat_weekday',
        'reminder_minutes','send_sms','meeting_manager','calendar_id','members_only','is_online')
    ) THEN
    RAISE EXCEPTION 'INVALID_SERIES_PATCH' USING ERRCODE = '22023';
  END IF;

  FOR v_field, v_delta IN SELECT key, value FROM jsonb_each(p_recipients) LOOP
    IF v_field NOT IN ('participant_user_ids','notify_users','external_participants','external_informees')
      OR jsonb_typeof(v_delta->'add') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_delta->'remove') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'INVALID_SERIES_RECIPIENTS' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_delta->'add') + jsonb_array_length(v_delta->'remove') > 0 THEN
      v_recipients := v_recipients || jsonb_build_object(v_field, v_delta);
    END IF;
  END LOOP;

  IF p_patch ?| ARRAY['start_time','end_time'] THEN
    -- Derive the display duration from each occurrence's final times.
    p_patch := p_patch || '{"duration":null}'::jsonb;
  END IF;
  SELECT string_agg(quote_ident(field), ','),
         string_agg(CASE WHEN field = 'duration' THEN
           'case when nullif(r.start_time,'''') is not null and nullif(r.end_time,'''') is not null then r.start_time||'' - ''||r.end_time else '''' end'
           ELSE 'r.' || quote_ident(field) END, ',')
  INTO v_columns, v_values
  FROM jsonb_object_keys(p_patch || v_recipients) AS f(field);
  IF v_columns IS NULL THEN RETURN 0; END IF;

  SELECT series_id INTO STRICT v_series FROM public.meetings
  WHERE id = p_meeting_id AND user_id = auth.uid();
  -- Deleted occurrences leave an entry in the creation batch. Update only
  -- surviving, owned rows. Acquire locks in a consistent order.
  PERFORM id FROM public.meetings
  WHERE id = ANY(v_ids) AND series_id = v_series AND user_id = auth.uid()
  ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('spark.series_notify', CASE WHEN p_notify THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('spark.series_future_notices', 'on', true);

  -- One UPDATE statement lets the existing transition-table trigger group
  -- the changed occurrences into a recipient-specific notification.
  EXECUTE format($update$
    UPDATE public.meetings m SET (%s) = (
      SELECT %s
      FROM jsonb_populate_record(m, $1 || coalesce((
        SELECT jsonb_object_agg(d.field, (
          SELECT coalesce(jsonb_agg(items.item ORDER BY items.position), '[]'::jsonb)
          FROM (
            SELECT old.item, old.position
            FROM jsonb_array_elements(coalesce(nullif(to_jsonb(m)->d.field, 'null'::jsonb), '[]'::jsonb))
              WITH ORDINALITY AS old(item, position)
            WHERE NOT ((d.delta->'remove') @> jsonb_build_array(old.item))
            UNION ALL
            SELECT added.item, 1000000000 + added.position
            FROM jsonb_array_elements(d.delta->'add') WITH ORDINALITY AS added(item, position)
            WHERE NOT coalesce((to_jsonb(m)->d.field) @> jsonb_build_array(added.item), false)
          ) items
        ))
        FROM jsonb_each($2) AS d(field, delta)
      ), '{}'::jsonb)) r
    )
    WHERE m.id = ANY($3) AND m.series_id = $4 AND m.user_id = auth.uid()
  $update$, v_columns, v_values) USING p_patch, v_recipients, v_ids, v_series;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_count THEN
    RAISE EXCEPTION 'SERIES_CHANGED_DURING_EDIT' USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('spark.series_notify', coalesce(v_previous_notify, ''), true);
  PERFORM set_config('spark.series_future_notices', coalesce(v_previous_scoped, ''), true);
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.update_meeting_series_scope_v1(uuid, text, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_meeting_series_scope_v1(uuid, text, jsonb, jsonb, boolean) TO authenticated;

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
  IF tg_op = 'UPDATE' AND current_setting('spark.series_future_notices', true) = 'on'
    AND private.recurring_occurrence_has_started(o->>'request_date', o->>'start_time')
  THEN CONTINUE; END IF;
  v_scheduled:=nullif(m->>'start_time','') is not null and nullif(m->>'end_time','') is not null and m->>'status'<>'closed';
  v_old_scheduled:=o is not null and nullif(o->>'start_time','') is not null and nullif(o->>'end_time','') is not null and o->>'status'<>'closed';
  if tg_op='DELETE' then v_scheduled:=false; v_old_scheduled:=true; o:=m; end if;
  if not v_scheduled and not v_old_scheduled then continue; end if;
  v_important:=o is null or (private.meeting_local_date(m->>'request_date'),m->>'start_time',m->>'end_time',m->>'location',m->>'subject',m->>'is_online',m->>'conference_room_id') is distinct from (private.meeting_local_date(o->>'request_date'),o->>'start_time',o->>'end_time',o->>'location',o->>'subject',o->>'is_online',o->>'conference_room_id');
  for r in
   with nr as (select * from private.meeting_recipients(m) where v_scheduled), orr as (select * from private.meeting_recipients(o) where v_old_scheduled)
   select coalesce(nr.identity,orr.identity) identity,coalesce(nr.recipient_id,orr.recipient_id) recipient_id,coalesce(nr.target_phone,orr.target_phone) target_phone,coalesce(nr.audience,orr.audience) audience, nr.audience IS DISTINCT FROM orr.audience role_changed,nr.identity is not null present,orr.identity is not null was_present
   from nr full join orr using(identity)
  loop
   v_event:=case when not r.present then 'cancel' when not r.was_present then 'invite' when v_important or r.role_changed then 'change' else null end;
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
