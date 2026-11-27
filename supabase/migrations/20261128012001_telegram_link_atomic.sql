BEGIN;

CREATE FUNCTION public.consume_telegram_link_token_service(p_token text, p_chat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_user_id uuid; v_full_name text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-fA-F]{32}$'
     OR p_chat_id IS NULL OR p_chat_id !~ '^-?[0-9]{1,20}$' THEN
    RETURN jsonb_build_object('ok',false);
  END IF;
  UPDATE public.telegram_link_tokens
     SET used = true
   WHERE token = p_token AND NOT used AND expires_at > clock_timestamp()
   RETURNING user_id INTO v_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE public.profiles SET telegram_chat_id = p_chat_id
   WHERE user_id = v_user_id AND is_active IS TRUE
   RETURNING full_name INTO v_full_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TELEGRAM_PROFILE_NOT_AVAILABLE' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('ok',true,'full_name',v_full_name);
END;
$fn$;
REVOKE ALL ON FUNCTION public.consume_telegram_link_token_service(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_link_token_service(text,text) TO service_role;

COMMIT;
