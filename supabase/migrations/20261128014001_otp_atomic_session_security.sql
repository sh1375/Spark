BEGIN;
CREATE FUNCTION public.authorize_phone_otp_gateway_session_v2(
  p_session_id uuid, p_user_id uuid, p_challenge_id uuid, p_claim_id uuid,
  p_phone_hash text, p_ip_hash text, p_device_summary text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_result jsonb;
  v_settings public.auth_security_settings%ROWTYPE;
  v_registration jsonb;
BEGIN
  v_result := public.authorize_phone_otp_gateway_session_v1(
    p_session_id,p_user_id,p_challenge_id,p_claim_id,p_phone_hash,p_ip_hash);
  IF (v_result->>'authorized') IS DISTINCT FROM 'true' THEN
    RETURN v_result;
  END IF;
  SELECT * INTO v_settings FROM public.auth_security_settings WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_SETTINGS_UNAVAILABLE' USING ERRCODE='40001'; END IF;
  IF v_settings.session_management_enabled IS TRUE THEN
    v_registration := public.register_session_security_state_v2(
      p_session_id,p_user_id,
      COALESCE(v_settings.session_idle_timeout_minutes,480),
      COALESCE(v_settings.session_absolute_lifetime_minutes,1440),
      left(COALESCE(p_device_summary,'unknown'),200),p_ip_hash);
    IF (v_registration->>'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'SESSION_SECURITY_REGISTRATION_FAILED' USING ERRCODE='40001';
    END IF;
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.authorize_phone_otp_gateway_session_v2(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_phone_otp_gateway_session_v2(uuid,uuid,uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.reconcile_phone_otp_gateway_session_v2(
  p_session_id uuid, p_user_id uuid, p_challenge_id uuid, p_claim_id uuid,
  p_phone_hash text, p_ip_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_result jsonb;
  v_enabled boolean;
BEGIN
  v_result := public.reconcile_phone_otp_gateway_session_v1(
    p_session_id,p_user_id,p_challenge_id,p_claim_id,p_phone_hash,p_ip_hash);
  IF (v_result->>'authorized') IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
  SELECT session_management_enabled INTO v_enabled FROM public.auth_security_settings WHERE id=1;
  IF NOT FOUND OR (v_enabled IS TRUE AND NOT EXISTS (
    SELECT 1 FROM public.session_security_state s
    JOIN public.profiles p ON p.user_id=s.user_id
    WHERE s.session_id=p_session_id AND s.user_id=p_user_id
      AND s.revoked_at IS NULL AND s.auth_epoch=p.auth_epoch
      AND s.idle_expiry_at>clock_timestamp() AND s.absolute_expiry_at>clock_timestamp()
  )) THEN
    RETURN jsonb_build_object('authorized',false,'error_code','INCONSISTENT_STATE');
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.reconcile_phone_otp_gateway_session_v2(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_phone_otp_gateway_session_v2(uuid,uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
