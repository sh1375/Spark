-- Exercise DELETE coverage for every source attached to the shared broadcaster.
-- Zero-row deletes leave user rows untouched, and all broadcasts are rolled back.
begin isolation level repeatable read;

do $$
declare
  broadcaster regprocedure := 'private.broadcast_app_data_change()'::regprocedure;
  t record;
  source regclass;
  before_total bigint;
  before_private bigint;
  before_exact bigint;
  after_total bigint;
  after_private bigint;
  after_exact bigint;
begin
  for t in
    -- Require the existing server sources, including legacy conference coverage,
    -- even if their triggers disappear from the catalog.
    select * from (values
      ('public', 'conference_rooms'),
      ('public', 'conference_participants'),
      ('public', 'conference_messages'),
      ('public', 'conference_message_reactions'),
      ('public', 'conference_message_mentions'),
      ('public', 'conference_recordings'),
      ('public', 'conference_recording_consents'),
      ('public', 'conference_waiting_room'),
      ('public', 'conference_speaker_sessions'),
      ('public', 'conference_spotlights'),
      ('public', 'conference_polls'),
      ('public', 'conference_poll_options'),
      ('public', 'conference_poll_votes'),
      ('public', 'conference_private_messages'),
      ('public', 'conference_moderator_messages'),
      ('public', 'conference_presentations'),
      ('public', 'conference_presentation_state'),
      ('public', 'conference_presentation_annotations'),
      ('public', 'conference_whiteboard_pages'),
      ('public', 'conference_whiteboard_boards'),
      ('private', 'conference_role_assignments'),
      ('private', 'conference_role_permissions'),
      ('private', 'conference_permissions'),
      ('private', 'conference_rbac_roles'),
      ('public', 'conference_whiteboard'),
      ('public', 'pending_approvals'),
      ('public', 'banned_users'),
      ('public', 'user_presence'),
      ('public', 'call_sessions'),
      ('private', 'chat_call_history_hidden'),
      ('public', 'chat_message_read_log')
    ) as required_sources(schema_name, table_name)
    union
    select n.nspname::text, c.relname::text
    from pg_catalog.pg_trigger as g
    join pg_catalog.pg_class as c on c.oid = g.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where g.tgfoid = broadcaster
    order by 1, 2
  loop
    source := to_regclass(format('%I.%I', t.schema_name, t.table_name));

    if not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = source and tgfoid = broadcaster
        and tgname = 'spark_live_data_change'
        and tgenabled = 'O' and (tgtype & 75) = 8
    ) then
      raise exception 'Shared broadcast trigger required on %.%', t.schema_name, t.table_name;
    end if;

    -- Mask row, before, delete, and instead-of bits. Other events may also be set.
    if exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = source and tgfoid = broadcaster
        and (tgenabled <> 'O' or (tgtype & 75) <> 8)
    ) then
      raise exception 'Shared broadcast triggers on %.% must be enabled AFTER DELETE statement triggers',
        t.schema_name, t.table_name;
    end if;

    select count(*), count(*) filter (where private is true),
           count(*) filter (where private is true and payload = jsonb_build_object('table', t.table_name))
    into before_total, before_private, before_exact
    from realtime.messages
    where topic = 'app-data-changes' and event = 'data_changed'
      ;

    execute format('delete from %I.%I where false', t.schema_name, t.table_name);

    select count(*), count(*) filter (where private is true),
           count(*) filter (where private is true and payload = jsonb_build_object('table', t.table_name))
    into after_total, after_private, after_exact
    from realtime.messages
    where topic = 'app-data-changes' and event = 'data_changed'
      ;

    if after_total <> before_total + 1 or after_private <> before_private + 1
       or after_exact <> before_exact + 1 then
      raise exception 'Expected exactly one new matching broadcast, marked private, for %.% (total delta %, private delta %)',
        t.schema_name, t.table_name, after_total - before_total, after_private - before_private;
    end if;


  end loop;
end $$;

rollback;
