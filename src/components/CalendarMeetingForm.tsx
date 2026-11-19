import { useLiveData, LIVE_DATA } from '../shared/realtime/useLiveData';
import { createMeetingSeries } from '../features/meetings/services/createMeetingSeries';
import { agendaItemsForSave, type LinkedAgendaItem } from '../lib/linkedAgendaDecisions';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { MeetingCreationRecoveryError, saveNewMeetingDetails } from '../features/meetings/services/saveNewMeetingDetails';
import { insertNotification } from '../lib/notifications';
import type { SmsDispatchResult } from '../lib/notifications';
import { getMeetingTemplateKey } from '../config/templateCatalog';
import { computeScopedMeetingChangeSet } from '../lib/meetingEditDiff';
import type { MeetingChangeSet } from '../lib/meetingEditDiff';
import toast from 'react-hot-toast';
import moment from 'moment-jalaali';
import { ContactEmail, AgendaItem } from '../types';
import { useOrgUsers, FALLBACK_NAME, LOADING_NAME } from '../lib/useOrgUsers';
import { CalendarMeetingFormView } from './CalendarMeetingForm/CalendarMeetingFormView';
import { validateScheduleTimes } from './CalendarMeetingForm/validateScheduleTimes';
import { commitCalendarMeetingEdit } from './CalendarMeetingForm/commitEdit';
import {
  buildCalendarRepeatRecords,
  sendSmsToExternals,
  showSmsSummary,
} from './CalendarMeetingForm/services';
import type { ExternalSmsResult } from './CalendarMeetingForm/services';
import type {
  CalendarMeetingFormProps,
  CommitSnapshot,
} from './CalendarMeetingForm/types';
import { mapOrgGroupsToMultiSelectGroups } from '../lib/orgUserOptions';

export type { CommitSnapshot } from './CalendarMeetingForm/types';

