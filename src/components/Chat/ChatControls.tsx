import type { ReactNode } from 'react';
import { Check, Loader } from 'lucide-react';
import type { MessageStatus } from './types';

export const messageActionClass = 'chat-icon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors sm:h-7 sm:w-7';
export const messageToolbarClass = 'flex items-center gap-0.5 px-2 pb-1 sm:gap-1 sm:pb-2';
export const composerToolbarClass = 'flex flex-wrap items-center gap-0.5 px-1 pt-0.5 pb-1 sm:gap-1 sm:px-2 sm:pt-1 sm:pb-2';
export const composerSendClass = 'chat-icon-button flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-all sm:h-auto sm:w-auto sm:rounded-xl sm:px-4 sm:py-2';

const statusLabels = { pending: 'در انتظار', in_progress: 'در حال رسیدگی', done: 'رسیدگی شده' };

export function MessageStatusButton({ status, onClick, className = '' }: {
  status: MessageStatus | null;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={`تغییر وضعیت رسیدگی: ${status ? statusLabels[status] : 'تعیین نشده'}`} className={`${messageActionClass} ${className}`}>
      {(!status || status === 'pending') && <span className={`size-3.5 rounded-full border-2 ${status ? 'border-slate-500 dark:border-slate-400' : 'border-dashed border-slate-400'}`} />}
      {status === 'in_progress' && <Loader className="size-4 text-amber-600 motion-safe:animate-spin dark:text-amber-400" />}
      {status === 'done' && <Check className="size-4 text-teal-700 dark:text-teal-400" />}
    </button>
  );
}

export function ComposerToolButton({ children, title, onClick, active, activeColor }: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`chat-icon-button flex h-9 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors sm:w-9 sm:rounded-lg ${
        active ? `bg-gray-100 dark:bg-gray-700 ${activeColor || 'text-teal-500'}`
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
      }`}>
      {children}
    </button>
  );
}
