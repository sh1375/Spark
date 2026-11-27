-- Non-mutating checks against a deployed or isolated PostgreSQL schema.
BEGIN READ ONLY;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='private' AND table_name='phone_otp_login_challenges_v2'
      AND column_name='consumed_claim_id') OR NOT EXISTS
    (SELECT 1 FROM information_schema.columns WHERE table_schema='private'
      AND table_name='phone_otp_login_challenges_v2' AND column_name='consumed_session_id') THEN
    RAISE EXCEPTION 'OTP claim/session binding columns missing';
  END IF;
  IF to_regclass('private.minutes_attachment_cleanup_reservations') IS NULL THEN
    RAISE EXCEPTION 'Attachment cleanup reservations missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.minutes_attachments'::regclass
    AND tgname='reject_reserved_minutes_attachment_path' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Attachment path guard missing';
  END IF;
  IF NOT has_function_privilege('service_role','public.claim_stale_minutes_attachments_service(integer)','EXECUTE')
    OR has_function_privilege('anon','public.claim_stale_minutes_attachments_service(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.claim_stale_minutes_attachments_service(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Cleanup claim RPC privileges incorrect';
  END IF;
  IF NOT has_function_privilege('service_role','public.consume_telegram_link_token_service(text,text)','EXECUTE')
    OR has_function_privilege('anon','public.consume_telegram_link_token_service(text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.consume_telegram_link_token_service(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Telegram linking RPC privileges incorrect';
  END IF;
END
$test$;
ROLLBACK;
