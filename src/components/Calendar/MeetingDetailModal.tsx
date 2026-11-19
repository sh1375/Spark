import { dispatchRecurringMeetingDelivery } from '../../features/meetings/services/dispatchRecurringMeetingDelivery';
import { useLiveRevision, LIVE_DATA } from '../../shared/realtime/useLiveData';
import { useState, useEffect, useRef } from 'react';
import { X, Clock, MapPin, Users, User, Phone, Bell, RefreshCw, UserPlus, Share2, ExternalLink, Trash2, CreditCard as Edit2, Video, Copy, FileText, Image, CalendarDays, CircleCheck as CheckCircle2, Circle as XCircle, Circle as HelpCircle, UserCheck, ClipboardList, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';
import { MeetingData, CalendarEntry } from './types';
import { supabase } from '../../lib/supabase';
import { isMeetingEligibleForMinutes } from '../../lib/isMeetingEligibleForMinutes';
import toast from 'react-hot-toast';
import { toPng } from 'html-to-image';
import { shareMeetingText, shareMeetingImage } from '../../features/meetings/sharing/nativeMeetingShare';
import { normalizeMeetingDate, normalizeClockTime } from '../../lib/minutesDate';
import { MeetingOwnerDelegateModal } from './MeetingOwnerDelegateModal';
import { LinkedDecisionDialog } from '../Agenda/LinkedDecisionDialog';
import { MeetingShareDialog } from '../../features/meetings/components/MeetingCard/MeetingShareDialog';
import { InformeeAddParticipantModal } from '../../features/meetings/components/InformeeAddParticipantModal';
import { ExternalInformeesManager } from '../../features/meetings/components/ExternalInformeesManager';

interface AgendaItem {
  id: string;
  title: string;
  presenter: string | null;
  duration_minutes: number | null;
  description: string | null;
  sort_order: number;
  source_decision_id?: string | null;
}

interface Props {
  meeting: MeetingData;
  currentUserId: string | null;
  resolveName: (uid: string) => string;
  calendars: CalendarEntry[];
  subscribedCalendars: CalendarEntry[];
  getMeetingColor: (m: MeetingData) => string;
  onClose: () => void;
  onEdit: (m: MeetingData) => void;
  onDelete: (id: string, deleteRepeating?: boolean) => void;
  onShare: (m: MeetingData) => void;
  onGoogleCalendar: (m: MeetingData) => void;
  onCreateSimilar?: (m: MeetingData, agendaItems: AgendaItem[]) => void;
  onRegisterMinutes?: (meetingId: string, existingMinuteId: string | null) => void;
}

export function MeetingDetailModal({
  meeting: m, currentUserId, resolveName, calendars, subscribedCalendars,
  getMeetingColor, onClose, onEdit, onDelete, onGoogleCalendar, onCreateSimilar, onRegisterMinutes,
}: Props) {
  const isOwner = m.user_id === currentUserId;
  const isManager = m.meeting_manager === currentUserId;
  const [retryingTimingSms, setRetryingTimingSms] = useState(false);
  const retryTimingSms = async () => {
    if (retryingTimingSms) return;
    setRetryingTimingSms(true);
    try {
      const { data, error } = await supabase.rpc('retry_calendar_schedule_sms_v1', { p_meeting_id: m.id });
      if (error) throw error;
      if (!data) {
        toast('پیامک ناموفق و قابل ارسال مجدد برای زمان فعلی جلسه یافت نشد.');
        return;
      }
      toast.success('درخواست ارسال مجدد پیامک ثبت شد.');
      await dispatchRecurringMeetingDelivery(m.series_id ?? m.id);
    } catch {
      toast.error('ثبت درخواست ارسال مجدد پیامک ناموفق بود.');
    } finally {
      setRetryingTimingSms(false);
    }
  };
  const canEdit = isOwner || isManager;
  const isInformee = Boolean(currentUserId && ((m.notify_users || []) as string[]).includes(currentUserId));
  const isListedParticipant = Boolean(currentUserId && (m.participant_user_ids || []).includes(currentUserId));
  const canAddParticipants = isOwner || isInformee || isListedParticipant;
  const cal = [...calendars, ...subscribedCalendars].find(c => c.id === m.calendar_id);

  const liveRevision = useLiveRevision([...LIVE_DATA.meetings, ...LIVE_DATA.minutes]);
  const [showShareChoice, setShowShareChoice] = useState(false);
  const [shareTextFallback, setShareTextFallback] = useState<string | null>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [showOwnerDelegate, setShowOwnerDelegate] = useState(false);
  const [showInformeeParticipantModal, setShowInformeeParticipantModal] = useState(false);
  const [informeeAddedParticipantIds, setInformeeAddedParticipantIds] = useState<string[]>([]);
  const [externalInformeeNames, setExternalInformeeNames] = useState<string[]>([]);
  const effectiveParticipantIds = Array.from(new Set([...(m.participant_user_ids || []), ...informeeAddedParticipantIds]));
  const [myDelegate, setMyDelegate] = useState<{
    userId: string;
    name: string;
    status: 'pending' | 'accepted' | 'declined';
  } | null>(() => m.owner_delegate_user_id && m.owner_delegate_name && m.owner_delegate_status
    ? { userId: m.owner_delegate_user_id, name: m.owner_delegate_name, status: m.owner_delegate_status }
    : null);
  const [canDelegateInvitation, setCanDelegateInvitation] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  // Guard against double-click / double-navigation when confirming minutes creation.
  const minutesNavigationRef = useRef(false);

  // Per-participant inbox status — only fetched for the meeting owner
  const [participantStatuses, setParticipantStatuses] = useState<Record<string, 'pending' | 'accepted' | 'declined' | 'delegated'>>({});

  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [linkedDetailId, setLinkedDetailId] = useState<string | null>(null);

  useEffect(() => {
    setShowInformeeParticipantModal(false);
    setInformeeAddedParticipantIds([]);
  }, [m.id]);

  useEffect(() => {
    let cancelled = false;
    setExternalInformeeNames([]);
    supabase
      .from('meetings')
      .select('external_informees')
      .eq('id', m.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = data as { external_informees?: string[] | null } | null;
        setExternalInformeeNames(Array.isArray(row?.external_informees) ? row.external_informees : []);
      });
    return () => { cancelled = true; };
  }, [m.id, liveRevision]);

  // Minutes access state — checked via RPC, not frontend-only
  const [minutesAccess, setMinutesAccess] = useState<{
    loading: boolean;
    allowed: boolean;
    existingMinuteId: string | null;
    error: boolean;
  }>({ loading: false, allowed: false, existingMinuteId: null, error: false });
  const [showMinutesConfirm, setShowMinutesConfirm] = useState(false);

  useEffect(() => {
    if (!onRegisterMinutes) return;
    const eligible = isMeetingEligibleForMinutes({ id: m.id, calendar_id: m.calendar_id, status_type: m.status_type });
    if (!eligible) {
      setMinutesAccess({ loading: false, allowed: false, existingMinuteId: null, error: false });
      return;
    }
    let cancelled = false;
    setMinutesAccess({ loading: true, allowed: false, existingMinuteId: null, error: false });
    (async () => {
      try {
        const { checkMinutesAccessForMeeting } = await import('../../lib/minutesMeetingAccess');
        const result = await checkMinutesAccessForMeeting(supabase, m.id);
        if (!cancelled) {
          const hasCheckError = result.errorCode === 'CHECK_FAILED';
          setMinutesAccess({
            loading: false,
            allowed: result.allowed,
            existingMinuteId: result.existingMinuteId ?? null,
            error: hasCheckError,
          });
        }
      } catch {
        if (!cancelled) {
          setMinutesAccess({ loading: false, allowed: false, existingMinuteId: null, error: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [m.id, m.status_type, m.calendar_id, onRegisterMinutes, liveRevision]);

  const handleRegisterMinutes = () => {
    if (!onRegisterMinutes) return;
    if (minutesAccess.existingMinuteId) {
      // Existing visible minutes: navigate directly, no confirmation dialog.
      onRegisterMinutes(m.id, minutesAccess.existingMinuteId);
      return;
    }
    setShowMinutesConfirm(true);
  };

  const handleConfirmMinutes = () => {
    if (!onRegisterMinutes) return;
    if (minutesNavigationRef.current) return; // prevent double-click
    minutesNavigationRef.current = true;
    setShowMinutesConfirm(false);
    onRegisterMinutes(m.id, null);
  };

  const handleCancelMinutes = () => {
    setShowMinutesConfirm(false);
    minutesNavigationRef.current = false;
  };

  // Escape closes the confirm dialog; click on backdrop closes it too.
  useEffect(() => {
    if (!showMinutesConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancelMinutes();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMinutesConfirm]);

  useEffect(() => {
    supabase
      .from('meeting_agenda_items')
      .select('id, title, presenter, duration_minutes, description, sort_order, source_decision_id')
      .eq('meeting_id', m.id)
      .order('sort_order')
      .then(({ data }) => { if (data) setAgendaItems(data as AgendaItem[]); });
  }, [m.id, liveRevision]);

  useEffect(() => {
    const handleDelegationChanged = (event: Event) => {
      const detail = (event as CustomEvent<{
        meetingId?: string;
        delegateUserId?: string;
        delegateName?: string;
        status?: 'pending' | 'accepted' | 'declined';
      }>).detail;
      if (!detail?.meetingId || detail.meetingId !== m.id || !detail.delegateUserId || !detail.delegateName || !detail.status) return;
      setMyDelegate({
        userId: detail.delegateUserId,
        name: detail.delegateName,
        status: detail.status,
      });
    };
    window.addEventListener('spark:meeting-delegation-changed', handleDelegationChanged);
    return () => window.removeEventListener('spark:meeting-delegation-changed', handleDelegationChanged);
  }, [m.id, liveRevision]);

  useEffect(() => {
    if (!currentUserId) {
      setMyDelegate(null);
      return;
    }
    let cancelled = false;
    supabase.rpc('get_my_meeting_delegations_v1').then(({ data, error }) => {
      if (cancelled || error) return;
      const rows = Array.isArray(data) ? data as Array<{
        meeting_id: string;
        delegate_user_id: string;
        delegate_name: string;
        status: 'pending' | 'accepted' | 'declined';
      }> : [];
      const row = rows.find((item) => item.meeting_id === m.id);
      setMyDelegate(row ? {
        userId: row.delegate_user_id,
        name: row.delegate_name,
        status: row.status,
      } : null);
    });
    return () => { cancelled = true; };
  }, [m.id, currentUserId, m.owner_delegate_user_id, m.owner_delegate_status, liveRevision]);

  useEffect(() => {
    if (!currentUserId || isOwner) {
      setCanDelegateInvitation(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('meeting_inbox')
      .select('id, status')
      .eq('meeting_id', m.id)
      .eq('user_id', currentUserId)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const status = data?.status as 'pending' | 'accepted' | undefined;
        const isOnCalendar =
          (m.participant_user_ids || []).includes(currentUserId) ||
          ((m.notify_users || []) as string[]).includes(currentUserId);
        setCanDelegateInvitation(
          !error && Boolean(data) && (status === 'pending' || (status === 'accepted' && isOnCalendar)),
        );
      });
    return () => { cancelled = true; };
  }, [m.id, currentUserId, isOwner, liveRevision]);

  useEffect(() => {
    if (!isOwner || !m.participant_user_ids?.length) return;
    supabase
      .from('meeting_inbox')
      .select('user_id, status')
      .eq('meeting_id', m.id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, 'pending' | 'accepted' | 'declined' | 'delegated'> = {};
        for (const row of data) map[row.user_id] = row.status;
        setParticipantStatuses(map);
      });
  }, [m.id, isOwner, m.participant_user_ids?.length, liveRevision]);

  // Determine if the current user is a participant (can see join buttons)
  const isParticipant = currentUserId && (
    m.user_id === currentUserId ||
    (m.participant_user_ids || []).includes(currentUserId) ||
    (m.notify_users || []).includes(currentUserId)
  );

const getJalaliDate = (): string => {
  // Priority: request_jalaali_date (already Jalali) → request_date (Gregorian).
  // Uses the shared stage-1 utility — no local moment, no timezone shift.
  const raw = (m as MeetingData & { request_jalaali_date?: string | null }).request_jalaali_date
    ?? m.request_date;
  const normalized = normalizeMeetingDate(raw);
  if (!normalized) return '';
  const [jy, jm, jd] = normalized.split('/').map(Number);
  const monthNames = [
    'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
    'مهر','آبان','آذر','دی','بهمن','اسفند'
  ];
  return `${jd} ${monthNames[jm - 1]} ${jy}`;
};

  const buildShareText = (): string => {
    const participantNames = effectiveParticipantIds
      .map(uid => resolveName(uid))
      .join('، ');
    const notifyNames = ((m.notify_users || []) as string[])
      .map(uid => resolveName(uid))
      .join('، ');
    const externalNames = (m.external_participants || []).join('، ');
    const externalInformees = externalInformeeNames.join('، ');
    const creatorName = resolveName(m.user_id);
    const startNorm = normalizeClockTime(m.start_time) ?? m.start_time;
    const endNorm = normalizeClockTime(m.end_time) ?? m.end_time;
    const timeStr = startNorm && endNorm ? `${startNorm} - ${endNorm}` : '';
    const dateStr = getJalaliDate();

    const lines = [
      `📋 جلسه: ${m.subject}`,
      `👤 ایجادکننده: ${creatorName}`,
      dateStr ? `📅 تاریخ: ${dateStr}` : '',
      timeStr ? `⏰ زمان: ${timeStr}` : '',
      m.location ? `📍 محل: ${m.location}` : '',
      m.representative ? `🧑‍💼 نماینده: ${m.representative}` : '',
      m.phone ? `📞 تماس: ${m.phone}` : '',
      participantNames ? `👥 شرکت‌کنندگان: ${participantNames}` : '',
      notifyNames ? `🔔 مطلعین: ${notifyNames}` : '',
      externalNames ? `🌐 شرکت‌کنندگان خارج سازمان: ${externalNames}` : '',
      externalInformees ? `🔔 مطلعین خارج سازمان: ${externalInformees}` : '',
      m.notes ? `📝 یادداشت: ${m.notes}` : '',
      agendaItems.length > 0
        ? `📌 دستور جلسه:\n` + agendaItems.map((item, idx) => {
            const parts = [`${idx + 1}. ${item.title}`];
            if (item.presenter) parts.push(`ارائه‌دهنده: ${item.presenter}`);
            if (item.duration_minutes) parts.push(`${item.duration_minutes} دقیقه`);
            return parts.join(' | ');
          }).join('\n')
        : '',
    ].filter(Boolean).join('\n');

    return lines;
  };

  const handleShareAsText = async () => {
    setShowShareChoice(false);
    const text = buildShareText();
    const result = await shareMeetingText(m.subject, text);
    if (result === 'copied') toast.success('متن جلسه در کلیپ‌بورد کپی شد');
    else if (result === 'unsupported') setShareTextFallback(text);
  };

  const handleShareAsImage = async () => {
    setShowShareChoice(false);
    if (!shareCardRef.current) {
      toast.error('خطا در ایجاد تصویر');
      return;
    }

    try {
      setShareLoading(true);
      toast.loading('در حال تولید تصویر...');
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      await new Promise<void>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('IMAGE_PRELOAD_FAILED'));
        image.src = dataUrl;
      });

      toast.dismiss();
      setShareImageUrl(dataUrl);
    } catch {
      toast.dismiss();
      toast.error('خطا در ایجاد تصویر');
    } finally {
      setShareLoading(false);
    }
  };

  const handleNativeShareImage = async () => {
    if (!shareImageUrl) return;

    try {
      const commaIndex = shareImageUrl.indexOf(',');
      if (commaIndex < 0) throw new Error('INVALID_DATA_URL');

      const metadata = shareImageUrl.slice(0, commaIndex);
      const payload = shareImageUrl.slice(commaIndex + 1);
      const mimeType = /^data:([^;,]+)/.exec(metadata)?.[1] || 'image/png';
      let blob: Blob;

      if (metadata.includes(';base64')) {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        blob = new Blob([bytes], { type: mimeType });
      } else {
        blob = new Blob([decodeURIComponent(payload)], { type: mimeType });
      }

      const file = new File([blob], `meeting-${m.id.slice(0, 8)}.png`, { type: 'image/png' });
      const result = await shareMeetingImage(m.subject, file);
      if (result === 'shared') toast.success('تصویر جلسه به اشتراک گذاشته شد');
      else if (result === 'unsupported') {
        handleDownloadShareImage();
        toast('اشتراک مستقیم در دسترس نیست؛ تصویر را از فایل‌های دانلودشده ارسال کنید');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('خطا در اشتراک‌گذاری تصویر');
    }
  };

  const handleDownloadShareImage = () => {
    if (!shareImageUrl) return;

    const link = document.createElement('a');
    link.href = shareImageUrl;
    link.download = `meeting-${m.id.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تصویر PNG دانلود شد');
  };

  const handleNativeShare = () => {
    if (shareLoading) return;
    setShowShareChoice(true);
  };

  const handleOpenDelegate = () => {
    window.dispatchEvent(new CustomEvent('spark:open-meeting-delegate', {
      detail: { meetingId: m.id },
    }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300]" onClick={onClose}>
      <div
        className="absolute inset-y-0 left-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slideInLeft"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 text-white flex-shrink-0" style={{ backgroundColor: getMeetingColor(m) }}>
          <h3 className="text-lg font-bold leading-tight flex-1 ml-2">{m.subject}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Creator */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">ایجاد کننده جلسه</p>
              <p className="text-sm font-semibold dark:text-white">
                {resolveName(m.user_id)}
              </p>
            </div>
          </div>

          {/* Date */}
          {m.request_date && getJalaliDate() && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <CalendarDays className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">تاریخ جلسه</p>
                <p className="text-sm font-semibold dark:text-white">{getJalaliDate()}</p>
              </div>
            </div>
          )}

          {/* Time */}
          {(m.start_time || m.end_time) && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">زمان جلسه</p>
                <p className="text-sm font-semibold dark:text-white">{normalizeClockTime(m.start_time) ?? m.start_time} — {normalizeClockTime(m.end_time) ?? m.end_time}</p>
              </div>
            </div>
          )}

          {/* Calendar */}
          {cal && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">تقویم</p>
                <p className="text-sm font-semibold dark:text-white">{cal.name}</p>
              </div>
            </div>
          )}

          {/* Location */}
          {m.location && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">محل برگزاری</p>
                <p className="text-sm font-semibold dark:text-white">{m.location}</p>
              </div>
            </div>
          )}

          {/* Representative */}
          {m.representative && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-0.5">نماینده</p>
                <p className="text-sm font-semibold dark:text-white">{m.representative}</p>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="text-xs text-blue-500 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" />{m.phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Participants */}
          {effectiveParticipantIds.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-400 font-medium">شرکت‌کنندگان ({effectiveParticipantIds.length})</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {effectiveParticipantIds.map(uid => {
                  const status = participantStatuses[uid];
                  const statusBadge = isOwner && status ? (() => {
                    if (status === 'accepted') return (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" />قبول
                      </span>
                    );
                    if (status === 'declined') return (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <XCircle className="w-2.5 h-2.5" />رد
                      </span>
                    );
                    if (status === 'delegated') return (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <UserCheck className="w-2.5 h-2.5" />جانشین
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        <HelpCircle className="w-2.5 h-2.5" />در انتظار
                      </span>
                    );
                  })() : null;
                  return (
                    <div key={uid} className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs font-medium flex-1 min-w-0">
                        <User className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{resolveName(uid)}</span>
                      </span>
                      {statusBadge}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* External participants */}
          {m.external_participants && m.external_participants.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-400 font-medium">شرکت‌کنندگان خارج سازمان</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {m.external_participants.map(name => (
                  <span key={name} className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2.5 py-1 rounded-full text-xs font-medium">{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* External informees */}
          {(externalInformeeNames.length > 0 || (canEdit && currentUserId)) && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">مطلعین خارج سازمان</p>
                </div>
                {currentUserId && (
                  <ExternalInformeesManager
                    meetingId={m.id}
                    currentUserId={currentUserId}
                    meetingSubject={m.subject}
                    meetingDate={(m as MeetingData & { request_jalaali_date?: string | null }).request_jalaali_date ?? m.request_date}
                    startTime={m.start_time}
                    endTime={m.end_time}
                    location={m.location}
                    names={externalInformeeNames}
                    canManage={canEdit}
                    onChanged={setExternalInformeeNames}
                  />
                )}
              </div>
              {externalInformeeNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {externalInformeeNames.map(name => (
                    <span key={name} className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full text-xs font-medium">{name}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-600/70 dark:text-amber-300/70">مطلع خارج سازمانی ثبت نشده است.</p>
              )}
            </div>
          )}

          {/* Notify */}
          {m.notify_users && m.notify_users.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-400 font-medium">مطلعین</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {m.notify_users.map(uid => {
                  return (
                    <span key={uid} className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full text-xs font-medium">
                      {resolveName(uid)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reminder */}
          {m.reminder_minutes && m.reminder_minutes > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <Bell className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-0.5">یادآوری</p>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {m.reminder_minutes >= 60 ? `${m.reminder_minutes / 60} ساعت` : `${m.reminder_minutes} دقیقه`} قبل از جلسه
                </p>
              </div>
            </div>
          )}

          {/* Repeat */}
          {m.repeat_type && m.repeat_type !== 'none' && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <RefreshCw className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-blue-500 mb-0.5">تکرار</p>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {m.repeat_type === 'weekly' ? 'هفتگی' : 'ماهیانه'}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {m.notes && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 mb-1.5">یادداشت</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{m.notes}</p>
            </div>
          )}

          {/* Agenda */}
          {agendaItems.length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-2.5">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-400 font-medium">دستور جلسه ({agendaItems.length} آیتم)</p>
              </div>
              <div className="space-y-2">
                {agendaItems.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-2.5 p-2.5 bg-white dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="break-words text-sm font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                       {item.source_decision_id && <button type="button" onClick={() => setLinkedDetailId(item.source_decision_id!)} className="mt-1 text-xs text-blue-600 hover:underline">مصوبه اصلی و تاریخچه پیگیری</button>}
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {item.presenter && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <UserCheck className="w-3 h-3" />{item.presenter}
                          </span>
                        )}
                        {item.duration_minutes && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Clock className="w-3 h-3" />{item.duration_minutes} دقیقه
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Online meeting section */}
          {m.is_online && isParticipant && (
            <div className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-200 dark:border-sky-700 space-y-3">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">جلسه آنلاین</p>
                  <p className="text-xs">ورود به ویدیوکنفرانس فعلاً غیرفعال است.</p>
                </div>
              </div>

            </div>
          )}
        </div>

        {myDelegate && (
          <div className={`mx-4 mb-3 rounded-xl border p-3 ${
            myDelegate.status === 'accepted'
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20'
              : myDelegate.status === 'pending'
                ? 'border-amber-200 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20'
                : 'border-rose-200 bg-rose-50 dark:border-rose-700/50 dark:bg-rose-900/20'
          }`}>
            <div className="flex items-start gap-2">
              <UserCheck className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                myDelegate.status === 'accepted' ? 'text-emerald-600' : myDelegate.status === 'pending' ? 'text-amber-600' : 'text-rose-600'
              }`} />
              <div>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                  {myDelegate.status === 'accepted'
                    ? `جانشین جلسه: ${myDelegate.name}`
                    : myDelegate.status === 'pending'
                      ? `در انتظار پاسخ جانشین: ${myDelegate.name}`
                      : `درخواست جانشینی توسط ${myDelegate.name} رد شد`}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                  {myDelegate.status === 'accepted'
                    ? 'این شخص حضور به‌عنوان جانشین شما را تأیید کرده است.'
                    : myDelegate.status === 'pending'
                      ? 'تا زمان تأیید، این جلسه در تقویم جانشین قرار نمی‌گیرد.'
                      : 'می‌توانید جانشین دیگری برای این جلسه انتخاب کنید.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 grid grid-cols-2 gap-2 flex-shrink-0">
          {canEdit && (
            <button onClick={() => onEdit(m)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <Edit2 className="w-4 h-4" />ویرایش
            </button>
          )}
          {isOwner && ((m.external_participants?.length ?? 0) > 0 || externalInformeeNames.length > 0) && (
            <button type="button" disabled={retryingTimingSms} onClick={() => void retryTimingSms()}
              className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium disabled:opacity-50">
              {retryingTimingSms ? 'در حال بررسی و ارسال…' : 'ارسال مجدد پیامک ناموفق تغییر زمان'}
            </button>
          )}
          {onCreateSimilar && (
            <button onClick={() => onCreateSimilar(m, agendaItems)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-sm font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
              <Copy className="w-4 h-4" />ایجاد جلسه مشابه
            </button>
          )}
          <button onClick={handleNativeShare} disabled={shareLoading} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-60 disabled:cursor-wait">
            <Share2 className="w-4 h-4" />اشتراک‌گذاری
          </button>
          <button onClick={() => onGoogleCalendar(m)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-sm font-medium hover:bg-orange-100 transition-colors">
            <ExternalLink className="w-4 h-4" />گوگل کلندر
          </button>
          {canAddParticipants && currentUserId && (
            <button
              onClick={() => setShowInformeeParticipantModal(true)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              title="افزودن شرکت‌کننده به همین جلسه"
            >
              <UserPlus className="w-4 h-4" />افزودن شرکت‌کننده
            </button>
          )}
          {isOwner && currentUserId && (!myDelegate || myDelegate.status === 'declined') && (
            <button onClick={() => setShowOwnerDelegate(true)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
              <UserCheck className="w-4 h-4" />{myDelegate?.status === 'declined' ? 'انتخاب جانشین جدید' : 'انتخاب جانشین'}
            </button>
          )}
          {isOwner && myDelegate?.status === 'pending' && (
            <button disabled className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 text-amber-600 text-sm font-medium cursor-not-allowed opacity-80 dark:bg-amber-900/20 dark:text-amber-300">
              <Clock className="w-4 h-4" />در انتظار پاسخ جانشین
            </button>
          )}
          {isOwner && myDelegate?.status === 'accepted' && (
            <button disabled className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-medium cursor-default dark:bg-emerald-900/20 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />جانشین تأییدشده
            </button>
          )}
          {!isOwner && canDelegateInvitation && (
            <button onClick={handleOpenDelegate} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
              <UserCheck className="w-4 h-4" />انتخاب جانشین
            </button>
          )}
          {onRegisterMinutes && isMeetingEligibleForMinutes({ id: m.id, calendar_id: m.calendar_id, status_type: m.status_type }) && minutesAccess.loading && (
            <button disabled className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium cursor-not-allowed">
              <Loader2 className="w-4 h-4 animate-spin" />
              در حال بررسی صورت‌جلسه...
            </button>
          )}
          {onRegisterMinutes && isMeetingEligibleForMinutes({ id: m.id, calendar_id: m.calendar_id, status_type: m.status_type }) && minutesAccess.error && (
            <button onClick={() => {
              setMinutesAccess({ loading: true, allowed: false, existingMinuteId: null, error: false });
              (async () => {
                try {
                  const { checkMinutesAccessForMeeting } = await import('../../lib/minutesMeetingAccess');
                  const result = await checkMinutesAccessForMeeting(supabase, m.id);
                  const hasCheckError = result.errorCode === 'CHECK_FAILED';
                  setMinutesAccess({ loading: false, allowed: result.allowed, existingMinuteId: result.existingMinuteId ?? null, error: hasCheckError });
                } catch {
                  setMinutesAccess({ loading: false, allowed: false, existingMinuteId: null, error: true });
                }
              })();
            }} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-100 transition-colors">
              <AlertCircle className="w-4 h-4" />
              بررسی دسترسی ناموفق بود — تلاش مجدد
            </button>
          )}
          {onRegisterMinutes && isMeetingEligibleForMinutes({ id: m.id, calendar_id: m.calendar_id, status_type: m.status_type }) && !minutesAccess.loading && !minutesAccess.error && (minutesAccess.allowed || Boolean(minutesAccess.existingMinuteId)) && (
            <button onClick={handleRegisterMinutes} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-100 transition-colors">
              <ClipboardList className="w-4 h-4" />
              {minutesAccess.existingMinuteId ? 'مشاهده صورت‌جلسه' : 'ثبت صورت‌جلسه'}
            </button>
          )}
          <button onClick={() => onDelete(m.id)} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 transition-colors">
            <Trash2 className="w-4 h-4" />
            {isOwner ? 'حذف برای همه' : 'حذف از تقویم من'}
          </button>
          {isOwner && m.repeat_type && m.repeat_type !== 'none' && (
            <button onClick={() => onDelete(m.id, true)} className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-100 transition-colors border border-red-200 dark:border-red-800">
              <Trash2 className="w-4 h-4" />حذف تمام جلسات تکراری
            </button>
          )}
        </div>
      </div>

      {shareImageUrl && (
        <MeetingShareDialog
          zIndex={400}
          imageUrl={shareImageUrl}
          onClose={() => setShareImageUrl(null)}
          onShare={handleNativeShareImage}
          onDownload={handleDownloadShareImage}
        />
      )}

      {showInformeeParticipantModal && canAddParticipants && currentUserId && (
        <InformeeAddParticipantModal
          meetingId={m.id}
          currentUserId={currentUserId}
          organizerId={m.user_id}
          existingParticipantIds={effectiveParticipantIds}
          onClose={() => setShowInformeeParticipantModal(false)}
          onSuccess={(participantUserId) => {
            setInformeeAddedParticipantIds(prev => prev.includes(participantUserId) ? prev : [...prev, participantUserId]);
            setShowInformeeParticipantModal(false);
          }}
        />
      )}

      {showOwnerDelegate && currentUserId && (
        <MeetingOwnerDelegateModal
          meetingId={m.id}
          meetingSubject={m.subject}
          currentUserId={currentUserId}
          participantUserIds={effectiveParticipantIds}
          notifyUserIds={(m.notify_users || []) as string[]}
          onClose={() => setShowOwnerDelegate(false)}
          onSuccess={(delegateUserId, delegateName) => {
            setMyDelegate({ userId: delegateUserId, name: delegateName, status: 'pending' });
            setShowOwnerDelegate(false);
          }}
        />
      )}

      {shareTextFallback !== null && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" onClick={e => { e.stopPropagation(); setShareTextFallback(null); }} dir="rtl" role="dialog" aria-modal="true" aria-label="متن جلسه">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-2xl bg-white p-4 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-gray-800 dark:text-white">متن جلسه</h4>
              <button type="button" aria-label="بستن متن جلسه" onClick={() => setShareTextFallback(null)} className="p-2"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-gray-500">اشتراک مستقیم یا کپی خودکار در دسترس نیست؛ متن را انتخاب و کپی کنید.</p>
            <textarea readOnly value={shareTextFallback} onFocus={e => e.currentTarget.select()} className="min-h-0 h-64 w-full resize-none rounded-xl border p-3 text-sm dark:bg-gray-900 dark:text-white" aria-label="متن قابل کپی جلسه" />
          </div>
        </div>
      )}

      {/* Share choice modal */}
      {showShareChoice && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={() => setShowShareChoice(false)} dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl w-full max-w-md p-5 pb-8 space-y-3 animate-slideInLeft" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-gray-800 dark:text-white">اشتراک‌گذاری جلسه</h4>
              <button onClick={() => setShowShareChoice(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">نوع اشتراک‌گذاری را انتخاب کنید:</p>
            <button onClick={handleShareAsText}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-right">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-white text-sm">اشتراک متن</p>
                <p className="text-xs text-gray-400 mt-0.5">ارسال از طریق برنامه‌های گوشی یا کپی متن</p>
              </div>
            </button>
            <button onClick={handleShareAsImage}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-right">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Image className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-white text-sm">اشتراک تصویر</p>
                <p className="text-xs text-gray-400 mt-0.5">پیش‌نمایش، اشتراک یا دانلود PNG</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Hidden card used for image generation — same visual language as meeting requests */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: -1 }}>
        <div
          ref={shareCardRef}
          style={{
            width: 380,
            backgroundColor: '#ffffff',
            fontFamily: 'Vazirmatn, system-ui, sans-serif',
            direction: 'rtl',
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            boxShadow: '0 14px 40px rgba(15,23,42,0.12)',
          }}
        >
          <div style={{ height: 5, background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 25%, #06b6d4 50%, #10b981 75%, #f59e0b 100%)' }} />

          <div style={{ padding: '18px 20px 14px', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 55%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 18px rgba(99,102,241,0.18)' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#0f172a', fontWeight: 800, fontSize: 16, margin: 0, lineHeight: 1.55, wordBreak: 'break-word' }}>
                  {m.subject}
                </p>
                <p style={{ color: '#64748b', fontSize: 10.5, margin: '4px 0 0' }}>Spark Meeting Manager</p>
              </div>

              <span style={{ color: '#047857', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '4px 8px', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                جلسه تقویم
              </span>
            </div>
          </div>

          <div style={{ margin: '0 16px', height: 1, backgroundColor: '#e2e8f0' }} />

          <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 11, backgroundColor: '#f8fafc' }}>
            {(() => {
              const creatorName = isOwner ? 'شما' : resolveName(m.user_id);
              const participantNames = effectiveParticipantIds.map(uid => resolveName(uid)).join('، ');
              const notifyNames = ((m.notify_users || []) as string[]).map(uid => resolveName(uid)).join('، ');
              const externalNames = (m.external_participants || []).join('، ');
              const externalInformees = externalInformeeNames.join('، ');
              const start = normalizeClockTime(m.start_time) ?? m.start_time;
              const finish = normalizeClockTime(m.end_time) ?? m.end_time;
              const rows = [
                { label: 'ایجادکننده', value: creatorName },
                { label: 'تاریخ', value: getJalaliDate() },
                { label: 'زمان', value: start && finish ? `${start} — ${finish}` : '' },
                { label: 'محل برگزاری', value: m.location },
                { label: 'نماینده', value: m.representative },
                { label: 'تلفن تماس', value: m.phone },
                { label: 'شرکت‌کنندگان', value: participantNames },
                { label: 'مطلعین', value: notifyNames },
                { label: 'شرکت‌کنندگان خارج سازمان', value: externalNames },
                { label: 'مطلعین خارج سازمان', value: externalInformees },
                { label: 'یادداشت', value: m.notes },
                {
                  label: 'دستور جلسه',
                  value: agendaItems.length > 0
                    ? agendaItems.map((item, idx) => {
                        const parts = [`${idx + 1}. ${item.title}`];
                        if (item.presenter) parts.push(`ارائه‌دهنده: ${item.presenter}`);
                        if (item.duration_minutes) parts.push(`${item.duration_minutes} دقیقه`);
                        return parts.join(' | ');
                      }).join('\n')
                    : '',
                },
              ].filter(row => row.value);

              const accentColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
              return rows.map((row, index) => (
                <div key={row.label} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: accentColors[index % accentColors.length], marginTop: 7, flexShrink: 0 }} />
                  <span style={{ color: '#64748b', fontSize: 11.5, minWidth: 88, flexShrink: 0 }}>{row.label}:</span>
                  <span style={{ color: '#0f172a', fontSize: 11.5, fontWeight: 500, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{row.value}</span>
                </div>
              ));
            })()}
          </div>

          <div style={{ padding: '11px 20px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#8b5cf6' }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#06b6d4' }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#10b981' }} />
            <p style={{ color: '#475569', fontSize: 10.5, margin: '0 3px 0 0' }}>سیستم مدیریت جلسات اسپارک</p>
          </div>
        </div>
      </div>

      {linkedDetailId && <LinkedDecisionDialog decisionId={linkedDetailId} onClose={() => setLinkedDetailId(null)} />}
      {showMinutesConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={handleCancelMinutes}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full p-6"
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">ثبت صورت‌جلسه</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">آیا مایل به ثبت صورت‌جلسه این جلسه هستید؟</p>
            <div className="flex gap-2 justify-end">
              <button onClick={handleCancelMinutes} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">خیر</button>
              <button
                onClick={handleConfirmMinutes}
                disabled={minutesNavigationRef.current}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >بله</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
