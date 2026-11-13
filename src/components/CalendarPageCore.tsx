import { persistCalendarTiming, meetingTimingPlaceholders } from './Calendar/persistCalendarTiming';
import { notifyBrowser } from '../lib/pwaNotificationBridge';
import { useLiveData } from '../shared/realtime/useLiveData';
import { mobileZoomDayCount } from './Calendar/weekZoom';
import { focusCalendarNow } from './Calendar/focusCalendarNow';
import { weekDayIndex } from './Calendar/weekInteraction';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePermissions } from '../context/PermissionsContext';
import { supabase } from '../lib/supabase';
import { insertNotification as insertNotificationFromTemplate } from '../lib/notifications';
import toast from 'react-hot-toast';
import { useUserPreferences } from '../features/user-preferences';
import { MeetingData, CalendarEntry, CalendarSubscription, PendingSchedule, CalendarFormState } from './Calendar/types';
import { PRIORITY_COLORS, SLOT_HEIGHT, HOURS_START, HOURS_END, DEFAULT_CALENDAR_COLOR, VIEW_OPTIONS, toJalaali, jalaaliToDate, jalaaliToYYYYMMDD, parseRequestDateToDateStr, timeToMinutes, minutesToTime, minutesToSlotIndex } from './Calendar/utils';
import { useOrgUsers, resolveUserDisplay } from '../lib/useOrgUsers';
import { useCalendarDataActions } from './Calendar/useCalendarDataActions';
import { useCalendarNavigation } from './Calendar/useCalendarNavigation';
import { CalendarPageView } from './Calendar/CalendarPageView';

import type { CalendarViewMode } from './Calendar/utils';

type ViewMode = CalendarViewMode;

const VALID_CALENDAR_VIEW_MODES = new Set<CalendarViewMode>(VIEW_OPTIONS.map(option => option.key));

function readStoredCalendarView(): CalendarViewMode | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem('user_prefs_calendar_view');
  return stored && VALID_CALENDAR_VIEW_MODES.has(stored as CalendarViewMode)
    ? stored as CalendarViewMode
    : null;
}

interface CalendarPageProps {
  currentUserId?: string | null;
  pendingSchedule?: PendingSchedule | null;
  onScheduleComplete?: () => void;
  pendingMentionParticipants?: string[];
  pendingMentionNotes?: string;
  onPendingMentionConsumed?: () => void;
  initialView?: ViewMode;
  onViewConsumed?: () => void;
  sparkNavigateDate?: { jy: number; jm: number; jd: number; view?: string } | null;
  onSparkNavigateDateConsumed?: () => void;
  sparkCalendarMeetingPrefill?: any;
  onSparkCalendarMeetingPrefillConsumed?: () => void;
  onRegisterMinutes?: (meetingId: string, existingMinuteId: string | null) => void;
}

