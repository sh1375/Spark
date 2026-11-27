import { formatMeetingRequestDate } from '../../formatMeetingRequestDate';
import { forwardRef } from 'react';
import { Meeting } from '../../../../types';
import type { AgendaItem } from '../../../../types';

interface MeetingShareCardProps {
  meeting: Meeting;
  agendaItems: AgendaItem[];
}

export const MeetingShareCard = forwardRef<HTMLDivElement, MeetingShareCardProps>(
  ({ meeting, agendaItems }, ref) => {
    const statusMeta = meeting.status_type === 'approved'
      ? { label: 'تأییدشده', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' }
      : meeting.status_type === 'rejected'
        ? { label: 'ردشده', color: '#be123c', bg: '#fff1f2', border: '#fecdd3' }
        : { label: 'درخواست‌شده', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };

    const rows = [
      { label: 'تاریخ', value: formatMeetingRequestDate(meeting.requestDate, meeting.request_jalaali_date) },
      { label: 'زمان', value: meeting.start_time && meeting.end_time ? `${meeting.start_time} — ${meeting.end_time}` : meeting.duration },
      { label: 'محل برگزاری', value: meeting.location },
      { label: 'نماینده', value: meeting.representative },
      { label: 'تلفن تماس', value: meeting.phone },
      { label: 'شرکت‌کنندگان', value: meeting.participants?.length ? meeting.participants.join('، ') : '' },
      { label: 'یادداشت', value: meeting.notes },
      { label: 'دستور جلسه', value: agendaItems.length > 0
          ? agendaItems.map((item, idx) => {
              const parts = [`${idx + 1}. ${item.title}`];
              if (item.presenter) parts.push(`ارائه‌دهنده: ${item.presenter}`);
              if (item.duration_minutes) parts.push(`${item.duration_minutes} دقیقه`);
              return parts.join(' | ');
            }).join('\n')
          : '' },
    ].filter(row => row.value);

    return (
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: -1 }}>
        <div ref={ref} style={{ width: 380, backgroundColor: '#ffffff', fontFamily: 'var(--spark-font-ui)', direction: 'rtl', borderRadius: 20, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 14px 40px rgba(15,23,42,0.12)' }}>
          <div style={{ height: 5, background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 25%, #06b6d4 50%, #10b981 75%, #f59e0b 100%)' }} />

          <div style={{ padding: '18px 20px 14px', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 55%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 18px rgba(99,102,241,0.18)' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#0f172a', fontWeight: 800, fontSize: 16, margin: 0, lineHeight: 1.55, wordBreak: 'break-word' }}>{meeting.subject}</p>
                <p style={{ color: '#64748b', fontSize: 10.5, margin: '4px 0 0' }}>Spark Meeting Manager</p>
              </div>
              <span style={{ color: statusMeta.color, backgroundColor: statusMeta.bg, border: `1px solid ${statusMeta.border}`, borderRadius: 999, padding: '4px 8px', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{statusMeta.label}</span>
            </div>
          </div>

          <div style={{ margin: '0 16px', height: 1, backgroundColor: '#e2e8f0' }} />

          <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 11, backgroundColor: '#f8fafc' }}>
            {rows.map((row, index) => {
              const accentColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
              const accent = accentColors[index % accentColors.length];
              return (
                <div key={row.label} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: accent, marginTop: 7, flexShrink: 0 }} />
                  <span style={{ color: '#64748b', fontSize: 11.5, minWidth: 88, flexShrink: 0 }}>{row.label}:</span>
                  <span style={{ color: '#0f172a', fontSize: 11.5, fontWeight: 500, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{row.value}</span>
                </div>
              );
            })}
          </div>

          <div style={{ padding: '11px 20px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#8b5cf6' }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#06b6d4' }} />
            <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#10b981' }} />
            <p style={{ color: '#475569', fontSize: 10.5, margin: '0 3px 0 0' }}>سیستم مدیریت جلسات اسپارک</p>
          </div>
        </div>
      </div>
    );
  }
);

MeetingShareCard.displayName = 'MeetingShareCard';
