-- Selection notifies the meeting creator; acceptance remains a separate event.
-- Existing custom/disabled templates and administrator delivery rules are preserved.
UPDATE public.notification_event_registry
SET sms_supported = true, updated_at = now()
WHERE event_key = 'meeting_invitation_delegate_selected';

INSERT INTO public.notification_templates
(category, event_type, audience, title, body, placeholders, is_active, icon, color)
VALUES ('meeting', 'meeting_invitation_delegate_selected', 'all',
'انتخاب جانشین دعوت جلسه',
'{{represented_person_name}}، {{representative_name}} را به‌عنوان جانشین خود برای شرکت در جلسه «{{meeting_subject}}» معرفی کرد.',
ARRAY['meeting_subject','represented_person_name','representative_name'], true, 'users', 'blue')
ON CONFLICT (category, event_type, audience) DO NOTHING;

INSERT INTO public.sms_templates
(category, event_type, audience, subject, body, placeholders, is_active)
VALUES ('meeting', 'meeting_invitation_delegate_selected', 'all',
'انتخاب جانشین دعوت جلسه',
'{{recipient_greeting}}، {{represented_person_name}}، {{representative_name}} را به‌عنوان جانشین خود برای شرکت در جلسه «{{meeting_subject}}» معرفی کرد.',
ARRAY['recipient_greeting','meeting_subject','represented_person_name','representative_name'], true)
ON CONFLICT (category, event_type, audience) DO NOTHING;

