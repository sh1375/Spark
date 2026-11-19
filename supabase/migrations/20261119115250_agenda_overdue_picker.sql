CREATE FUNCTION public.pick_meeting_agenda_decisions_v2(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_overdue_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result jsonb;
  v_today date := (now() AT TIME ZONE 'Asia/Tehran')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset < 0
    OR length(coalesce(p_search, '')) > 180 THEN
    RAISE EXCEPTION 'INVALID_PAGINATION_OR_SEARCH' USING ERRCODE = '22023';
  END IF;

  IF p_overdue_only IS NOT TRUE THEN
    RETURN private.pick_meeting_agenda_decisions_v1(
      p_search, p_status, p_owner_user_id, p_date_from, p_date_to, p_limit, p_offset
    );
  END IF;

  -- Apply the picker-specific filters to the same current rows as Follow-up.
  -- The picker still requires access to the original minute and paginates after filtering.
  WITH scoped AS (
    SELECT f.id, f.minute_id, d.parent_decision_id, d.clause_order,
      d.title, f.description, d.official_number AS decision_number,
      m.official_number AS minute_number, f.minute_title,
      f.meeting_date_snapshot AS meeting_date, f.status, f.priority,
      f.primary_owner_user_id, f.responsible_unit_name_snapshot, f.progress_percent,
      f.owner_name, f.due_date, v_today - f.due_date AS days_overdue
    FROM private.get_trackable_minutes_decisions(
      p_owner_user_id => p_owner_user_id,
      p_status => nullif(p_status, ''),
      p_deadline_state => 'overdue',
      p_limit => NULL
    ) f
    JOIN public.minutes_decisions d ON d.id = f.id
    JOIN public.minutes m ON m.id = f.minute_id
    WHERE private._user_can_view_minute(m.id)
      AND (p_date_from IS NULL OR f.meeting_date_snapshot >= p_date_from)
      AND (p_date_to IS NULL OR f.meeting_date_snapshot <= p_date_to)
      AND (nullif(btrim(p_search), '') IS NULL
        OR d.title ILIKE '%' || p_search || '%'
        OR f.minute_title ILIKE '%' || p_search || '%'
        OR f.meeting_date_snapshot ILIKE '%' || p_search || '%'
        OR m.official_number ILIKE '%' || p_search || '%'
        OR d.official_number ILIKE '%' || p_search || '%'
        OR f.owner_name ILIKE '%' || p_search || '%'
        OR d.clause_order::text = p_search)
  ), paged AS (
    SELECT * FROM scoped ORDER BY due_date, minute_id, id LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY due_date, minute_id, id) FROM paged), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_meeting_agenda_decisions_v2(text,text,uuid,text,text,integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_meeting_agenda_decisions_v2(text,text,uuid,text,text,integer,integer,boolean) TO authenticated;
