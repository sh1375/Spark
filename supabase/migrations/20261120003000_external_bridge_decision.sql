create function public.get_external_bridge_decision(p_capability text,p_ref text,p_recipient uuid)
returns text language sql stable security definer set search_path='' as $$
  select coalesce(decision,case when expires_at<=now() then 'expired' else 'pending' end)
  from private.external_call_invitations
  where capability=p_capability and provider_ref=p_ref and left(p_ref,7)='bridge:' and recipient_id=p_recipient
$$;
revoke all on function public.get_external_bridge_decision(text,text,uuid) from public,anon,authenticated;
grant execute on function public.get_external_bridge_decision(text,text,uuid) to service_role;
notify pgrst,'reload schema';
