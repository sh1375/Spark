import { useEffect, type RefObject } from 'react';
import { supabase } from '../../lib/supabase';
import { useMessageUnreadCounts } from './messageUnreadCounts';

export function useVisibleMessageReads(
  container: RefObject<HTMLDivElement | null>,
  renderedMessages: readonly unknown[],
  userId: string | null,
  threadId: string,
  isChannel: boolean,
  filter: string,
) {
  const { refresh } = useMessageUnreadCounts();

  useEffect(() => {
    const root = container.current;
    if (!root || !userId) return;
    const candidates = root.querySelectorAll<HTMLElement>('[data-unread-message-id]');
    if (!candidates.length) return;

    const visible = new Set<string>();
    const saved = new Set<string>();
    let running = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay = 180) => {
      if (!disposed && !running && timer === undefined && document.visibilityState === 'visible') {
        timer = setTimeout(() => { void markVisible(); }, delay);
      }
    };
    const markVisible = async () => {
      timer = undefined;
      if (document.visibilityState !== 'visible') return;
      const ids = [...visible].filter(id => !saved.has(id)).slice(0, 100);
      if (!ids.length) return;
      running = true;
      let failed = false;
      try {
        const { error } = await supabase.rpc('mark_visible_messages_read_v1', {
          p_thread_id: threadId, p_is_channel: isChannel, p_message_ids: ids,
        });
        if (error) throw error;
        ids.forEach(id => saved.add(id));
        refresh();
      } catch {
        failed = true;
      } finally {
        running = false;
        if ([...visible].some(id => !saved.has(id))) schedule(failed ? 2000 : 180);
      }
    };

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.unreadMessageId;
        if (!id) continue;
        if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(id);
        else visible.delete(id);
      }
      schedule();
    }, { root, threshold: [0, 0.01] });

    candidates.forEach(message => observer.observe(message));
    const onVisibilityChange = () => schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [container, renderedMessages, userId, threadId, isChannel, filter, refresh]);
}
