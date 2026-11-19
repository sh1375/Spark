-- Transactional integration tests: no SMS/Push job or fixture is committed.
begin;
create temp table series_test_users as select gen_random_uuid() user_id,gen_random_uuid() session_id,n from generate_series(0,1)n;
grant select on series_test_users to authenticated;
insert into auth.users(id,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) select user_id,now(),now(),'{}','{}' from series_test_users;
insert into public.profiles(user_id,full_name,is_admin,account_status,is_active,profile_completion_status,registration_source)
select user_id,'Temporary series fixture '||n,false,'ACTIVE',true,'COMPLETE','imported' from series_test_users;
insert into public.user_preferences(user_id,notifications_enabled) select user_id,false from series_test_users;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select session_id,user_id,now(),now(),'aal1' from series_test_users;
insert into public.session_security_state(session_id,user_id,auth_epoch,idle_expiry_at,absolute_expiry_at)
select u.session_id,u.user_id,p.auth_epoch,now()+interval '1 hour',now()+interval '2 hours' from series_test_users u join public.profiles p on p.user_id=u.user_id;
insert into private.password_gateway_session_authorizations(session_id,user_id,login_method,identifier_hash,ip_hash,auth_session_created_at)
select session_id,user_id,'email',encode(extensions.digest('series-fixture','sha256'),'hex'),encode(extensions.digest('fixture','sha256'),'hex'),now() from series_test_users;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true) from series_test_users where n=0;

SET LOCAL plpgsql.check_asserts=on;
CREATE TEMP TABLE calendar_sms_fixture AS SELECT gen_random_uuid() single_id,gen_random_uuid() series_id;
GRANT SELECT ON calendar_sms_fixture TO authenticated;
INSERT INTO public.contacts_email(user_id,name,phone)
SELECT u.user_id,c.name,c.phone FROM series_test_users u CROSS JOIN (VALUES
 ('Drop invitee','09000000021'),('Drop alias','+989000000021'),('Drop informee','09000000022')
) c(name,phone) WHERE u.n=0;
INSERT INTO public.meetings(id,user_id,subject,location,representative,phone,request_date,start_time,end_time,status,status_type,external_participants,external_informees)
SELECT f.single_id,u.user_id,'Calendar SMS fixture','Room','','','2027-01-03','09:00','10:00','archived','scheduled',
 ARRAY['Drop invitee'],ARRAY['Drop alias','Drop informee']
FROM calendar_sms_fixture f CROSS JOIN series_test_users u WHERE u.n=0;
UPDATE private.recurring_notification_policy SET invite_sms=false,change_sms=true;

SET LOCAL ROLE authenticated;
DO $$
DECLARE f record; r jsonb;
BEGIN
 SELECT * INTO f FROM calendar_sms_fixture;
 SELECT * INTO r FROM public.save_calendar_meeting_changes_v1(ARRAY[f.single_id],
   '{"request_date":"2027-01-04","start_time":"11:00","end_time":"12:00","duration":"11:00 - 12:00"}',true);
 ASSERT (r->>'timing_changed')::boolean AND r->>'start_time'='11:00','Successful save returns committed timing';
 SELECT * INTO r FROM public.save_calendar_meeting_changes_v1(ARRAY[f.single_id],
   '{"request_date":"2027-01-04","start_time":"11:00","end_time":"12:00"}',true);
 ASSERT NOT (r->>'timing_changed')::boolean,'Identical operation is a no-op for SMS';
 BEGIN
   PERFORM public.save_calendar_meeting_changes_v1(ARRAY[f.single_id,gen_random_uuid()],
    '{"start_time":"13:00","end_time":"14:00"}',true);
   RAISE EXCEPTION 'Partial update unexpectedly saved';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
