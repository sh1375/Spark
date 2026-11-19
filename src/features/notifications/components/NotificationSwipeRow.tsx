import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { CheckCheck, Trash2 } from 'lucide-react';
import { notificationRowAction, notificationRowGesture } from '../models/notificationRowGesture';

interface Props {
  read: boolean;
  title: string;
  onOpen: () => void;
  onRead: () => Promise<void>;
  onDelete: () => Promise<void>;
  children: ReactNode;
}

export function NotificationSwipeRow({ read, title, onOpen, onRead, onDelete, children }: Props) {
  const [dragX, setDragX] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const suppressClick = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; axis: string } | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); } finally { busyRef.current = false; setBusy(false); }
  };
  const reset = () => { gesture.current = null; setDragX(0); };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) { suppressClick.current = true; reset(); return; }
    if (busyRef.current || event.button !== 0 || (event.target as HTMLElement).closest('button,a,input,textarea')) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: 'pending' };
    // Touch implicitly captures the child under the finger. Own capture from
    // pointerdown so transferring it later cannot cancel the row's gesture.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (g.axis === 'pending') g.axis = notificationRowGesture(dx, dy);
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10) suppressClick.current = true;
    if (g.axis === 'horizontal') {
      event.preventDefault();
      try {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      } catch { /* Some mobile WebViews can release capture during scrolling. */ }
      setDragX(Math.max(-110, Math.min(110, dx)));
    }
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    const axis = g.axis === 'pending' ? notificationRowGesture(dx, dy) : g.axis;
    if (axis !== 'pending' || Math.max(Math.abs(dx), Math.abs(dy)) >= 10) suppressClick.current = true;
    reset();
    if (axis === 'horizontal') {
      const action = notificationRowAction(dx, read);
      if (action) void run(action === 'delete' ? onDelete : onRead);
    }
  };
  return (
    <div className="relative overflow-hidden border-b border-gray-100 dark:border-gray-700/40">
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-between bg-gray-100 dark:bg-gray-900" dir="ltr">
        <span className="flex h-full items-center gap-2 bg-emerald-600 px-4 text-xs text-white"><CheckCheck className="h-5 w-5" />خوانده شد</span>
        <span className="flex h-full items-center gap-2 bg-red-600 px-4 text-xs text-white">حذف<Trash2 className="h-5 w-5" /></span>
      </div>
      <div role="button" tabIndex={busy ? -1 : 0} aria-label={`باز کردن اعلان: ${title}`} aria-busy={busy}
        className="relative bg-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:bg-gray-800"
        style={{ transform: `translateX(${dragX}px)`, touchAction: 'pan-y pinch-zoom', transition: dragX ? 'none' : 'transform 160ms ease-out' }}
        onPointerDown={start} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={() => { suppressClick.current = true; reset(); }}
        onLostPointerCapture={event => {
          // Capture loss from an inner title/icon bubbles to the row; it is
          // not a cancellation of the row's own active pointer.
          if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) {
            suppressClick.current = true; reset();
          }
        }}
        onClick={() => { if (!busyRef.current && !suppressClick.current) onOpen(); }}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (!busyRef.current) onOpen(); } }}>
        {children}

      </div>
    </div>
  );
}
