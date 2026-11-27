-- Requires the existing self-hosted function; do not create an unexpected overload.
DO $audit_guard$
BEGIN
  IF to_regprocedure('public.upsert_my_pwa_push_subscription(text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected baseline function missing';
  END IF;
END;
$audit_guard$;

CREATE OR REPLACE FUNCTION public.upsert_my_pwa_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text DEFAULT NULL::text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '42501';
  END IF;
  IF nullif(btrim(p_endpoint), '') IS NULL
     OR length(p_endpoint) > 4096
     OR nullif(btrim(p_p256dh), '') IS NULL
     OR nullif(btrim(p_auth_key), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_SUBSCRIPTION' USING errcode = '22023';
  END IF;

  INSERT INTO public.pwa_push_subscriptions AS subscription (
    user_id, endpoint, p256dh, auth_key, user_agent,
    updated_at, disabled_at, failure_count
  )
  VALUES (
    v_user_id, p_endpoint, p_p256dh, p_auth_key,
    left(p_user_agent, 500), now(), NULL, 0
  )
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        updated_at = now(),
        disabled_at = NULL,
        failure_count = 0
    WHERE subscription.user_id = EXCLUDED.user_id
  RETURNING id INTO v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PWA_PUSH_ENDPOINT_OWNERSHIP_CONFLICT' USING errcode = '42501';
  END IF;

  RETURN v_id;
END;
$$;