export function CalendarPage({
  currentUserId: providedUserId,
  pendingSchedule, onScheduleComplete,
  pendingMentionParticipants, pendingMentionNotes, onPendingMentionConsumed,
  initialView, onViewConsumed,
  sparkNavigateDate, onSparkNavigateDateConsumed,
  sparkCalendarMeetingPrefill, onSparkCalendarMeetingPrefillConsumed,
  onRegisterMinutes,
}: CalendarPageProps) {
  const { prefs, updatePrefs, loading: prefsLoading } = useUserPreferences();
  const [meetings, setMeetings] = useState<MeetingData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredCalendarView() ?? 'week');
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [currentJy, setCurrentJy] = useState(0);
  const [currentJm, setCurrentJm] = useState(0);
  const [selectedJd, setSelectedJd] = useState(0);
  const [selectedJy, setSelectedJy] = useState(0);
  const [selectedJm, setSelectedJm] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUserId, setCurrentUserId] = useState<string | null>(providedUserId ?? null);

  const [sidebarJy, setSidebarJy] = useState(0);
  const [sidebarJm, setSidebarJm] = useState(0);

  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [subscribedCalendars, setSubscribedCalendars] = useState<CalendarEntry[]>([]);
  const [enabledCalendarIds, setEnabledCalendarIds] = useState<Set<string>>(new Set());

  const [showCreateCalendar, setShowCreateCalendar] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<CalendarEntry | null>(null);
  const [calendarForm, setCalendarForm] = useState<CalendarFormState>({
    name: '', type: 'private', description: '', is_active: true,
    enable_reminder: false, create_online_link: false, show_time_overlap: true, free_for_all: true, color: '#3b82f6',
  });

  const [showCalendarList, setShowCalendarList] = useState(false);
  const [calendarListSearch, setCalendarListSearch] = useState('');

  const [showSubscriptionsModal, setShowSubscriptionsModal] = useState(false);
  const [subscriptionsCalendar, setSubscriptionsCalendar] = useState<CalendarEntry | null>(null);
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  // Zoomed cards render participant names before any modal is opened, in every view.
  const { usersById, allUsers, loading: orgUsersLoading } = useOrgUsers(currentUserId);
  const resolveName = useCallback((uid: string) =>
    resolveUserDisplay(usersById, uid, undefined, orgUsersLoading),
  [usersById, orgUsersLoading]);
  const [subSearch, setSubSearch] = useState('');
  const [subPermission, setSubPermission] = useState<'view' | 'edit'>('edit');

  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [myGroupOpen, setMyGroupOpen] = useState(true);
  const [sharedGroupOpen, setSharedGroupOpen] = useState(true);
  const [publicGroupOpen, setPublicGroupOpen] = useState(true);

  const [detailMeeting, setDetailMeeting] = useState<MeetingData | null>(null);

  // Hover/click preview popup for day/week blocks
  const [previewMeeting, setPreviewMeeting] = useState<MeetingData | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement | null>(null);

  // New-meeting drag
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartSlot, setDragStartSlot] = useState<number | null>(null);
  const [dragEndSlot, setDragEndSlot] = useState<number | null>(null);
  const [dragDate, setDragDate] = useState<{ jy: number; jm: number; jd: number } | null>(null);
  const timeGridRef = useRef<HTMLDivElement | null>(null);
  const timeScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [prefillData, setPrefillData] = useState<any>(null);
  const [activePendingSchedule, setActivePendingSchedule] = useState<PendingSchedule | null>(null);

  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);

  // Move meeting drag
  const [dragMoveMeeting, setDragMoveMeeting] = useState<MeetingData | null>(null);
  const [dragMoveStartY, setDragMoveStartY] = useState(0);
  const [dragMoveStartX, setDragMoveStartX] = useState(0);
  const dragMovedRef = useRef(false);
  const [dragMoveOriginalSlot, setDragMoveOriginalSlot] = useState(0);
  const [dragMoveOriginalEndSlot, setDragMoveOriginalEndSlot] = useState(0);
  const [dragMoveCurrentDeltaSlot, setDragMoveCurrentDeltaSlot] = useState(0);
  const [dragMoveCurrentDeltaDay, setDragMoveCurrentDeltaDay] = useState(0);
  const [dragMoveOriginalDate, setDragMoveOriginalDate] = useState('');
  const [pendingMove, setPendingMove] = useState<{
    meeting: MeetingData;
    updates: Record<string, string>;
    ns: number;
    ne: number;
    oldDateIso: string;
    newDateIso: string;
  } | null>(null);
  const [isMoveCommitting, setIsMoveCommitting] = useState(false);
  const weekGridRef = useRef<HTMLDivElement | null>(null);
  const dayGridRef = useRef<HTMLDivElement | null>(null);

  // Resize meeting
  const [resizeMeeting, setResizeMeeting] = useState<MeetingData | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeOriginalEndSlot, setResizeOriginalEndSlot] = useState(0);
  const [resizeCurrentDelta, setResizeCurrentDelta] = useState(0);
  const [pendingResize, setPendingResize] = useState<{
    meeting: MeetingData;
    newEndTime: string;
  } | null>(null);
  const [isResizeCommitting, setIsResizeCommitting] = useState(false);

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showDesktopSidebar, setShowDesktopSidebar] = useState(true);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return meetings.filter(m =>
      m.subject?.toLowerCase().includes(q) ||
      m.location?.toLowerCase().includes(q) ||
      m.representative?.toLowerCase().includes(q)
    );
  }, [meetings, searchQuery]);

  const visibleMeetings = useMemo(() => {
    // Use Tehran-adjusted today so comparison is consistent with parseRequestDateToDateStr
    const IST_OFFSET_MS = 210 * 60 * 1000;
    const tehranNow = new Date(Date.now() + IST_OFFSET_MS);
    const todayStr = `${tehranNow.getUTCFullYear()}-${String(tehranNow.getUTCMonth()+1).padStart(2,'0')}-${String(tehranNow.getUTCDate()).padStart(2,'0')}`;
    const result = meetings.filter(m => {
      if (m.status_type !== 'scheduled') return false;
      const dateStr = parseRequestDateToDateStr(m.request_date);
      if (dateStr && dateStr < todayStr && !prefs.show_past_meetings) return false;
      // Only treat archived meetings as "cancelled" when they are NOT scheduled calendar
      // appointments. status='archived' + status_type='scheduled' means a real meeting.
      if (m.status === 'archived' && m.status_type !== 'scheduled' && !prefs.show_cancelled_meetings) return false;
      return true;
    });
    console.log('[CalendarPage] visibleMeetings: total=' + meetings.length + ' visible=' + result.length + ' show_past=' + prefs.show_past_meetings + ' show_cancelled=' + prefs.show_cancelled_meetings + ' todayStr(Tehran)=' + todayStr);
    return result;
  }, [meetings, prefs.show_past_meetings, prefs.show_cancelled_meetings]);

  const navigateToMeeting = (m: MeetingData) => {
    const dateStr = parseRequestDateToDateStr(m.request_date);
    if (!dateStr) return;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const j = toJalaali(new Date(y, mo - 1, d));
    setCurrentJy(j.jy); setCurrentJm(j.jm);
    setSelectedJy(j.jy); setSelectedJm(j.jm); setSelectedJd(j.jd);
    setSidebarJy(j.jy); setSidebarJm(j.jm);
    if (m.start_time) setViewMode('day'); else setViewMode('month');
    setShowSearch(false);
    setSearchQuery('');
    setTimeout(() => setDetailMeeting(m), 100);
  };

  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus();
  }, [showSearch]);

  // Apply the DB default only when the user does not already have a valid explicit
  // calendar view selection. This prevents late preference hydration from overwriting
  // toolbar choices such as 3-day / 4-day / week.
  const prefViewApplied = useRef(false);
  useEffect(() => {
    if (prefsLoading || prefViewApplied.current) return;
    prefViewApplied.current = true;

    const stored = readStoredCalendarView();
    if (stored) {
      if (stored !== viewMode) setViewMode(stored);
      return;
    }

    const map: Partial<Record<string, ViewMode>> = {
      month: 'month',
      week: 'week',
      day: 'day',
      list: 'schedule',
    };
    const mapped = prefs.default_calendar_view ? map[prefs.default_calendar_view] : undefined;
    if (mapped) {
      setViewMode(mapped);
      window.localStorage.setItem('user_prefs_calendar_view', mapped);
    }
  }, [prefsLoading, prefs.default_calendar_view, viewMode]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    if (showSearch) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSearch]);

  // Month day popup
  const [monthDayPopup, setMonthDayPopup] = useState<{ jy: number; jm: number; jd: number; x: number; y: number } | null>(null);
  const monthDayPopupRef = useRef<HTMLDivElement | null>(null);

  // All-day event creation
  const [showAllDayForm, setShowAllDayForm] = useState(false);
  const [allDayFormDate, setAllDayFormDate] = useState<{ jy: number; jm: number; jd: number } | null>(null);
  const [allDayFormEndDate, setAllDayFormEndDate] = useState<{ jy: number; jm: number; jd: number } | null>(null);
  const [allDayFormTitle, setAllDayFormTitle] = useState('');
  const [allDayFormType, setAllDayFormType] = useState<'meeting' | 'leave' | 'other'>('meeting');
  const [allDayEvents, setAllDayEvents] = useState<{ id: string; title: string; type: string; date_jy: number; date_jm: number; date_jd: number; user_id: string }[]>([]);

  // All-day drag select state
  const [allDayDragStart, setAllDayDragStart] = useState<{ jy: number; jm: number; jd: number } | null>(null);
  const [allDayDragEnd, setAllDayDragEnd] = useState<{ jy: number; jm: number; jd: number } | null>(null);
  const [allDayDragging, setAllDayDragging] = useState(false);

  // Repeat edit scope dialog
  const [repeatEditDialog, setRepeatEditDialog] = useState<{ meeting: MeetingData } | null>(null);

  // Delete meeting confirmation modal
  const [deleteMeetingDialog, setDeleteMeetingDialog] = useState<{ id: string; deleteRepeating?: boolean } | null>(null);

  // ── Calendar occasions ────────────────────────────────────────────────────
  const [occasions, setOccasions] = useState<{
    id: string; title: string; calendar_type: string;
    month: number; day: number; is_holiday: boolean; is_celebration: boolean;
  }[]>([]);
  const [occasionsEnabled, setOccasionsEnabled] = useState(true);

  useEffect(() => {
    supabase.from('calendar_occasions').select('id,title,calendar_type,month,day,is_holiday,is_celebration')
      .eq('is_active', true).then(({ data }) => { if (data) setOccasions(data as any); });
  }, []);

  useLiveData(['calendar_occasions'], async () => {
    const { data, error } = await supabase.from('calendar_occasions')
      .select('id,title,calendar_type,month,day,is_holiday,is_celebration').eq('is_active', true);
    if (!error && data) setOccasions(data as any);
  });

  const handleToggleOccasions = useCallback(async () => {
    const next = !occasionsEnabled;
    setOccasionsEnabled(next);
    if (!currentUserId) return;
    await supabase.from('calendars').update({ is_active: next }).eq('user_id', currentUserId).eq('is_occasions', true);
  }, [occasionsEnabled, currentUserId]);

  const totalSlots = (HOURS_END - HOURS_START) * 2;

  // Adjustable slot height (px per 30-min slot) — wheel/pinch on hour column
  const [slotHeight, setSlotHeight] = useState(SLOT_HEIGHT);
  const adjustSlotHeight = (delta: number) => {
    const minimum = mobileZoomDayCount(viewMode) > 0 && window.matchMedia('(max-width: 767px)').matches ? 4 : 20;
    setSlotHeight(prev => Math.min(120, Math.max(minimum, prev + delta)));
  };

  // Pinch-to-zoom state
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartHeightRef = useRef<number>(SLOT_HEIGHT);

  const handleHourColTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartHeightRef.current = slotHeight;
      // Don't call preventDefault here — let the parent scroll container handle scroll
    }
  };
  const handleHourColTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchStartDistRef.current;
      const newH = Math.min(120, Math.max(20, Math.round(pinchStartHeightRef.current * scale)));
      setSlotHeight(newH);
    }
  };
  const handleHourColTouchEnd = () => { pinchStartDistRef.current = null; };

  // Work-hour boundaries from system_config (default 07:00–19:30)
  const [workStartMin, setWorkStartMin] = useState(420);  // 07:00
  const [workEndMin, setWorkEndMin] = useState(1170);     // 19:30

  // Hide off-hours based on permission and user preference
  const { hasPermission } = usePermissions();
  const [hideOffHours, setHideOffHours] = useState(false);
  const canHideOffHours = hasPermission('calendar_hide_offhours');

  // Sync hideOffHours from user preferences — only after prefs are loaded from DB
  useEffect(() => {
    if (!prefsLoading) setHideOffHours(prefs.hide_offhours);
  }, [prefs.hide_offhours, prefsLoading]);

  // Compact working-hours view is intentionally fixed at 06:00–20:00.
  const visibleStartMin = hideOffHours ? 6 * 60 : HOURS_START * 60;
  const visibleEndMin = hideOffHours ? 20 * 60 : HOURS_END * 60;
  const visibleStartHour = Math.floor(visibleStartMin / 60);
  const visibleEndHour = Math.ceil(visibleEndMin / 60);

  useEffect(() => {
    supabase.from('system_config').select('key,value').eq('section', 'regional')
      .in('key', ['work_start_time', 'work_end_time']).then(({ data }) => {
      if (!data) return;
      data.forEach(row => {
        if (row.key === 'work_start_time' && row.value) {
          const m = timeToMinutes(row.value);
          if (m >= 0) setWorkStartMin(m);
        }
        if (row.key === 'work_end_time' && row.value) {
          const m = timeToMinutes(row.value);
          if (m >= 0) setWorkEndMin(m);
        }
      });
    });
  }, []);

  // Override work hours with user personal preference when set — only after prefs are loaded from DB
  useEffect(() => {
    if (prefsLoading) return;
    if (prefs.work_start_time) {
      const m = timeToMinutes(prefs.work_start_time);
      if (m >= 0) setWorkStartMin(m);
    }
    if (prefs.work_end_time) {
      const m = timeToMinutes(prefs.work_end_time);
      if (m >= 0) setWorkEndMin(m);
    }
  }, [prefs.work_start_time, prefs.work_end_time, prefsLoading]);

  // Spark: change view mode
  useEffect(() => {
    if (!initialView) return;
    setViewMode(initialView);
    onViewConsumed?.();
  }, [initialView]);

  // Spark: navigate to a specific date
  useEffect(() => {
    if (!sparkNavigateDate) return;
    const { jy, jm, jd, view } = sparkNavigateDate;
    setCurrentJy(jy);
    setCurrentJm(jm);
    setSelectedJy(jy);
    setSelectedJm(jm);
    setSelectedJd(jd);
    setSidebarJy(jy);
    setSidebarJm(jm);
    if (view) setViewMode(view as ViewMode);
    onSparkNavigateDateConsumed?.();
  }, [sparkNavigateDate]);

  // Spark: open calendar meeting form with prefill
  useEffect(() => {
    if (!sparkCalendarMeetingPrefill) return;
    setPrefillData(sparkCalendarMeetingPrefill);
    setShowMeetingForm(true);
    onSparkCalendarMeetingPrefillConsumed?.();
  }, [sparkCalendarMeetingPrefill]);

  // Track which meetings we've already fired reminders for in this session
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const [reminderAlert, setReminderAlert] = useState<{ meeting: MeetingData; minutesBefore: number } | null>(null);

  const sendNotification = useCallback((title: string, body: string, _icon?: string) => {
    if (currentUserId) void notifyBrowser({ id: crypto.randomUUID(), title, message: body, action_url: '/?page=calendar' }, currentUserId);
  }, [currentUserId]);

  // Reminder checker — runs every 30 seconds
  useEffect(() => {
    const checkReminders = () => {
      if (!currentUserId || !meetings.length) return;
      const now = new Date();
      const IST_OFFSET_MS = 210 * 60 * 1000;
      const tehranNow = new Date(now.getTime() + IST_OFFSET_MS);
      const todayStr = `${tehranNow.getUTCFullYear()}-${String(tehranNow.getUTCMonth()+1).padStart(2,'0')}-${String(tehranNow.getUTCDate()).padStart(2,'0')}`;
      meetings.forEach(m => {
        if (m.series_id) return; // Server scheduler owns reminders for managed series.
        if (!m.reminder_minutes || m.reminder_minutes === 0) return;
        if (!m.start_time) return;
        const isParticipant = m.user_id === currentUserId ||
          (m.participant_user_ids || []).includes(currentUserId) ||
          ((m.notify_users || []) as string[]).includes(currentUserId);
        if (!isParticipant) return;

        const dateStr = parseRequestDateToDateStr(m.request_date);
        if (dateStr !== todayStr) return;

        const [hh, mm] = m.start_time.split(':').map(Number);
        const meetingMs = new Date(todayStr + 'T00:00:00').getTime() + (hh * 60 + mm) * 60000;
        const reminderMs = meetingMs - m.reminder_minutes * 60000;
        const nowMs = now.getTime();
        const key = `${m.id}-${m.reminder_minutes}`;

        // Fire if we're within a 30-second window of reminder time and haven't fired yet
        if (nowMs >= reminderMs && nowMs < reminderMs + 30000 && !firedRemindersRef.current.has(key)) {
          firedRemindersRef.current.add(key);
          const label = m.reminder_minutes >= 60
            ? `${m.reminder_minutes / 60} ساعت`
            : `${m.reminder_minutes} دقیقه`;
          const body = `جلسه "${m.subject}" ${label} دیگر شروع می‌شود — ${m.start_time}`;
          sendNotification('یادآوری جلسه', body);
          setReminderAlert({ meeting: m, minutesBefore: m.reminder_minutes });
        }
      });
    };
    const iv = setInterval(() => { setCurrentTime(new Date()); checkReminders(); }, 30000);
    checkReminders();
    return () => clearInterval(iv);
  }, [meetings, currentUserId, sendNotification]);

  const insertNotification = useCallback(async (userId: string, title: string, message: string, type = 'meeting', eventType = 'invite', placeholders?: Record<string, string>) => {
    try {
      await insertNotificationFromTemplate({
        userId, category: type, eventType,
        fallbackTitle: title, fallbackMessage: message,
        placeholders: placeholders || { meeting_subject: message },
        senderId: currentUserId || null, actionUrl: type,
      });
    } catch {}
  }, [currentUserId]);

  const buildMeetingPlaceholders = useCallback((m: MeetingData, recipientId?: string): Record<string, string> => {
    const gregDateStr = parseRequestDateToDateStr(m.request_date);
    let meetingDateStr = '';
    if (gregDateStr) {
      const d = new Date(gregDateStr + 'T00:00:00');
      const j = toJalaali(d);
      meetingDateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    }
    const meetingTimeStr = m.start_time && m.end_time ? `${m.start_time} - ${m.end_time}` : m.start_time || '';
    const senderName = currentUserId ? resolveName(currentUserId) : '';
    const recipientName = recipientId ? resolveName(recipientId) : '';
    return {
      ...meetingTimingPlaceholders(m),
      meeting_subject: m.subject || '',
      meeting_date: meetingDateStr,
      meeting_time: meetingTimeStr,
      location: m.location || '',
      location_part: m.location ? ` | ${m.location}` : '',
      agenda: '',
      sender_name: senderName,
      full_name: recipientName,
      representative: m.representative || '',
    };
  }, [resolveName, currentUserId]);

  // ---- Init ----
  useEffect(() => {
    console.log('[CalendarPage] MOUNT');
    const now = toJalaali(new Date());
    setCurrentJy(now.jy); setCurrentJm(now.jm);
    setSelectedJy(now.jy); setSelectedJm(now.jm); setSelectedJd(now.jd);
    setSidebarJy(now.jy); setSidebarJm(now.jm);
    if (providedUserId) setCurrentUserId(providedUserId);
    else void fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (pendingSchedule) {
      setActivePendingSchedule(pendingSchedule);
      const m = pendingSchedule.meeting;
      setPrefillData({
        subject: m.subject, location: m.location, representative: m.representative,
        phone: m.phone, notes: m.notes || '', priority: m.priority,
        meetingId: pendingSchedule.meetingId,
        participantUserIds: m.participant_user_ids || [],
        repeatEnabled: !!(m.repeat_type && m.repeat_type !== 'none'),
        repeatType: (m.repeat_type === 'weekly' || m.repeat_type === 'monthly') ? m.repeat_type : 'weekly',
        repeatInterval: m.repeat_interval || 1,
        repeatEndDate: m.repeat_end_date || '',
        repeatWeekday: m.repeat_weekday ?? 0,
      });
    }
  }, [pendingSchedule]);

  // Store pending mention data — will be injected when user drags a time slot
  const pendingMentionRef = React.useRef<{ participantUserIds?: string[]; notes?: string } | null>(null);
  useEffect(() => {
    if ((pendingMentionParticipants && pendingMentionParticipants.length > 0) || pendingMentionNotes) {
      pendingMentionRef.current = {
        ...(pendingMentionParticipants && pendingMentionParticipants.length > 0 ? { participantUserIds: pendingMentionParticipants } : {}),
        ...(pendingMentionNotes ? { notes: pendingMentionNotes } : {}),
      };
      // Show toast to guide user
      import('react-hot-toast').then(({ default: toast }) => {
        toast('زمان جلسه را در تقویم انتخاب (درگ) کنید', { duration: 5000, icon: '📅' });
      });
    } else {
      pendingMentionRef.current = null;
    }
  }, [pendingMentionParticipants, pendingMentionNotes]);

  // Scroll to current time on view change
  useEffect(() => {
    if (viewMode === 'day' || viewMode === 'week') {
      const timer = setTimeout(() => {
        if (!timeScrollRef.current) return;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = Math.max(nowMinutes, 6 * 60);
        const targetSlot = targetMinutes / 30;
        const scrollTop = targetSlot * slotHeight - timeScrollRef.current.clientHeight / 2;
        timeScrollRef.current.scrollTop = Math.max(0, scrollTop);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode]);

  // When working-hours mode is enabled, start at the top of the clipped 06:00–20:00 range.
  useEffect(() => {
    if (!timeScrollRef.current || (viewMode !== 'day' && viewMode !== 'week')) return;
    const timer = setTimeout(() => {
      if (!timeScrollRef.current) return;
      const scrollTop = hideOffHours
        ? 0
        : ((Math.max(new Date().getHours() * 60 + new Date().getMinutes(), 6 * 60)) / 30) * slotHeight - (timeScrollRef.current.clientHeight / 2);
      timeScrollRef.current.scrollTop = Math.max(0, scrollTop);
    }, 50);
    return () => clearTimeout(timer);
  }, [hideOffHours, viewMode, slotHeight]);

  // Scroll to today in list-month view
  useEffect(() => {
    if (viewMode !== 'list-month') return;
    const timer = setTimeout(() => {
      if (!listScrollRef.current) return;
      const todayEl = listScrollRef.current.querySelector('[data-today="true"]') as HTMLElement | null;
      if (todayEl) {
        const containerTop = listScrollRef.current.getBoundingClientRect().top;
        const elTop = todayEl.getBoundingClientRect().top;
        listScrollRef.current.scrollTop += elTop - containerTop - 16;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [viewMode, currentJy, currentJm]);

  const {
    fetchAllDayEvents, fetchCalendars, fetchCurrentUser, fetchMeetings, fetchMeetingsRef, getAllDayEventsForDay,
    handleAddSubscription, handleBlockClick, handleCreateMeetingForDay, handleDeleteCalendar, handleDeleteMeeting, handleDeleteMeetingConfirm,
    handleEditMeeting, handleOpenSubscriptions, handleRemoveSubscription, handleSaveCalendar, handleSendToGoogleCalendar, handleShareFromDetail,
    handleUpdateSubPermission, isInAllDayDragRange, jalaaliDatesBetween, openEditForm, resetCalendarForm, toFarsiTime
  } = useCalendarDataActions({
    allDayDragEnd, allDayDragStart, allDayEvents, buildMeetingPlaceholders, calendarForm, calendars,
    currentJm, currentJy, currentUserId, deleteMeetingDialog, dragMovedRef, editingCalendar,
    insertNotification, isRefreshing, meetings, monthDayPopup, monthDayPopupRef, previewMeeting,
    previewRef, providedUserId, resolveName, setAllDayEvents, setCalendarForm, setCalendars,
    setCurrentUserId, setDeleteMeetingDialog, setDetailMeeting, setEditingCalendar, setEnabledCalendarIds, setIsRefreshing,
    setMeetings, setMonthDayPopup, setOccasionsEnabled, setPrefillData, setPreviewMeeting, setPreviewPos, setRepeatEditDialog,
    setShowCalendarList, setShowCreateCalendar, setShowMeetingForm, setShowSubscriptionsModal, setSubSearch, setSubscribedCalendars,
    setSubscriptions, setSubscriptionsCalendar, subPermission, subscriptions, subscriptionsCalendar, usersById
  });

  // Current user's personal public calendar — prefer is_personal_public=true, fall back to any type='public'
  const myPublicCalendar = useMemo(() =>
    calendars.find(c => c.is_personal_public && c.type === 'public') ||
    calendars.find(c => c.type === 'public' && !c.is_occasions) ||
    null,
  [calendars]);

  // ---- Color ----
  const getMeetingColor = useCallback((m: MeetingData): string => {
    // Meetings assigned to me by others → always show in my personal public calendar color
    if (currentUserId && m.user_id !== currentUserId &&
      (m.personal_calendar_direct_access || (m.participant_user_ids || []).includes(currentUserId) ||
       ((m.notify_users || []) as string[]).includes(currentUserId))) {
      if (myPublicCalendar) return myPublicCalendar.color;
    }
    if (m.calendar_id) {
      const cal = [...calendars, ...subscribedCalendars].find(c => c.id === m.calendar_id);
      if (cal) return cal.color;
    }
    return PRIORITY_COLORS[m.priority || 'medium']?.solid || DEFAULT_CALENDAR_COLOR;
  }, [calendars, subscribedCalendars, currentUserId, myPublicCalendar]);

  // ---- Filter meetings ----
  // Set of all calendar IDs the user has a direct checkbox for (owned + subscribed)
  const knownCalendarIds = useMemo(() => {
    const s = new Set<string>();
    calendars.forEach(c => s.add(c.id));
    subscribedCalendars.forEach(c => s.add(c.id));
    return s;
  }, [calendars, subscribedCalendars]);

  // Map: owner user_id → set of calendar IDs they own that we subscribed to
  const subscribedOwnerCalendarIds = useMemo(() => {
    const map = new Map<string, string[]>();
    subscribedCalendars.forEach(c => {
      if (c.type !== 'public') return;
      if (!map.has(c.user_id)) map.set(c.user_id, []);
      map.get(c.user_id)!.push(c.id);
    });
    return map;
  }, [subscribedCalendars]);

  // Returns true if we subscribe to any calendar owned by any user in the list
  const isAnyParticipantSubscribed = useCallback((participantIds: string[]) => {
    return participantIds.some(uid => {
      const calIds = subscribedOwnerCalendarIds.get(uid) || [];
      return calIds.some(cid => enabledCalendarIds.has(cid));
    });
  }, [subscribedOwnerCalendarIds, enabledCalendarIds]);

  const meetingsByDate = useMemo(() => {
    const map: Record<string, MeetingData[]> = {};
    // Don't filter by calendar/owner until both user ID and calendars have loaded.
    // This prevents a race where meetings appear then vanish when the two async fetches
    // resolve in the wrong order.
    const calendarsLoaded = enabledCalendarIds.size > 0 || calendars.length > 0;
    let hiddenCalId = 0, hiddenNoCalNoSub = 0, hiddenPublicCalOff = 0;
    visibleMeetings.forEach(m => {
      const isCreator = !!currentUserId && m.user_id === currentUserId;
      const isAssigned = !!currentUserId && !isCreator && (
        m.personal_calendar_direct_access ||
        (m.participant_user_ids || []).includes(currentUserId) ||
        ((m.notify_users || []) as string[]).includes(currentUserId)
      );

      // If calendars haven't loaded yet or userId is unknown, show all meetings
      if (!currentUserId || !calendarsLoaded) {
        const s = parseRequestDateToDateStr(m.request_date);
        if (!s) return;
        if (!map[s]) map[s] = [];
        map[s].push(m);
        return;
      }

      // Meetings assigned to me → always use my personal public calendar toggle
      if (isAssigned) {
        // If I have a public calendar and it's disabled → hide the meeting
        if (myPublicCalendar && !enabledCalendarIds.has(myPublicCalendar.id)) { hiddenPublicCalOff++; return; }
        // If I have NO public calendar at all → still show (no toggle to apply)
        const s = parseRequestDateToDateStr(m.request_date);
        if (!s) return;
        if (!map[s]) map[s] = [];
        map[s].push(m);
        return;
      }

      // Check if any participant has a calendar we subscribed to (and it's enabled)
      const allParticipants = [m.user_id, ...(m.participant_user_ids || [])];
      const isViaSubscription = isAnyParticipantSubscribed(allParticipants);

      if (m.calendar_id) {
        // If this calendar has a direct checkbox (owned or subscribed), respect its toggle strictly
        if (knownCalendarIds.has(m.calendar_id)) {
          if (!enabledCalendarIds.has(m.calendar_id)) { hiddenCalId++; return; }
        } else if (!isCreator) {
          hiddenCalId++; return;
        }
      } else {
        // Creator's meeting without a calendar: respect myPublicCalendar toggle
        if (isCreator) {
          if (myPublicCalendar && !enabledCalendarIds.has(myPublicCalendar.id)) { hiddenPublicCalOff++; return; }
        } else {
          if (!isViaSubscription) { hiddenNoCalNoSub++; return; }
          if (m.members_only) return;
        }
      }

      const s = parseRequestDateToDateStr(m.request_date);
      if (!s) return;
      if (!map[s]) map[s] = [];
      map[s].push(m);
    });
    const shown = Object.values(map).reduce((a, arr) => a + arr.length, 0);
    // Log a sample of what keys are in the map vs what the grid would look up
    const mapKeys = Object.keys(map).slice(0, 5);
    const sampleGridKey1 = jalaaliToYYYYMMDD(currentJy || 1405, currentJm || 4, 1);
    const sampleGridKey2 = jalaaliToYYYYMMDD(currentJy || 1405, currentJm || 4, 15);
    console.log('[CalendarPage] meetingsByDate recomputed: visibleMeetings=' + visibleMeetings.length + ' shown=' + shown + ' hiddenCalId=' + hiddenCalId + ' hiddenNoCalNoSub=' + hiddenNoCalNoSub + ' hiddenPublicCalOff=' + hiddenPublicCalOff + ' currentUserId=' + currentUserId + ' enabledCalendarIds.size=' + enabledCalendarIds.size + ' calendarsLoaded=' + calendarsLoaded + ' myPublicCalendar=' + myPublicCalendar?.id);
    console.log('[CalendarPage] meetingsByDate keys (sample):', mapKeys, '| grid lookup key for day 1:', sampleGridKey1, '| day 15:', sampleGridKey2, '| currentJy/Jm:', currentJy, currentJm);
    return map;
  }, [visibleMeetings, enabledCalendarIds, calendars, currentUserId, isAnyParticipantSubscribed, myPublicCalendar, currentJy, currentJm]);

  const getMeetings = useCallback((jy: number, jm: number, jd: number): MeetingData[] => {
    return meetingsByDate[jalaaliToYYYYMMDD(jy, jm, jd)] || [];
  }, [meetingsByDate]);

  // Convert Gregorian → Hijri (Tabular Islamic calendar algorithm)
  const toHijri = useCallback((date: Date) => {
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
    const N = d + Math.ceil(29.5001 * (mo - 1)) + (y - 1) * 365 + Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400) + 1721425.5 - 1948438.5;
    const z = Math.floor(N);
    const a = Math.floor((z - 1) / 10631);
    const b = z - 1 - 10631 * a;
    const c = Math.floor((b - 1) / 354);
    const hy = 30 * a + c + 1;
    const rem = b - 354 * c;
    let hm = 0, hd = 0;
    const monthLengths = [30,29,30,29,30,29,30,29,30,29,30,29];
    let cumDays = 0;
    for (let i = 0; i < 12; i++) {
      if (rem <= cumDays + monthLengths[i]) { hm = i + 1; hd = rem - cumDays; break; }
      cumDays += monthLengths[i];
    }
    return { hy, hm: hm || 12, hd: hd || 29 };
  }, []);

  const getOccasionsForDay = useCallback((jy: number, jm: number, jd: number) => {
    if (!occasionsEnabled) return [];
    const greg = jalaaliToDate(jy, jm, jd);
    const hijri = toHijri(greg);
    return occasions.filter(o =>
      o.calendar_type === 'shamsi'
        ? o.month === jm && o.day === jd
        : o.month === hijri.hm && o.day === hijri.hd
    );
  }, [occasions, toHijri, occasionsEnabled]);

  const todayJ = useMemo(() => toJalaali(currentTime), [currentTime]);
  const isToday = (jy: number, jm: number, jd: number) => jy === todayJ.jy && jm === todayJ.jm && jd === todayJ.jd;
  const isSelected = (jy: number, jm: number, jd: number) => jy === selectedJy && jm === selectedJm && jd === selectedJd;

  const {
    getNavTitle, goToToday, listMeetings, mainMonthDays, navigateNext, navigatePrev,
    sidebarMonthDays, weekDays
  } = useCalendarNavigation({
    currentJm, currentJy, getMeetings, selectedJd, selectedJm, selectedJy,
    setCurrentJm, setCurrentJy, setSelectedJd, setSelectedJm, setSelectedJy, setSidebarJm,
    setSidebarJy, sidebarJm, sidebarJy, viewMode
  });

  const [focusNowRequest, setFocusNowRequest] = useState(0);
  const focusGeometry = useRef({ mode: viewMode, height: slotHeight, startHour: hideOffHours ? visibleStartHour : 0 });
  focusGeometry.current = { mode: viewMode, height: slotHeight, startHour: hideOffHours ? visibleStartHour : 0 };
  const refreshCalendarToNow = async () => {
    goToToday();
    await fetchMeetings();
    goToToday();
    setCurrentTime(new Date());
    setFocusNowRequest(value => value + 1);
  };
  useEffect(() => {
    if (!focusNowRequest) return;
    // Allow the view's initial date positioning to finish before explicit focus.
    const timer = window.setTimeout(() => {
      const geometry = focusGeometry.current;
      focusCalendarNow(geometry.mode, document.querySelector<HTMLElement>('[data-calendar-page]'),
        timeScrollRef.current, listScrollRef.current, new Date(), geometry.height, geometry.startHour);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [focusNowRequest]);

  // ---- Drag/grid helpers ----
  // Returns the correct inner grid element for slot-from-Y calculations.
  // Week view: weekGridRef (inner div, has negative marginTop offset)
  // Day view:  timeGridRef (also inner div, already offset by negative marginTop)
  const getActiveGridEl = () =>
    (viewMode === 'week' ? weekGridRef.current : dayGridRef.current);

  const getSlotFromY = (y: number, el: HTMLElement): number | null => {
    const rect = el.getBoundingClientRect();
    const relY = y - rect.top;
    // getBoundingClientRect() already reflects the element's negative marginTop,
    // so relY directly maps to the correct midnight-based slot index.
    const slot = Math.floor(relY / slotHeight);
    if (slot < 0 || slot >= (HOURS_END - HOURS_START) * 2) return null;
    return slot;
  };

  const getDayIndexFromX = (x: number): number => {
    const grid = weekGridRef.current?.querySelector<HTMLElement>('[data-calendar-day-grid]');
    return grid ? weekDayIndex(x, grid.getBoundingClientRect(), grid.querySelectorAll('[data-calendar-column-date]').length || 7) : 0;
  };

  // Global move/resize handlers
  useEffect(() => {
    const originalDay = Array.from(weekGridRef.current?.querySelectorAll<HTMLElement>('[data-calendar-column-date]') || [])
      .findIndex(column => column.dataset.calendarColumnDate === dragMoveOriginalDate);
    const originDay = originalDay >= 0 ? originalDay : getDayIndexFromX(dragMoveStartX);
    const onMove = (clientX: number, clientY: number, isTouch = false) => {
      if (dragMoveMeeting) {
        const deliberate = !isTouch || Math.hypot(clientX - dragMoveStartX, clientY - dragMoveStartY) >= 10;
        const deltaSlot = deliberate ? Math.round((clientY - dragMoveStartY) / (slotHeight / 2)) * 0.5 : 0;
        const deltaDay = deliberate && mobileZoomDayCount(viewMode) > 0 ? getDayIndexFromX(clientX) - originDay : 0;
        if (deltaSlot !== 0 || deltaDay !== 0) dragMovedRef.current = true;
        setDragMoveCurrentDeltaSlot(deltaSlot);
        if (mobileZoomDayCount(viewMode) > 0) setDragMoveCurrentDeltaDay(deltaDay);
      }
      if (resizeMeeting) setResizeCurrentDelta(isTouch && Math.abs(clientY - resizeStartY) < 10 ? 0 : Math.round((clientY - resizeStartY) / (slotHeight / 2)) * 0.5);
    };
    const onEnd = async (clientX: number, clientY: number, isTouch = false) => {
      pointer = null;
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      if (dragMoveMeeting) {
        const deliberate = !isTouch || Math.hypot(clientX - dragMoveStartX, clientY - dragMoveStartY) >= 10;
        const deltaSlot = deliberate ? Math.round((clientY - dragMoveStartY) / (slotHeight / 2)) * 0.5 : 0;
        const deltaDay = deliberate && mobileZoomDayCount(viewMode) > 0 ? getDayIndexFromX(clientX) - originDay : 0;
        if (deltaSlot !== 0 || deltaDay !== 0) {
          const ns = dragMoveOriginalSlot + deltaSlot;
          const ne = dragMoveOriginalEndSlot + deltaSlot;
          if (ns >= 0 && ne <= (HOURS_END - HOURS_START) * 2) {
            let newDate = dragMoveOriginalDate;
            if (deltaDay !== 0 && mobileZoomDayCount(viewMode) > 0 && dragMoveOriginalDate) {
              const origDate = new Date(dragMoveOriginalDate + 'T00:00:00');
              origDate.setDate(origDate.getDate() + deltaDay);
              newDate = `${origDate.getFullYear()}-${String(origDate.getMonth() + 1).padStart(2, '0')}-${String(origDate.getDate()).padStart(2, '0')}`;
            }
            const updates: Record<string, string> = { start_time: minutesToTime(ns * 30), end_time: minutesToTime(ne * 30), duration: `${minutesToTime(ns * 30)} - ${minutesToTime(ne * 30)}` };
            if (newDate !== dragMoveOriginalDate) updates.request_date = new Date(newDate + 'T12:00:00').toISOString();
            setPendingMove({ meeting: dragMoveMeeting, updates, ns, ne, oldDateIso: dragMoveOriginalDate, newDateIso: newDate });
          }
        }
        setDragMoveMeeting(null); setDragMoveCurrentDeltaSlot(0); setDragMoveCurrentDeltaDay(0);
      }
      if (resizeMeeting) {
        const delta = isTouch && Math.abs(clientY - resizeStartY) < 10 ? 0 : Math.round((clientY - resizeStartY) / (slotHeight / 2)) * 0.5;
        if (delta !== 0) {
          const ne = resizeOriginalEndSlot + delta;
          const ss = timeToMinutes(resizeMeeting.start_time) / 30;
          if (ne > ss && ne <= (HOURS_END - HOURS_START) * 2) {
            setPendingResize({ meeting: resizeMeeting, newEndTime: minutesToTime(ne * 30) });
          }
        }
        setResizeMeeting(null); setResizeCurrentDelta(0);
      }
    };
    let pointer: { x: number; y: number; touch: boolean } | null = null;
    let autoScrollFrame = 0;
    const mm = (e: MouseEvent) => { pointer = { x: e.clientX, y: e.clientY, touch: false }; onMove(e.clientX, e.clientY); };
    const mu = (e: MouseEvent) => onEnd(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { if (e.touches.length !== 1) return; e.preventDefault(); pointer = { x: e.touches[0].clientX, y: e.touches[0].clientY, touch: true }; onMove(pointer.x, pointer.y, true); };
    const tu = (e: TouchEvent) => onEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY, true);
    const autoScroll = () => {
      const scroller = timeScrollRef.current;
      if (pointer && scroller && dragMovedRef.current) {
        const rect = scroller.getBoundingClientRect();
        const left = rect.left + 28;
        const right = rect.right - 56 - 28;
        const speed = pointer.x < left ? -Math.min(12, (left - pointer.x) / 3)
          : pointer.x > right ? Math.min(12, (pointer.x - right) / 3) : 0;
        if (speed) {
          scroller.scrollLeft += speed;
          onMove(pointer.x, pointer.y, pointer.touch);
        }
      }
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };
    const cancel = () => {
      pointer = null;
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      setDragMoveMeeting(null); setDragMoveCurrentDeltaSlot(0); setDragMoveCurrentDeltaDay(0);
      setResizeMeeting(null); setResizeCurrentDelta(0);
    };
    if (dragMoveMeeting && mobileZoomDayCount(viewMode) > 0) autoScrollFrame = requestAnimationFrame(autoScroll);
    if (dragMoveMeeting || resizeMeeting) {
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
      document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', tu);
      document.addEventListener('touchcancel', cancel);
    }
    return () => {
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
      document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', tu);
    };
  }, [dragMoveMeeting, dragMoveStartY, dragMoveStartX, dragMoveOriginalSlot, dragMoveOriginalEndSlot, dragMoveOriginalDate, resizeMeeting, resizeStartY, resizeOriginalEndSlot, viewMode, slotHeight, weekDays]);

  // Cancel all-day drag on global mouseup
  useEffect(() => {
    const cancel = () => {
      if (allDayDragging) {
        setAllDayDragging(false);
        setAllDayDragStart(null);
        setAllDayDragEnd(null);
      }
    };
    document.addEventListener('mouseup', cancel);
    return () => document.removeEventListener('mouseup', cancel);
  }, [allDayDragging]);

  // New-meeting drag handlers
  const handleGridMouseDown = (e: React.MouseEvent, jy: number, jm: number, jd: number) => {
    const el = getActiveGridEl();
    if (e.button !== 0 || !el
      || (e.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) return;
    const slot = getSlotFromY(e.clientY, el);
    if (slot === null) return;
    setIsDragging(true); setDragStartSlot(slot); setDragEndSlot(slot); setDragDate({ jy, jm, jd });
  };
  const handleGridMouseMove = (e: React.MouseEvent) => {
    const el = getActiveGridEl();
    if (!isDragging || !el) return;
    const slot = getSlotFromY(e.clientY, el);
    if (slot !== null) setDragEndSlot(slot);
  };
  const handleGridTouchStart = (e: React.TouchEvent, jy: number, jm: number, jd: number) => {
    const el = getActiveGridEl();
    if (!el) return;
    const slot = getSlotFromY(e.touches[0].clientY, el);
    if (slot === null) return;
    setIsDragging(true); setDragStartSlot(slot); setDragEndSlot(slot); setDragDate({ jy, jm, jd });
  };
  const handleGridTouchMove = (e: React.TouchEvent) => {
    const el = getActiveGridEl();
    if (!isDragging || !el) return;
    e.preventDefault();
    const slot = getSlotFromY(e.touches[0].clientY, el);
    if (slot !== null) setDragEndSlot(slot);
  };
  const commitDrag = () => {
    if (!isDragging || dragStartSlot === null || dragEndSlot === null) { setIsDragging(false); return; }
    const startSlot = Math.min(dragStartSlot, dragEndSlot);
    const endSlot = Math.max(dragStartSlot, dragEndSlot) + 1;
    const mentionData = pendingMentionRef.current;
    setPrefillData({
      startTime: minutesToTime(startSlot * 30), endTime: minutesToTime(endSlot * 30),
      dateJy: dragDate?.jy, dateJm: dragDate?.jm, dateJd: dragDate?.jd,
      meetingId: activePendingSchedule?.meetingId || undefined,
      subject: activePendingSchedule?.meeting.subject || '',
      location: activePendingSchedule?.meeting.location || '',
      representative: activePendingSchedule?.meeting.representative || '',
      phone: activePendingSchedule?.meeting.phone || '',
      notes: mentionData?.notes || activePendingSchedule?.meeting.notes || '',
      participantUserIds: mentionData?.participantUserIds || activePendingSchedule?.meeting.participant_user_ids || [],
    });
    if (mentionData) {
      pendingMentionRef.current = null;
      onPendingMentionConsumed?.();
    }
    setShowMeetingForm(true);
    setIsDragging(false); setDragStartSlot(null); setDragEndSlot(null);
  };

  useEffect(() => {
    setDetailMeeting(previous => previous ? meetings.find(meeting => meeting.id === previous.id) || null : null);
    setPreviewMeeting(previous => previous ? meetings.find(meeting => meeting.id === previous.id) || null : null);
  }, [meetings]);

  if (!currentJy) return null;

  const commitMove = async (withNotify: boolean) => {
    const snap = pendingMove;
    if (!snap || isMoveCommitting) return;

    setIsMoveCommitting(true);
    const { meeting, updates, ns, ne } = snap;

    try {
      const saved = await persistCalendarTiming(supabase, meeting.id, updates);
      const movedMtg = { ...meeting, ...updates, ...saved };
      setMeetings(previous => previous.map(row => row.id === meeting.id ? { ...row, ...saved } : row));

      setPendingMove(null);
      fetchMeetings();

      if (!withNotify) {
        toast.success('تغییرات جلسه بدون اطلاع‌رسانی ذخیره شد');
        return;
      }

      try {
        sendNotification('جلسه جابجا شد', meeting.subject);

        if (currentUserId) {
          await insertNotificationFromTemplate({
            userId: currentUserId,
            category: 'meeting',
            meetingId: meeting.id,
            eventType: 'change',
            fallbackTitle: 'جلسه جابجا شد',
            fallbackMessage: `جلسه «${meeting.subject}» جابجا شد`,
            placeholders: buildMeetingPlaceholders(movedMtg, currentUserId),
            senderId: currentUserId,
            actionUrl: 'calendar',
            channels: { inApp: true, sms: false, bale: false },
          });
        }

        const participantIds = meeting.participant_user_ids || [];
        const recipientIds = Array.from(new Set([
          ...participantIds,
          ...((meeting.notify_users || []) as string[]),
        ])).filter(id => id !== currentUserId);

        if (recipientIds.length > 0) {
          const deliveryResults = await Promise.all(recipientIds.map(uid =>
            insertNotificationFromTemplate({
              userId: uid,
              category: 'meeting',
              meetingId: meeting.id,
              eventType: 'change',
              audience: participantIds.includes(uid) ? 'participants' : 'observers',
              fallbackTitle: 'زمان جلسه تغییر کرد',
              fallbackMessage: `جلسه «${meeting.subject}» جابجا شد`,
              placeholders: buildMeetingPlaceholders(movedMtg, uid),
              senderId: currentUserId,
              actionUrl: 'calendar',
            })
          ));
          if (deliveryResults.some(result => result?.ok === false)) throw new Error('MEETING_NOTIFICATION_FAILED');
        }

        toast.success('تغییرات جلسه ذخیره شد و اطلاع‌رسانی انجام شد');
      } catch (notificationError) {
        console.error('Meeting move notification error:', notificationError);
        toast.error('تغییرات جلسه ذخیره شد، اما اطلاع‌رسانی به‌طور کامل انجام نشد');
      }
    } catch (error) {
      console.error('Meeting move update error:', error);
      toast.error('خطا در ذخیره تغییرات جلسه');
    } finally {
      setIsMoveCommitting(false);
    }
  };

  const returnMoveToEdit = () => {
    const snap = pendingMove;
    if (!snap || isMoveCommitting) return;

    const proposedMeeting = {
      ...snap.meeting,
      ...snap.updates,
      start_time: snap.updates.start_time || snap.meeting.start_time,
      end_time: snap.updates.end_time || snap.meeting.end_time,
    } as MeetingData;

    setPendingMove(null);
    openEditForm(proposedMeeting);
  };

  const commitResize = async (withNotify: boolean) => {
    const snap = pendingResize;
    if (!snap || isResizeCommitting) return;

    setIsResizeCommitting(true);
    const { meeting, newEndTime } = snap;
    const updates = {
      end_time: newEndTime,
      duration: `${meeting.start_time} - ${newEndTime}`,
    };

    try {
      const saved = await persistCalendarTiming(supabase, meeting.id, updates);
      const resizedMtg = { ...meeting, ...updates, ...saved };
      setMeetings(previous => previous.map(row => row.id === meeting.id ? { ...row, ...saved } : row));

      setPendingResize(null);
      fetchMeetings();

      if (!withNotify) {
        toast.success('تغییرات جلسه بدون اطلاع‌رسانی ذخیره شد');
        return;
      }

      try {
        sendNotification('زمان جلسه تغییر کرد', meeting.subject);

        if (currentUserId) {
          await insertNotificationFromTemplate({
            userId: currentUserId,
            category: 'meeting',
            meetingId: meeting.id,
            eventType: 'change',
            fallbackTitle: 'مدت جلسه تغییر کرد',
            fallbackMessage: `جلسه «${meeting.subject}» مدت آن تغییر کرد`,
            placeholders: buildMeetingPlaceholders(resizedMtg, currentUserId),
            senderId: currentUserId,
            actionUrl: 'calendar',
            channels: { inApp: true, sms: false, bale: false },
          });
        }

        const participantIds = meeting.participant_user_ids || [];
        const recipientIds = Array.from(new Set([
          ...participantIds,
          ...((meeting.notify_users || []) as string[]),
        ])).filter(id => id !== currentUserId);

        if (recipientIds.length > 0) {
          const deliveryResults = await Promise.all(recipientIds.map(uid =>
            insertNotificationFromTemplate({
              userId: uid,
              category: 'meeting',
              meetingId: meeting.id,
              eventType: 'change',
              audience: participantIds.includes(uid) ? 'participants' : 'observers',
              fallbackTitle: 'زمان جلسه تغییر کرد',
              fallbackMessage: `جلسه «${meeting.subject}» مدت آن تغییر کرد`,
              placeholders: buildMeetingPlaceholders(resizedMtg, uid),
              senderId: currentUserId,
              actionUrl: 'calendar',
            })
          ));
          if (deliveryResults.some(result => result?.ok === false)) throw new Error('MEETING_NOTIFICATION_FAILED');
        }

        toast.success('تغییرات جلسه ذخیره شد و اطلاع‌رسانی انجام شد');
      } catch (notificationError) {
        console.error('Meeting resize notification error:', notificationError);
        toast.error('تغییرات جلسه ذخیره شد، اما اطلاع‌رسانی به‌طور کامل انجام نشد');
      }
    } catch (error) {
      console.error('Meeting resize update error:', error);
      toast.error('خطا در ذخیره تغییرات جلسه');
    } finally {
      setIsResizeCommitting(false);
    }
  };

  const returnResizeToEdit = () => {
    const snap = pendingResize;
    if (!snap || isResizeCommitting) return;

    const proposedMeeting = {
      ...snap.meeting,
      end_time: snap.newEndTime,
      duration: `${snap.meeting.start_time} - ${snap.newEndTime}`,
    } as MeetingData;

    setPendingResize(null);
    openEditForm(proposedMeeting);
  };


  return <CalendarPageView model={{
      adjustSlotHeight, allDayDragEnd, allDayDragStart, allDayDragging, allDayFormDate, allDayFormEndDate,
      allDayFormTitle, allDayFormType, allUsers, calendarForm, calendarListSearch, calendars,
      canHideOffHours, commitDrag, commitMove, commitResize, currentJm, currentJy, isMoveCommitting, isResizeCommitting,
      currentTime, currentUserId, dayGridRef, deleteMeetingDialog, detailMeeting, dragDate,
      dragEndSlot, dragMoveCurrentDeltaDay, dragMoveCurrentDeltaSlot, dragMoveMeeting, dragMoveOriginalEndSlot, dragMoveOriginalSlot,
      dragMovedRef, dragStartSlot, editingCalendar, enabledCalendarIds, expandedMeetingId, fetchAllDayEvents,
      fetchMeetings, getAllDayEventsForDay, getMeetingColor, getMeetings, getNavTitle, getOccasionsForDay,
      refreshCalendarToNow, goToToday, handleAddSubscription, handleBlockClick, handleCreateMeetingForDay, handleDeleteCalendar, handleDeleteMeeting,
      cancelTouchDrag: () => { setIsDragging(false); setDragStartSlot(null); setDragEndSlot(null); },
      handleDeleteMeetingConfirm, handleEditMeeting, handleGridMouseDown, handleGridMouseMove, handleGridTouchMove, handleGridTouchStart,
      handleHourColTouchEnd, handleHourColTouchMove, handleHourColTouchStart, handleOpenSubscriptions, handleRemoveSubscription, handleSaveCalendar,
      handleSendToGoogleCalendar, handleShareFromDetail, handleToggleOccasions, handleUpdateSubPermission, hideOffHours, isDragging,
      isInAllDayDragRange, isRefreshing, isSelected, isToday, jalaaliDatesBetween, listMeetings,
      listScrollRef, mainMonthDays, meetings, monthDayPopup, monthDayPopupRef, myGroupOpen,
      navigateNext, navigatePrev, navigateToMeeting, occasionsEnabled, onRegisterMinutes, onScheduleComplete,
      openEditForm, pendingMove, pendingResize, prefillData, prefs, previewMeeting, returnMoveToEdit, returnResizeToEdit,
      previewPos, previewRef, publicGroupOpen, reminderAlert, repeatEditDialog, resetCalendarForm,
      resizeCurrentDelta, resizeMeeting, resizeOriginalEndSlot, resolveName, searchInputRef, searchQuery,
      searchRef, searchResults, selectedJd, selectedJm, selectedJy, sendNotification,
      setActivePendingSchedule, setAllDayDragEnd, setAllDayDragStart, setAllDayDragging, setAllDayFormDate, setAllDayFormEndDate,
      setAllDayFormTitle, setAllDayFormType, setCalendarForm, setCalendarListSearch, setCurrentJm, setCurrentJy,
      setDeleteMeetingDialog, setDetailMeeting, setDragMoveCurrentDeltaDay, setDragMoveCurrentDeltaSlot, setDragMoveMeeting, setDragMoveOriginalDate,
      setDragMoveOriginalEndSlot, setDragMoveOriginalSlot, setDragMoveStartX, setDragMoveStartY, setEditingCalendar, setEnabledCalendarIds,
      setExpandedMeetingId, setHideOffHours, setMonthDayPopup, setMyGroupOpen, setPendingMove, setPendingResize,
      setPrefillData, setPreviewMeeting, setPublicGroupOpen, setReminderAlert, setRepeatEditDialog, setResizeCurrentDelta,
      setResizeMeeting, setResizeOriginalEndSlot, setResizeStartY, setSearchQuery, setSelectedJd, setSelectedJm,
      setSelectedJy, setSharedGroupOpen, setShowAllDayForm, setShowCalendarList, setShowCreateCalendar, setShowDesktopSidebar,
      setShowMeetingForm, setShowMobileSidebar, setShowOnlyMine, setShowSearch, setShowSubscriptionsModal, setShowViewDropdown,
      setSidebarJm, setSidebarJy, setSubPermission, setSubSearch, setViewMode, sharedGroupOpen,
      showAllDayForm, showCalendarList, showCreateCalendar, showDesktopSidebar, showMeetingForm, showMobileSidebar,
      showOnlyMine, showSearch, showSubscriptionsModal, showViewDropdown, sidebarJm, sidebarJy,
      sidebarMonthDays, slotHeight, subPermission, subSearch, subscribedCalendars, subscriptions,
      subscriptionsCalendar, timeGridRef, timeScrollRef, toFarsiTime, totalSlots, updatePrefs,
      viewMode, visibleEndHour, visibleStartHour, weekDays, weekGridRef, workEndMin,
      workStartMin
    }} />;
}
