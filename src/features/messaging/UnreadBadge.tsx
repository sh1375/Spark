export function unreadLabel(count: number) {
  return `${count.toLocaleString('fa-IR')} پیام خوانده‌نشده`;
}

export function UnreadBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-4 shrink-0 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-4 text-white ${className}`}
      title={unreadLabel(count)}
      aria-label={unreadLabel(count)}
    >
      {count > 99 ? '۹۹+' : count.toLocaleString('fa-IR')}
    </span>
  );
}
