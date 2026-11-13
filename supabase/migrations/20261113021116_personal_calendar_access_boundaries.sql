-- Shared calendar membership is granted by its owner, never by a self-subscription.
ALTER POLICY "Users can view public/shared calendars" ON public.calendars
USING (type = 'public');
ALTER POLICY "Users can insert own subscriptions" ON public.calendar_subscriptions
WITH CHECK (
  user_id = (SELECT auth.uid()) AND permission = 'view'
  AND EXISTS (SELECT FROM public.calendars c WHERE c.id=calendar_id AND c.type='public')
);
CREATE POLICY "Calendar owners can update subscriptions" ON public.calendar_subscriptions
FOR UPDATE TO authenticated
USING (EXISTS (SELECT FROM public.calendars c WHERE c.id=calendar_id AND c.user_id=(SELECT auth.uid())))
WITH CHECK (permission IN ('view','edit') AND EXISTS (
  SELECT FROM public.calendars c WHERE c.id=calendar_id AND c.user_id=(SELECT auth.uid())
));

-- Following one shared calendar must not reveal its owner's unrelated legacy meetings.
CREATE OR REPLACE FUNCTION private.is_any_participant_calendar_subscribed(participant_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
SELECT EXISTS (
  SELECT FROM public.calendar_subscriptions s JOIN public.calendars c ON c.id=s.calendar_id
  WHERE s.user_id=auth.uid() AND s.permission IN ('view','edit')
    AND c.type='public' AND c.user_id=ANY(coalesce(participant_ids,'{}'::uuid[]))
);
$function$;

CREATE POLICY "Calendar owners can read their calendar meetings" ON public.meetings
FOR SELECT TO authenticated USING (EXISTS (
  SELECT FROM public.calendars c WHERE c.id=calendar_id
    AND c.user_id=(SELECT auth.uid()) AND c.type IN ('shared','public')
));

-- Monitoring may legitimately read a wider set of meetings. Personal calendar
-- reads must still have an explicit calendar/invitation relationship.
CREATE OR REPLACE FUNCTION public.get_my_calendar_meetings_v1(p_from date, p_to date)
RETURNS SETOF public.meetings LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT m.* FROM public.meetings m
  WHERE auth.uid() IS NOT NULL AND private.is_current_session_fully_authorized()
    AND p_from IS NOT NULL AND p_to >= p_from AND p_to-p_from <= 366
    AND m.status <> 'closed' AND m.request_local_date BETWEEN p_from AND p_to
    AND NOT EXISTS (SELECT FROM public.meeting_calendar_exclusions e
      WHERE e.meeting_id=m.id AND e.user_id=auth.uid())
    AND (m.user_id=auth.uid() OR NOT EXISTS (
      SELECT FROM public.meeting_inbox i WHERE i.meeting_id=m.id
        AND i.user_id=auth.uid() AND i.status IN ('pending','declined')
    ))
    AND (
      m.user_id=auth.uid()
      OR auth.uid()=ANY(coalesce(m.participant_user_ids,'{}'::uuid[]))
      OR auth.uid()=ANY(coalesce(m.notify_users,'{}'::uuid[]))
      OR EXISTS (SELECT FROM public.meeting_inbox i WHERE i.meeting_id=m.id
        AND i.user_id=auth.uid() AND i.status IN ('accepted','delegated'))
      OR EXISTS (SELECT FROM public.calendars c WHERE c.id=m.calendar_id AND c.user_id=auth.uid())
      OR (NOT coalesce(m.members_only,false) AND (
        (m.calendar_id IS NOT NULL AND EXISTS (
          SELECT FROM public.calendar_subscriptions s WHERE s.calendar_id=m.calendar_id
            AND s.user_id=auth.uid() AND s.permission IN ('view','edit')
        ))
        OR (m.calendar_id IS NULL AND private.is_any_participant_calendar_subscribed(
          ARRAY[m.user_id] || coalesce(m.participant_user_ids,'{}'::uuid[])
        ))
      ))
    )
  ORDER BY m.start_time, m.id;
$function$;
REVOKE ALL ON FUNCTION public.get_my_calendar_meetings_v1(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_meetings_v1(date,date) TO authenticated, service_role;
