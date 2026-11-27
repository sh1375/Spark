-- Run after migrations, including after restoring a database. No data committed.
begin;

do $test$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public._create_minutes_notification(uuid, text, text, text, text, uuid, uuid, integer, uuid, jsonb, text)',
    'public._get_minute_notif_context(uuid)',
    'public._has_permission(uuid, text)',
    'public._minutes_user_belongs_to_meeting(uuid, uuid)',
    'public._minutes_user_exists(uuid)',
    'public._sync_minutes_decisions_legacy_periodic_v1(uuid, jsonb, uuid[])',
    'public._write_minutes_audit(uuid, text, text, uuid, integer, jsonb, jsonb, jsonb)',
    'public.admin_revoke_user_session(uuid, uuid, uuid, text)',
    'public.admin_unlock_account(uuid, uuid)',
    'public.authorize_password_gateway_session_v1(uuid, uuid, text, text, text)',
    'public.authorize_phone_otp_gateway_session_v1(uuid, uuid, uuid, uuid, text, text)',
    'public.check_account_lock_status(uuid)',
    'public.check_public_registration_identifiers_available(text, text, text)',
    'public.claim_avatar_cleanup_job(text)',
    'public.claim_avatar_job_by_id_v1(uuid, text)',
    'public.claim_deferred_sms_queue(integer)',
    'public.claim_due_minutes_decision_reminders(integer)',
    'public.claim_due_overdue_decisions(integer)',
    'public.claim_meeting_notification_jobs(integer)',
    'public.claim_next_avatar_job(text)',
    'public.claim_notification_outbox_rows(integer)',
    'public.claim_phone_otp_login_challenge_v2(uuid, text, uuid)',
    'public.claim_phone_password_reset_completion(uuid, text, uuid)',
    'public.claim_public_registration_challenge(uuid, text, text)',
    'public.claim_public_registration_challenge_v2(uuid, text, text, uuid)',
    'public.claim_pwa_push_outbox_service(integer)',
    'public.claim_sms_dispatch_v1(text, uuid, text, uuid, text, text, text, text, uuid, uuid, text)',
    'public.claim_unified_recovery_completion(uuid, text, uuid)',
    'public.cleanup_auth_hook_events()',
    'public.cleanup_bale_auth_code_dispatches()',
    'public.cleanup_orphan_minutes_attachments()',
    'public.cleanup_pending_minutes_attachments(integer)',
    'public.cleanup_phone_otp_rate_limit()',
    'public.cleanup_stale_phone_password_reset_processing()',
    'public.complete_auth_hook_event(text)',
    'public.complete_avatar_job(uuid, text, text, text)',
    'public.complete_phone_otp_login_challenge_v2(uuid, uuid)',
    'public.complete_pwa_push_outbox_service(uuid, boolean, text)',
    'public.consume_bale_link_nonce(text, text)',
    'public.consume_bale_link_nonce(text, uuid, bytea, text)',
    'public.consume_bale_link_nonce_service(text, text)',
    'public.consume_custom_mfa_challenge_hash(uuid, text, uuid)',
    'public.consume_custom_mfa_challenge_service(uuid, uuid, text, uuid)',
    'public.consume_custom_mfa_challenge_v2(uuid, uuid, text, uuid)',
    'public.consume_custom_mfa_recovery_hash(text, uuid)',
    'public.consume_custom_mfa_recovery_service(uuid, text, uuid)',
    'public.consume_mfa_challenge_rate_limit(uuid, uuid, text, integer, integer, integer, integer)',
    'public.consume_native_auth_sms_send_grant_v1(text, text)',
    'public.consume_password_login_rate_limit_v1(text, text, text, integer, integer, integer)',
    'public.consume_phone_otp_login_rate_limit_v2(text, text, text, integer, integer, integer)',
    'public.consume_phone_otp_rate_limit(text, text)',
    'public.consume_phone_otp_verify_rate_limit(text, text)',
    'public.consume_phone_password_recovery_complete_limit(text, text, integer, integer)',
    'public.consume_phone_password_recovery_rate_limit(text, text)',
    'public.consume_phone_password_recovery_request_limit(text, text, text, integer, integer, integer)',
    'public.consume_phone_password_recovery_verify_limit(text, text, integer, integer)',
    'public.consume_public_registration_rate_limit(text, text, text, text)',
    'public.consume_public_registration_rate_limit_v2(text, text, text, text, integer, integer, integer, integer)',
    'public.consume_sms_mfa_challenge_v3(uuid, uuid, uuid, text)',
    'public.consume_unified_recovery_rate_limit(text, text, text, integer, integer, integer)',
    'public.create_bale_link_nonce()',
    'public.create_bale_link_nonce(text, uuid, timestamp with time zone)',
    'public.create_bale_link_nonce_service(uuid)',
    'public.create_custom_mfa_challenge(text, uuid, text)',
    'public.create_custom_mfa_challenge_service(uuid, text, uuid, text)',
    'public.create_custom_mfa_challenge_v2(uuid, text, uuid, text, text)',
    'public.create_phone_otp_login_challenge_v2(uuid, uuid, text, text, text, timestamp with time zone, timestamp with time zone, uuid, integer)',
    'public.create_phone_password_reset_challenge(uuid, text, text, timestamp with time zone)',
    'public.create_phone_password_reset_challenge(uuid, uuid, text, text, timestamp with time zone)',
    'public.create_public_registration_challenge(text, text, text, text, text, timestamp with time zone, uuid)',
    'public.create_public_registration_challenge_v2(uuid, text, text, text, text, text, timestamp with time zone, uuid)',
    'public.create_sms_mfa_challenge_v3(uuid, uuid, text, text, text)',
    'public.create_unified_recovery_challenge(uuid, uuid, text, text, text, text, timestamp with time zone, integer)',
    'public.disable_custom_mfa_factor(uuid, text)',
    'public.dispatch_pwa_push_worker()',
    'public.enroll_custom_mfa_factor(uuid, text, text, text, bytea, text)',
    'public.enroll_sms_factor_from_auth_phone(uuid, text)',
    'public.fail_auth_hook_event(text, text)',
    'public.fail_avatar_cleanup_job(uuid, text, text, boolean)',
    'public.fail_avatar_job(uuid, text, text, boolean)',
    'public.finalize_phone_password_reset_completion(uuid, uuid, boolean)',
    'public.finalize_public_registration_challenge(uuid, uuid)',
    'public.finalize_unified_recovery_completion(uuid, uuid, boolean)',
    'public.finalize_unified_recovery_completion_v2(uuid, uuid, boolean)',
    'public.finish_meeting_notification_job(uuid, uuid, text, text)',
    'public.get_bale_chat_id_service(uuid)',
    'public.get_email_by_username(text)',
    'public.get_phone_auth_config()',
    'public.get_phone_auth_identity_state_v1(uuid, text)',
    'public.get_pwa_vapid_config_service()',
    'public.get_registration_phone_otp_secret_service()',
    'public.has_active_custom_mfa_grant(uuid, uuid)',
    'public.heartbeat_avatar_cleanup_job(uuid, text)',
    'public.heartbeat_avatar_job(uuid, text)',
    'public.hmac_with_pepper(text, text)',
    'public.issue_custom_mfa_grant(uuid, uuid, text, text, uuid)',
    'public.issue_native_auth_sms_send_grant_v1(text, text, integer)',
    'public.mark_avatar_cleanup_progress(uuid, text, boolean, boolean)',
    'public.mark_registration_delivery_failed(uuid)',
    'public.mark_registration_delivery_failed_v2(uuid)',
    'public.mark_sent_unconfirmed_auth_hook_event(text)',
    'public.materialize_due_minutes_periodic_reminders(integer)',
    'public.mfa_decrypt(bytea)',
    'public.mfa_encrypt(text)',
    'public.postpone_meeting_notification_job(uuid, uuid, timestamp with time zone)',
    'public.reclaim_avatar_cleanup_jobs()',
    'public.reclaim_avatar_jobs()',
    'public.reconcile_phone_otp_gateway_session_v1(uuid, uuid, uuid, uuid, text, text)',
    'public.record_auth_failure(uuid, text, text)',
    'public.regenerate_custom_mfa_recovery_codes()',
    'public.regenerate_custom_mfa_recovery_codes_v2(uuid, text[])',
    'public.regenerate_custom_mfa_recovery_codes_v3(uuid, text[])',
    'public.register_session_security_state(uuid, uuid, integer, integer, integer, text, text)',
    'public.register_session_security_state_v2(uuid, uuid, integer, integer, text, text)',
    'public.release_phone_otp_login_challenge_v2(uuid, uuid)',
    'public.release_public_registration_claim(uuid)',
    'public.release_public_registration_claim_v2(uuid, uuid)',
    'public.reserve_auth_hook_event(text)',
    'public.resolve_and_queue_notification(text, uuid, text, text, uuid, uuid, uuid, jsonb, text, integer)',
    'public.resolve_phone_password_login_v1(text)',
    'public.resolve_phone_password_reset_target(text)',
    'public.resolve_phone_password_reset_target_detailed(text)',
    'public.resolve_unified_recovery_target(text, text)',
    'public.revalidate_phone_password_reset_target(uuid)',
    'public.revoke_all_sessions(uuid)',
    'public.revoke_custom_mfa_grant(uuid)',
    'public.revoke_other_sessions(uuid, uuid)',
    'public.revoke_session_security_state(uuid, uuid, text)',
    'public.schedule_daily_report_check()',
    'public.set_phone_otp_login_delivery_v2(uuid, boolean)',
    'public.set_pwa_vapid_config_service(text, text)',
    'public.touch_session_security_state(uuid, uuid, integer, integer)',
    'public.trigger_daily_meetings_send()',
    'public.update_mfa_challenge_resend(uuid, text, timestamp with time zone)',
    'public.verify_cron_secret(text)',
    'public.verify_custom_mfa_challenge(uuid, text, uuid)',
    'public.verify_custom_mfa_recovery(text, uuid)',
    'public.verify_meeting_worker_token(text)',
    'public.verify_phone_password_reset_challenge(uuid, text, text, timestamp with time zone)',
    'public.verify_pwa_push_worker_secret_service(text)',
    'public.verify_recovery_channel_ownership(uuid, text, text)',
    'public.verify_unified_recovery_challenge(uuid, text, text, timestamp with time zone)',
    'public.write_denied_audit(uuid, uuid, text, text, uuid, uuid)',
    'public.write_mfa_stepup_denied_audit(uuid, uuid, text, text, uuid)'
  ] loop
    assert to_regprocedure(v_signature) is not null, 'Missing required RPC: ' || v_signature;
    assert not has_function_privilege('anon',v_signature,'EXECUTE'), 'Anonymous internal RPC access: ' || v_signature;
    assert not has_function_privilege('authenticated',v_signature,'EXECUTE'), 'Browser internal RPC access: ' || v_signature;
    assert has_function_privilege('service_role',v_signature,'EXECUTE'), 'Worker lost RPC access: ' || v_signature;
  end loop;
  assert has_function_privilege('anon','public.get_public_auth_config()','EXECUTE'), 'Public login configuration must remain callable';
  assert has_function_privilege('anon','public.get_public_login_methods()','EXECUTE'), 'Public login methods must remain callable';
  assert has_function_privilege('authenticated','public.get_my_auth_access_state_v3()','EXECUTE'), 'Session evaluation must remain callable';
  assert has_function_privilege('authenticated','public.get_my_app_bootstrap_v1()','EXECUTE'), 'Application bootstrap must remain callable';
  assert has_function_privilege('authenticated','public.get_custom_mfa_state()','EXECUTE'), 'User MFA state must remain callable';
  assert has_function_privilege('authenticated','public.submit_minutes_for_approval(uuid,timestamp with time zone,text)','EXECUTE'), 'Minutes approval must remain callable';
