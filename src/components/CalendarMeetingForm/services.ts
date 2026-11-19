import { readSmsFunctionError } from '../../features/meetings/services/readSmsFunctionError';
import moment from 'moment-jalaali';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { fillPlaceholders, getSmsTemplates } from '../../lib/notifications';
import type { SmsDispatchResult } from '../../lib/notifications';
import type { ContactEmail } from '../../types';
import { VIDEO_CONFERENCE_DISABLED_REASON, VIDEO_CONFERENCE_ENABLED } from '../../config/featureFlags';

export interface ExternalSmsResult {
  ok: boolean;
  sent: number;
  skipped: number;
  error?: string;
}

export const MEETING_VIDEO_CONFERENCE_ENABLED = VIDEO_CONFERENCE_ENABLED;
export const MEETING_VIDEO_CONFERENCE_DISABLED_REASON = VIDEO_CONFERENCE_DISABLED_REASON;

export async function sendSmsToExternals(
  externalNames: string[],
  allContacts: ContactEmail[],
  message: string,
  triggeredByUserId?: string | null,
  placeholders?: Record<string, string>,
  eventType: 'invite' | 'change' | 'cancel' | 'informee_invite' | 'informee_change' | 'informee_cancel' = 'invite',
  meetingId?: string | null,
  eventKey?: string | null,
): Promise<ExternalSmsResult> {
  if (!externalNames.length) return { ok: true, sent: 0, skipped: 0 };

  const resolved = externalNames
    .map(name => ({ name, contact: allContacts.find(contact => contact.name === name) }))
    .filter((item): item is { name: string; contact: ContactEmail } => !!item.contact && !!((item.contact as any).phone))
    .filter(item => ((item.contact as any).phone as string).trim().length >= 7);

  const mobiles = resolved.map(item => (item.contact as any).phone as string);
  const skippedNoPhone = externalNames.length - resolved.length;
  if (!mobiles.length) {
    return { ok: false, sent: 0, skipped: skippedNoPhone, error: 'شماره موبایل برای افراد خارج سازمان یافت نشد' };
  }

  let smsMessage = message;
  if (placeholders) {
    const smsTemplates = await getSmsTemplates();
    const templateBody =
      smsTemplates.get(`meeting:${eventType}:external`) ||
      smsTemplates.get(`meeting:${eventType}:all`) ||
      (eventType === 'change'
        ? smsTemplates.get('meeting:invite:external') || smsTemplates.get('meeting:invite:all')
        : undefined);
    if (templateBody) smsMessage = fillPlaceholders(templateBody, placeholders);
  }

  try {
    const { data: result, error: functionError } = await supabase.functions.invoke('send-sms', {
      body: {
        mode: 'external',
        mobiles,
        message: smsMessage,
        context: placeholders ?? {},
        meetingId: meetingId ?? null,
        eventKey: eventKey ?? null,
        triggeredByUserId: triggeredByUserId ?? null,
        category: 'meeting',
        eventType,
      },
    });
    if (functionError) throw new Error(await readSmsFunctionError(functionError));
    return {
      ok: result?.ok === true,
      sent: result?.sent ?? 0,
      skipped: (result?.skipped ?? 0) + skippedNoPhone,
      error: result?.ok ? undefined : (result?.error ?? result?.errorCode ?? 'خطای ناشناخته'),
    };
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    return { ok: false, sent: 0, skipped: skippedNoPhone, error: messageText };
  }
}

export function showSmsSummary(
  internalResults: SmsDispatchResult[],
  externalResult: ExternalSmsResult | null,
) {
  const sent = internalResults.filter(result => result.status === 'sent').length + (externalResult?.sent ?? 0);
  const skipped = internalResults.filter(result => result.status === 'skipped').length + (externalResult?.skipped ?? 0);
  const failed = internalResults.filter(result => result.status === 'failed').length
    + (externalResult && !externalResult.ok && externalResult.sent === 0 ? 1 : 0);
  if (sent === 0 && skipped === 0 && failed === 0) return;

  const parts: string[] = [];
  if (sent > 0) parts.push(`پیامک ${sent} نفر ارسال شد`);
  if (skipped > 0) parts.push(`${skipped} نفر پیامک ندارند یا قانونی برایشان تعریف نشده`);
  if (failed > 0) parts.push(`ارسال برای ${failed} نفر ناموفق بود`);

  if (failed > 0) toast.error('جلسه ثبت شد. ' + parts.join(' — ')
    + (externalResult?.error ? ` — ${externalResult.error}` : ''), { duration: 6000 });
  else toast.success('جلسه ثبت شد. ' + parts.join(' — '), { duration: 5000 });
}

