-- Deployment may supply its Application-node URL during migration. Split
-- installations can also reuse the configured meeting or push worker origin.
do $$
declare endpoint text := nullif(current_setting('spark.external_call_alert_worker_url',true),'');
begin
 if endpoint is not null then
   if endpoint !~ '^https://[^/?#@[:space:]]+/functions/v1/external-call-alert-worker$' then raise exception 'Invalid worker URL'; end if;
   if not exists(select 1 from vault.secrets where name='external_call_alert_worker_url') then
     perform vault.create_secret(endpoint,'external_call_alert_worker_url');
   end if;
 end if;
end;
$$;
