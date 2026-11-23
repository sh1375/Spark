-- Existing membership administration stays in place. The extra path only
-- permits a signed-in user to join a public group as an ordinary member.
CREATE POLICY channel_members_join_public_work_group
ON public.channel_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'member'
  AND private.is_current_session_fully_authorized()
  AND EXISTS (
    SELECT FROM public.channels c
    WHERE c.id = channel_id AND c.type = 'group' AND c.is_private IS FALSE
  )
);

CREATE FUNCTION public.join_public_work_group_v1(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT FROM public.channels
    WHERE id = p_group_id AND type = 'group' AND is_private IS FALSE
  ) THEN
    RAISE EXCEPTION 'PUBLIC_WORK_GROUP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_members (channel_id, user_id, role)
  VALUES (p_group_id, auth.uid(), 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END
$$;

REVOKE ALL ON FUNCTION public.join_public_work_group_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_work_group_v1(uuid) TO authenticated;
