-- Transactional integration tests: no SMS/Push job or fixture is committed.
begin;
create temp table series_test_users as select gen_random_uuid() user_id,gen_random_uuid() session_id,n from generate_series(0,11)n;
grant select on series_test_users to authenticated;
insert into auth.users(id,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) select user_id,now(),now(),'{}','{}' from series_test_users;
insert into public.profiles(user_id,full_name,is_admin,account_status,is_active,profile_completion_status,registration_source)
select user_id,'Temporary series fixture '||n,n=0,'ACTIVE',true,'COMPLETE','imported' from series_test_users;
insert into public.user_preferences(user_id,notifications_enabled) select user_id,false from series_test_users;
insert into auth.sessions(id,user_id,created_at,updated_at,aal) select session_id,user_id,now(),now(),'aal1' from series_test_users;
insert into public.session_security_state(session_id,user_id,auth_epoch,idle_expiry_at,absolute_expiry_at)
select u.session_id,u.user_id,p.auth_epoch,now()+interval '1 hour',now()+interval '2 hours' from series_test_users u join public.profiles p on p.user_id=u.user_id;
insert into private.password_gateway_session_authorizations(session_id,user_id,login_method,identifier_hash,ip_hash,auth_session_created_at)
select session_id,user_id,'email',encode(extensions.digest('series-fixture','sha256'),'hex'),encode(extensions.digest('fixture','sha256'),'hex'),now() from series_test_users;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true) from series_test_users where n=0;
create temp table series_test_input as select gen_random_uuid() operation_id,
(select jsonb_agg(jsonb_build_object('user_id',u.user_id,'subject','Recurring fixture','location','Test room','representative','','phone','','status','archived','status_type','scheduled','request_date',('2027-01-03'::date+d.day_index*7)::text,'start_time','09:00','end_time','10:00','repeat_type','weekly','repeat_interval',1,'repeat_end_date','1406/10/01','send_sms',true,'reminder_minutes',15,'participant_user_ids',(select jsonb_agg(user_id) from series_test_users where n between 1 and 10),'notify_users',(select jsonb_agg(user_id) from series_test_users where n between 1 and 3))) from generate_series(0,51)d(day_index) cross join series_test_users u where u.n=0) records;
grant select on series_test_input to authenticated;
set local role authenticated;
do $$ declare ids uuid[]; again uuid[]; begin
 assert private.is_current_session_fully_authorized(),'fixture session must be FULL';
 select public.create_meeting_series(operation_id,records,'[{"title":"Agenda fixture"}]','هر هفته یکشنبه') into ids from series_test_input;
 assert cardinality(ids)=52,'all 52 occurrences created';
 select public.create_meeting_series(operation_id,records,'[{"title":"Agenda fixture"}]','هر هفته یکشنبه') into again from series_test_input;
 assert ids=again,'retry reuses the same operation';
end $$;
reset role;
do $$ declare s uuid:=(select operation_id from series_test_input); begin
 assert (select count(*) from public.meetings where series_id=s)=52,'52 persisted meetings';
 assert (select count(*) from public.meeting_agenda_items a join public.meetings m on m.id=a.meeting_id where m.series_id=s)=52,'agenda copied to all occurrences';
 assert (select count(*) from public.meeting_inbox i join public.meetings m on m.id=i.meeting_id where m.series_id=s)=520,'all invitations retained';
 assert (select count(*) from private.meeting_notification_jobs where series_id=s)=11,'one SMS job per unique internal recipient, not per occurrence';
 assert (select count(*) from public.notifications where metadata->>'series_id'=s::text)=11,'one internal notification per unique recipient';
 assert not exists(select 1 from private.meeting_notification_jobs where series_id=s and context->>'occurrence_count'<>'52'),'summary includes the entire series';
end $$;
-- Scoped people edits follow creation order even when a later occurrence was moved.
savepoint scoped_people_edit;
create temp table scoped_series_fixture as
select first_id, anchor_id, last_id
from private.meeting_series_batches b
cross join lateral (
  select b.meeting_ids[1] first_id, b.meeting_ids[51] anchor_id, b.meeting_ids[52] last_id
) ids
where b.id=(select operation_id from series_test_input);
grant select on scoped_series_fixture to authenticated;
insert into public.contacts_email(user_id,name,phone)
select user_id,'Scoped outside observer','09128887766' from series_test_users where n=0;
select set_config('spark.series_notify','off',true);
update public.meetings set request_date=((now() at time zone 'Asia/Tehran')::date+60)::text
where id=(select anchor_id from scoped_series_fixture);
update public.meetings set request_date=((now() at time zone 'Asia/Tehran')::date+50)::text,
 external_informees=array['Occurrence-specific observer']
where id=(select last_id from scoped_series_fixture);
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);

set local role authenticated;
do $$ begin
 assert public.update_meeting_series_scope_v1(
  (select anchor_id from scoped_series_fixture),'following','{}',
  '{"external_informees":{"add":["Scoped outside observer"],"remove":[]}}',true
 )=2,'following scope includes the selected and moved later occurrence';
end $$;
reset role;
do $$ begin
 assert (select external_informees from public.meetings where id=(select last_id from scoped_series_fixture))
   =array['Occurrence-specific observer','Scoped outside observer'],'keep the occurrence-specific observer';
 assert not exists(select from public.meetings where id=(select first_id from scoped_series_fixture)
   and 'Scoped outside observer'=any(external_informees)),'earlier occurrence is untouched';
 assert exists(select from private.meeting_notification_jobs
   where series_id=(select operation_id from series_test_input) and audience='external_observers'
     and event_type='series_invite' and jsonb_array_length(meetings)=2
     and context ? 'external_schedule'),'external observer gets the exact changed schedule';
