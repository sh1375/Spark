import type { Note } from './types';

export function BrandedShareCard({ shareNote, brandedCardRef }: { shareNote: Note | null; brandedCardRef: React.RefObject<HTMLDivElement> }) {
  if (!shareNote) return null;
  return (
    <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: -1 }}>
      <div
        ref={brandedCardRef}
        style={{
          width: '380px',
          backgroundColor: '#ffffff',
          fontFamily: 'var(--spark-font-ui)',
          direction: 'rtl',
          borderRadius: '20px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          boxShadow: '0 14px 40px rgba(15,23,42,0.12)',
        }}
      >
        <div style={{ height: 5, background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 25%, #06b6d4 50%, #10b981 75%, #f59e0b 100%)' }} />
        <div style={{ padding: '18px 20px 15px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 55%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#0f172a', fontWeight: 800, fontSize: 16, margin: 0, lineHeight: 1.55, wordBreak: 'break-word' }}>{shareNote.title}</p>
              <p style={{ color: '#64748b', fontSize: 10.5, margin: '4px 0 0' }}>{new Date(shareNote.created_at).toLocaleDateString('fa-IR')} · Spark Notes</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 20px 20px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          {shareNote.content && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#8b5cf6', marginTop: 8, flexShrink: 0 }} />
              <span style={{ color: '#0f172a', fontSize: 12, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.9' }}>{shareNote.content}</span>
            </div>
          )}
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