export function CalendarMeetingForm({ onSuccess, onCancel, prefillData, calendars = [] }: CalendarMeetingFormProps) {
  const [loading, setLoading] = useState(false);
  const seriesOperationRef = useRef(crypto.randomUUID());
  const creationRecoveryErrorRef = useRef<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [subject, setSubject] = useState('');
  const [location, setLocation] = useState('');
  const [representative, setRepresentative] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('medium');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [scheduleDate, setScheduleDate] = useState<{jy:number;jm:number;jd:number}|null>(null);
  // Identity is an input, never mutable draft state. Similar drafts cannot edit the source.
  const prefillMeetingId = prefillData?.mode === 'create' ? null : prefillData?.meetingId || null;
  const prefillEditAllIds = prefillMeetingId && prefillData?.editAllIds?.length ? prefillData.editAllIds : null;
  const currentEditIdRef = useRef(prefillMeetingId);
  currentEditIdRef.current = prefillMeetingId;
  const [saveContact, setSaveContact] = useState(false);
  const [membersOnly, setMembersOnly] = useState(false);
  const lastPrefillRef = useRef<string>('');

  const [selectedParticipants, setSelectedParticipants] = useState<{id:string;name:string}[]>([]);
  const [selectedNotifyUsers, setSelectedNotifyUsers] = useState<{id:string;name:string}[]>([]);

  const [contacts, setContacts] = useState<ContactEmail[]>([]);
  const [externalSearch, setExternalSearch] = useState('');
  const [selectedExternal, setSelectedExternal] = useState<string[]>([]);
  const [showExternalDropdown, setShowExternalDropdown] = useState(false);
  const [newExternalName, setNewExternalName] = useState('');
  const [newExternalPhone, setNewExternalPhone] = useState('');
  const [newExternalCompany, setNewExternalCompany] = useState('');
  const [newExternalPosition, setNewExternalPosition] = useState('');
  const [showAddExternal, setShowAddExternal] = useState(false);
  const externalSearchRef = useRef<HTMLDivElement>(null);

  const [externalInformeeSearch, setExternalInformeeSearch] = useState('');
  const [selectedExternalInformees, setSelectedExternalInformees] = useState<string[]>([]);
  const [showExternalInformeeDropdown, setShowExternalInformeeDropdown] = useState(false);
  const externalInformeeSearchRef = useRef<HTMLDivElement>(null);

  const [allContacts, setAllContacts] = useState<ContactEmail[]>([]);
  const [showRepPicker, setShowRepPicker] = useState(false);
  const [repPickerSearch, setRepPickerSearch] = useState('');
  const [repFromContacts, setRepFromContacts] = useState(false);
  const repPickerRef = useRef<HTMLDivElement>(null);

  const [showManualDateTime, setShowManualDateTime] = useState(false);
  const [manualDateStr, setManualDateStr] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');

  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatType, setRepeatType] = useState<'weekly'|'monthly'>('weekly');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [repeatWeekday, setRepeatWeekday] = useState(0);
  const [repeatMonthlyMode, setRepeatMonthlyMode] = useState<'specific'|'nth'>('specific');
  const [repeatMonthlyNth, setRepeatMonthlyNth] = useState(1);
  const [repeatMonthlyNthWeekday, setRepeatMonthlyNthWeekday] = useState(0);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDatePickerJy, setEndDatePickerJy] = useState(() => moment().jYear());
  const [endDatePickerJm, setEndDatePickerJm] = useState(() => moment().jMonth() + 1);

  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [sendSms, setSendSms] = useState(false);
  const [meetingManager, setMeetingManager] = useState('');
  const [isOnline, setIsOnline] = useState(false);

  const [editDecision, setEditDecision] = useState<null | {
    changeSet: MeetingChangeSet;
    snapshot: CommitSnapshot;
  }>(null);
  const [committing, setCommitting] = useState(false);

  const [agendaEnabled, setAgendaEnabled] = useState(false);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaForm, setAgendaForm] = useState<{ title: string; presenter: string; duration_minutes: string; description: string }>({ title: '', presenter: '', duration_minutes: '', description: '' });
  const [editingAgendaIdx, setEditingAgendaIdx] = useState<number | null>(null);

  const { groups: orgGroups, allUsers: orgAllUsers, loading: orgUsersLoading, usersById } = useOrgUsers(userId);

  const systemUserGroups = mapOrgGroupsToMultiSelectGroups(orgGroups);

  const isPlaceholderName = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return true;
    if (trimmed === 'همکار گرامی' || trimmed === FALLBACK_NAME || trimmed === LOADING_NAME) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
    if (/^\S+@\S+\.\S+$/.test(trimmed)) return true;
    return false;
  };

  const resolveDisplayName = (uid: string, storedName?: string): string => {
    if (orgUsersLoading) return LOADING_NAME;
    const user = usersById[uid];
    if (user?.full_name?.trim()) return user.full_name.trim();
    if (storedName && !isPlaceholderName(storedName)) return storedName;
    return FALLBACK_NAME;
  };

  const participantDisplayItems = useMemo(
    () => selectedParticipants.map(p => ({ id: p.id, name: resolveDisplayName(p.id, p.name) })),
    [selectedParticipants, usersById, orgUsersLoading],
  );
  const notifyDisplayItems = useMemo(
    () => selectedNotifyUsers.map(u => ({ id: u.id, name: resolveDisplayName(u.id, u.name) })),
    [selectedNotifyUsers, usersById, orgUsersLoading],
  );
  const managerDisplayName = useMemo(
    () => meetingManager ? resolveDisplayName(meetingManager) : '',
    [meetingManager, usersById, orgUsersLoading],
  );

  const resolveUserName = (uid: string): string => resolveDisplayName(uid);

  const fetchContacts = async (uid: string) => {
    const { data } = await supabase.from('contacts_email').select('*').eq('user_id', uid).order('name');
    setContacts(data || []);
    setAllContacts(data || []);
  };

  useLiveData(LIVE_DATA.contacts, async () => { if (userId) await fetchContacts(userId); }, !!userId);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchContacts(user.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedCalendarId) return;
    const publicCal =
      calendars.find(c => c.is_personal_public && c.type === 'public') ||
      calendars.find(c => c.type === 'public' && !c.is_occasions);
    if (publicCal) setSelectedCalendarId(publicCal.id);
  }, [calendars]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repPickerRef.current && !repPickerRef.current.contains(e.target as Node)) setShowRepPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!prefillData) return;
    const key = JSON.stringify(prefillData);
    if (key === lastPrefillRef.current) return;
    lastPrefillRef.current = key;

    setSubject(prefillData.subject || '');
    setLocation(prefillData.location || '');
    setRepresentative(prefillData.representative || '');
    setPhone(prefillData.phone || '');
    setNotes(prefillData.notes || '');
    setPriority(prefillData.priority || 'medium');
    setStartTime(prefillData.startTime || '');
    setEndTime(prefillData.endTime || '');
    if (prefillData.dateJy && prefillData.dateJm && prefillData.dateJd) {
      setScheduleDate({ jy: prefillData.dateJy, jm: prefillData.dateJm, jd: prefillData.dateJd });
    }
    if (prefillMeetingId) {
      loadMeetingParticipants(prefillMeetingId);
    }
    if (prefillData.calendarId) setSelectedCalendarId(prefillData.calendarId);
    if (prefillData.membersOnly !== undefined) setMembersOnly(prefillData.membersOnly);
    if (prefillData.repeatEnabled) {
      setRepeatEnabled(true);
      if (prefillData.repeatType) setRepeatType(prefillData.repeatType);
      if (prefillData.repeatInterval) setRepeatInterval(prefillData.repeatInterval);
      if (prefillData.repeatEndDate) setRepeatEndDate(prefillData.repeatEndDate);
      if (prefillData.repeatWeekday !== undefined) setRepeatWeekday(prefillData.repeatWeekday);
    }
    if (prefillData.participantUserIds && prefillData.participantUserIds.length > 0) {
      setSelectedParticipants(prefillData.participantUserIds.map((id: string) => ({ id, name: '' })));
    }
    if (prefillData.notifyUserIds && prefillData.notifyUserIds.length > 0) {
      setSelectedNotifyUsers(prefillData.notifyUserIds.map((id: string) => ({ id, name: '' })));
    }
    if (prefillData.externalParticipants && prefillData.externalParticipants.length > 0) {
      setSelectedExternal(prefillData.externalParticipants);
    }
    if (prefillData.externalInformees) {
      setSelectedExternalInformees(prefillData.externalInformees);
    }
    if (prefillData.meetingManager !== undefined) setMeetingManager(prefillData.meetingManager);
    if (prefillData.reminderMinutes !== undefined) setReminderMinutes(prefillData.reminderMinutes);
    if (prefillData.isOnline !== undefined) setIsOnline(prefillData.isOnline);
    if (prefillData.agendaItems && prefillData.agendaItems.length > 0) {
      setAgendaEnabled(true);
      setAgendaItems(prefillData.agendaItems.map((item, idx) => ({
        id: `prefill-${idx}`,
        meeting_id: '',
        title: item.title,
        presenter: item.presenter ?? null,
        duration_minutes: item.duration_minutes ?? null,
        description: item.description ?? null,
        source_decision_id: item.source_decision_id ?? null,
        sort_order: idx,
        created_at: '',
      })) as unknown as AgendaItem[]);
    }
  }, [prefillData]);

  const loadMeetingParticipants = async (meetingId: string) => {
    const { data } = await supabase.from('meetings').select('participant_user_ids, notify_users, external_participants, external_informees, meeting_manager, is_online, send_sms').eq('id', meetingId).maybeSingle();
    if (!data || currentEditIdRef.current !== meetingId) return;
    if (data.is_online !== undefined && data.is_online !== null) setIsOnline(!!data.is_online);
    if (data.send_sms !== undefined && data.send_sms !== null) setSendSms(!!data.send_sms);

    if ((data.participant_user_ids || []).length > 0) {
      setSelectedParticipants((data.participant_user_ids as string[]).map((id: string) => ({ id, name: '' })));
    }
    if ((data.notify_users || []).length > 0) {
      const notifyIds = data.notify_users as string[];
      setSelectedNotifyUsers(notifyIds.map((id: string) => ({ id, name: '' })));
    }
    setSelectedExternal(Array.isArray(data.external_participants) ? data.external_participants as string[] : []);
    setSelectedExternalInformees(Array.isArray(data.external_informees) ? data.external_informees as string[] : []);
    if (data.meeting_manager) setMeetingManager(data.meeting_manager);

    const { data: items } = await supabase
      .from('meeting_agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('sort_order');
    if (currentEditIdRef.current !== meetingId) return;
    if (items && items.length > 0) {
      setAgendaEnabled(true);
      setAgendaItems(items as AgendaItem[]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (externalSearchRef.current && !externalSearchRef.current.contains(e.target as Node)) setShowExternalDropdown(false);
      if (externalInformeeSearchRef.current && !externalInformeeSearchRef.current.contains(e.target as Node)) setShowExternalInformeeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCalendar = calendars.find(c => c.id === selectedCalendarId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (creationRecoveryErrorRef.current) {
      toast.error(creationRecoveryErrorRef.current, { duration: 10000 });
      return;
    }
    if (!userId) { toast.error('لطفا وارد شوید'); return; }
    if (!subject.trim()) { toast.error('موضوع جلسه را وارد کنید'); return; }
    if (!scheduleDate) { toast.error('تاریخ جلسه مشخص نیست'); return; }
    const timeError = validateScheduleTimes(startTime, endTime);
    if (timeError) {
      setShowManualDateTime(true);
      toast.error(timeError);
      return;
    }
    if (orgUsersLoading) { toast.error('اطلاعات سازمانی در حال بارگذاری است؛ لحظاتی دیگر تلاش کنید'); return; }
    const senderName = orgAllUsers.find(u => u.user_id === userId)?.full_name?.trim();
    if (!senderName) { toast.error('اطلاعات سازمانی کاربر کامل نیست؛ امکان ثبت جلسه وجود ندارد.'); return; }
    setLoading(true);
    try {
      const m = moment(`${scheduleDate.jy}/${scheduleDate.jm}/${scheduleDate.jd}`, 'jYYYY/jM/jD');
      const gregDate = m.toDate().toISOString();

      const record: any = {
        subject, request_date: gregDate,
        duration: startTime && endTime ? `${startTime} - ${endTime}` : '',
        start_time: startTime, end_time: endTime,
        location, representative, phone, notes: notes || null, priority,
        status: 'archived', status_type: 'scheduled', user_id: userId,
        notify_users: Array.from(new Set([userId, ...selectedNotifyUsers.map(u => u.id)])),
        participant_user_ids: selectedParticipants.map(p => p.id),
        external_participants: selectedExternal,
        external_informees: selectedExternalInformees,
        repeat_type: repeatEnabled ? repeatType : 'none',
        repeat_interval: repeatEnabled ? repeatInterval : null,
        repeat_end_date: repeatEnabled ? repeatEndDate : null,
        repeat_weekday: repeatEnabled && repeatType === 'weekly' ? repeatWeekday : null,
        reminder_minutes: reminderMinutes || null,
        send_sms: sendSms, meeting_manager: meetingManager || null,
        calendar_id: selectedCalendarId || null,
        members_only: (selectedParticipants.length > 0 || selectedNotifyUsers.filter(u => u.id !== userId).length > 0)
          ? true
          : ((selectedCalendarId && selectedCalendar?.type === 'shared') ? membersOnly : false),
        is_online: isOnline,
      };

      const meetingDateStr = `${scheduleDate.jy}/${String(scheduleDate.jm).padStart(2, '0')}/${String(scheduleDate.jd).padStart(2, '0')}`;
      const meetingTimeStr = startTime && endTime ? `${startTime}-${endTime}` : startTime || '';
      const smsPlaceholders: Record<string, string> = {
        meeting_subject: subject,
        meeting_date: meetingDateStr,
        start_time: startTime || '',
        end_time: endTime || '',
        meeting_time: meetingTimeStr,
        location: location || '',
        location_part: location ? ` | ${location}` : '',
        join_link: '',
        sender_name: senderName,
        organizer_name: senderName,
        representative: representative || '',
        agenda: agendaEnabled && agendaItems.length > 0
          ? agendaItems.map((item, idx) => {
              const parts = [`${idx + 1}. ${item.title}`];
              if (item.presenter) parts.push(`ارائه‌دهنده: ${item.presenter}`);
              if (item.duration_minutes) parts.push(`${item.duration_minutes} دقیقه`);
              return parts.join(' | ');
            }).join('\n')
          : '',
      };

      const agendaSummary = agendaEnabled && agendaItems.length > 0
        ? '\n\nدستور جلسه:\n' + agendaItems.map((item, idx) => {
            const parts = [`${idx + 1}. ${item.title}`];
            if (item.presenter) parts.push(`ارائه‌دهنده: ${item.presenter}`);
            if (item.duration_minutes) parts.push(`${item.duration_minutes} دقیقه`);
            return parts.join(' | ');
          }).join('\n')
        : '';

      const participantNameMap: Record<string, string> = {};
      const participantIds = selectedParticipants.map(p => p.id).filter(id => id !== userId);
      const observerIds = selectedNotifyUsers.map(u => u.id).filter(id => id !== userId);
      let prevParticipantIds: string[] = [];
      let prevObserverIds: string[] = [];
      if (prefillMeetingId) {
        const bulkIds = prefillEditAllIds && prefillEditAllIds.length > 0 ? prefillEditAllIds : [prefillMeetingId];
        const { data: existingRows } = await supabase
          .from('meetings')
          .select('id, participant_user_ids, notify_users')
          .in('id', bulkIds);
        for (const row of existingRows || []) {
          for (const uid of row.participant_user_ids || []) {
            if (uid && uid !== userId) prevParticipantIds.push(uid);
          }
          for (const uid of row.notify_users || []) {
            if (uid && uid !== userId) prevObserverIds.push(uid);
          }
        }
        prevParticipantIds = [...new Set(prevParticipantIds)];
        prevObserverIds = [...new Set(prevObserverIds)];
      }
      const allRecipientIds = [...new Set([...participantIds, ...observerIds, ...prevParticipantIds, ...prevObserverIds])];
      for (const uid of allRecipientIds) participantNameMap[uid] = resolveUserName(uid);

      if (prefillMeetingId) {
        const bulkIds = prefillEditAllIds && prefillEditAllIds.length > 0 ? prefillEditAllIds : [prefillMeetingId];
        const { data: existingRows } = await supabase
          .from('meetings')
          .select('id, subject, request_date, start_time, end_time, location, representative, phone, notes, priority, meeting_manager, is_online, participant_user_ids, notify_users, external_participants, external_informees, reminder_minutes, calendar_id, send_sms, members_only, repeat_type, repeat_interval, repeat_end_date, repeat_weekday')
          .in('id', bulkIds);
        const existingMap = new Map<string, any>();
        for (const row of existingRows || []) existingMap.set(row.id, row);

        const { data: prevAgendaRows, error: prevAgendaError } = await supabase
          .from('meeting_agenda_items')
          .select('meeting_id, title, presenter, duration_minutes, sort_order')
          .in('meeting_id', bulkIds)
          .order('sort_order');
        if (prevAgendaError) throw new Error('خطا در آماده‌سازی ویرایش جلسه؛ لطفاً دوباره تلاش کنید');
        const prevAgendaByMeetingId: Record<string, AgendaItem[]> = {};
        for (const item of prevAgendaRows ?? []) {
          const row = existingMap.get(item.meeting_id);
          if (!row) continue;
          if (!row.agenda_items) row.agenda_items = [];
          row.agenda_items.push({ title: item.title, presenter: item.presenter, duration_minutes: item.duration_minutes });
          if (!prevAgendaByMeetingId[item.meeting_id]) prevAgendaByMeetingId[item.meeting_id] = [];
          prevAgendaByMeetingId[item.meeting_id].push({ title: item.title, presenter: item.presenter, duration_minutes: item.duration_minutes });
        }
        const existingMtg = existingMap.get(prefillMeetingId) || null;
        const isFirstSchedule = !existingMtg?.start_time;
        const nextFields: Record<string, any> = {
          subject, request_date: gregDate, start_time: startTime, end_time: endTime,
          location, representative, phone, notes: notes || null, priority,
          meeting_manager: meetingManager || null, is_online: isOnline,
          participant_user_ids: selectedParticipants.map(p => p.id),
          notify_users: Array.from(new Set([userId, ...selectedNotifyUsers.map(u => u.id)])),
          external_participants: selectedExternal,
          external_informees: selectedExternalInformees,
          reminder_minutes: reminderMinutes || null,
          calendar_id: selectedCalendarId || null,
          send_sms: sendSms,
          members_only: (selectedParticipants.length > 0 || selectedNotifyUsers.filter(u => u.id !== userId).length > 0)
            ? true
            : ((selectedCalendarId && selectedCalendar?.type === 'shared') ? membersOnly : false),
          repeat_type: repeatEnabled ? repeatType : 'none',
          repeat_interval: repeatEnabled ? repeatInterval : null,
          repeat_end_date: repeatEnabled ? repeatEndDate : null,
          repeat_weekday: repeatEnabled && repeatType === 'weekly' ? repeatWeekday : null,
          agenda_items: agendaEnabled ? agendaItems : [],
        };

        const changeSetsByMeetingId: Record<string, MeetingChangeSet> = {};
        const aggregatedChangeSet: MeetingChangeSet = {
          importantFields: [], minorFields: [],
          participantChanged: false, notifyUsersChanged: false, externalChanged: false,
          hasNonParticipantChanges: false, hasAnyChanges: false,
        };
        const importantSet = new Set<string>();
        const minorSet = new Set<string>();
        for (const id of bulkIds) {
          const existing = existingMap.get(id) || {};
          const changeSet = computeScopedMeetingChangeSet(
            existing,
            nextFields,
            Boolean(prefillEditAllIds && prefillEditAllIds.length > 0),
          );
          changeSetsByMeetingId[id] = changeSet;
          for (const field of changeSet.importantFields) importantSet.add(field);
          for (const field of changeSet.minorFields) minorSet.add(field);
          if (changeSet.participantChanged) aggregatedChangeSet.participantChanged = true;
          if (changeSet.notifyUsersChanged) aggregatedChangeSet.notifyUsersChanged = true;
          if (changeSet.externalChanged) aggregatedChangeSet.externalChanged = true;
          if (changeSet.hasNonParticipantChanges) aggregatedChangeSet.hasNonParticipantChanges = true;
          if (changeSet.hasAnyChanges) aggregatedChangeSet.hasAnyChanges = true;
        }
        aggregatedChangeSet.importantFields = [...importantSet];
        aggregatedChangeSet.minorFields = [...minorSet];
        const changeSet = aggregatedChangeSet;

        if (!changeSet.hasAnyChanges) {
          toast('تغییری شناسایی نشد');
          return;
        }

        const updateRecord: any = {
          subject, request_date: gregDate,
          duration: startTime && endTime ? `${startTime} - ${endTime}` : '',
          start_time: startTime, end_time: endTime,
          location, representative, phone, notes: notes || null, priority,
          status: 'archived', status_type: 'scheduled',
          notify_users: Array.from(new Set([userId, ...selectedNotifyUsers.map(u => u.id)])),
          external_participants: selectedExternal,
          external_informees: selectedExternalInformees,
          repeat_type: repeatEnabled ? repeatType : 'none',
          repeat_interval: repeatEnabled ? repeatInterval : null,
          repeat_end_date: repeatEnabled ? repeatEndDate : null,
          repeat_weekday: repeatEnabled && repeatType === 'weekly' ? repeatWeekday : null,
          reminder_minutes: reminderMinutes || null,
          send_sms: sendSms, meeting_manager: meetingManager || null,
          calendar_id: selectedCalendarId || null,
          members_only: (selectedParticipants.length > 0 || selectedNotifyUsers.filter(u => u.id !== userId).length > 0)
            ? true
            : ((selectedCalendarId && selectedCalendar?.type === 'shared') ? membersOnly : false),
          is_online: isOnline,
        };

        let baseFields: Record<string, any> | null = null;
        if (prefillEditAllIds && prefillEditAllIds.length > 0) {
          baseFields = {
            subject, location, representative, phone, notes: notes || null, priority,
            start_time: startTime, end_time: endTime,
            duration: startTime && endTime ? `${startTime} - ${endTime}` : '',
            status: 'archived', status_type: 'scheduled',
            notify_users: updateRecord.notify_users,
            external_participants: selectedExternal,
            external_informees: selectedExternalInformees,
            repeat_type: updateRecord.repeat_type, repeat_interval: updateRecord.repeat_interval,
            repeat_end_date: updateRecord.repeat_end_date, repeat_weekday: updateRecord.repeat_weekday,
            reminder_minutes: reminderMinutes || null,
            send_sms: sendSms, meeting_manager: meetingManager || null,
            calendar_id: selectedCalendarId || null,
            members_only: updateRecord.members_only, is_online: isOnline,
          };
        }

        const operationId = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const snapshot: CommitSnapshot = {
          operationId,
          updateRecord, baseFields, isFirstSchedule, senderName,
          meetingDateStr, meetingTimeStr, smsPlaceholders, agendaSummary,
          participantNameMap, observerIds,
          prevNotifyUserIds: (existingMtg?.notify_users || []).filter((value: string) => value && value !== userId),
          previousNotifyUserIdsByMeetingId: Object.fromEntries(
            bulkIds.map((id: string) => [
              id,
              ((existingMap.get(id)?.notify_users || []) as string[]).filter((value: string) => value && value !== userId),
            ]),
          ),
          changeSetsByMeetingId,
          prevAgendaByMeetingId,
          gregDate,
          selectedParticipantIds: selectedParticipants.map(p => p.id),
          selectedExternal,
          selectedExternalInformees,
          sendSms, agendaEnabled, agendaItems,
          prevExternalByMeetingId: Object.fromEntries(
            bulkIds.map((id: string) => [
              id,
              ((existingMap.get(id)?.external_participants || []) as string[]).filter((value: string) => !!value),
            ]),
          ),
          prevExternalInformeesByMeetingId: Object.fromEntries(
            bulkIds.map((id: string) => [
              id,
              ((existingMap.get(id)?.external_informees || []) as string[]).filter((value: string) => !!value),
            ]),
          ),
          prevParticipantIds,
          prevObserverIds,
        };

        if (isFirstSchedule) {
          await commitEdit(snapshot, true);
          return;
        }

        setEditDecision({ changeSet, snapshot });
        return;
      }

      if (repeatEnabled) {
        if (!repeatEndDate) throw new Error('پایان بازه تکرار را مشخص کنید');
        const repeatRecords = buildCalendarRepeatRecords({ baseRecord: record, type: repeatType, interval: repeatInterval,
          endDate: repeatEndDate, repeatWeekday, repeatMonthlyMode, repeatMonthlyNth, repeatMonthlyNthWeekday });
        const weekdays = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
        const pattern = repeatType === 'weekly'
          ? `هر ${repeatInterval} هفته، ${weekdays[repeatWeekday]}`
          : `هر ${repeatInterval} ماه${repeatMonthlyMode === 'nth' ? `، ${repeatMonthlyNth === -1 ? 'آخرین' : repeatMonthlyNth} ${weekdays[repeatMonthlyNthWeekday]}` : ''}`;
        const linked = agendaEnabled ? agendaItems as LinkedAgendaItem[] : [];
        const ids = await createMeetingSeries(seriesOperationRef.current, [{ ...record, request_jalaali_date: meetingDateStr }, ...repeatRecords],
          linked, pattern);
        toast.success(`${ids.length} نوبت ثبت شد؛ اطلاع‌رسانی سری طبق تنظیمات در صف قرار گرفت`);
      } else {
        const { data: meeting, error: meetingError } = await supabase.from('meetings').insert([record]).select().single();
        if (meetingError) throw meetingError;
        if (!meeting) throw new Error('جلسه ثبت نشد؛ لطفاً دوباره تلاش کنید');
        await saveNewMeetingDetails({
          saveParticipants: async () => {
            if (participantDisplayItems.length === 0) return;
            const { error } = await supabase.from('participants').insert(
              participantDisplayItems.map(p => ({ meeting_id: meeting.id, name: p.name })),
            );
            if (error) throw new Error('خطا در ثبت شرکت‌کنندگان: ' + error.message);
          },
          saveAgenda: async () => {
            if (!agendaEnabled || agendaItems.length === 0) return;
            const { error } = await (supabase as any).rpc('sync_linked_meeting_agenda_v1', {
              p_meeting_id: meeting.id, p_items: agendaItemsForSave(agendaItems as LinkedAgendaItem[]),
            });
            if (error) throw new Error('خطا در ثبت دستور جلسه: ' + error.message);
          },
          rollback: async () => {
            // Only the meeting just created by this submission is eligible for cleanup.
            // Inbox has an ON DELETE SET NULL FK, so remove its invitations first.
            const { error: inboxError } = await supabase.from('meeting_inbox')
              .delete().eq('meeting_id', meeting.id);
            if (inboxError) throw inboxError;
            const { data: deleted, error } = await supabase.from('meetings')
              .delete().eq('id', meeting.id).select('id');
            if (error) throw error;
            if (!deleted?.some(row => row.id === meeting.id)) {
              throw new Error('حذف جلسه ناقص تأیید نشد');
            }
          },
          meetingId: meeting.id,
        });
        // meetings_sync_inbox_from_participants creates invitations in the same
        // database transaction as the meeting. Do not insert them again here.

        let notificationMeetings = [{ id: meeting.id, request_jalaali_date: meetingDateStr }];


        const internalSmsResults: SmsDispatchResult[] = [];
        let externalSmsResult: ExternalSmsResult | null = null;
        let externalInformeeSmsResult: ExternalSmsResult | null = null;
        const mergeSmsResults = (previous: ExternalSmsResult | null, result: ExternalSmsResult): ExternalSmsResult => ({
          ok: (previous?.ok ?? true) && result.ok,
          sent: (previous?.sent ?? 0) + result.sent,
          skipped: (previous?.skipped ?? 0) + result.skipped,
          error: previous?.error || result.error,
        });
        for (const occurrence of notificationMeetings) {
          const occurrenceDate = occurrence.request_jalaali_date;
          const occurrencePlaceholders = { ...smsPlaceholders, meeting_date: occurrenceDate };
          await insertNotification({
            userId,
            category: 'meeting',
            eventType: getMeetingTemplateKey('creator', 'created'),
            fallbackTitle: 'جلسه ثبت شد',
            fallbackMessage: `جلسه "${subject}" ثبت شد — ${meetingTimeStr}${agendaSummary}`,
            placeholders: { ...occurrencePlaceholders, full_name: senderName, recipient_greeting: `${senderName} گرامی` },
            senderId: userId,
            senderName,
            actionUrl: 'calendar',
            meetingId: occurrence.id,
            eventKey: `create:${occurrence.id}:${userId}:creator`,
          });

          if (participantIds.length) {
            const results = await Promise.all(participantIds.map(uid => insertNotification({
              userId: uid,
              category: 'meeting',
              eventType: 'invite',
              audience: 'participants',
              fallbackTitle: 'دعوت به جلسه',
              fallbackMessage: `شما به جلسه "${subject}" دعوت شدید — ${meetingTimeStr}${occurrenceDate ? ` در ${occurrenceDate}` : ''}${agendaSummary}`,
              placeholders: { ...occurrencePlaceholders, full_name: participantNameMap[uid] || '', recipient_greeting: participantNameMap[uid] ? `${participantNameMap[uid]} گرامی` : 'همکار گرامی' },
              senderId: userId,
              senderName,
              actionUrl: 'calendar',
              meetingId: occurrence.id,
              eventKey: `create:${occurrence.id}:${uid}:participants`,
            })));
            internalSmsResults.push(...results);
          }
          if (observerIds.length) {
            const results = await Promise.all(observerIds.map(uid => insertNotification({
              userId: uid,
              category: 'meeting',
              eventType: 'invite',
              audience: 'observers',
              fallbackTitle: 'اطلاع از جلسه',
              fallbackMessage: `شما به عنوان مطلع جلسه "${subject}" ثبت شده‌اید — ${meetingTimeStr}${occurrenceDate ? ` در ${occurrenceDate}` : ''}${agendaSummary}`,
              placeholders: { ...occurrencePlaceholders, full_name: participantNameMap[uid] || '', recipient_greeting: participantNameMap[uid] ? `${participantNameMap[uid]} گرامی` : 'همکار گرامی' },
              senderId: userId,
              senderName,
              actionUrl: 'calendar',
              meetingId: occurrence.id,
              eventKey: `create:${occurrence.id}:${uid}:observers`,
            })));
            internalSmsResults.push(...results);
          }

          if (sendSms && selectedExternal.length > 0) {
            const meetingDatesText = occurrenceDate;
            const externalSmsPlaceholders = {
              ...occurrencePlaceholders,
              meeting_date: meetingDatesText,
            };
            const dateLabel = 'تاریخ';
            const fallbackSms = `دعوت به جلسه: «${subject}» | ${dateLabel}: ${meetingDatesText} | ساعت: ${meetingTimeStr}${smsPlaceholders.location_part}`;
            const result = await sendSmsToExternals(
              selectedExternal,
              contacts,
              fallbackSms,
              userId,
              externalSmsPlaceholders,
              'invite',
              occurrence.id,
              `create:${occurrence.id}:external:invite`,
            );
            externalSmsResult = mergeSmsResults(externalSmsResult, result);
          }

          if (selectedExternalInformees.length > 0) {
            const meetingDatesText = occurrenceDate;
            const informeePlaceholders = {
              ...occurrencePlaceholders,
              meeting_date: meetingDatesText,
            };
            const dateLabel = 'تاریخ';
            const fallbackSms = `جهت اطلاع شما جلسه «${subject}» | ${dateLabel}: ${meetingDatesText} | ساعت: ${meetingTimeStr}${smsPlaceholders.location_part}`;
            const result = await sendSmsToExternals(
              selectedExternalInformees,
              contacts,
              fallbackSms,
              userId,
              informeePlaceholders,
              'informee_invite',
              occurrence.id,
              `create:${occurrence.id}:external-informee:invite`,
            );
            externalInformeeSmsResult = mergeSmsResults(externalInformeeSmsResult, result);
          }

        }

        const combinedExternalSmsResult = externalSmsResult || externalInformeeSmsResult
          ? {
              ok: (externalSmsResult?.ok ?? true) && (externalInformeeSmsResult?.ok ?? true),
              sent: (externalSmsResult?.sent ?? 0) + (externalInformeeSmsResult?.sent ?? 0),
              skipped: (externalSmsResult?.skipped ?? 0) + (externalInformeeSmsResult?.skipped ?? 0),
              error: externalSmsResult?.error || externalInformeeSmsResult?.error,
            }
          : null;
        showSmsSummary(internalSmsResults, combinedExternalSmsResult);

      }

      if (saveContact && representative?.trim() && phone?.trim()) {
        const { error: contactError } = await supabase
          .from('contacts_email')
          .insert([{
            name: representative.trim(),
            phone: phone.trim(),
            user_id: userId,
            email: null,
            company: '',
          }]);
        if (contactError) {
          console.error('Detailed DB Error:', contactError);
          toast.error('جلسه ثبت شد ولی شماره تماس ذخیره نشد');
        } else {
          console.log('مخاطب با موفقیت ذخیره شد');
        }
      }
      onSuccess(subject, false);
    } catch (err: any) {
      if (err instanceof MeetingCreationRecoveryError) {
        creationRecoveryErrorRef.current = err.message;
      }
      toast.error(err?.message || 'خطا در ثبت جلسه');
    } finally {
      setLoading(false);
    }
  };

  const commitLockRef = useRef(false);
  const commitEdit = (snapshot: CommitSnapshot, notifyExistingParticipants: boolean) => commitCalendarMeetingEdit({
    snapshot,
    notifyExistingParticipants,
    userId,
    prefillMeetingId,
    prefillEditAllIds,
    subject,
    startTime,
    endTime,
    contacts,
    commitLockRef,
    setCommitting,
    setEditDecision,
    onSuccess,
  });

  const externalOptions = contacts.map(contact => {
    const parts = [contact.position, contact.company, contact.phone].filter(Boolean);
    return { id: contact.name, name: contact.name, sub: parts.join(' · ') };
  });
  const filteredExternal = externalOptions.filter(contact =>
    !selectedExternal.includes(contact.id) &&
    (contact.name.toLowerCase().includes(externalSearch.toLowerCase()) || (contact.sub ?? '').toLowerCase().includes(externalSearch.toLowerCase())),
  );
  const filteredExternalInformees = externalOptions.filter(contact =>
    !selectedExternalInformees.includes(contact.id) &&
    (contact.name.toLowerCase().includes(externalInformeeSearch.toLowerCase()) || (contact.sub ?? '').toLowerCase().includes(externalInformeeSearch.toLowerCase())),
  );

  const addQuickExternal = async () => {
    if (!newExternalName.trim() || !userId) return;
    try {
      const { data, error } = await supabase.from('contacts_email').insert([{
        name: newExternalName.trim(),
        phone: newExternalPhone.trim() || null,
        company: newExternalCompany.trim() || null,
        position: newExternalPosition.trim() || null,
        user_id: userId,
      }]).select().single();
      if (error) throw error;
      if (data) {
        setContacts(previous => [...previous, data]);
        setSelectedExternal(previous => [...previous, newExternalName.trim()]);
      }
      setNewExternalName('');
      setNewExternalPhone('');
      setNewExternalCompany('');
      setNewExternalPosition('');
      setShowAddExternal(false);
      toast.success('مخاطب اضافه شد');
    } catch {
      toast.error('خطا در افزودن مخاطب');
    }
  };

  return (
    <CalendarMeetingFormView
      onSubmit={handleSubmit}
      onCancel={onCancel}
      calendars={calendars}
      selectedCalendarId={selectedCalendarId}
      setSelectedCalendarId={setSelectedCalendarId}
      selectedCalendar={selectedCalendar}
      membersOnly={membersOnly}
      setMembersOnly={setMembersOnly}
      scheduleDate={scheduleDate}
      setScheduleDate={setScheduleDate}
      showManualDateTime={showManualDateTime}
      setShowManualDateTime={setShowManualDateTime}
      manualDateStr={manualDateStr}
      setManualDateStr={setManualDateStr}
      manualStartTime={manualStartTime}
      setManualStartTime={setManualStartTime}
      manualEndTime={manualEndTime}
      setManualEndTime={setManualEndTime}
      startTime={startTime}
      setStartTime={setStartTime}
      endTime={endTime}
      setEndTime={setEndTime}
      subject={subject}
      setSubject={setSubject}
      location={location}
      setLocation={setLocation}
      representative={representative}
      setRepresentative={setRepresentative}
      setRepFromContacts={setRepFromContacts}
      repPickerRef={repPickerRef}
      showRepPicker={showRepPicker}
      setShowRepPicker={setShowRepPicker}
      repPickerSearch={repPickerSearch}
      setRepPickerSearch={setRepPickerSearch}
      allContacts={allContacts}
      phone={phone}
      setPhone={setPhone}
      priority={priority}
      setPriority={setPriority}
      notes={notes}
      setNotes={setNotes}
      systemUserGroups={systemUserGroups}
      participantDisplayItems={participantDisplayItems}
      selectedParticipants={selectedParticipants}
      setSelectedParticipants={setSelectedParticipants}
      notifyDisplayItems={notifyDisplayItems}
      selectedNotifyUsers={selectedNotifyUsers}
      setSelectedNotifyUsers={setSelectedNotifyUsers}
      externalSearchRef={externalSearchRef}
      selectedExternal={selectedExternal}
      setSelectedExternal={setSelectedExternal}
      externalSearch={externalSearch}
      setExternalSearch={setExternalSearch}
      showExternalDropdown={showExternalDropdown}
      setShowExternalDropdown={setShowExternalDropdown}
      filteredExternal={filteredExternal}
      showAddExternal={showAddExternal}
      setShowAddExternal={setShowAddExternal}
      newExternalName={newExternalName}
      setNewExternalName={setNewExternalName}
      newExternalPhone={newExternalPhone}
      setNewExternalPhone={setNewExternalPhone}
      newExternalCompany={newExternalCompany}
      setNewExternalCompany={setNewExternalCompany}
      newExternalPosition={newExternalPosition}
      setNewExternalPosition={setNewExternalPosition}
      addQuickExternal={addQuickExternal}
      externalInformeeSearchRef={externalInformeeSearchRef}
      selectedExternalInformees={selectedExternalInformees}
      setSelectedExternalInformees={setSelectedExternalInformees}
      externalInformeeSearch={externalInformeeSearch}
      setExternalInformeeSearch={setExternalInformeeSearch}
      showExternalInformeeDropdown={showExternalInformeeDropdown}
      setShowExternalInformeeDropdown={setShowExternalInformeeDropdown}
      filteredExternalInformees={filteredExternalInformees}
      meetingManager={meetingManager}
      setMeetingManager={setMeetingManager}
      managerDisplayName={managerDisplayName}
      repeatEnabled={repeatEnabled}
      setRepeatEnabled={setRepeatEnabled}
      repeatType={repeatType}
      setRepeatType={setRepeatType}
      repeatInterval={repeatInterval}
      setRepeatInterval={setRepeatInterval}
      repeatEndDate={repeatEndDate}
      setRepeatEndDate={setRepeatEndDate}
      showEndDatePicker={showEndDatePicker}
      setShowEndDatePicker={setShowEndDatePicker}
      endDatePickerJy={endDatePickerJy}
      setEndDatePickerJy={setEndDatePickerJy}
      endDatePickerJm={endDatePickerJm}
      setEndDatePickerJm={setEndDatePickerJm}
      repeatWeekday={repeatWeekday}
      setRepeatWeekday={setRepeatWeekday}
      repeatMonthlyMode={repeatMonthlyMode}
      setRepeatMonthlyMode={setRepeatMonthlyMode}
      repeatMonthlyNth={repeatMonthlyNth}
      setRepeatMonthlyNth={setRepeatMonthlyNth}
      repeatMonthlyNthWeekday={repeatMonthlyNthWeekday}
      setRepeatMonthlyNthWeekday={setRepeatMonthlyNthWeekday}
      reminderMinutes={reminderMinutes}
      setReminderMinutes={setReminderMinutes}
      agendaEnabled={agendaEnabled}
      setAgendaEnabled={setAgendaEnabled}
      agendaItems={agendaItems}
      setAgendaItems={setAgendaItems}
      showAgendaForm={showAgendaForm}
      setShowAgendaForm={setShowAgendaForm}
      agendaForm={agendaForm}
      setAgendaForm={setAgendaForm}
      editingAgendaIdx={editingAgendaIdx}
      setEditingAgendaIdx={setEditingAgendaIdx}
      prefillMeetingId={prefillMeetingId}
      isOnline={isOnline}
      setIsOnline={setIsOnline}
      sendSms={sendSms}
      setSendSms={setSendSms}
      saveContact={saveContact}
      setSaveContact={setSaveContact}
      repFromContacts={repFromContacts}
      loading={loading}
      orgUsersLoading={orgUsersLoading}
      committing={committing}
      editDecision={editDecision}
      setEditDecision={setEditDecision}
      commitEdit={commitEdit}
    />
  );
}
