-- Fixtures and read receipts are rolled back. No messages are delivered.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
CREATE TEMP TABLE unread_users AS
SELECT gen_random_uuid() AS user_id, gen_random_uuid() AS session_id, n FROM generate_series(1,3) n;
INSERT INTO auth.users(id,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
SELECT user_id,now(),now(),'{}','{}' FROM unread_users;
INSERT INTO public.profiles(user_id,full_name,account_status,is_active,profile_completion_status,registration_source)
SELECT user_id,'Unread count fixture','ACTIVE',true,'COMPLETE','imported' FROM unread_users;
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal)
SELECT session_id,user_id,now(),now(),'aal1' FROM unread_users;
INSERT INTO public.session_security_state(session_id,user_id,auth_epoch,idle_expiry_at,absolute_expiry_at)
SELECT u.session_id,u.user_id,p.auth_epoch,now()+interval '1 hour',now()+interval '2 hours'
FROM unread_users u JOIN public.profiles p USING(user_id);
CREATE TEMP TABLE unread_threads AS
SELECT gen_random_uuid() AS id, kind FROM (VALUES ('chat'),('group'),('channel'),('other')) k(kind);
CREATE TEMP TABLE unread_messages AS
SELECT t.id AS thread_id,t.kind,gen_random_uuid() AS id,n
FROM unread_threads t CROSS JOIN generate_series(1,4) n;
GRANT SELECT ON unread_users,unread_threads,unread_messages TO authenticated;

INSERT INTO public.chat_conversations(id,participant_a,participant_b,created_by)
SELECT t.id,least(viewer.user_id,sender.user_id),greatest(viewer.user_id,sender.user_id),viewer.user_id
FROM unread_threads t CROSS JOIN unread_users viewer CROSS JOIN unread_users sender
WHERE t.kind='chat' AND viewer.n=1 AND sender.n=2;
INSERT INTO public.chat_messages(id,conversation_id,sender_id,body,deleted_for_receiver)
SELECT m.id,m.thread_id,u.user_id,'Unread count fixture',m.n=4
FROM unread_messages m JOIN unread_users u ON u.n=CASE WHEN m.n=3 THEN 1 ELSE 2 END
WHERE m.kind='chat';

INSERT INTO public.channels(id,name,type,created_by,is_private)
SELECT t.id,'Unread count fixture '||t.kind,CASE WHEN t.kind='group' THEN 'group' ELSE 'channel' END,u.user_id,true
FROM unread_threads t CROSS JOIN unread_users u WHERE t.kind<>'chat' AND u.n=2;
INSERT INTO public.channel_members(channel_id,user_id)
SELECT t.id,u.user_id FROM unread_threads t CROSS JOIN unread_users u
WHERE t.kind IN ('group','channel') AND u.n=1;
INSERT INTO public.channel_messages(id,channel_id,sender_id,body,deleted_for_all)
SELECT m.id,m.thread_id,u.user_id,'Unread count fixture',m.n=4
FROM unread_messages m JOIN unread_users u ON u.n=CASE WHEN m.n=3 THEN 1 ELSE 2 END
WHERE m.kind<>'chat';

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'session_id',session_id,'role','authenticated','aal','aal1')::text,true)
FROM unread_users WHERE n=1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  t record;
  seen uuid;
  other uuid := (SELECT id FROM unread_messages WHERE kind='other' AND n=1);
BEGIN
  ASSERT private.is_current_session_fully_authorized(),'fixture requires FULL access';
  ASSERT (SELECT count(*) FROM public.get_message_unread_counts_v1())=3,'visible unread threads only';
  FOR t IN SELECT * FROM unread_threads WHERE kind<>'other' LOOP
    ASSERT (SELECT unread_count FROM public.get_message_unread_counts_v1() WHERE thread_id=t.id AND thread_kind=t.kind)=2,
      'own and deleted messages excluded in '||t.kind;
    SELECT id INTO seen FROM unread_messages WHERE kind=t.kind AND n=1;
    PERFORM public.mark_visible_messages_read_v1(t.id,t.kind<>'chat',ARRAY[seen,other]);
    PERFORM public.mark_visible_messages_read_v1(t.id,t.kind<>'chat',ARRAY[seen]);
    ASSERT (SELECT unread_count FROM public.get_message_unread_counts_v1() WHERE thread_id=t.id)=1,
      'only observed message removed in '||t.kind;
  END LOOP;
  PERFORM public.mark_visible_messages_read_v1((SELECT id FROM unread_threads WHERE kind='other'),true,ARRAY[other]);
END;
$$;
RESET ROLE;
DO $$
BEGIN
  ASSERT EXISTS (SELECT FROM public.chat_message_read_log WHERE message_id=(SELECT id FROM unread_messages WHERE kind='chat' AND n=1)),
    'chat read audit recorded';
  ASSERT (SELECT count(*) FROM public.channel_message_read_log WHERE message_id IN (SELECT id FROM unread_messages))=2,
    'exact channel and group IDs logged, unauthorized channel untouched';
END;
$$;
SELECT 'Unread counts, partial reads, retry and membership boundaries passed' AS result;
ROLLBACK;