end $$;
rollback to savepoint scoped_people_edit;

-- A new user added to every occurrence gets exactly one invitation. Existing
-- recipients receive no change alert solely for the membership change.
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);
delete from public.notifications where metadata->>'series_id'=(select operation_id::text from series_test_input);
set local role authenticated;
do $$ declare ids uuid[]; begin
 select array_agg(id) into ids from public.meetings where series_id=(select operation_id from series_test_input);
 perform public.update_meeting_series(ids,jsonb_build_object('participant_user_ids',(select jsonb_agg(user_id) from series_test_users where n between 1 and 11)),true);
end $$;
reset role;
do $$ begin
 assert (select count(*) from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input))=1,'only the newly added user notified';
 assert (select recipient_id from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input))=(select user_id from series_test_users where n=11),'new recipient selected';
end $$;
-- Single occurrence changes do not fan out to all occurrences.
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);
set local role authenticated;
do $$ declare id uuid; begin
 select m.id into id from public.meetings m where series_id=(select operation_id from series_test_input) order by request_date limit 1;
 perform public.update_meeting_series(array[id],'{"location":"New room"}',true);
end $$;
reset role;
do $$ begin
 assert (select count(*) from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input))=12,'one affected occurrence, 12 distinct users';
 assert not exists(select 1 from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input) and jsonb_array_length(meetings)<>1),'no unaffected occurrence included';
end $$;
-- Policy and silent updates preserve the existing explicit choice.
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);
set local role authenticated;
do $$ begin
 perform public.update_meeting_series((select array_agg(id) from public.meetings where series_id=(select operation_id from series_test_input)),'{"location":"Silent room"}',false);
end $$;
reset role;
do $$ begin assert not exists(select 1 from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input)),'silent update emits no jobs'; end $$;
select set_config('spark.series_notify','on',true);
-- A due reminder is generated by the server and deduplicates across repeated ticks.
update public.meetings set request_date=(((now()+interval '30 minutes') at time zone 'Asia/Tehran')::date)::text,
 start_time=to_char((now()+interval '30 minutes') at time zone 'Asia/Tehran','HH24:MI'),
 end_time=to_char((now()+interval '60 minutes') at time zone 'Asia/Tehran','HH24:MI'),reminder_minutes=60
 where id=(select id from public.meetings where series_id=(select operation_id from series_test_input) order by request_date limit 1);
-- Accept the fixture invitations: pending/declined people must not be reminded.
update public.meeting_inbox set status='accepted' where meeting_id in(select id from public.meetings where series_id=(select operation_id from series_test_input));
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);
delete from public.notifications where metadata->>'series_id'=(select operation_id::text from series_test_input);
select private.materialize_series_reminders();
select private.materialize_series_reminders();
do $$ begin
 assert (select count(*) from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input) and event_type='series_reminder')=12,'one reminder per current recipient';
 assert not exists(select 1 from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input) and event_type='series_reminder' and status='pending'),'reminder SMS defaults off';
 assert (select count(*) from public.notifications where metadata->>'series_id'=(select operation_id::text from series_test_input))=12,'server reminders appear internally once';
end $$;
-- Claim/lease/ack SQL path, without invoking the provider.
update private.recurring_notification_policy set reminder_sms=true;
update private.meeting_notification_jobs set status='pending' where series_id=(select operation_id from series_test_input) and event_type='series_reminder';
-- The connected database can already contain unrelated cancellation jobs.
-- The worker claims globally; assertions and acknowledgements belong only to
-- this rolled-back fixture's series, never to pre-existing work.
create temp table claimed_meeting_jobs as
select j from public.claim_meeting_notification_jobs(100) as claimed(j)
where j->>'series_id'=(select operation_id::text from series_test_input);
do $$ declare row jsonb; begin
 assert (select count(*) from claimed_meeting_jobs)=12,'claim returns expected due recipients';
 for row in select j from claimed_meeting_jobs loop
  perform public.finish_meeting_notification_job((row->>'id')::uuid,(row->>'lease')::uuid,'sent',null);
 end loop;
 assert not exists(select 1 from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input) and status='processing'),'leases completed';
end $$;
-- Deleting all occurrences queues a single cancellation per recipient. Jobs
-- survive meeting deletion and remain available for delivery.
delete from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input);
create temp table series_test_ids as select id from public.meetings where series_id=(select operation_id from series_test_input);
grant select on series_test_ids to authenticated;
-- Outsiders cannot update an owned series or change administrator policy.
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true) from series_test_users where n=11;
set local role authenticated;
do $$ begin
 begin
  perform public.update_meeting_series((select array_agg(id) from series_test_ids),'{"location":"Attack"}',true);
  raise exception 'outsider unexpectedly permitted';
 exception when others then assert sqlerrm='SERIES_OWNERSHIP_REQUIRED','must reject outsider at ownership gate'; end;
 begin perform public.set_recurring_notification_policy('{}'); raise exception 'policy unexpectedly permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from public.meeting_inbox where meeting_id in(select id from series_test_ids);
delete from public.meetings where series_id=(select operation_id from series_test_input);
do $$ begin
 assert (select count(*) from private.meeting_notification_jobs where series_id=(select operation_id from series_test_input) and event_type='series_cancel')=12,'bulk cancellation is one per recipient';
end $$;
rollback;
