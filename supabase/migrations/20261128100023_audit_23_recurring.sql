CREATE OR REPLACE FUNCTION public.finish_meeting_notification_job(
  p_id uuid, p_lease uuid, p_status text, p_error text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_status NOT IN ('sent', 'skipped', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'INVALID_JOB_STATUS';
  END IF;

  UPDATE private.meeting_notification_jobs
  SET status = p_status, processed_at = now(), last_error = left(p_error, 1000)
  WHERE id = p_id AND lease = p_lease AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEETING_NOTIFICATION_JOB_LEASE_MISMATCH';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.postpone_meeting_notification_job(
  p_id uuid, p_lease uuid, p_available_at timestamp with time zone
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE private.meeting_notification_jobs
  SET status = 'pending',
      available_at = greatest(p_available_at, now() + interval '1 minute'),
      lease = NULL,
      last_error = 'DEFERRED_BY_SMS_POLICY'
  WHERE id = p_id AND lease = p_lease AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEETING_NOTIFICATION_JOB_LEASE_MISMATCH';
  END IF;
END;
$$;
