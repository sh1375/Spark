-- An operator supplies the verified occurrence IDs in their original order.
-- Leave this administrative operation private and do not infer membership from titles.
CREATE FUNCTION private.link_legacy_meeting_series(p_owner uuid, p_ordered_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_series uuid;
  v_count integer;
  v_previous_series text := current_setting('spark.creating_series', true);
  v_previous_notify text := current_setting('spark.series_notify', true);
BEGIN
  IF p_owner IS NULL OR coalesce(cardinality(p_ordered_ids), 0) NOT BETWEEN 2 AND 600
    OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_ids) AS selected(id)) <> cardinality(p_ordered_ids)
  THEN
    RAISE EXCEPTION 'INVALID_LEGACY_SERIES' USING ERRCODE = '22023';
  END IF;

  PERFORM m.id FROM public.meetings m
  WHERE m.id = ANY(p_ordered_ids) AND m.user_id = p_owner
  ORDER BY m.id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_ordered_ids) THEN
    RAISE EXCEPTION 'LEGACY_SERIES_OWNER_OR_OCCURRENCE_MISMATCH' USING ERRCODE = '22023';
  END IF;

  SELECT b.id INTO v_series FROM private.meeting_series_batches b
  WHERE b.owner_id = p_owner AND b.meeting_ids = p_ordered_ids
    AND NOT EXISTS (
      SELECT FROM public.meetings m WHERE m.id = ANY(p_ordered_ids) AND m.series_id IS DISTINCT FROM b.id
    );
  IF v_series IS NOT NULL THEN RETURN v_series; END IF;

  IF EXISTS (
    SELECT FROM public.meetings m WHERE m.id = ANY(p_ordered_ids)
      AND (m.series_id IS NOT NULL OR coalesce(m.repeat_type, 'none') NOT IN ('weekly', 'monthly'))
  ) THEN
    RAISE EXCEPTION 'LEGACY_SERIES_REQUIRES_UNLINKED_REPEATING_MEETINGS' USING ERRCODE = '22023';
  END IF;

  v_series := gen_random_uuid();
  INSERT INTO private.meeting_series_batches (id, owner_id, request_hash, meeting_ids)
  VALUES (v_series, p_owner, 'legacy-link:' || v_series::text, p_ordered_ids);

  PERFORM set_config('spark.creating_series', v_series::text, true);
  PERFORM set_config('spark.series_notify', 'off', true);

  UPDATE public.meetings m SET series_id = v_series
  WHERE m.id = ANY(p_ordered_ids) AND m.user_id = p_owner AND m.series_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_ordered_ids) THEN
    RAISE EXCEPTION 'LEGACY_SERIES_CHANGED_DURING_LINK' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('spark.creating_series', coalesce(v_previous_series, ''), true);
  PERFORM set_config('spark.series_notify', coalesce(v_previous_notify, ''), true);
  RETURN v_series;
END
$$;

REVOKE ALL ON FUNCTION private.link_legacy_meeting_series(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
