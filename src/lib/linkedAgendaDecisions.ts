import { DECISION_STATUS_LABELS } from '../components/Minutes/decisionHelpers';
import type { DecisionStatus } from '../components/Minutes/types';
import type { AgendaItem } from '../types';
import { formatJalaliDateForDisplay, gregorianToJalaliDate } from './minutesDate';

export interface LinkedAgendaItem extends AgendaItem {
  source_decision_id?: string | null;
}

export interface PickerDecision {
  id: string;
  minute_id: string;
  parent_decision_id: string | null;
  clause_order: number | null;
  title: string;
  description: string | null;
  minute_title: string;
  meeting_date: string;
  minute_number: string | null;
  decision_number: string | null;
  status: DecisionStatus;
  due_date?: string | null;
  days_overdue?: number;
  progress_percent: number;
  owner_name: string;
  primary_owner_user_id: string | null;
  responsible_unit_name_snapshot: string | null;
}

export function linkedDecisionAgendaTitle(decision: PickerDecision): string {
  const clause = decision.parent_decision_id && decision.clause_order
    ? `بند ${decision.clause_order} / ` : '';
  const decisionLabel = decision.decision_number
    ? `مصوبه شماره ${decision.decision_number}` : 'مصوبه';
  const minuteLabel = decision.minute_number
    ? `صورت‌جلسه شماره ${decision.minute_number}`
    : `صورت‌جلسه «${decision.minute_title}» مورخ ${gregorianToJalaliDate(decision.meeting_date) || decision.meeting_date}`;
  return `بررسی و پیگیری ${clause}${decisionLabel} از ${minuteLabel} با موضوع ${decision.title}`;
}

export function linkedDecisionAgendaDescription(decision: PickerDecision): string | null {
  if (!decision.due_date || typeof decision.days_overdue !== 'number') return null;
  return [
    `تاریخ صورت‌جلسه: ${formatJalaliDateForDisplay(decision.meeting_date)}`,
    `مسئول اجرا: ${decision.owner_name || '—'}`,
    `مهلت انجام: ${formatJalaliDateForDisplay(decision.due_date)}`,
    `وضعیت هنگام افزودن: ${DECISION_STATUS_LABELS[decision.status] || decision.status}`,
    `${decision.days_overdue.toLocaleString('fa-IR')} روز تأخیر هنگام افزودن`,
  ].join(' · ');
}

export function linkedAgendaSourceId(item: { source_decision_id?: string | null }): string | null {
  return item.source_decision_id || null;
}

export function agendaItemsForSave(items: Array<{
  id?: string; title: string; presenter?: string | null;
  duration_minutes?: number | null; description?: string | null;
  source_decision_id?: string | null;
}>) {
  return items.map(item => ({
    id: item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
      ? item.id : crypto.randomUUID(),
    title: item.title,
    presenter: item.presenter ?? null,
    duration_minutes: item.duration_minutes ?? null,
    description: item.description ?? null,
    source_decision_id: item.source_decision_id ?? null,
  }));
}
