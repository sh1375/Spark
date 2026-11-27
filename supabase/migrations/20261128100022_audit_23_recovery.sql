BEGIN;

DO $guard$
BEGIN
  IF pg_catalog.to_regprocedure('public.claim_unified_recovery_completion(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required function public.claim_unified_recovery_completion(uuid, text, uuid) is missing'
      USING ERRCODE = '42883';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.claim_unified_recovery_completion(
  p_challenge_id uuid,
  p_reset_token_hash text,
  p_claim_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_challenge public.unified_recovery_challenges%ROWTYPE;
  v_checked_at timestamptz;
  v_same_claim boolean;
  v_updated integer;
BEGIN
  IF p_challenge_id IS NULL OR p_reset_token_hash IS NULL OR p_claim_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PARAMS');
  END IF;

  SELECT * INTO v_challenge
  FROM public.unified_recovery_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHALLENGE_NOT_FOUND');
  END IF;

  v_checked_at := clock_timestamp();
  v_same_claim := v_challenge.status = 'PROCESSING'
    AND v_challenge.processing_claim_id IS NOT DISTINCT FROM p_claim_id;

  IF v_challenge.status <> 'RESET_TOKEN_ISSUED' AND NOT v_same_claim THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED');
  END IF;

  IF v_challenge.reset_token_hash IS DISTINCT FROM p_reset_token_hash THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RESET_TOKEN_INVALID');
  END IF;

  IF v_challenge.reset_expires_at IS NULL OR v_challenge.reset_expires_at <= v_checked_at THEN
    IF v_challenge.status = 'RESET_TOKEN_ISSUED' THEN
      UPDATE public.unified_recovery_challenges
      SET status = 'EXPIRED', updated_at = v_checked_at
      WHERE id = p_challenge_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'RESET_TOKEN_EXPIRED');
  END IF;

  IF v_challenge.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED');
  END IF;

  IF v_same_claim THEN
    IF v_challenge.processing_expires_at IS NULL OR v_challenge.processing_expires_at <= v_checked_at THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_VERIFIED');
    END IF;
    RETURN jsonb_build_object('ok', true, 'user_id', v_challenge.user_id, 'idempotent', true);
  END IF;

  UPDATE public.unified_recovery_challenges
  SET status = 'PROCESSING',
      processing_claim_id = p_claim_id,
      processing_expires_at = v_checked_at + interval '60 seconds',
      updated_at = v_checked_at
  WHERE id = p_challenge_id AND status = 'RESET_TOKEN_ISSUED'
  RETURNING 1 INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CLAIM_RACE');
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_challenge.user_id);
END;
$function$;

COMMIT;