DECLARE f record; j jsonb; received integer:=0;
BEGIN
 SELECT * INTO f FROM calendar_sms_fixture;
 ASSERT (SELECT count(*) FROM private.meeting_notification_jobs WHERE series_id=f.single_id)=2,
  'Both external roles and one job per normalized phone';
 ASSERT EXISTS(SELECT FROM private.meeting_notification_jobs WHERE series_id=f.single_id AND event_type='informee_change'
  AND context->>'external_schedule' LIKE '%زمان قبلی:%09:00 تا 10:00%زمان جدید:%11:00 تا 12:00%'),'Old and new dates/clocks';
 FOR j IN SELECT private.claim_meeting_delivery_jobs(25,(SELECT user_id FROM series_test_users WHERE n=0),f.single_id,'sms') LOOP
  received:=received+1;
  ASSERT j->'context'->>'meeting_id'=f.single_id::text,'Worker log linked to meeting';
  PERFORM public.finish_meeting_notification_job((j->>'id')::uuid,(j->>'lease')::uuid,
   CASE WHEN j->>'event_type'='informee_change' THEN 'uncertain' ELSE 'failed' END,'fixture outcome');
 END LOOP;
 ASSERT received=2,'Only persisted jobs claimed';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE mid uuid:=(SELECT single_id FROM calendar_sms_fixture);
BEGIN
 ASSERT public.retry_calendar_schedule_sms_v1(mid)=1,'Retry only confirmed failure';
 ASSERT public.retry_calendar_schedule_sms_v1(mid)=0,'Double-click must not queue twice';
 PERFORM public.save_calendar_meeting_changes_v1(ARRAY[mid],'{"start_time":"15:00","end_time":"16:00"}',false);
END $$;
RESET ROLE;
DO $$
DECLARE f record;
BEGIN
 SELECT * INTO f FROM calendar_sms_fixture;
 ASSERT (SELECT count(*) FROM private.meeting_notification_jobs WHERE series_id=f.single_id)=2,'Silent edit queues nothing';
 ASSERT NOT EXISTS(SELECT FROM private.claim_meeting_delivery_jobs(25,NULL,f.single_id,'sms')),
  'Superseded retries are skipped';
END $$;

SELECT public.create_meeting_series(f.series_id,(SELECT jsonb_agg(jsonb_build_object(
 'user_id',u.user_id,'subject','Calendar series SMS fixture','location','Room','representative','','phone','',
 'request_date',('2027-01-03'::date+n*7)::text,'start_time','09:00','end_time','10:00','status','archived',
 'status_type','scheduled','repeat_type','weekly','external_participants',jsonb_build_array('Drop invitee')
)) FROM generate_series(0,1) n), '[]','هفتگی')
FROM calendar_sms_fixture f CROSS JOIN series_test_users u WHERE u.n=0;
SELECT set_config('spark.series_notify','off',true);
UPDATE public.meetings SET external_participants=ARRAY['Drop informee']
WHERE series_id=(SELECT series_id FROM calendar_sms_fixture) AND request_local_date='2027-01-10';
SELECT set_config('spark.series_notify','on',true);
SET LOCAL ROLE authenticated;
SELECT public.save_calendar_meeting_changes_v1(ARRAY[m.id],
 '{"request_date":"2027-01-05","start_time":"13:00","end_time":"14:00"}',true)
FROM public.meetings m JOIN calendar_sms_fixture f USING(series_id) WHERE m.request_local_date='2027-01-03';
RESET ROLE;
DO $$
DECLARE sid uuid:=(SELECT series_id FROM calendar_sms_fixture); j jsonb;
BEGIN
 ASSERT (SELECT count(*) FROM private.meeting_notification_jobs WHERE series_id=sid AND event_type='series_change' AND target_phone IS NOT NULL)=1,
  'Only affected occurrence external recipients';
 FOR j IN SELECT private.claim_meeting_delivery_jobs(25,(SELECT user_id FROM series_test_users WHERE n=0),sid,'sms') LOOP
  IF j->>'event_type'='series_change' AND j->>'target_phone' IS NOT NULL THEN
   ASSERT j->>'target_phone'='09000000021','Other occurrence phone is excluded';
   ASSERT (j->'context'->>'meeting_id')::uuid IS NOT NULL,'Occurrence history linked';
   ASSERT j->'context'->>'external_schedule' LIKE '%زمان قبلی:%زمان جدید:%13:00 تا 14:00%',
    'Series old/new schedule survives claim';
  END IF;
 END LOOP;
END $$;
SELECT 'Calendar SMS enqueue, occurrence scope, safe retry and silent edits passed' AS result;
ROLLBACK;
