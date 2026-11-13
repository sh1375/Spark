-- Run on the test copy. Every identity, session, notification and queued SMS rolls back.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL plpgsql.check_asserts = on;
UPDATE public.auth_security_settings SET session_management_enabled=true, mfa_policy='disabled' WHERE id=1;
CREATE TEMP TABLE delegation_users AS
SELECT n, gen_random_uuid() user_id, gen_random_uuid() session_id FROM generate_series(0,3) n;
GRANT SELECT ON delegation_users TO authenticated;
INSERT INTO auth.users(id,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
SELECT user_id,now(),now(),'{}','{}' FROM delegation_users;
INSERT INTO public.profiles(user_id,full_name,organization,account_status,is_active,profile_completion_status,registration_source)
SELECT user_id,CASE n WHEN 0 THEN 'سازنده آزمایشی' WHEN 1 THEN 'دعوت‌شده آزمایشی' ELSE 'جانشین آزمایشی' END,
CASE WHEN n=3 THEN 'Delegation outside fixture' ELSE 'Delegation fixture' END,
'ACTIVE',true,'COMPLETE','imported' FROM delegation_users;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT session_id,user_id,now(),now(),'aal1' FROM delegation_users;
INSERT INTO public.session_security_state(session_id,user_id,auth_epoch,idle_expiry_at,absolute_expiry_at)
SELECT u.session_id,u.user_id,p.auth_epoch,now()+interval '1 hour',now()+interval '2 hours'
FROM delegation_users u JOIN public.profiles p USING(user_id);
CREATE TEMP TABLE delegation_cases AS
SELECT status,gen_random_uuid() meeting_id,gen_random_uuid() inbox_id FROM unnest(ARRAY['pending','accepted']) status;
GRANT SELECT ON delegation_cases TO authenticated;
INSERT INTO public.meetings(id,subject,location,representative,phone,user_id,request_date,start_time,end_time,participant_user_ids)
SELECT meeting_id,'آزمایش انتخاب جانشین '||status,'Room','','',
(SELECT user_id FROM delegation_users WHERE n=0),'2026-11-14','09:00','10:00',
CASE WHEN status='accepted' THEN ARRAY[(SELECT user_id FROM delegation_users WHERE n=1)] ELSE '{}'::uuid[] END
FROM delegation_cases;
INSERT INTO public.meeting_inbox(id,meeting_id,user_id,status)
SELECT inbox_id,meeting_id,(SELECT user_id FROM delegation_users WHERE n=1),status FROM delegation_cases
ON CONFLICT (meeting_id,user_id) DO UPDATE SET id=excluded.id,status=excluded.status;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true)
FROM delegation_users WHERE n=1;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE c record; r jsonb; version timestamptz;
BEGIN
  ASSERT private.is_current_session_fully_authorized(), 'Fixture must have FULL access';
  FOR c IN SELECT * FROM delegation_cases LOOP
    SELECT coalesce(updated_at,created_at) INTO version FROM public.meeting_inbox WHERE id=c.inbox_id;
    r := public.assign_meeting_invitation_delegate(c.inbox_id,(SELECT user_id FROM delegation_users WHERE n=3),version);
    ASSERT r->>'error_code'='DELEGATE_DIFFERENT_ORG', 'Organization boundary changed';
    r := public.assign_meeting_invitation_delegate(c.inbox_id,(SELECT user_id FROM delegation_users WHERE n=2),version);
    ASSERT r->>'success'='true', 'Delegation failed: '||r::text;
    ASSERT r#>>'{organizer_delivery,queued}'='true', 'Creator SMS not queued: '||r::text;
    r := public.assign_meeting_invitation_delegate(c.inbox_id,(SELECT user_id FROM delegation_users WHERE n=2),version);
    ASSERT r->>'error_code'='DELEGATE_ALREADY_ASSIGNED', 'Retry duplicated the selection';
  END LOOP;
END $test$;
RESET ROLE;
DO $test$
DECLARE c record; owner_id uuid := (SELECT user_id FROM delegation_users WHERE n=0);
BEGIN
  FOR c IN SELECT * FROM delegation_cases LOOP
    ASSERT (SELECT status FROM public.meeting_inbox WHERE id=c.inbox_id)=c.status, 'Delegator state changed before acceptance';
    ASSERT EXISTS(SELECT FROM public.meeting_inbox WHERE meeting_id=c.meeting_id
      AND user_id=(SELECT user_id FROM delegation_users WHERE n=2) AND status='pending'), 'Delegate cannot respond';
    ASSERT (SELECT count(*) FROM public.notifications WHERE entity_id=c.meeting_id
      AND user_id=owner_id AND template_event_type='meeting_invitation_delegate_selected')=1, 'Creator notification missing or duplicated';
    ASSERT EXISTS(SELECT FROM public.notifications WHERE entity_id=c.meeting_id AND user_id=owner_id
      AND type='meeting' AND sender_id=(SELECT user_id FROM delegation_users WHERE n=1)
      AND action_url='meetings' AND message LIKE '%دعوت‌شده آزمایشی%جانشین آزمایشی%'), 'Creator UI content/route/actor incorrect';
    ASSERT (SELECT count(*) FROM public.notifications WHERE entity_id=c.meeting_id
      AND template_event_type='meeting_invitation_delegate_assigned')=1, 'Delegate notification regressed';
    ASSERT (SELECT count(*) FROM public.notification_outbox WHERE entity_id=c.meeting_id
      AND event_type='meeting_invitation_delegate_selected' AND recipient_id=owner_id)=1, 'SMS queue missing or duplicated';
    ASSERT EXISTS(SELECT FROM public.notification_outbox o JOIN public.notifications n ON n.event_key=o.idempotency_key
      WHERE o.entity_id=c.meeting_id AND o.recipient_id=owner_id AND n.user_id=owner_id
      AND o.notification_status='sent' AND o.status='pending' AND o.meeting_id=c.meeting_id
      AND o.audience='organizer' AND (o.payload->>'sms_supported')::boolean
      AND o.payload#>>'{context,full_name}'='سازنده آزمایشی'), 'Outbox recipient/idempotency/context incorrect';
  END LOOP;
  ASSERT EXISTS(SELECT FROM public.sms_templates WHERE category='meeting'
    AND event_type='meeting_invitation_delegate_selected' AND audience='all' AND is_active), 'SMS template missing';
  ASSERT NOT has_function_privilege('anon','private.assign_meeting_invitation_delegate(uuid,uuid,timestamptz)','EXECUTE'), 'Anonymous delegation exposed';
END $test$;
SELECT 'PASS: pending/accepted delegation, creator UI notification, SMS queue, retry and organization isolation' AS result;
ROLLBACK;
