import { supabase } from './supabase';
import { playNotificationSound, unlockNotificationSound } from './notificationSound';

export type BrowserPushStatus = 'unsupported' | 'not-installed' | 'permission-required' | 'permission-denied' | 'disabled-by-preference' | 'registering' | 'ready' | 'error';
export interface BrowserPushState { status: BrowserPushStatus; message?: string }
type NotificationRow = { id?: string; user_id?: string; title?: string | null; message?: string | null; action_url?: string | null; read?: boolean };
let activeUserId: string | null = null;
let preferenceEnabled = true;
let generation = 0;
let pushReady = false;
let pending: Promise<boolean> | null = null;
let state: BrowserPushState = { status: 'permission-required' };
const delivered = new Set<string>();
type PushConfig = { publicKey?: string | null; configured?: boolean };
// These existing RPCs are absent from the repository's generated database types.
// Keep their verified signatures local rather than broadening unrelated query types.
const pushClient = supabase as unknown as {
  rpc(name: 'get_my_pwa_push_config'): PromiseLike<{ data: PushConfig | null; error: { message?: string } | null }>;
  rpc(name: 'upsert_my_pwa_push_subscription', args: { p_endpoint: string; p_p256dh: string; p_auth_key: string; p_user_agent: string }): PromiseLike<{ data: string | null; error: unknown }>;
  rpc(name: 'disable_my_pwa_push_subscription', args: { p_endpoint: string }): PromiseLike<{ data: unknown; error: unknown }>;
};

function installed(): boolean {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);
}
function deviceEnabled(userId: string): boolean {
  try { return localStorage.getItem(`spark-browser-notifications:${userId}`) !== 'off'; } catch { return true; }
}
export function isBrowserNotificationPreferenceEnabled(userId: string | null = activeUserId): boolean {
  return !userId || deviceEnabled(userId); // Enabled by default; preserve explicit opt-outs.
}
function devicePreference(userId: string, enabled: boolean) {
  try { localStorage.setItem(`spark-browser-notifications:${userId}`, enabled ? 'on' : 'off'); } catch { /* private browsing */ }
}
function emit(status: BrowserPushStatus, message?: string) {
  state = { status, message };
  window.dispatchEvent(new Event('spark-browser-notifications-changed'));
}
export function getBrowserPushState(): BrowserPushState {
  if (typeof window === 'undefined') return { status: 'unsupported' };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !installed()) return { status: 'not-installed' };
  if (!window.isSecureContext || typeof Notification === 'undefined') return { status: 'unsupported' };
  if (Notification.permission === 'denied') return { status: 'permission-denied' };
  if (!preferenceEnabled || (activeUserId && !deviceEnabled(activeUserId))) return { status: 'disabled-by-preference' };
  if (Notification.permission !== 'granted') return { status: 'permission-required' };
  return state;
}
function eligible(userId: string) {
  return activeUserId === userId && preferenceEnabled && deviceEnabled(userId) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function withTimeout<T>(promise: PromiseLike<T>, ms = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('مرورگر در زمان مقرر پاسخ نداد؛ دوباره تلاش کنید.')), ms);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
