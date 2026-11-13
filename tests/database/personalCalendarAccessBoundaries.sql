-- Isolated identities and sessions. No real users are modified and everything rolls back.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL plpgsql.check_asserts=on;
UPDATE public.auth_security_settings SET session_management_enabled=true,mfa_policy='disabled' WHERE id=1;
CREATE TEMP TABLE calendar_test_users AS
SELECT n,gen_random_uuid() user_id,gen_random_uuid() session_id FROM generate_series(0,6)n;
GRANT SELECT ON calendar_test_users TO authenticated;
INSERT INTO auth.users(id,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
SELECT user_id,now(),now(),'{}','{}' FROM calendar_test_users;
INSERT INTO public.profiles(user_id,full_name,organization,account_status,is_active,is_admin,profile_completion_status,registration_source)
SELECT user_id,'Calendar boundary fixture '||n,'Calendar boundary fixture','ACTIVE',true,n=3,'COMPLETE','imported'
FROM calendar_test_users;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT session_id,user_id,now(),now(),'aal1' FROM calendar_test_users;
INSERT INTO public.session_security_state(session_id,user_id,auth_epoch,idle_expiry_at,absolute_expiry_at)
SELECT u.session_id,u.user_id,p.auth_epoch,now()+interval '1 hour',now()+interval '2 hours'
FROM calendar_test_users u JOIN public.profiles p USING(user_id);
CREATE TEMP TABLE calendar_test_calendars AS
SELECT kind,gen_random_uuid() id FROM unnest(ARRAY['shared','public'])kind;
GRANT SELECT ON calendar_test_calendars TO authenticated;
INSERT INTO public.calendars(id,user_id,name,type)
SELECT id,(SELECT user_id FROM calendar_test_users WHERE n=0),'Calendar boundary fixture '||kind,kind
FROM calendar_test_calendars;
INSERT INTO public.calendar_subscriptions(calendar_id,user_id,permission)
SELECT c.id,u.user_id,CASE WHEN u.n=6 THEN 'edit' ELSE 'view' END
FROM calendar_test_calendars c CROSS JOIN calendar_test_users u
WHERE (c.kind='shared' AND u.n IN(1,6)) OR (c.kind='public' AND u.n=6);
CREATE TEMP TABLE calendar_test_meetings AS
SELECT n,gen_random_uuid() id FROM generate_series(0,5)n;
GRANT SELECT ON calendar_test_meetings TO authenticated;
INSERT INTO public.meetings(id,user_id,subject,location,representative,phone,request_date,start_time,end_time,calendar_id,members_only,participant_user_ids,notify_users)
SELECT m.id,(SELECT user_id FROM calendar_test_users WHERE n=0),'Calendar boundary fixture '||m.n,'Room','','',
'2026-11-14','09:00','10:00',CASE WHEN m.n=5 THEN NULL ELSE (SELECT id FROM calendar_test_calendars WHERE kind='shared') END,
m.n=1,
CASE WHEN m.n=1 THEN ARRAY[(SELECT user_id FROM calendar_test_users WHERE n=4)]
     WHEN m.n IN(2,3) THEN ARRAY[(SELECT user_id FROM calendar_test_users WHERE n=3)] ELSE '{}'::uuid[] END,
CASE WHEN m.n=1 THEN ARRAY[(SELECT user_id FROM calendar_test_users WHERE n=5)] ELSE '{}'::uuid[] END
FROM calendar_test_meetings m;
UPDATE public.meeting_inbox SET status='accepted' WHERE meeting_id IN(SELECT id FROM calendar_test_meetings);
UPDATE public.meeting_inbox SET status='pending' WHERE meeting_id=(SELECT id FROM calendar_test_meetings WHERE n=3)
AND user_id=(SELECT user_id FROM calendar_test_users WHERE n=3);
INSERT INTO public.meeting_inbox(meeting_id,user_id,status)
SELECT (SELECT id FROM calendar_test_meetings WHERE n=4),user_id,'accepted' FROM calendar_test_users WHERE n=3
ON CONFLICT(meeting_id,user_id) DO UPDATE SET status='accepted';
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true)
FROM calendar_test_users WHERE n=0;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE u record; actual integer; expected integer; changed integer;
BEGIN
  FOR u IN SELECT * FROM calendar_test_users ORDER BY n LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.user_id,'session_id',u.session_id,'role','authenticated','aal','aal1')::text,true);
    ASSERT private.is_current_session_fully_authorized(),'Fixture must have FULL access';
    SELECT count(*) INTO actual FROM public.get_my_calendar_meetings_v1('2026-11-14','2026-11-14')
    WHERE id IN(SELECT id FROM calendar_test_meetings);
    expected := CASE u.n WHEN 0 THEN 6 WHEN 1 THEN 4 WHEN 2 THEN 0 WHEN 3 THEN 2 WHEN 4 THEN 1 WHEN 5 THEN 1 WHEN 6 THEN 5 END;
    ASSERT actual=expected,format('Calendar scope for user %s: expected %s, got %s',u.n,expected,actual);
    IF u.n=3 THEN
      ASSERT private.current_user_has_permission_v1('config_modules.monitoring'),'Admin fixture must have monitoring access';
      ASSERT (SELECT count(*) FROM public.meetings WHERE id IN(SELECT id FROM calendar_test_meetings))=6,
        'Explicit monitoring read must remain available';
    END IF;
    IF u.n IN(2,3) THEN
      ASSERT NOT EXISTS(SELECT FROM public.calendars WHERE id=(SELECT id FROM calendar_test_calendars WHERE kind='shared')),
        'Unshared calendar metadata leaked';
    END IF;
    IF u.n=2 THEN
      ASSERT NOT EXISTS(SELECT FROM public.meetings WHERE id IN(SELECT id FROM calendar_test_meetings)),
        'Unrelated regular user can read meetings directly';
      BEGIN
        INSERT INTO public.calendar_subscriptions(calendar_id,user_id,permission)
        VALUES((SELECT id FROM calendar_test_calendars WHERE kind='shared'),u.user_id,'view');
        RAISE EXCEPTION 'Unrelated user subscribed to a shared calendar';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
    IF u.n=1 THEN
      UPDATE public.calendar_subscriptions SET permission='edit' WHERE user_id=u.user_id;
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=0,'Viewer promoted their own subscription';
    END IF;
  END LOOP;
END $test$;
RESET ROLE;
-- Revocation must remove calendar visibility immediately, independently of admin status.
DELETE FROM public.calendar_subscriptions WHERE calendar_id=(SELECT id FROM calendar_test_calendars WHERE kind='shared')
AND user_id=(SELECT user_id FROM calendar_test_users WHERE n=1);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true)
FROM calendar_test_users WHERE n=1;
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  ASSERT NOT EXISTS(SELECT FROM public.get_my_calendar_meetings_v1('2026-11-14','2026-11-14')
    WHERE id IN(SELECT id FROM calendar_test_meetings)), 'Revoked shared access persisted';
  ASSERT NOT EXISTS(SELECT FROM public.get_my_calendar_meetings_v1('2026-11-15','2026-11-14')),'Invalid range returned rows';
END $test$;
RESET ROLE;
DO $test$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.get_my_calendar_meetings_v1(date,date)','EXECUTE');
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_my_calendar_meetings_v1(date,date)'::regprocedure),
    'Personal calendar RPC must not bypass RLS';
END $test$;
SELECT 'PASS: owner/viewer/editor/outsider/admin/direct invite/observer/pending/revocation and shared subscription boundaries' AS result;
ROLLBACK;
