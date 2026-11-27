import { useEffect, useState, type ReactNode } from 'react';
import moment from 'moment-jalaali';
import { Bell, Check, CheckCheck, MessageSquare, Tag, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { FALLBACK_NAME } from '../../lib/useOrgUsers';
import type { ChatTag, UserProfile } from './types';
import { ChatDialog } from './ChatDialog';

export function MentionProfilePopup({ user, currentUserId, onClose, onOpenDirectChat }: {
  user: UserProfile;
  currentUserId: string;
  onClose: () => void;
  onOpenDirectChat?: (userId: string) => void;
}) {
  const [positionTitle, setPositionTitle] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [loadingPosition, setLoadingPosition] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('org_position_members')
          .select('org_positions(title, org_units(name))')
          .eq('user_id', user.user_id)
          .eq('is_primary', true)
          .maybeSingle();
        const pos = (data as any)?.org_positions;
        setPositionTitle(pos?.title || null);
        setUnitName(pos?.org_units?.name || null);
      } catch {
        // Preserve the existing silent profile-detail fallback.
      } finally {
        setLoadingPosition(false);
      }
    })();
  }, [user.user_id]);

  const name = user.full_name || FALLBACK_NAME;
  const initial = name.charAt(0).toUpperCase();
  const isSelf = user.user_id === currentUserId;

  const handleDM = () => {
    if (onOpenDirectChat) {
      onOpenDirectChat(user.user_id);
      onClose();
    } else {
      toast('برای چت خصوصی به بخش چت سازمانی بروید', { icon: '💬' });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain" onClick={event => event.stopPropagation()}>
        <div className="flex justify-between items-center px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">پروفایل کاربر</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 flex items-center gap-4">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 dark:text-white text-base truncate">{name}</p>
            {loadingPosition ? (
              <div className="w-24 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1.5" />
            ) : positionTitle ? (
              <p className="text-sm text-blue-600 dark:text-blue-400 truncate mt-0.5">{positionTitle}</p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">بدون سمت سازمانی</p>
            )}
            {!loadingPosition && unitName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{unitName}</p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 pt-1 space-y-2">
          {!isSelf && (
            <button onClick={handleDM} className="w-full flex items-center gap-3 px-4 py-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl transition-colors font-medium">
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">پیام خصوصی</span>
            </button>
          )}
          <button onClick={onClose} className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReminderModal({ messageId, messageBody, currentUserId, onClose, onSaved }: {
  messageId: string;
  messageBody: string | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const presets = [
    { label: '۳۰ دقیقه', minutes: 30 },
    { label: '۱ ساعت', minutes: 60 },
    { label: '۲ ساعت', minutes: 120 },
    { label: '۴ ساعت', minutes: 240 },
    { label: 'فردا', minutes: 24 * 60 },
  ];

  const save = async () => {
    const mins = selectedPreset !== null ? selectedPreset : parseInt(customMinutes);
    if (!mins || mins <= 0) {
      toast.error('زمان یادآوری را انتخاب کنید');
      return;
    }
    setSaving(true);
    const remindAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
    const { error } = await supabase.from('chat_reminders').insert({ message_id: messageId, user_id: currentUserId, remind_at: remindAt, note });
    setSaving(false);
    if (error) {
      toast.error('خطا در ذخیره یادآوری');
      return;
    }
    toast.success('یادآوری تنظیم شد');
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">تنظیم یادآوری</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {messageBody && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700 line-clamp-2">
              {messageBody}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">زمان پیگیری</p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {presets.map(preset => (
                <button
                  key={preset.minutes}
                  onClick={() => { setSelectedPreset(preset.minutes); setCustomMinutes(''); }}
                  className={`py-2 rounded-xl text-sm font-medium transition-colors border ${selectedPreset === preset.minutes ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-300'}`}
                >
                  {preset.label}
                </button>
              ))}
              <input
                type="number"
                placeholder="دقیقه دلخواه"
                value={customMinutes}
                onChange={event => { setCustomMinutes(event.target.value); setSelectedPreset(null); }}
                className="col-span-2 py-2 px-3 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-white outline-none focus:border-amber-400 text-center"
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">توضیحات</p>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              placeholder="توضیحات اختیاری..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white outline-none focus:border-amber-400 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">لغو</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? '...' : 'تنظیم'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TAG_COLORS = [
  { value: '#10B981', label: 'سبز' },
  { value: '#3B82F6', label: 'آبی' },
  { value: '#F59E0B', label: 'کهربایی' },
  { value: '#EF4444', label: 'قرمز' },
  { value: '#8B5CF6', label: 'بنفش' },
  { value: '#EC4899', label: 'صورتی' },
  { value: '#14B8A6', label: 'فیروزه‌ای' },
  { value: '#F97316', label: 'نارنجی' },
];

export function TagModal({ messageId, currentTags, currentUserId, onClose, onChanged }: {
  messageId: string;
  currentTags: ChatTag[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [allTags, setAllTags] = useState<ChatTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10B981');
  const [busy, setBusy] = useState(false);
  const [loadingTags, setLoadingTags] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    supabase.from('chat_tags').select('*').eq('user_id', currentUserId).then(({ data, error }) => {
      if (cancelled) return;
      setAllTags(data || []);
      setLoadingTags(false);
      if (error) setErrorMessage('دریافت تگ‌ها ممکن نشد.');
    });
    return () => { cancelled = true; };
  }, [currentUserId]);

  const toggleTag = async (tag: ChatTag, assigned: boolean) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage('');
    const assignments = supabase.from('chat_message_tag_assignments');
    const { error } = assigned
      ? await assignments.delete().eq('message_id', messageId).eq('tag_id', tag.id).eq('user_id', currentUserId)
      : await assignments.insert({ message_id: messageId, tag_id: tag.id, user_id: currentUserId });
    setBusy(false);
    if (error) {
      setErrorMessage('تغییر تگ پیام انجام نشد.');
      return;
    }
    onChanged();
  };

  const addTag = async () => {
    const name = newTagName.trim();
    if (!name || busy || loadingTags) return;
    setBusy(true);
    setErrorMessage('');
    const { data, error } = await supabase.from('chat_tags').insert({ user_id: currentUserId, name, color: newTagColor }).select().maybeSingle();
    setBusy(false);
    if (error) {
      setErrorMessage('افزودن تگ انجام نشد.');
      return;
    }
    if (data) setAllTags(tags => [...tags, data]);
    setNewTagName('');
  };

  const close = () => { if (!busy) onClose(); };

  return (
    <ChatDialog label="تگ‌های پیام" onClose={close}>
      <div className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-1.5 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Tag className="size-4 text-teal-600 dark:text-teal-400" /> تگ‌های پیام
          </h3>
          <button type="button" autoFocus onClick={close} disabled={busy} aria-label="بستن تگ‌های پیام" className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto overscroll-contain">
            {loadingTags && <p className="text-sm text-slate-500 dark:text-slate-400">در حال دریافت تگ‌ها…</p>}
            {!loadingTags && allTags.length === 0 && !errorMessage && <p className="text-sm text-slate-500 dark:text-slate-400">هنوز تگی ایجاد نشده است.</p>}
            {allTags.map(tag => {
              const assigned = currentTags.some(current => current.id === tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag, assigned)}
                  disabled={busy}
                  aria-pressed={assigned}
                  className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-sm [overflow-wrap:anywhere] disabled:opacity-60 ${assigned ? 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="min-w-0">{tag.name}</span>
                  {assigned && <Check className="size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
          <form className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800" onSubmit={event => { event.preventDefault(); void addTag(); }}>
            <label htmlFor="chat-new-tag" className="text-xs font-semibold text-slate-700 dark:text-slate-300">افزودن تگ جدید</label>
            <div role="group" aria-label="رنگ تگ" className="my-2 grid grid-cols-8 gap-0.5">
              {TAG_COLORS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNewTagColor(value)}
                  aria-label={label}
                  aria-pressed={newTagColor === value}
                  className="grid h-9 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className={`grid size-6 place-items-center rounded-full ${newTagColor === value ? 'outline outline-2 outline-offset-2 outline-slate-500 dark:outline-slate-300' : ''}`} style={{ backgroundColor: value }}>
                    {newTagColor === value && <Check className="size-3.5 text-slate-950" />}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                id="chat-new-tag"
                value={newTagName}
                onChange={event => setNewTagName(event.target.value)}
                placeholder="نام تگ"
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:text-sm"
              />
              <button type="submit" disabled={busy || loadingTags || !newTagName.trim()} className="shrink-0 rounded-xl bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">افزودن</button>
            </div>
            {errorMessage && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
          </form>
        </div>
      </div>
    </ChatDialog>
  );
}

export function ChatMessageMenuItem({ icon, label, labelClass, onClick }: {
  icon: ReactNode;
  label: string;
  labelClass?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-right">
      <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{icon}</span>
      <span className={labelClass || 'text-gray-700 dark:text-gray-300'}>{label}</span>
    </button>
  );
}

export function ChatViewersModal({ messageId, conversationId, messageCreatedAt, currentUserId, allUsers, readBy, onClose }: {
  messageId: string;
  conversationId: string;
  messageCreatedAt: string;
  currentUserId: string;
  allUsers: UserProfile[];
  readBy: string[];
  onClose: () => void;
}) {
  const [seenLog, setSeenLog] = useState<Array<{ user_id: string; seen_at: string }>>([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('chat_message_read_log')
      .select('user_id, seen_at')
      .eq('message_id', messageId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSeenLog(data.map((row: any) => ({ user_id: row.user_id, seen_at: row.seen_at })));
          setLogLoading(false);
        } else {
          supabase
            .from('chat_message_read_receipts')
            .select('user_id, last_read_at')
            .eq('conversation_id', conversationId)
            .neq('user_id', currentUserId)
            .gte('last_read_at', messageCreatedAt)
            .then(({ data: fallback }) => {
              setSeenLog((fallback || []).map((row: any) => ({ user_id: row.user_id, seen_at: row.last_read_at })));
              setLogLoading(false);
            });
        }
      });
  }, [messageId, conversationId, currentUserId, messageCreatedAt]);

  const seenIds = new Set(readBy.filter(id => id !== currentUserId));
  const viewers = [...seenIds].map(uid => {
    const profile = allUsers.find(user => user.user_id === uid);
    const logEntry = seenLog.find(log => log.user_id === uid);
    return { uid, profile, seen_at: logEntry?.seen_at ?? null };
  });

  const formatTime = (iso: string | null) => iso ? moment(iso).format('jYYYY/jMM/jDD - HH:mm') : null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[400] flex items-end sm:items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="w-full sm:w-80 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-white dark:bg-gray-900 rounded-2xl shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">مشاهده‌کنندگان پیام</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {viewers.length > 0 ? (
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-3">
                <CheckCheck className="w-3.5 h-3.5" /> دیده شده توسط ({viewers.length})
              </p>
              {viewers.map(({ uid, profile, seen_at }) => (
                <div key={uid} className="flex items-center gap-3 py-2">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(profile?.full_name || FALLBACK_NAME).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{profile?.full_name || FALLBACK_NAME}</p>
                    {logLoading ? (
                      <p className="text-[11px] text-gray-400 mt-0.5">در حال بارگذاری...</p>
                    ) : seen_at ? (
                      <p className="text-[11px] text-teal-500 dark:text-teal-400 mt-0.5">{formatTime(seen_at)}</p>
                    ) : (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">زمان نامشخص</p>
                    )}
                  </div>
                  <CheckCheck className="w-4 h-4 text-teal-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">هنوز کسی این پیام را ندیده</p>
          )}
        </div>
      </div>
    </div>
  );
}