async function registration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.');
  let worker = await navigator.serviceWorker.getRegistration('/');
  if (!worker) worker = await navigator.serviceWorker.register('/pwa-sw.js', { scope: '/', updateViaCache: 'none' });
  return worker.active ? worker : withTimeout(navigator.serviceWorker.ready);
}
function serverKey(base64: string): Uint8Array {
  const raw = window.atob((base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function ensurePushSubscription(userId: string): Promise<boolean> {
  const support = getBrowserPushState().status;
  if (['unsupported', 'not-installed'].includes(support) || !eligible(userId)) { emit(support); return false; }
  if (pushReady) { emit('ready'); return true; }
  if (pending) return pending;
  const version = generation;
  const current = () => version === generation && eligible(userId);
  const task = (async () => {
    emit('registering');
    try {
      const worker = await registration();
      if (!current()) return false;
      if (!worker.pushManager) throw new Error('Push در این مرورگر در دسترس نیست؛ اعلان هنگام بازبودن برنامه فعال است.');
      let { data, error } = await withTimeout(pushClient.rpc('get_my_pwa_push_config'));
      if (!current()) return false;
      if ((!error && data?.configured === false) || error?.message?.includes('PWA_PUSH_NOT_CONFIGURED')) {
        // Only the authenticated server endpoint can create/repair VAPID keys.
        const initialized = await withTimeout(supabase.functions.invoke<PushConfig>('pwa-push-config', { body: {} }));
        if (!current()) return false;
        data = initialized.data;
        error = initialized.error;
      }
      if (!current()) return false;
      if (error || !data?.publicKey) throw new Error(error?.message?.includes('PWA_PUSH_NOT_CONFIGURED')
        ? 'کلید ارسال Push روی سرور تنظیم نشده است؛ اعلان هنگام بازبودن برنامه فعال است.'
        : 'ثبت اعلان پس‌زمینه ناموفق بود؛ اعلان هنگام بازبودن برنامه فعال است.');
      const key = serverKey(data.publicKey);
      let subscription = await withTimeout(worker.pushManager.getSubscription());
      if (!current()) return false;
      if (subscription?.options.applicationServerKey) {
        const old = new Uint8Array(subscription.options.applicationServerKey);
        if (old.length !== key.length || old.some((value, index) => value !== key[index])) { await withTimeout(subscription.unsubscribe()); subscription = null; }
      }
      subscription ??= await withTimeout(worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }));
      if (!current()) return false;
      const save = async (candidate: PushSubscription) => {
        const serialized = candidate.toJSON();
        if (!serialized.keys?.p256dh || !serialized.keys.auth) throw new Error('Invalid push subscription keys');
        return withTimeout(pushClient.rpc('upsert_my_pwa_push_subscription', {
          p_endpoint: candidate.endpoint, p_p256dh: serialized.keys.p256dh,
          p_auth_key: serialized.keys.auth, p_user_agent: navigator.userAgent,
        }));
      };
      let { error: saveError } = await save(subscription);
      if (!current()) return false;
      // An endpoint owned by another account must never be reassigned. Rotate only
      // on the explicit server conflict and never on a generic authorization error.
      const conflict = saveError as { code?: string; message?: string } | null;
      if (conflict?.code === '42501' && conflict.message === 'PWA_PUSH_ENDPOINT_OWNERSHIP_CONFLICT') {
        const previousEndpoint = subscription.endpoint;
        const latest = await withTimeout(worker.pushManager.getSubscription());
        if (!current()) return false;
        if (latest && latest.endpoint === previousEndpoint) await withTimeout(latest.unsubscribe());
        if (!current()) return false;
        subscription = await withTimeout(worker.pushManager.getSubscription());
        if (!current()) return false;
        subscription ??= await withTimeout(worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }));
        if (!current()) return false;
        if (subscription.endpoint === previousEndpoint) throw new Error('Push endpoint rotation did not complete');
        ({ error: saveError } = await save(subscription));
        if (!current()) return false;
      }
      if (saveError) throw saveError;
      pushReady = true; emit('ready'); return true;
    } catch (error) {
      if (current()) emit('error', error instanceof Error ? error.message : 'ثبت اعلان مرورگر ناموفق بود.');
      return false;
    }
  })();
  pending = task;
  void task.finally(() => { if (pending === task) pending = null; });
  return task;
}
async function unsubscribeDevice(isCurrent: () => boolean) {
  try {
    const worker = await navigator.serviceWorker?.getRegistration('/');
    const subscription = await worker?.pushManager?.getSubscription();
    if (!subscription || !isCurrent()) return;
    await withTimeout(subscription.unsubscribe());
    if (isCurrent()) void withTimeout(pushClient.rpc('disable_my_pwa_push_subscription', { p_endpoint: subscription.endpoint })).catch(() => {});
  } catch { /* An expired endpoint is also retired by the push worker. */ }
}
export function startPwaNotificationBridge(userId: string, enabled: boolean): () => void {
  const version = ++generation;
  activeUserId = userId; preferenceEnabled = enabled; pushReady = false; pending = null;
  const retry = () => { if (version === generation) void ensurePushSubscription(userId); };
  const unlock = () => { if (eligible(userId)) unlockNotificationSound(); };
  const sound = (event: MessageEvent) => {
    if (event.data?.type === 'SPARK_NOTIFICATION_SHOWN' && eligible(userId) && document.visibilityState === 'visible') playNotificationSound();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === `spark-browser-notifications:${userId}`) { pushReady = false; retry(); }
  };
  window.addEventListener('focus', retry); window.addEventListener('online', retry);
  window.addEventListener('spark-browser-notifications-retry', retry);
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  window.addEventListener('storage', storage);
  navigator.serviceWorker?.addEventListener('message', sound);
  retry();
  return () => {
    window.removeEventListener('focus', retry); window.removeEventListener('online', retry);
    window.removeEventListener('spark-browser-notifications-retry', retry);
    window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
    window.removeEventListener('storage', storage);
    navigator.serviceWorker?.removeEventListener('message', sound);
    if (generation === version) {
      activeUserId = null; pushReady = false; pending = null;
      // StrictMode/effect restarts reuse the endpoint; real logout retires it.
      queueMicrotask(() => { if (generation === version && !activeUserId) void unsubscribeDevice(() => generation === version && !activeUserId); });
    }
  };
}
export async function enableBrowserNotifications(): Promise<void> {
  if (activeUserId) devicePreference(activeUserId, true);
  const support = getBrowserPushState().status;
  emit(support);
  if (['unsupported', 'not-installed', 'permission-denied'].includes(support)) return;
  unlockNotificationSound();
  const permission = await Notification.requestPermission(); // Must run directly in the click handler.
  if (permission !== 'granted') { emit(permission === 'denied' ? 'permission-denied' : 'permission-required'); return; }
  if (activeUserId) devicePreference(activeUserId, true);
  pushReady = false;
  window.dispatchEvent(new Event('spark-browser-notifications-retry'));
}
export async function disableBrowserNotifications(): Promise<void> {
  if (!activeUserId) return;
  const userId = activeUserId;
  devicePreference(userId, false); pushReady = false;
  emit('disabled-by-preference');
  await unsubscribeDevice(() => activeUserId === userId && !deviceEnabled(userId));
}
export async function notifyBrowser(row: NotificationRow, userId: string): Promise<void> {
  if (!eligible(userId) || row.read || (row.user_id && row.user_id !== userId) || (row.id && delivered.has(row.id))) return;
  const subject = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'یک اعلان جدید در اسپارک دارید.';
  try {
    const worker = await registration();
    if (!eligible(userId)) return;
    if (!worker.active) throw new Error('Service worker is inactive');
    worker.active.postMessage({ type: 'SPARK_REALTIME_NOTIFICATION', payload: {
      notificationId: row.id || crypto.randomUUID(), title: 'اسپارک',
      body: subject, actionUrl: row.action_url || '/',
    } });
    if (row.id) delivered.add(row.id);
    if (delivered.size > 256) delivered.delete(delivered.values().next().value!);
  } catch {
    // Desktop fallback; mobile browsers require ServiceWorker.showNotification.
    if (!eligible(userId)) return;
    try {
      const notification = new Notification('اسپارک', { body: subject, tag: row.id, icon: '/icons/icon-192x192.png', silent: document.visibilityState === 'visible' });
      notification.onclick = () => { window.focus(); notification.close(); const url = new URL(row.action_url || '/', window.location.origin); if (url.origin === window.location.origin) window.location.assign(url.href); };
      if (document.visibilityState === 'visible') playNotificationSound();
      if (row.id) delivered.add(row.id);
    } catch { /* In-app notification remains available. */ }
  }
}