interface RepeatOptions {
  baseRecord: any;
  type: string;
  interval: number;
  endDate: string;
  repeatWeekday: number;
  repeatMonthlyMode: 'specific' | 'nth';
  repeatMonthlyNth: number;
  repeatMonthlyNthWeekday: number;
}

export function buildCalendarRepeatRecords({
  baseRecord,
  type,
  interval,
  endDate,
  repeatWeekday,
  repeatMonthlyMode,
  repeatMonthlyNth,
  repeatMonthlyNthWeekday,
}: RepeatOptions): any[] {
  if (!Number.isInteger(interval) || interval < 1) throw new Error('فاصله تکرار نامعتبر است');
  if (!endDate) return [];
  let endMs: number;
  if (endDate.includes('/') && endDate.split('/').length === 3) {
    const [year, month, day] = endDate.split('/').map(Number);
    const gregorianDate = moment(`${year}/${month}/${day}`, 'jYYYY/jM/jD').toDate();
    gregorianDate.setHours(23, 59, 59, 999);
    endMs = gregorianDate.getTime();
  } else {
    endMs = new Date(endDate).getTime();
  }
  if (Number.isNaN(endMs)) return [];

  const baseDate = new Date(baseRecord.request_date);
  const repeatMeetings: any[] = [];
  const javascriptDayMap = [6, 0, 1, 2, 3, 4, 5];

  if (type === 'weekly') {
    // The selected date's Saturday-based week anchors the entire series.
    // The base occurrence is already saved separately; do not repeat it here.
    const baseWeekday = (baseDate.getDay() + 1) % 7;
    let current = new Date(baseDate);
    current.setDate(current.getDate() + repeatWeekday - baseWeekday);
    if (current.getTime() <= baseDate.getTime()) {
      current.setDate(current.getDate() + 7 * interval);
    }
    while (current.getTime() <= endMs) {
      const jalaliDate = moment(current).format('jYYYY/jMM/jDD');
      const { id: _id, ...recordWithoutId } = baseRecord;
      void _id;
      repeatMeetings.push({ ...recordWithoutId, request_date: current.toISOString(), request_jalaali_date: jalaliDate });
      if (repeatMeetings.length > 599) throw new Error('حداکثر ۶۰۰ نوبت در هر سری قابل ثبت است');
      current.setDate(current.getDate() + 7 * interval);
    }
  } else {
    const baseJalali = moment(baseDate).format('jYYYY/jMM/jDD').split('/').map(Number);
    const [baseYear, baseMonth, baseDay] = baseJalali;

    const getNthWeekdayOfMonth = (year: number, month: number, nth: number, targetDay: number): Date => {
      const firstDay = moment(`${year}/${month}/1`, 'jYYYY/jM/jD').toDate();
      const lastDayNumber = month <= 6 ? 31 : month <= 11 ? 30 : 29;
      const lastDay = moment(`${year}/${month}/${lastDayNumber}`, 'jYYYY/jM/jD').toDate();
      if (nth === -1) {
        const date = new Date(lastDay);
        while (date.getDay() !== targetDay) date.setDate(date.getDate() - 1);
        return date;
      }
      const date = new Date(firstDay);
      let count = 0;
      while (count < nth) {
        if (date.getDay() === targetDay) count++;
        if (count < nth) date.setDate(date.getDate() + 1);
      }
      return date;
    };

    for (let offset = 0; ; offset += interval) {
      let year = baseYear;
      let month = baseMonth + offset;
      while (month > 12) {
        year++;
        month -= 12;
      }

      let date: Date;
      if (repeatMonthlyMode === 'nth') {
        const targetDay = javascriptDayMap[repeatMonthlyNthWeekday];
        date = getNthWeekdayOfMonth(year, month, repeatMonthlyNth, targetDay);
      } else {
        const dayInMonth = Math.min(baseDay, month <= 6 ? 31 : month <= 11 ? 30 : 29);
        date = moment(`${year}/${month}/${dayInMonth}`, 'jYYYY/jM/jD').toDate();
      }

      if (date.getTime() > endMs) break;
      if (date.getTime() > baseDate.getTime()) {
        const jalaliDate = moment(date).format('jYYYY/jMM/jDD');
        const { id: _id, ...recordWithoutId } = baseRecord;
        void _id;
        repeatMeetings.push({ ...recordWithoutId, request_date: date.toISOString(), request_jalaali_date: jalaliDate });
        if (repeatMeetings.length > 599) throw new Error('حداکثر ۶۰۰ نوبت در هر سری قابل ثبت است');
      }
    }
  }

  return repeatMeetings;
}
