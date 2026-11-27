import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ChatDialog({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      if (!viewport) return;
      dialog.style.top = `${viewport.offsetTop}px`;
      dialog.style.left = `${viewport.offsetLeft}px`;
      dialog.style.width = `${viewport.width}px`;
      dialog.style.height = `${viewport.height}px`;
    };

    fitViewport();
    dialog.showModal();
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    return () => {
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={label}
      dir="rtl"
      className="fixed inset-auto left-0 top-0 m-0 h-dvh w-full max-h-none max-w-none items-end justify-center overflow-hidden bg-transparent px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop:bg-slate-950/45 open:flex sm:items-center sm:p-4"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