CREATE OR REPLACE FUNCTION private.assign_meeting_invitation_delegate(p_meeting_inbox_id uuid, p_delegate_user_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_inbox public.meeting_inbox%rowtype;
  v_meeting record;
  v_delegate_org text;
  v_user_org text;
  v_delegate_name text;
  v_user_name text;
  v_inbox_updated_at timestamptz;
  v_organizer_name text;
  v_organizer_context jsonb;
  v_organizer_event_key text;
  v_organizer_delivery jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'NOT_AUTHENTICATED');
  end if;

  select *
  into v_inbox
  from public.meeting_inbox
  where id = p_meeting_inbox_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'INBOX_NOT_FOUND');
  end if;

  if v_inbox.user_id is distinct from v_user_id then
    return jsonb_build_object('success', false, 'error_code', 'NOT_INBOX_OWNER');
  end if;

  if p_delegate_user_id = v_user_id then
    return jsonb_build_object('success', false, 'error_code', 'CANNOT_DELEGATE_TO_SELF');
  end if;

  if v_inbox.status not in ('pending', 'accepted') then
    return jsonb_build_object('success', false, 'error_code', 'INBOX_NOT_PENDING');
  end if;

  if v_inbox.delegate_to is not null then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_ALREADY_ASSIGNED');
  end if;

  v_inbox_updated_at := coalesce(v_inbox.updated_at, v_inbox.created_at);
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_inbox_updated_at then
    return jsonb_build_object('success', false, 'error_code', 'INBOX_VERSION_CONFLICT');
  end if;

  select id, user_id, subject, request_date, start_time, end_time, location,
         participant_user_ids, notify_users, calendar_id
  into v_meeting
  from public.meetings
  where id = v_inbox.meeting_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'MEETING_NOT_FOUND');
  end if;

  if v_inbox.status = 'accepted'
     and not (
       v_user_id = any(coalesce(v_meeting.participant_user_ids, '{}'::uuid[]))
       or v_user_id = any(coalesce(v_meeting.notify_users, '{}'::uuid[]))
     ) then
    return jsonb_build_object('success', false, 'error_code', 'ACCEPTED_INVITE_NOT_ON_CALENDAR');
  end if;

  if p_delegate_user_id = v_meeting.user_id then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_IS_ORGANIZER');
  end if;

  if p_delegate_user_id = any(coalesce(v_meeting.participant_user_ids, '{}'::uuid[])) then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_ALREADY_PARTICIPANT');
  end if;

  if exists (
    select 1
    from public.meeting_inbox
    where meeting_id = v_inbox.meeting_id
      and user_id = p_delegate_user_id
      and status in ('pending', 'accepted', 'delegated')
  ) then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_ALREADY_INVITED');
  end if;

  select organization
  into v_delegate_org
  from public.profiles
  where user_id = p_delegate_user_id
    and is_active = true
    and coalesce(is_hidden, false) = false
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_PROFILE_INVALID');
  end if;

  select organization
  into v_user_org
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if coalesce(v_user_org, '') <> coalesce(v_delegate_org, '') then
    return jsonb_build_object('success', false, 'error_code', 'DELEGATE_DIFFERENT_ORG');
  end if;

  v_user_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where user_id = v_user_id limit 1),
    'کاربر'
  );
  v_delegate_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where user_id = p_delegate_user_id limit 1),
    'جانشین'
  );

  -- Keep the delegator's current invitation state unchanged.
  -- delegate_to only marks that an unresolved delegation request exists.
  update public.meeting_inbox
  set delegate_to = p_delegate_user_id,
      delegated_by_user_id = v_user_id,
      delegated_at = now(),
      updated_at = now()
  where id = p_meeting_inbox_id;

  -- The delegate receives an actionable PENDING inbox item.
  insert into public.meeting_inbox (
    meeting_id,
    user_id,
    status,
    delegate_to,
    delegated_by_user_id,
    delegated_at
  )
  values (
    v_inbox.meeting_id,
    p_delegate_user_id,
    'pending',
    null,
    v_user_id,
    now()
  )
  on conflict (meeting_id, user_id) do update
  set status = 'pending',
      delegate_to = null,
      delegated_by_user_id = v_user_id,
      delegated_at = now(),
      updated_at = now();

  perform public.create_notification(
    p_user_id := p_delegate_user_id,
    p_title := 'درخواست جانشینی در جلسه',
    p_message := v_user_name || ' از شما درخواست کرده به‌عنوان جانشین او در جلسه «' ||
      coalesce(v_meeting.subject, '') || '» حضور داشته باشید. لطفاً از کارتابل جلسات تأیید یا رد کنید.',
    p_type := 'meeting',
    p_action_url := 'calendar',
    p_template_category := 'meeting',
    p_template_event_type := 'meeting_invitation_delegate_assigned',
    p_template_audience := 'all',
    p_entity_type := 'meeting',
    p_entity_id := v_inbox.meeting_id,
    p_metadata := jsonb_build_object(
      'meeting_id', v_inbox.meeting_id,
      'meeting_subject', coalesce(v_meeting.subject, ''),
      'meeting_date', coalesce(v_meeting.request_date, ''),
      'start_time', coalesce(v_meeting.start_time, ''),
      'end_time', coalesce(v_meeting.end_time, ''),
      'location', coalesce(v_meeting.location, ''),
      'represented_person_name', v_user_name,
      'representative_name', v_delegate_name,
      'recipient_greeting', v_delegate_name || ' گرامی',
      'full_name', v_delegate_name
    ),
    p_event_key := 'meeting:' || v_inbox.meeting_id::text || ':delegate-requested:' ||
      v_user_id::text || ':' || p_delegate_user_id::text || ':' || extract(epoch from now())::bigint::text
  );


  -- The creator must hear about selection immediately, independently of acceptance.
  -- Queue both channels once; materialize in-app now, leaving only SMS to the worker.
  if v_meeting.user_id is not null and v_meeting.user_id <> v_user_id then
    select coalesce(nullif(btrim(full_name), ''), 'برگزارکننده')
      into v_organizer_name from public.profiles
      where user_id = v_meeting.user_id limit 1;

    v_organizer_context := jsonb_build_object(
      'meeting_id', v_inbox.meeting_id,
      'meeting_subject', coalesce(v_meeting.subject, ''),
      'meeting_date', coalesce(v_meeting.request_date, ''),
      'start_time', coalesce(v_meeting.start_time, ''),
      'end_time', coalesce(v_meeting.end_time, ''),
      'location', coalesce(v_meeting.location, ''),
      'represented_person_name', v_user_name,
      'representative_name', v_delegate_name,
      'organizer_name', coalesce(v_organizer_name, 'برگزارکننده'),
      'recipient_greeting', coalesce(v_organizer_name, 'برگزارکننده') || ' گرامی',
      'full_name', coalesce(v_organizer_name, 'برگزارکننده'),
      'action_url', 'meetings',
      'meeting_link', 'meetings'
    );
    v_organizer_event_key := 'meeting:' || v_inbox.meeting_id::text ||
      ':delegate-selected:' || p_meeting_inbox_id::text || ':' ||
      p_delegate_user_id::text || ':' || extract(epoch from now())::text;

    v_organizer_delivery := public.resolve_and_queue_notification(
      p_event_key := 'meeting_invitation_delegate_selected',
      p_recipient_user_id := v_meeting.user_id,
      p_audience := 'organizer',
      p_entity_type := 'meeting',
      p_entity_id := v_inbox.meeting_id,
      p_actor_user_id := v_user_id,
      p_context := v_organizer_context,
      p_idempotency_key := v_organizer_event_key
    );
    if coalesce((v_organizer_delivery->>'queued')::boolean, false) then
      perform public.create_notification(
        p_user_id := v_meeting.user_id,
        p_title := 'انتخاب جانشین دعوت جلسه',
        p_message := v_user_name || '، ' || v_delegate_name ||
          ' را به‌عنوان جانشین خود برای شرکت در جلسه «' ||
          coalesce(v_meeting.subject, '') || '» معرفی کرد. درخواست در انتظار پاسخ جانشین است.',
        p_type := 'meeting',
        p_action_url := 'meetings',
        p_template_category := 'meeting',
        p_template_event_type := 'meeting_invitation_delegate_selected',
        p_template_audience := 'organizer',
        p_entity_type := 'meeting',
        p_entity_id := v_inbox.meeting_id,
        p_metadata := v_organizer_context,
        p_event_key := v_organizer_event_key
      );
      update public.notification_outbox
        set meeting_id = v_inbox.meeting_id,
            notification_status = 'sent'
        where id = (v_organizer_delivery->>'outbox_id')::uuid;
    elsif coalesce((v_organizer_delivery->>'ok')::boolean, false) is false
      and coalesce(v_organizer_delivery->>'reason', '') not in
        ('NOTIFICATION_DISABLED', 'GROUP_RULE_DISABLED', 'EVENT_NOT_FOUND_OR_INACTIVE') then
      -- Do not report success when a broken template silently drops delivery.
      raise exception 'DELEGATION_ORGANIZER_NOTIFICATION_FAILED: %', v_organizer_delivery;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'meeting_id', v_inbox.meeting_id,
    'delegate_user_id', p_delegate_user_id,
    'delegate_name', v_delegate_name,
    'organizer_delivery', v_organizer_delivery,
    'status', 'pending',
    'message', 'درخواست جانشینی به کارتابل کاربر ارسال شد.'
  );
end;
$function$
;
