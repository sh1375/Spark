create table private.external_call_connections (
  capability text primary key check (capability in ('audio', 'video', 'conference')),
  endpoint text not null default '',
  secret_id uuid references vault.secrets(id),
  sms_enabled boolean not null default false,
  bale_enabled boolean not null default false,
  sms_template text not null default '{caller} با شما تماس گرفته است. برای پاسخ، اسپارک را باز کنید.',
  bale_template text not null default '{caller} با شما تماس گرفته است. برای پاسخ، اسپارک را باز کنید.'
);
revoke all on private.external_call_connections from public, anon, authenticated;
insert into private.external_call_connections(capability) values ('audio'), ('video'), ('conference');

create function private.require_external_call_admin()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.is_current_session_fully_authorized(), false)
    or not exists (select 1 from public.profiles where user_id = auth.uid()
      and is_admin and is_active and account_status = 'ACTIVE') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_external_call_admin() from public, anon, authenticated;

create function public.get_external_call_connections()
returns table (capability text, endpoint text, has_key boolean, sms_enabled boolean,
  bale_enabled boolean, sms_template text, bale_template text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_external_call_admin();
  return query select c.capability, c.endpoint, c.secret_id is not null,
    c.sms_enabled, c.bale_enabled, c.sms_template, c.bale_template
    from private.external_call_connections c order by c.capability;
end;
$$;

create function public.save_external_call_connection(p_capability text, p_endpoint text, p_key text,
  p_sms_enabled boolean, p_bale_enabled boolean, p_sms_template text, p_bale_template text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  existing private.external_call_connections;
  endpoint text := btrim(p_endpoint);
begin
  perform private.require_external_call_admin();
  select * into strict existing from private.external_call_connections
    where capability = p_capability for update;
  if endpoint <> '' and endpoint !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[^?#[:space:]]*)?$' then
    raise exception 'Invalid HTTPS endpoint' using errcode = '22023';
  end if;
  if endpoint <> existing.endpoint and existing.secret_id is not null and nullif(p_key, '') is null then
    raise exception 'Changing the endpoint requires a new key' using errcode = '22023';
  end if;
  if nullif(p_key, '') is not null then
    if endpoint = '' then raise exception 'Endpoint required' using errcode = '22023'; end if;
    if existing.secret_id is null then
      existing.secret_id := vault.create_secret(p_key);
    else
      perform vault.update_secret(existing.secret_id, p_key);
    end if;
  end if;
  if btrim(p_sms_template) = '' or btrim(p_bale_template) = '' then
    raise exception 'Notification template required' using errcode = '22023';
  end if;
  update private.external_call_connections set endpoint = btrim(p_endpoint), secret_id = existing.secret_id,
    sms_enabled = p_sms_enabled, bale_enabled = p_bale_enabled,
    sms_template = p_sms_template, bale_template = p_bale_template where capability = p_capability;
end;
$$;
revoke all on function public.get_external_call_connections(), public.save_external_call_connection(text,text,text,boolean,boolean,text,text) from public, anon;
grant execute on function public.get_external_call_connections(), public.save_external_call_connection(text,text,text,boolean,boolean,text,text) to authenticated;
