import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLiveDataQueue } from '../../src/shared/realtime/liveDataQueue';
import { createLiveDataBus } from '../../src/shared/realtime/liveDataCoordinator';
const pause = (ms = 130) => new Promise(resolve => setTimeout(resolve, ms));

test('bursts coalesce, in-flight changes retain a trailing fetch, disposal cancels queued work', async () => {
  let calls = 0;
  let release!: () => void;
  const queue = createLiveDataQueue(async () => { calls++; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); }, 5);
  queue.request(); queue.request(); queue.request();
  await pause(20); assert.equal(calls, 1);
  queue.request(); queue.request(); release(); await pause(20);
  assert.equal(calls, 2);
  queue.request(); queue.dispose(); await pause(20); assert.equal(calls, 2);
});

test('a failed request does not disable later reconciliation', async () => {
  let calls = 0;
  const queue = createLiveDataQueue(async () => { calls++; throw Error('offline'); }, 1);
  queue.request(); await pause(15); queue.request(); await pause(15);
  assert.equal(calls, 2); queue.dispose();
});

function fixture(failAuth = false) {
  const window = new EventTarget() as Window;
  const document = new EventTarget() as Document;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
  let emit: (payload: any) => void = () => {};
  let status: (value: string) => void = () => {};
  const intervals = new Map<number, { callback: () => void; ms: number }>(); let serial = 0;
  window.setInterval = ((callback: () => void, ms: number) => { intervals.set(++serial, { callback, ms }); return serial; }) as any;
  window.clearInterval = id => { intervals.delete(id); };
  const stats = { channels: 0, removed: 0, auth: 0, subscriptions: 0 };
  const channel = {
    on(type: string, filter: any, callback: any) { assert.equal(type, 'broadcast'); assert.equal(filter.event, 'data_changed'); emit = callback; return this; },
    subscribe(callback: any) { stats.subscriptions++; status = callback; return this; },
  };
  const client = {
    channel(topic: string, options: any) { stats.channels++; assert.equal(topic, 'app-data-changes'); assert.equal(options.config.private, true); return channel; },
    realtime: { async setAuth() { stats.auth++; if (failAuth && stats.auth === 1) throw Error('offline'); } },
    async removeChannel() { stats.removed++; },
  };
  const bus = createLiveDataBus(client as any, window, document);
  return { ...bus, stats, window, document, intervals, emit: (table: unknown) => emit({ payload: { table } }), status: (s: string) => status(s) };
}

test('one socket routes changes to related readers and reconciles permissions', async () => {
  const f = fixture(); let meetings = 0, minutes = 0;
  const a = f.watchLiveData(['meetings', 'meeting_inbox'], async () => { meetings++; });
  const b = f.watchLiveData(['minutes', 'minutes_decisions'], async () => { minutes++; });
  await pause(); assert.equal(f.stats.channels, 1);
  f.emit('meeting_inbox'); f.emit('meetings'); await pause();
  assert.equal(meetings, 2); assert.equal(minutes, 1);
  f.emit('minutes_decisions'); await pause(); assert.equal(minutes, 2);
  f.emit('unknown'); f.emit(null); await pause(); assert.equal(minutes, 2);
  f.emit('profiles'); await pause(); assert.equal(meetings, 3); assert.equal(minutes, 3);
  a(); assert.equal(f.stats.removed, 0); b(); assert.equal(f.stats.removed, 1); assert.equal(f.intervals.size, 0);
});

test('hidden views defer refresh, resume and reconnect reconcile, fallback accelerates on errors', async () => {
  const f = fixture(); let calls = 0;
  const stop = f.watchLiveData(['minutes'], async () => { calls++; });
  await pause();
  Object.assign(f.document, { visibilityState: 'hidden' }); f.emit('minutes'); await pause(); assert.equal(calls, 1);
  Object.assign(f.document, { visibilityState: 'visible' }); f.document.dispatchEvent(new Event('visibilitychange')); await pause(); assert.equal(calls, 2);
  f.status('CHANNEL_ERROR'); assert.equal([...f.intervals.values()][0].ms, 15_000);
  f.status('SUBSCRIBED'); await pause(); assert.equal(calls, 3); assert.equal([...f.intervals.values()][0].ms, 60_000);
  f.window.dispatchEvent(new Event('online')); await pause(); assert.equal(calls, 4);
  stop(); f.emit('minutes'); await pause(); assert.equal(calls, 4);
});

test('initial auth failure retries on resume and stopped views never subscribe', async () => {
  const f = fixture(true);
  const stop = f.watchLiveData(['meetings'], async () => {});
  await pause(); assert.equal(f.stats.subscriptions, 0);
  f.window.dispatchEvent(new Event('online')); await pause(); assert.equal(f.stats.subscriptions, 1); stop();
  const g = fixture(); const cancel = g.watchLiveData(['minutes'], async () => {}); cancel();
  await pause(); assert.equal(g.stats.subscriptions, 0);
});

test('live calendar options retain hidden calendars, include new ones and remove deleted ones', async () => {
  const { mergeLiveSelection } = await import('../../src/shared/realtime/mergeLiveSelection');
  assert.deepEqual([...mergeLiveSelection(new Set(), null, new Set(['a','b']))], ['a','b']);
  assert.deepEqual([...mergeLiveSelection(new Set(['a','deleted']), new Set(['a','b','deleted']), new Set(['a','b','new']))], ['a','new']);
  assert.equal(mergeLiveSelection(new Set(), new Set(['a','b']), new Set(['a','b'])).size, 0);
});

test('supported shared sources route call clearing, presence, conference archives, forwarding and runtime changes independently', async () => {
  const f=fixture();
  const tables=['chat_call_history_hidden','user_presence','conference_archives','system_config','contacts_email','chat_message_read_log'];
  const counts=tables.map(()=>0);
  const stops=tables.map((table,index)=>f.watchLiveData([table],async()=>{counts[index]++;}));
  await pause();assert.deepEqual(counts,tables.map(()=>1));
  for(let index=0;index<tables.length;index++){
    f.emit(tables[index]);await pause();
    assert.equal(counts[index],2,`${tables[index]} must reach its shared reader`);
    assert.ok(counts.every((count,i)=>count===(i<=index?2:1)),'unrelated readers must not refetch');
  }
  stops.forEach(stop=>stop());assert.equal(f.stats.channels,1);assert.equal(f.stats.removed,1);
});

// Native conference readers were intentionally retired in bec3795.
// Legacy events must not invalidate supported readers or re-enable retired scopes.
test('retired native conference events are ignored while archives remain supported', async () => {
  const f = fixture();
  const retired = ['conference_private_messages','conference_role_assignments','conference_recording_consents','pending_approvals','banned_users'];
  const counts = retired.map(() => 0);
  const stops = retired.map((table, index) => f.watchLiveData([table], async () => { counts[index]++; }));
  let archives = 0;
  const stopArchive = f.watchLiveData(['conference_archives'], async () => { archives++; });
  await pause();
  assert.deepEqual(counts, retired.map(() => 1)); assert.equal(archives, 1);
  for (const table of retired) { f.emit(table); await pause(); }
  assert.deepEqual(counts, retired.map(() => 1)); assert.equal(archives, 1);
  f.emit('conference_archives'); await pause();
  assert.equal(archives, 2); assert.deepEqual(counts, retired.map(() => 1));
  stopArchive(); stops.forEach(stop => stop());
  assert.equal(f.stats.channels, 1); assert.equal(f.stats.removed, 1);
});
