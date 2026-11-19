CREATE FUNCTION public.get_message_unread_counts_v1()
RETURNS TABLE (thread_id uuid, thread_kind text, unread_count bigint)
LANGUAGE sql STABLE
SET search_path TO ''
AS $$
  WITH viewer AS (SELECT auth.uid() AS id)
  SELECT cm.conversation_id, 'chat'::text, count(*)
  FROM viewer u
  JOIN public.chat_conversations c ON u.id IN (c.participant_a, c.participant_b)
  JOIN public.chat_messages cm ON cm.conversation_id = c.id
  WHERE (CASE WHEN c.participant_a = u.id THEN c.deleted_for_a ELSE c.deleted_for_b END) IS NOT TRUE
    AND c.participant_a IS DISTINCT FROM c.participant_b
    AND cm.sender_id <> u.id
    AND cm.deleted_for_all IS FALSE
    AND cm.deleted_for_receiver IS FALSE
    AND NOT (coalesce(cm.read_by, ARRAY[]::text[]) @> ARRAY[u.id::text])
  GROUP BY cm.conversation_id
  UNION ALL
  SELECT m.channel_id, c.type, count(*)
  FROM viewer u
  JOIN public.channel_members mem ON mem.user_id = u.id
  JOIN public.channels c ON c.id = mem.channel_id
  JOIN public.channel_messages m ON m.channel_id = c.id
  WHERE c.type IN ('channel', 'group')
    AND m.sender_id IS DISTINCT FROM u.id
    AND m.deleted_for_all IS FALSE
    AND NOT (coalesce(m.read_by, ARRAY[]::uuid[]) @> ARRAY[u.id])
  GROUP BY m.channel_id, c.type;
$$;

-- The existing whole-thread RPCs remain available for their other callers.
-- An open view submits only the incoming message IDs that entered its viewport.
CREATE FUNCTION private.mark_visible_messages_read_v1(p_thread_id uuid, p_is_channel boolean, p_message_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT private.is_current_session_fully_authorized() THEN
    RAISE EXCEPTION 'FULL_SESSION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_message_ids), 0) > 100 THEN
    RAISE EXCEPTION 'MESSAGE_READ_BATCH_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  IF p_is_channel THEN
    WITH marked AS (
      UPDATE public.channel_messages m
      SET read_by = array_append(coalesce(m.read_by, ARRAY[]::uuid[]), v_user)
      WHERE m.channel_id = p_thread_id AND m.id = ANY(p_message_ids)
        AND m.sender_id IS DISTINCT FROM v_user
        AND m.deleted_for_all IS FALSE
        AND NOT (coalesce(m.read_by, ARRAY[]::uuid[]) @> ARRAY[v_user])
        AND EXISTS (SELECT 1 FROM public.channel_members mem
                    WHERE mem.channel_id = m.channel_id AND mem.user_id = v_user)
      RETURNING m.id
    )
    INSERT INTO public.channel_message_read_log(message_id, user_id, seen_at)
    SELECT id, v_user, now() FROM marked
    ON CONFLICT (message_id, user_id) DO NOTHING;
  ELSE
    WITH marked AS (
      UPDATE public.chat_messages m
      SET read_by = array_append(coalesce(m.read_by, ARRAY[]::text[]), v_user::text)
      WHERE m.conversation_id = p_thread_id AND m.id = ANY(p_message_ids)
        AND m.sender_id <> v_user
        AND m.deleted_for_all IS FALSE AND m.deleted_for_receiver IS FALSE
        AND NOT (coalesce(m.read_by, ARRAY[]::text[]) @> ARRAY[v_user::text])
        AND EXISTS (SELECT 1 FROM public.chat_conversations c
                    WHERE c.id = m.conversation_id AND v_user IN (c.participant_a, c.participant_b)
                      AND (CASE WHEN c.participant_a = v_user THEN c.deleted_for_a ELSE c.deleted_for_b END) IS NOT TRUE)
      RETURNING m.id
    )
    INSERT INTO public.chat_message_read_log(message_id, user_id, seen_at)
    SELECT id, v_user, now() FROM marked
    ON CONFLICT (message_id, user_id) DO NOTHING;
  END IF;
END;
$$;

CREATE FUNCTION public.mark_visible_messages_read_v1(p_thread_id uuid, p_is_channel boolean, p_message_ids uuid[])
RETURNS void
LANGUAGE sql
SET search_path TO ''
AS $$
  SELECT private.mark_visible_messages_read_v1(p_thread_id, p_is_channel, p_message_ids);
$$;

REVOKE ALL ON FUNCTION public.get_message_unread_counts_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_visible_messages_read_v1(uuid, boolean, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.mark_visible_messages_read_v1(uuid, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_message_unread_counts_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_visible_messages_read_v1(uuid, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.mark_visible_messages_read_v1(uuid, boolean, uuid[]) TO authenticated;
