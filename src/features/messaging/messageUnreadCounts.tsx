import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { watchLiveData } from '../../shared/realtime/liveDataBus';
import { createLiveDataQueue } from '../../shared/realtime/liveDataQueue';

const tables = ['chat_conversations', 'chat_messages', 'channels', 'channel_members', 'channel_messages'];
const emptyCounts = {
  direct: new Map<string, number>(),
  channels: new Map<string, number>(),
  directTotal: 0,
  groupTotal: 0,
  channelTotal: 0,
};
const noop = () => {};
const UnreadContext = createContext({ ...emptyCounts, refresh: noop });

export function MessageUnreadProvider({ userId, children }: { userId?: string | null; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<{ userId: string; counts: typeof emptyCounts }>();
  const refresh = useRef(noop);
  const requestRefresh = useCallback(() => refresh.current(), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const queue = createLiveDataQueue(async () => {
      const { data, error } = await supabase.rpc('get_message_unread_counts_v1');
      if (!active || error) return;

      const counts = { ...emptyCounts, direct: new Map<string, number>(), channels: new Map<string, number>() };
      for (const row of data || []) {
        const count = Number(row.unread_count);
        if (row.thread_kind === 'chat') {
          counts.direct.set(row.thread_id, count);
          counts.directTotal += count;
        } else {
          counts.channels.set(row.thread_id, count);
          if (row.thread_kind === 'group') counts.groupTotal += count;
          else counts.channelTotal += count;
        }
      }
      setSnapshot({ userId, counts });
    });

    refresh.current = queue.request;
    const unwatch = watchLiveData(tables, async () => queue.request());
    return () => {
      active = false;
      refresh.current = noop;
      unwatch();
      queue.dispose();
    };
  }, [userId]);

  const counts = snapshot?.userId === userId ? snapshot?.counts ?? emptyCounts : emptyCounts;
  return <UnreadContext.Provider value={{ ...counts, refresh: requestRefresh }}>{children}</UnreadContext.Provider>;
}

export function useMessageUnreadCounts() {
  return useContext(UnreadContext);
}
