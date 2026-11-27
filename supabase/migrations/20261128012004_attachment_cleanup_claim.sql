BEGIN;

-- Durable reservations prevent reattaching a path after cleanup claims it.
CREATE TABLE private.minutes_attachment_cleanup_reservations (
  storage_path text PRIMARY KEY,
  attachment_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.minutes_attachment_cleanup_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.minutes_attachment_cleanup_reservations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.reject_reserved_minutes_attachment_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.minutes_attachment_cleanup_reservations r
    WHERE r.storage_path = NEW.storage_path AND r.attachment_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'ATTACHMENT_PATH_RESERVED' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.minutes_attachment_cleanup_reservations r
    WHERE r.storage_path = NEW.storage_path
  ) AND (TG_OP = 'INSERT' OR NEW.upload_status IS DISTINCT FROM 'cleanup_claimed') THEN
    RAISE EXCEPTION 'ATTACHMENT_PATH_RESERVED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.reject_reserved_minutes_attachment_path() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reject_reserved_minutes_attachment_path
BEFORE INSERT OR UPDATE OF storage_path, upload_status ON public.minutes_attachments
FOR EACH ROW EXECUTE FUNCTION private.reject_reserved_minutes_attachment_path();

CREATE FUNCTION public.claim_stale_minutes_attachments_service(p_max_age_hours integer DEFAULT 24)
RETURNS TABLE(id uuid, storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF p_max_age_hours IS NULL OR p_max_age_hours < 24 OR p_max_age_hours > 87600 THEN
    RAISE EXCEPTION 'INVALID_CLEANUP_AGE' USING ERRCODE='22023';
  END IF;
  -- Serialize path reservation with all metadata writes. Keep the lock only
  -- during this bounded database transaction, never during Storage requests.
  LOCK TABLE public.minutes_attachments IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO private.minutes_attachment_cleanup_reservations(storage_path, attachment_id)
  SELECT a.storage_path, a.id
  FROM public.minutes_attachments a
  WHERE a.upload_status = 'pending_upload' AND a.deleted_at IS NULL
    AND a.created_at < clock_timestamp() - make_interval(hours => p_max_age_hours)
    AND a.storage_path LIKE 'minutes/' || a.minute_id::text || '/' || a.id::text || '/%'
    AND NOT EXISTS (SELECT 1 FROM public.minutes_attachments other
                    WHERE other.storage_path = a.storage_path AND other.id <> a.id)
  ORDER BY a.created_at, a.id LIMIT 100
  ON CONFLICT ON CONSTRAINT minutes_attachment_cleanup_reservations_pkey DO NOTHING;

  UPDATE public.minutes_attachments a SET upload_status='cleanup_claimed'
  FROM private.minutes_attachment_cleanup_reservations reservation
  WHERE a.id=reservation.attachment_id AND a.storage_path=reservation.storage_path
    AND a.upload_status='pending_upload';

  RETURN QUERY SELECT a.id, a.storage_path
  FROM public.minutes_attachments a
  JOIN private.minutes_attachment_cleanup_reservations reservation
    ON reservation.attachment_id=a.id AND reservation.storage_path=a.storage_path
  WHERE a.upload_status='cleanup_claimed' AND a.deleted_at IS NULL
  ORDER BY a.created_at, a.id LIMIT 100;
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_stale_minutes_attachments_service(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_minutes_attachments_service(integer) TO service_role;

CREATE OR REPLACE FUNCTION private.finalize_minutes_attachment(p_attachment_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_minute_id uuid;
  v_storage_path text;
  v_expected_size bigint;
  v_expected_mime text;
  v_filename text;
  v_obj_size bigint;
  v_obj_mime text;
  v_obj_metadata jsonb;
  v_upload_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  LOCK TABLE public.minutes_attachments IN ROW EXCLUSIVE MODE;
  select minute_id, storage_path, size_bytes, mime_type, original_filename, upload_status
    into v_minute_id, v_storage_path, v_expected_size, v_expected_mime, v_filename, v_upload_status
    from public.minutes_attachments
    where id = p_attachment_id and deleted_at is null FOR UPDATE;

  if v_minute_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.is_current_user_admin() then
    perform 1
      from public.minutes_attachments
      where id = p_attachment_id
        and uploaded_by_user_id = auth.uid();
    if not found then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  end if;

  IF v_upload_status NOT IN ('pending_upload','ready') OR v_upload_status IS NULL THEN
    RAISE EXCEPTION 'ATTACHMENT_NOT_PENDING' USING errcode='P0002';
  END IF;

  begin
    select (metadata->>'size')::bigint, metadata->>'mimetype', metadata
      into v_obj_size, v_obj_mime, v_obj_metadata
      from storage.objects
      where bucket_id = 'minutes-attachments'
        and name = v_storage_path;
  exception when others then
    raise exception 'OBJECT_NOT_FOUND' using errcode = 'P0002';
  end;

  if v_obj_size is null then
    raise exception 'OBJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if abs(v_obj_size - v_expected_size) > 1024 then
    raise exception 'SIZE_MISMATCH expected=% actual=%', v_expected_size, v_obj_size
      using errcode = '23514';
  end if;

  IF v_upload_status = 'ready' THEN
    RETURN jsonb_build_object('success',true,'attachment_id',p_attachment_id);
  END IF;

  update public.minutes_attachments
    set upload_status = 'ready'
    where id = p_attachment_id;

  perform public._write_minutes_audit(
    v_minute_id,
    'attachment_uploaded',
    'attachment',
    p_attachment_id,
    null,
    null,
    jsonb_build_object(
      'filename', v_filename,
      'size', v_obj_size,
      'mime', v_expected_mime
    ),
    null
  );

  return jsonb_build_object('success', true, 'attachment_id', p_attachment_id);
end;
$$;

COMMIT;
