-- Requires the existing self-hosted function; do not create an unexpected overload.
DO $audit_guard$
BEGIN
  IF to_regprocedure('public.claim_phone_otp_login_challenge_v2(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline function missing';
  END IF;
END;
$audit_guard$;

CREATE OR REPLACE FUNCTION public.claim_phone_otp_login_challenge_v2(
  p_challenge_id uuid,
  p_otp_hash text,
  p_claim_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz;
  v_user_id uuid;
  v_phone_hash text;
  v_stored_otp_hash text;
  v_status text;
  v_delivery_status text;
  v_attempt_count integer;
  v_max_attempts integer;
  v_expires_at timestamptz;
  v_existing_claim_id uuid;
  v_existing_claim_expires_at timestamptz;
  v_challenge_found boolean;
  v_next_attempt_count integer;
  v_new_claim_expires_at timestamptz;
BEGIN
  IF p_challenge_id IS NULL OR p_otp_hash IS NULL OR p_claim_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CLAIM_CONFIGURATION' USING ERRCODE = '22023';
  END IF;

  IF p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_CLAIM_CONFIGURATION' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, phone_hash, otp_hash, status, delivery_status,
         attempt_count, max_attempts, expires_at, claim_id, claim_expires_at
  INTO v_user_id, v_phone_hash, v_stored_otp_hash, v_status, v_delivery_status,
       v_attempt_count, v_max_attempts, v_expires_at, v_existing_claim_id,
       v_existing_claim_expires_at
  FROM private.phone_otp_login_challenges_v2
  WHERE id = p_challenge_id
  FOR UPDATE;

  v_challenge_found := FOUND;
  v_now := clock_timestamp();

  IF NOT v_challenge_found THEN
    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'INVALID_CHALLENGE', 'attempts_remaining', null, 'claim_expires_at', null
    );
  END IF;

  IF v_delivery_status IS DISTINCT FROM 'sent' THEN
    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'DELIVERY_NOT_CONFIRMED', 'attempts_remaining', null, 'claim_expires_at', null
    );
  END IF;

  IF v_status = 'consumed' THEN
    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'ALREADY_CONSUMED', 'attempts_remaining', null, 'claim_expires_at', null
    );
  END IF;

  IF v_status = 'superseded' OR v_status = 'delivery_failed' THEN
    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'INVALID_CHALLENGE', 'attempts_remaining', null, 'claim_expires_at', null
    );
  END IF;

  IF v_status = 'locked' THEN
    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'CHALLENGE_LOCKED', 'attempts_remaining', 0, 'claim_expires_at', null
    );
  END IF;

  IF v_expires_at <= v_now THEN
    UPDATE private.phone_otp_login_challenges_v2
    SET status = 'expired', claim_id = null, claim_expires_at = null, updated_at = v_now
    WHERE id = p_challenge_id AND status IN ('pending', 'processing');

    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'CHALLENGE_EXPIRED', 'attempts_remaining', null, 'claim_expires_at', null
    );
  END IF;

  IF v_status IN ('pending', 'processing') AND v_attempt_count >= v_max_attempts THEN
    UPDATE private.phone_otp_login_challenges_v2
    SET status = 'locked', claim_id = null, claim_expires_at = null, updated_at = v_now
    WHERE id = p_challenge_id
      AND status IN ('pending', 'processing')
      AND delivery_status = 'sent'
      AND attempt_count = v_attempt_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHALLENGE_STATE_CHANGED' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'CHALLENGE_LOCKED', 'attempts_remaining', 0, 'claim_expires_at', null
    );
  END IF;

  IF v_status = 'processing' THEN
    IF v_existing_claim_expires_at > v_now
       AND v_existing_claim_id IS NOT DISTINCT FROM p_claim_id
       AND p_otp_hash IS NOT DISTINCT FROM v_stored_otp_hash THEN
      RETURN jsonb_build_object(
        'claimed', true, 'idempotent', true, 'user_id', v_user_id, 'phone_hash', v_phone_hash,
        'error_code', null, 'attempts_remaining', v_max_attempts - v_attempt_count,
        'claim_expires_at', v_existing_claim_expires_at
      );
    END IF;

    IF v_existing_claim_expires_at > v_now
       AND v_existing_claim_id IS NOT DISTINCT FROM p_claim_id
       AND p_otp_hash IS DISTINCT FROM v_stored_otp_hash THEN
      RAISE EXCEPTION 'CLAIM_ID_REUSE_MISMATCH' USING ERRCODE = '22023';
    END IF;

    IF v_existing_claim_expires_at > v_now
       AND v_existing_claim_id IS DISTINCT FROM p_claim_id THEN
      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
        'error_code', 'ACTIVE_PROCESSING', 'attempts_remaining', null, 'claim_expires_at', null
      );
    END IF;

    IF v_existing_claim_expires_at <= v_now THEN
      UPDATE private.phone_otp_login_challenges_v2
      SET status = 'pending', claim_id = null, claim_expires_at = null, updated_at = v_now
      WHERE id = p_challenge_id AND status = 'processing';

      v_status := 'pending';
      v_existing_claim_id := null;
      v_existing_claim_expires_at := null;
    END IF;
  END IF;

  IF v_status IS DISTINCT FROM 'pending' OR v_delivery_status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'INVALID_CHALLENGE_STATE' USING ERRCODE = '22023';
  END IF;

  IF p_otp_hash IS DISTINCT FROM v_stored_otp_hash THEN
    v_next_attempt_count := LEAST(v_attempt_count + 1, v_max_attempts);

    IF v_next_attempt_count >= v_max_attempts THEN
      UPDATE private.phone_otp_login_challenges_v2
      SET attempt_count = v_max_attempts, status = 'locked', claim_id = null,
          claim_expires_at = null, updated_at = v_now
      WHERE id = p_challenge_id
        AND status = 'pending'
        AND delivery_status = 'sent'
        AND attempt_count = v_attempt_count;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CHALLENGE_STATE_CHANGED' USING ERRCODE = '40001';
      END IF;

      RETURN jsonb_build_object(
        'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
        'error_code', 'CHALLENGE_LOCKED', 'attempts_remaining', 0, 'claim_expires_at', null
      );
    END IF;

    UPDATE private.phone_otp_login_challenges_v2
    SET attempt_count = v_next_attempt_count, status = 'pending', claim_id = null,
        claim_expires_at = null, updated_at = v_now
    WHERE id = p_challenge_id
      AND status = 'pending'
      AND delivery_status = 'sent'
      AND attempt_count = v_attempt_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHALLENGE_STATE_CHANGED' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
      'claimed', false, 'idempotent', false, 'user_id', null, 'phone_hash', null,
      'error_code', 'INVALID_OTP', 'attempts_remaining', v_max_attempts - v_next_attempt_count,
      'claim_expires_at', null
    );
  END IF;

  v_new_claim_expires_at := LEAST(v_expires_at, v_now + pg_catalog.make_interval(secs => 30));

  UPDATE private.phone_otp_login_challenges_v2
  SET status = 'processing', claim_id = p_claim_id,
      claim_expires_at = v_new_claim_expires_at, updated_at = v_now
  WHERE id = p_challenge_id
    AND status = 'pending'
    AND delivery_status = 'sent'
    AND attempt_count = v_attempt_count
    AND otp_hash = v_stored_otp_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHALLENGE_STATE_CHANGED' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'claimed', true, 'idempotent', false, 'user_id', v_user_id, 'phone_hash', v_phone_hash,
    'error_code', null, 'attempts_remaining', v_max_attempts - v_attempt_count,
    'claim_expires_at', v_new_claim_expires_at
  );
END;
$function$;