end;
$test$;

set local role anon;
do $test$
begin
  begin
    perform public._get_minute_notif_context(gen_random_uuid());
    raise exception 'Anonymous minute context was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.revoke_all_sessions(gen_random_uuid());
    raise exception 'Anonymous session revocation was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.disable_custom_mfa_factor(gen_random_uuid(),'sms');
    raise exception 'Anonymous MFA mutation was accepted';
  exception when insufficient_privilege then null; end;
  -- Exercise the real public login RPC, rather than checking grants alone.
  perform public.get_public_auth_config();
  perform public.get_public_login_methods();
end;
$test$;
reset role;

set local role authenticated;
do $test$
begin
  begin
    perform public._get_minute_notif_context(gen_random_uuid());
    raise exception 'Browser minute context was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_notification_outbox_rows(0);
    raise exception 'Browser claimed worker jobs';
  exception when insufficient_privilege then null; end;
  perform public.get_my_auth_access_state_v3();
end;
$test$;
reset role;

set local role service_role;
do $test$
begin
  -- Non-mutating service calls; do not return secrets or claim real jobs.
  assert public._get_minute_notif_context(gen_random_uuid()) = '{}'::jsonb, 'Worker cannot call internal helper';
  perform public.get_phone_auth_config();
  assert (public.revoke_all_sessions(null)->>'error') = 'INVALID_PARAMS', 'Service session RPC stopped executing';
  assert (public.disable_custom_mfa_factor(null,'sms')->>'error') = 'INVALID_PARAMS', 'Service MFA RPC stopped executing';
  assert (select count(*) from public.claim_notification_outbox_rows(0)) = 0, 'Worker cannot execute queue claim';
end;
$test$;
reset role;

-- Existing SECURITY DEFINER workflows execute their helpers as the owner even
-- when a browser caller cannot execute the helper directly. Exercise that chain.
create temp table spark_test_rpc_namespace_init (id integer);
create function pg_temp.spark_test_internal_context()
returns jsonb language sql security definer set search_path = ''
as $$ select public._get_minute_notif_context(gen_random_uuid()) $$;
do $test$
begin
  execute format('GRANT USAGE ON SCHEMA %I TO authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end;
$test$;
grant execute on function pg_temp.spark_test_internal_context() to authenticated;
set local role authenticated;
do $test$
begin
  assert pg_temp.spark_test_internal_context() = '{}'::jsonb, 'Definer workflow lost helper access';
end;
$test$;
reset role;

select 'internal RPC access tests passed' as result;
rollback;
