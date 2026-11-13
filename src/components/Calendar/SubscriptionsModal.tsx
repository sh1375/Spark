import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Search, User, Trash2, ChevronDown } from 'lucide-react';
import { CalendarEntry, CalendarSubscription } from './types';
import type { OrgUserProfile } from '../../lib/useOrgUsers';

interface Props {
  calendar: CalendarEntry;
  subscriptions: CalendarSubscription[];
  allUsers: OrgUserProfile[];
  resolveName: (uid: string) => string;
  currentUserId: string | null;
  subSearch: string;
  subPermission: 'view' | 'edit';
  onSearchChange: (v: string) => void;
  onPermissionChange: (v: 'view' | 'edit') => void;
  onAdd: (userId: string) => void;
  onRemove: (subId: string) => void;
  onUpdatePermission: (subId: string, perm: 'view' | 'edit') => void;
  onClose: () => void;
}

export function SubscriptionsModal({
  calendar, subscriptions, allUsers, resolveName, currentUserId,
  subSearch, subPermission,
  onSearchChange, onPermissionChange, onAdd, onRemove, onUpdatePermission, onClose,
}: Props) {
  const [showUserPicker, setShowUserPicker] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showUserPicker) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [showUserPicker]);

  const matchesSearch = (p: OrgUserProfile, q: string) => {
    if ((p.full_name || '').toLowerCase().includes(q)) return true;
    if ((p.position_title || '').toLowerCase().includes(q)) return true;
    if ((p.unit_name || '').toLowerCase().includes(q)) return true;
    return p.assignments.some(a =>
      (a.positionTitle || '').toLowerCase().includes(q) ||
      (a.unitName || '').toLowerCase().includes(q)
    );
  };

  const availableUsers = allUsers.filter(p => {
    if (p.user_id === currentUserId) return false;
    if (subscriptions.some(s => s.user_id === p.user_id)) return false;
    if (!subSearch.trim()) return true;
    return matchesSearch(p, subSearch.toLowerCase());
  });

  const displayUsers = subSearch.trim() ? availableUsers : availableUsers.slice(0, 20);

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[250]" dir="rtl" onClick={onClose}>
      <div
        className="absolute inset-y-0 left-0 w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slideInLeft"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold dark:text-white">اشتراک‌گذاری تقویم</h3>
            <p className="text-xs text-gray-400 mt-0.5">{calendar.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-red-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add subscriber */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowUserPicker(v => !v); onSearchChange(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white text-sm rounded-xl hover:bg-teal-600 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />اشتراک‌گذاری جدید
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showUserPicker ? 'rotate-180' : ''}`} />
            </button>
            <select
              value={subPermission}
              onChange={e => onPermissionChange(e.target.value as 'view' | 'edit')}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-700 dark:text-white"
            >
              <option value="edit">ویرایش</option>
              <option value="view">مشاهده</option>
            </select>
          </div>

          {showUserPicker && (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchRef}
                  value={subSearch}
                  onChange={e => onSearchChange(e.target.value)}
                  placeholder="جستجوی نام، سمت یا واحد..."
                  className="w-full pl-4 pr-9 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {displayUsers.length > 0 ? (
                <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {displayUsers.map(p => {
                    const hasAssignments = p.assignments.length > 0;
                    return (
                      <button
                        key={p.user_id}
                        onClick={() => {
                          onAdd(p.user_id);
                          onSearchChange('');
                          setShowUserPicker(false);
                        }}
                        className="w-full text-right px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm dark:text-white font-medium truncate">{p.full_name || 'همکار سازمانی'}</p>
                          {hasAssignments ? (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {p.assignments.map(a => (
                                <span key={a.positionId} className="text-xs text-gray-400 truncate">
                                  {a.positionTitle || '—'}{a.unitName ? ` · ${a.unitName}` : ''}
                                  {a.isPrimary && <span className="text-teal-500 font-medium mr-0.5">اصلی</span>}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 truncate">بدون جایگاه سازمانی</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {!subSearch.trim() && availableUsers.length > 20 && (
                    <div className="px-4 py-2 text-xs text-gray-400 text-center">
                      برای یافتن سایر کاربران جستجو کنید ({availableUsers.length - 20} نفر بیشتر)
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-3">
                  {subSearch.trim() ? 'کاربری یافت نشد' : 'همه کاربران اشتراک دارند'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Subscribers table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
              <tr>
                <th className="text-right text-xs text-gray-500 dark:text-gray-400 font-medium px-4 py-2.5">نام</th>
                <th className="text-right text-xs text-gray-500 dark:text-gray-400 font-medium px-4 py-2.5">سطح دسترسی</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {subscriptions.map(sub => (
                <tr key={sub.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-sm dark:text-white">{resolveName(sub.user_id)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={sub.permission}
                      onChange={e => onUpdatePermission(sub.id, e.target.value as 'view' | 'edit')}
                      className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    >
                      <option value="edit">ویرایش</option>
                      <option value="view">مشاهده</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onRemove(sub.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-gray-400 text-sm">هیچ کاربری اشتراک ندارد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>, document.body,
  );
}
