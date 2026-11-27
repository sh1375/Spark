-- Realtime 2.174.6 / PostgreSQL 17 tenant-schema regression check.
-- Run explicitly against an isolated tenant clone or a live database using psql
-- -X -v ON_ERROR_STOP=1 -f deploy/spark-cli/diagnose-realtime-2.174.6.sql.
-- This check is read-only and does not mark any upstream migration as applied.
BEGIN READ ONLY;
DO $check$
DECLARE
  problems text[] := ARRAY[]::text[];
  migration_count bigint;
BEGIN
  IF to_regclass('realtime.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Realtime tenant migration ledger is missing';
  END IF;
  SELECT count(*) INTO migration_count FROM realtime.schema_migrations;
  IF migration_count < 98 THEN
    problems := array_append(problems, format('tenant migration ledger has %s entries; expected at least 98 for v2.174.6', migration_count));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM realtime.schema_migrations WHERE version = 20211210212804) THEN
    problems := array_append(problems, 'generic subscription claims migration is not recorded');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'realtime' AND table_name = 'subscription' AND column_name = 'subscription_id'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'realtime' AND table_name = 'subscription' AND column_name = 'user_id'
  ) THEN
    problems := array_append(problems, 'subscription identity columns do not match reference');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='realtime' AND table_name='messages' AND column_name='skip_broadcast'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='realtime' AND table_name='messages' AND column_name='expires_at'
  ) THEN
    problems := array_append(problems, 'required message columns are missing');
  END IF;
  IF to_regprocedure('realtime.filters_hash(realtime.user_defined_filter[])') IS NULL
    OR to_regprocedure('realtime.list_changes_sync(name,name,integer,integer)') IS NULL
    OR to_regprocedure('realtime.settled_changes(name,integer,text[])') IS NULL THEN
    problems := array_append(problems, 'required Realtime functions are missing');
  END IF;
  IF to_regclass('realtime.messages_replay_index') IS NULL
    OR to_regclass('realtime.subscription_subscription_id_entity_filters_hash_key') IS NULL THEN
    problems := array_append(problems, 'required Realtime indexes are missing');
  END IF;
  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Realtime tenant schema not ready: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'Realtime tenant schema readiness checks passed (% recorded migrations)', migration_count;
END
$check$;
ROLLBACK;
