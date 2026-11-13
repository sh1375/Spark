// @ts-nocheck
import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Calendar, RefreshCw, X, Plus, Users, CalendarPlus } from 'lucide-react';
import { CalendarViews } from './CalendarViews';
import { supabase } from '../../lib/supabase';
import { meetingLocalDate } from '../../features/meetings/meetingLocalDate';
import { MEETING_VIDEO_CONFERENCE_ENABLED } from '../CalendarMeetingForm/services';
import { MeetingInboxButton } from '../MeetingInboxButton';
import { JALAALI_MONTHS, VIEW_OPTIONS, parseRequestDateToDateStr } from './utils';
import { CalendarSidebar } from './CalendarSidebar';
import { CalendarToolbar } from './CalendarToolbar';

const CalendarMeetingForm = lazy(() => import('../CalendarMeetingForm').then(m => ({ default: m.CalendarMeetingForm })));
const MeetingDetailModal = lazy(() => import('./MeetingDetailModal').then(m => ({ default: m.MeetingDetailModal })));
const CreateEditCalendarModal = lazy(() => import('./CreateEditCalendarModal').then(m => ({ default: m.CreateEditCalendarModal })));
const SubscriptionsModal = lazy(() => import('./SubscriptionsModal').then(m => ({ default: m.SubscriptionsModal })));
const CalendarListModal = lazy(() => import('./CalendarListModal').then(m => ({ default: m.CalendarListModal })));
const ReminderAlertModal = lazy(() => import('./ReminderAlertModal').then(m => ({ default: m.ReminderAlertModal })));
const DeleteMeetingDialog = lazy(() => import('./DeleteMeetingDialog').then(m => ({ default: m.DeleteMeetingDialog })));
const MoveConfirmDialog = lazy(() => import('./MoveConfirmDialog').then(m => ({ default: m.MoveConfirmDialog })));
const ResizeConfirmDialog = lazy(() => import('./ResizeConfirmDialog').then(m => ({ default: m.ResizeConfirmDialog })));


export function CalendarPageView({ model }: { model: Record<string, any> }) {
  const {
    adjustSlotHeight, allDayDragEnd, allDayDragStart, allDayDragging, allDayFormDate, allDayFormEndDate,
    allDayFormTitle, allDayFormType, allUsers, calendarForm, calendarListSearch, calendars,
    canHideOffHours, commitDrag, commitMove, commitResize, currentJm, currentJy, isMoveCommitting, isResizeCommitting,
    currentTime, currentUserId, dayGridRef, deleteMeetingDialog, detailMeeting, dragDate,
    dragEndSlot, dragMoveCurrentDeltaDay, dragMoveCurrentDeltaSlot, dragMoveMeeting, dragMoveOriginalEndSlot, dragMoveOriginalSlot,
    dragMovedRef, dragStartSlot, editingCalendar, enabledCalendarIds, expandedMeetingId, fetchAllDayEvents,
    fetchMeetings, getAllDayEventsForDay, getMeetingColor, getMeetings, getNavTitle, getOccasionsForDay,
    refreshCalendarToNow, handleAddSubscription, handleBlockClick, handleCreateMeetingForDay, handleDeleteCalendar, handleDeleteMeeting,
    cancelTouchDrag, handleDeleteMeetingConfirm, handleEditMeeting, handleGridMouseDown, handleGridMouseMove, handleGridTouchMove, handleGridTouchStart,
    handleHourColTouchEnd, handleHourColTouchMove, handleHourColTouchStart, handleOpenSubscriptions, handleRemoveSubscription, handleSaveCalendar,
    handleSendToGoogleCalendar, handleShareFromDetail, handleToggleOccasions, handleUpdateSubPermission, hideOffHours, isDragging,
    isInAllDayDragRange, isRefreshing, isSelected, isToday, jalaaliDatesBetween, listMeetings,
    listScrollRef, mainMonthDays, meetings, monthDayPopup, monthDayPopupRef, myGroupOpen,
    navigateNext, navigatePrev, navigateToMeeting, occasionsEnabled, onRegisterMinutes, onScheduleComplete,
    openEditForm, pendingMove, pendingResize, prefillData, prefs, previewMeeting, returnMoveToEdit, returnResizeToEdit,
    previewPos, previewRef, publicGroupOpen, reminderAlert, repeatEditDialog, resetCalendarForm,
    resizeCurrentDelta, resizeMeeting, resizeOriginalEndSlot, resolveName, searchInputRef, searchQuery,
    searchRef, searchResults, selectedJd, selectedJm, selectedJy, sendNotification,
    setActivePendingSchedule, setAllDayDragEnd, setAllDayDragStart, setAllDayDragging, setAllDayFormDate, setAllDayFormEndDate,
    setAllDayFormTitle, setAllDayFormType, setCalendarForm, setCalendarListSearch, setCurrentJm, setCurrentJy,
    setDeleteMeetingDialog, setDetailMeeting, setDragMoveCurrentDeltaDay, setDragMoveCurrentDeltaSlot, setDragMoveMeeting, setDragMoveOriginalDate,
    setDragMoveOriginalEndSlot, setDragMoveOriginalSlot, setDragMoveStartX, setDragMoveStartY, setEditingCalendar, setEnabledCalendarIds,
    setExpandedMeetingId, setHideOffHours, setMonthDayPopup, setMyGroupOpen, setPendingMove, setPendingResize,
    setPrefillData, setPreviewMeeting, setPublicGroupOpen, setReminderAlert, setRepeatEditDialog, setResizeCurrentDelta,
    setResizeMeeting, setResizeOriginalEndSlot, setResizeStartY, setSearchQuery, setSelectedJd, setSelectedJm,
    setSelectedJy, setSharedGroupOpen, setShowAllDayForm, setShowCalendarList, setShowCreateCalendar, setShowDesktopSidebar,
    setShowMeetingForm, setShowMobileSidebar, setShowOnlyMine, setShowSearch, setShowSubscriptionsModal, setShowViewDropdown,
    setSidebarJm, setSidebarJy, setSubPermission, setSubSearch, setViewMode, sharedGroupOpen,
    showAllDayForm, showCalendarList, showCreateCalendar, showDesktopSidebar, showMeetingForm, showMobileSidebar,
    showOnlyMine, showSearch, showSubscriptionsModal, showViewDropdown, sidebarJm, sidebarJy,
    sidebarMonthDays, slotHeight, subPermission, subSearch, subscribedCalendars, subscriptions,
    subscriptionsCalendar, timeGridRef, timeScrollRef, toFarsiTime, totalSlots, updatePrefs,
    viewMode, visibleEndHour, visibleStartHour, weekDays, weekGridRef, workEndMin,
    workStartMin
  } = model;
  return (
    <div data-calendar-page className="flex h-full bg-gray-50 dark:bg-gray-900 overflow-hidden" dir="rtl">

      {/* Reminder alert */}
      {reminderAlert && (
        <Suspense fallback={null}>
          <ReminderAlertModal reminderAlert={reminderAlert} onDismiss={() => setReminderAlert(null)} />
        </Suspense>
      )}

      {/* Meeting form */}
      {showMeetingForm && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[250]" dir="rtl" onClick={() => { setShowMeetingForm(false); setActivePendingSchedule(null); setPrefillData(null); }}>
          <div
            className="absolute inset-y-0 left-0 w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slideInLeft"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
            <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-gray-500">در حال آماده‌سازی فرم جلسه...</div>}>
              <CalendarMeetingForm
              key={prefillData?.mode === 'create' ? 'similar-meeting' : prefillData?.meetingId || 'new-meeting'}
              prefillData={prefillData}
              calendars={[...calendars.filter(c => !c.is_occasions && c.type !== 'private'), ...subscribedCalendars.filter(c => !c.is_occasions && c.type !== 'private')]}
              onCancel={() => { setShowMeetingForm(false); setActivePendingSchedule(null); setPrefillData(null); }}
              onSuccess={(subject, isUpdate) => { setShowMeetingForm(false); setActivePendingSchedule(null); setPrefillData(null); fetchMeetings(); if (onScheduleComplete) onScheduleComplete(); sendNotification(isUpdate ? 'جلسه ویرایش شد' : 'جلسه ثبت شد', subject || ''); }}
              />
            </Suspense>
          </div>
        </div>, document.body,
      )}

      {/* Meeting detail */}
      {detailMeeting && (
        <Suspense fallback={null}>
          <MeetingDetailModal
          meeting={detailMeeting}
          currentUserId={currentUserId}
          resolveName={resolveName}
          calendars={calendars}
          subscribedCalendars={subscribedCalendars}
          getMeetingColor={getMeetingColor}
          onClose={() => setDetailMeeting(null)}
          onEdit={handleEditMeeting}
          onDelete={handleDeleteMeeting}
          onShare={handleShareFromDetail}
          onGoogleCalendar={handleSendToGoogleCalendar}
          onCreateSimilar={(meeting, sourceAgendaItems) => {
            const eligibleCalendarId = [...calendars, ...subscribedCalendars].some(
              (calendar) => calendar.id === meeting.calendar_id && !calendar.is_occasions && calendar.type !== 'private'
            ) ? meeting.calendar_id : undefined;
            setPrefillData({
              mode: 'create',
              subject: meeting.subject || '',
              location: meeting.location || '',
              representative: meeting.representative || '',
              phone: meeting.phone || '',
              notes: meeting.notes || '',
              priority: meeting.priority || 'medium',
              calendarId: eligibleCalendarId,
              membersOnly: meeting.members_only ?? undefined,
              participantUserIds: [...(meeting.participant_user_ids || [])],
              notifyUserIds: (meeting.notify_users || []).filter((id) => id !== meeting.user_id),
              externalParticipants: [...(meeting.external_participants || [])],
              meetingManager: meeting.meeting_manager && meeting.meeting_manager !== meeting.user_id
                ? meeting.meeting_manager
                : '',
              reminderMinutes: meeting.reminder_minutes ?? 15,
              isOnline: MEETING_VIDEO_CONFERENCE_ENABLED ? Boolean(meeting.is_online) : false,
              agendaItems: sourceAgendaItems.map((item) => ({
                title: item.title,
                presenter: item.presenter ?? null,
                duration_minutes: item.duration_minutes ?? null,
                description: item.description ?? null,
              })),
            });
            setActivePendingSchedule(null);
            setDetailMeeting(null);
            setShowMeetingForm(true);
          }}
          onRegisterMinutes={onRegisterMinutes}
          />
        </Suspense>
      )}

      {/* Repeat edit scope dialog */}
      {repeatEditDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRepeatEditDialog(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="bg-blue-600 px-5 py-4">
              <h3 className="text-white font-bold">ویرایش جلسه تکراری</h3>
              <p className="text-blue-100 text-xs mt-1">کدام جلسات تغییر کنند؟</p>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => { openEditForm(repeatEditDialog.meeting); setRepeatEditDialog(null); }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-right group">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 transition-colors">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white text-sm">فقط این جلسه</p>
                  <p className="text-xs text-gray-400 mt-0.5">تنها همین جلسه تغییر می‌کند</p>
                </div>
              </button>
              <button onClick={async () => {
                const m = repeatEditDialog.meeting;
                if (!m.series_id) { openEditForm(m); setRepeatEditDialog(null); return; }
                const { data: allRepeat } = await supabase.from('meetings').select('id').eq('series_id', m.series_id).eq('user_id', m.user_id || '').gte('request_local_date', meetingLocalDate(m.request_date));
                if (allRepeat && allRepeat.length > 0) {
                  const ids = allRepeat.map((r: any) => r.id);
                  openEditForm({ ...m, id: m.id, _editAllIds: ids } as any);
                }
                setRepeatEditDialog(null);
              }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all text-right group">
                <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500 transition-colors">
                  <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-400 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white text-sm">این و جلسات بعدی</p>
                  <p className="text-xs text-gray-400 mt-0.5">{repeatEditDialog.meeting.series_id ? 'از این جلسه به بعد تغییر می‌کنند' : 'سری قدیمی: فقط همین نوبت قابل انتخاب است'}</p>
                </div>
              </button>
              <button onClick={async () => {
                const m = repeatEditDialog.meeting;
                if (!m.series_id) { openEditForm(m); setRepeatEditDialog(null); return; }
                const { data: allRepeat } = await supabase.from('meetings').select('id').eq('series_id', m.series_id).eq('user_id', m.user_id || '');
                if (allRepeat && allRepeat.length > 0) openEditForm({ ...m, id: m.id, _editAllIds: allRepeat.map((r: any) => r.id) } as any);
                setRepeatEditDialog(null);
              }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-right group">
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500 transition-colors">
                  <Users className="w-4 h-4 text-red-600 dark:text-red-400 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white text-sm">همه جلسات</p>
                  <p className="text-xs text-gray-400 mt-0.5">{repeatEditDialog.meeting.series_id ? 'تمام جلسات تکراری تغییر می‌کنند' : 'سری قدیمی: فقط همین نوبت قابل انتخاب است'}</p>
                </div>
              </button>
              <button onClick={() => setRepeatEditDialog(null)} className="w-full py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview popup (rendered inside CalendarViews) */}

      {/* Delete meeting confirmation modal */}
      {deleteMeetingDialog && (() => {
        const meeting = meetings.find(x => x.id === deleteMeetingDialog.id);
        const isOwner = meeting?.user_id === currentUserId;
        return (
          <Suspense fallback={null}>
            <DeleteMeetingDialog
            meeting={meeting}
            isOwner={isOwner}
            onConfirmRevert={() => handleDeleteMeetingConfirm('revert')}
            onConfirmFull={() => handleDeleteMeetingConfirm('full')}
            onClose={() => setDeleteMeetingDialog(null)}
            />
          </Suspense>
        );
      })()}

      {/* Month day popup */}
      {monthDayPopup && (() => {
        const { jy, jm, jd, x, y } = monthDayPopup;
        const dm = getMeetings(jy, jm, jd);
        const occ = getOccasionsForDay(jy, jm, jd);
        const dayEvs = getAllDayEventsForDay(jy, jm, jd);
        return (
          <div className="fixed inset-0 z-[55] pointer-events-none" dir="rtl">
            <div ref={monthDayPopupRef}
              className="pointer-events-auto absolute bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 w-72 max-h-80 flex flex-col overflow-hidden"
              style={{
                top: Math.min(y + 4, window.innerHeight - 340),
                left: Math.min(x, window.innerWidth - 300),
              }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${isToday(jy, jm, jd) ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white'}`}>{jd}</div>
                  <div>
                    <p className="text-sm font-semibold dark:text-white">{JALAALI_MONTHS[jm - 1]} {jy}</p>
                    <p className="text-xs text-gray-400">{dm.length} جلسه</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => { setMonthDayPopup(null); handleCreateMeetingForDay(jy, jm, jd); }}
                    title="تنظیم جلسه" aria-label="تنظیم جلسه برای این روز"
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500 transition-colors">
                    <CalendarPlus className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => { setMonthDayPopup(null); setAllDayFormDate({ jy, jm, jd }); setShowAllDayForm(true); }}
                    title="ایجاد برنامه روزانه" aria-label="ایجاد برنامه روزانه برای این روز"
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setMonthDayPopup(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                {occ.map(o => (
                  <div key={o.id} className={`px-3 py-1.5 rounded-xl text-xs font-medium ${o.is_holiday ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' : o.is_celebration ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{o.title}</div>
                ))}
                {dayEvs.map(ev => (
                  <div key={ev.id} className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between ${ev.type === 'leave' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                    <span>{ev.title}</span>
                    <button type="button" aria-label="حذف رویداد تمام‌روز" onClick={async () => { await supabase.from('all_day_events').delete().eq('id', ev.id); fetchAllDayEvents(); }} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                {dm.length === 0 && occ.length === 0 && dayEvs.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-xs">جلسه‌ای ندارد</div>
                )}
                {dm.map(m => {
                  const c = getMeetingColor(m);
                  return (
                    <button type="button" key={m.id} onClick={() => { setMonthDayPopup(null); setDetailMeeting(m); }}
                      className="w-full text-right flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold dark:text-white truncate">{m.subject}</p>
                        {m.start_time && <p className="text-[10px] text-gray-400 mt-0.5">{toFarsiTime(m.start_time)}{m.end_time ? ` – ${toFarsiTime(m.end_time)}` : ''}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                <button type="button" onClick={() => { setMonthDayPopup(null); setSelectedJy(jy); setSelectedJm(jm); setSelectedJd(jd); setViewMode('day'); }}
                  className="w-full py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors">
                  نمایش روزانه
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* All-day event form */}
      {showAllDayForm && allDayFormDate && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setShowAllDayForm(false); setAllDayFormTitle(''); setAllDayFormEndDate(null); }} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-xs overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-800 dark:text-white">رویداد کل‌روز</span>
              <button onClick={() => { setShowAllDayForm(false); setAllDayFormTitle(''); setAllDayFormEndDate(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Date range display */}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {allDayFormEndDate && (allDayFormEndDate.jy !== allDayFormDate.jy || allDayFormEndDate.jm !== allDayFormDate.jm || allDayFormEndDate.jd !== allDayFormDate.jd)
                  ? `${allDayFormDate.jd} ${JALAALI_MONTHS[allDayFormDate.jm - 1]} تا ${allDayFormEndDate.jd} ${JALAALI_MONTHS[allDayFormEndDate.jm - 1]} ${allDayFormDate.jy}`
                  : `${allDayFormDate.jd} ${JALAALI_MONTHS[allDayFormDate.jm - 1]} ${allDayFormDate.jy}`
                }
              </div>

              {/* Type selector */}
              <div className="flex gap-1.5">
                {[{ v: 'meeting', l: 'جلسه' }, { v: 'leave', l: 'مرخصی' }, { v: 'other', l: 'سایر' }].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setAllDayFormType(opt.v as any)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${allDayFormType === opt.v
                      ? opt.v === 'leave' ? 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300'
                        : opt.v === 'meeting' ? 'bg-sky-100 border-sky-300 text-sky-700 dark:bg-sky-900/30 dark:border-sky-600 dark:text-sky-300'
                        : 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>

              {/* Title input */}
              <input autoFocus type="text" value={allDayFormTitle} onChange={e => setAllDayFormTitle(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && allDayFormTitle.trim() && currentUserId) {
                    const dates = allDayFormEndDate ? jalaaliDatesBetween(allDayFormDate, allDayFormEndDate) : [allDayFormDate];
                    await supabase.from('all_day_events').insert(dates.map(dt => ({ title: allDayFormTitle.trim(), type: allDayFormType, date_jy: dt.jy, date_jm: dt.jm, date_jd: dt.jd, user_id: currentUserId })));
                    fetchAllDayEvents(); setShowAllDayForm(false); setAllDayFormTitle(''); setAllDayFormEndDate(null);
                  }
                }}
                placeholder="عنوان رویداد..."
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-600 placeholder-gray-300 dark:placeholder-gray-600" />

              {/* Save */}
              <button
                onClick={async () => {
                  if (!allDayFormTitle.trim() || !currentUserId) return;
                  const dates = allDayFormEndDate ? jalaaliDatesBetween(allDayFormDate, allDayFormEndDate) : [allDayFormDate];
                  await supabase.from('all_day_events').insert(dates.map(dt => ({ title: allDayFormTitle.trim(), type: allDayFormType, date_jy: dt.jy, date_jm: dt.jm, date_jd: dt.jd, user_id: currentUserId })));
                  fetchAllDayEvents(); setShowAllDayForm(false); setAllDayFormTitle(''); setAllDayFormEndDate(null);
                }}
                disabled={!allDayFormTitle.trim()}
                className="w-full py-2 text-sm font-semibold rounded-lg transition-colors bg-gray-800 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed">
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit calendar */}
      {showCreateCalendar && (
        <Suspense fallback={null}>
          <CreateEditCalendarModal
          editingCalendar={editingCalendar}
          form={calendarForm}
          onChange={setCalendarForm}
          onSave={handleSaveCalendar}
          onClose={() => { setShowCreateCalendar(false); setEditingCalendar(null); }}
          />
        </Suspense>
      )}

      {/* Calendar list */}
      {showCalendarList && (
        <Suspense fallback={null}>
          <CalendarListModal
          calendars={calendars}
          subscribedCalendars={subscribedCalendars}
          meetings={meetings}
          allUsers={allUsers}
          resolveName={resolveName}
          search={calendarListSearch}
          onSearchChange={setCalendarListSearch}
          onShare={cal => { handleOpenSubscriptions(cal); setShowCalendarList(false); }}
          onEdit={cal => { setEditingCalendar(cal); setCalendarForm({ name: cal.name, type: cal.type, description: cal.description || '', is_active: cal.is_active, enable_reminder: cal.enable_reminder, create_online_link: false, show_time_overlap: cal.enable_overlap, free_for_all: true, color: cal.color }); setShowCreateCalendar(true); setShowCalendarList(false); }}
          onDelete={handleDeleteCalendar}
          onClose={() => setShowCalendarList(false)}
          />
        </Suspense>
      )}

      {/* Subscriptions */}
      {showSubscriptionsModal && subscriptionsCalendar && (
        <Suspense fallback={null}>
          <SubscriptionsModal
          calendar={subscriptionsCalendar}
          subscriptions={subscriptions}
          allUsers={allUsers}
          resolveName={resolveName}
          currentUserId={currentUserId}
          subSearch={subSearch}
          subPermission={subPermission}
          onSearchChange={setSubSearch}
          onPermissionChange={setSubPermission}
          onAdd={handleAddSubscription}
          onRemove={handleRemoveSubscription}
          onUpdatePermission={handleUpdateSubPermission}
          onClose={() => setShowSubscriptionsModal(false)}
          />
        </Suspense>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden flex-row-reverse gap-0">
        {/* Content */}
        <div className="relative isolate flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top bar */}
          <div className="relative z-[200] flex-shrink-0 overflow-visible">
          <CalendarToolbar
            showMobileSidebar={showMobileSidebar}
            setShowMobileSidebar={setShowMobileSidebar}
            showDesktopSidebar={showDesktopSidebar}
            setShowDesktopSidebar={setShowDesktopSidebar}
            searchRef={searchRef}
            showSearch={showSearch}
            setShowSearch={setShowSearch}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            navigateToMeeting={navigateToMeeting}
            parseRequestDateToDateStr={parseRequestDateToDateStr}
            isRefreshing={isRefreshing}
            fetchMeetings={refreshCalendarToNow}
            navigatePrev={navigatePrev}
            navigateNext={navigateNext}
            getNavTitle={getNavTitle}
            showViewDropdown={showViewDropdown}
            setShowViewDropdown={setShowViewDropdown}
            viewMode={viewMode}
            setViewMode={setViewMode}
            VIEW_OPTIONS={VIEW_OPTIONS}
            canHideOffHours={canHideOffHours}
            prefsHideOffhours={prefs.hide_offhours}
            hideOffHours={hideOffHours}
            setHideOffHours={setHideOffHours}
            updatePrefs={updatePrefs}
            slotHeight={slotHeight}
            adjustSlotHeight={adjustSlotHeight}
          />
          </div>

          {/* View */}
          <div className="relative z-0 flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
            <CalendarViews
              viewMode={viewMode}
              selectedJy={selectedJy} selectedJm={selectedJm} selectedJd={selectedJd}
              currentJy={currentJy} currentJm={currentJm}
              currentTime={currentTime}
              currentUserId={currentUserId}
              getMeetings={getMeetings}
              getMeetingColor={getMeetingColor}
              resolveName={resolveName}
              weekDays={weekDays}
              mainMonthDays={mainMonthDays}
              listMeetings={listMeetings}
              getOccasionsForDay={getOccasionsForDay}
              getAllDayEventsForDay={getAllDayEventsForDay}
              fetchAllDayEvents={fetchAllDayEvents}
              isInAllDayDragRange={isInAllDayDragRange}
              slotHeight={slotHeight}
              totalSlots={totalSlots}
              hideOffHours={hideOffHours}
              visibleStartHour={visibleStartHour}
              visibleEndHour={visibleEndHour}
              workStartMin={workStartMin}
              workEndMin={workEndMin}
              isToday={isToday}
              isSelected={isSelected}
              toFarsiTime={toFarsiTime}
              isDragging={isDragging}
              dragStartSlot={dragStartSlot}
              dragEndSlot={dragEndSlot}
              dragDate={dragDate}
              dragMoveMeeting={dragMoveMeeting}
              dragMoveOriginalSlot={dragMoveOriginalSlot}
              dragMoveOriginalEndSlot={dragMoveOriginalEndSlot}
              dragMoveCurrentDeltaSlot={dragMoveCurrentDeltaSlot}
              dragMoveCurrentDeltaDay={dragMoveCurrentDeltaDay}
              dragMovedRef={dragMovedRef}
              setDragMoveMeeting={setDragMoveMeeting}
              setDragMoveStartY={setDragMoveStartY}
              setDragMoveStartX={setDragMoveStartX}
              setDragMoveOriginalSlot={setDragMoveOriginalSlot}
              setDragMoveOriginalEndSlot={setDragMoveOriginalEndSlot}
              setDragMoveCurrentDeltaSlot={setDragMoveCurrentDeltaSlot}
              setDragMoveCurrentDeltaDay={setDragMoveCurrentDeltaDay}
              setDragMoveOriginalDate={setDragMoveOriginalDate}
              resizeMeeting={resizeMeeting}
              resizeOriginalEndSlot={resizeOriginalEndSlot}
              resizeCurrentDelta={resizeCurrentDelta}
              setResizeMeeting={setResizeMeeting}
              setResizeStartY={setResizeStartY}
              setResizeOriginalEndSlot={setResizeOriginalEndSlot}
              setResizeCurrentDelta={setResizeCurrentDelta}
              allDayDragging={allDayDragging}
              allDayDragStart={allDayDragStart}
              allDayDragEnd={allDayDragEnd}
              setAllDayDragStart={setAllDayDragStart}
              setAllDayDragEnd={setAllDayDragEnd}
              setAllDayDragging={setAllDayDragging}
              setAllDayFormDate={setAllDayFormDate}
              setAllDayFormEndDate={setAllDayFormEndDate}
              setShowAllDayForm={setShowAllDayForm}
              timeGridRef={timeGridRef}
              timeScrollRef={timeScrollRef}
              weekGridRef={weekGridRef}
              dayGridRef={dayGridRef}
              previewRef={previewRef}
              handleGridMouseDown={handleGridMouseDown}
              handleGridMouseMove={handleGridMouseMove}
              handleGridTouchStart={handleGridTouchStart}
              handleGridTouchMove={handleGridTouchMove}
              cancelTouchDrag={cancelTouchDrag}
              commitDrag={commitDrag}
              handleHourColTouchStart={handleHourColTouchStart}
              handleHourColTouchMove={handleHourColTouchMove}
              handleHourColTouchEnd={handleHourColTouchEnd}
              adjustSlotHeight={adjustSlotHeight}
              handleEditMeeting={handleEditMeeting}
              handleBlockClick={handleBlockClick}
              setSelectedJy={setSelectedJy}
              setSelectedJm={setSelectedJm}
              setSelectedJd={setSelectedJd}
              setViewMode={setViewMode as (v: string) => void}
              setMonthDayPopup={setMonthDayPopup}
              onCreateMeetingForDay={handleCreateMeetingForDay}
              previewMeeting={previewMeeting}
              previewPos={previewPos}
              setPreviewMeeting={setPreviewMeeting}
              setDetailMeeting={setDetailMeeting}
              expandedMeetingId={expandedMeetingId}
              setExpandedMeetingId={setExpandedMeetingId}
              listScrollRef={listScrollRef}
            />
          </div>
        </div>

        {/* Sidebar — slide in/out from the right */}
        <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 overflow-hidden ${showDesktopSidebar ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}>
          <div className="w-64 h-full">
          <CalendarSidebar
            sidebarJy={sidebarJy}
            sidebarJm={sidebarJm}
            sidebarMonthDays={sidebarMonthDays}
            onSidebarPrev={() => { let nm = sidebarJm - 1, ny = sidebarJy; if (nm < 1) { nm = 12; ny--; } setSidebarJy(ny); setSidebarJm(nm); }}
            onSidebarNext={() => { let nm = sidebarJm + 1, ny = sidebarJy; if (nm > 12) { nm = 1; ny++; } setSidebarJy(ny); setSidebarJm(nm); }}
            onSidebarMonthClick={() => { setCurrentJy(sidebarJy); setCurrentJm(sidebarJm); }}
            onDayClick={day => { setSelectedJy(sidebarJy); setSelectedJm(sidebarJm); setSelectedJd(day); setCurrentJy(sidebarJy); setCurrentJm(sidebarJm); if (viewMode !== 'day') setViewMode('day'); }}
            isToday={isToday}
            isSelected={isSelected}
            getMeetingsForDay={getMeetings}
            calendars={calendars}
            subscribedCalendars={subscribedCalendars}
            enabledCalendarIds={enabledCalendarIds}
            onToggleCalendar={id => setEnabledCalendarIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
            occasionsEnabled={occasionsEnabled}
            onToggleOccasions={handleToggleOccasions}
            myGroupOpen={myGroupOpen}
            sharedGroupOpen={sharedGroupOpen}
            publicGroupOpen={publicGroupOpen}
            onMyGroupToggle={() => setMyGroupOpen(o => !o)}
            onSharedGroupToggle={() => setSharedGroupOpen(o => !o)}
            onPublicGroupToggle={() => setPublicGroupOpen(o => !o)}
            showOnlyMine={showOnlyMine}
            onShowOnlyMineChange={setShowOnlyMine}
            onNewCalendar={() => { setShowCreateCalendar(true); setEditingCalendar(null); resetCalendarForm(); }}
            onOpenCalendarList={() => setShowCalendarList(true)}
            onShareCalendar={handleOpenSubscriptions}
            onEditCalendar={cal => { setEditingCalendar(cal); setCalendarForm({ name: cal.name, type: cal.type, description: cal.description || '', is_active: cal.is_active, enable_reminder: cal.enable_reminder, create_online_link: false, show_time_overlap: cal.enable_overlap, free_for_all: true, color: cal.color }); setShowCreateCalendar(true); }}
            onDeleteCalendar={handleDeleteCalendar}
          />
          </div>
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden" dir="rtl">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
          <div className="absolute inset-y-0 right-0 w-72 bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slideInRight" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <span className="text-sm font-bold dark:text-white">تقویم‌ها</span>
              <button onClick={() => setShowMobileSidebar(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <ChevronRight className="w-5 h-5 dark:text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CalendarSidebar
                sidebarJy={sidebarJy}
                sidebarJm={sidebarJm}
                sidebarMonthDays={sidebarMonthDays}
                onSidebarPrev={() => { let nm = sidebarJm - 1, ny = sidebarJy; if (nm < 1) { nm = 12; ny--; } setSidebarJy(ny); setSidebarJm(nm); }}
                onSidebarNext={() => { let nm = sidebarJm + 1, ny = sidebarJy; if (nm > 12) { nm = 1; ny++; } setSidebarJy(ny); setSidebarJm(nm); }}
                onSidebarMonthClick={() => { setCurrentJy(sidebarJy); setCurrentJm(sidebarJm); setShowMobileSidebar(false); }}
                onDayClick={day => { setSelectedJy(sidebarJy); setSelectedJm(sidebarJm); setSelectedJd(day); setCurrentJy(sidebarJy); setCurrentJm(sidebarJm); if (viewMode !== 'day') setViewMode('day'); setShowMobileSidebar(false); }}
                isToday={isToday}
                isSelected={isSelected}
                getMeetingsForDay={getMeetings}
                calendars={calendars}
                subscribedCalendars={subscribedCalendars}
                enabledCalendarIds={enabledCalendarIds}
                onToggleCalendar={id => setEnabledCalendarIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                occasionsEnabled={occasionsEnabled}
                onToggleOccasions={handleToggleOccasions}
                myGroupOpen={myGroupOpen}
                sharedGroupOpen={sharedGroupOpen}
                publicGroupOpen={publicGroupOpen}
                onMyGroupToggle={() => setMyGroupOpen(o => !o)}
                onSharedGroupToggle={() => setSharedGroupOpen(o => !o)}
                onPublicGroupToggle={() => setPublicGroupOpen(o => !o)}
                showOnlyMine={showOnlyMine}
                onShowOnlyMineChange={setShowOnlyMine}
                onNewCalendar={() => { setShowCreateCalendar(true); setEditingCalendar(null); resetCalendarForm(); setShowMobileSidebar(false); }}
                onOpenCalendarList={() => { setShowCalendarList(true); setShowMobileSidebar(false); }}
                onShareCalendar={cal => { handleOpenSubscriptions(cal); setShowMobileSidebar(false); }}
                onEditCalendar={cal => { setEditingCalendar(cal); setCalendarForm({ name: cal.name, type: cal.type, description: cal.description || '', is_active: cal.is_active, enable_reminder: cal.enable_reminder, create_online_link: false, show_time_overlap: cal.enable_overlap, free_for_all: true, color: cal.color }); setShowCreateCalendar(true); setShowMobileSidebar(false); }}
                onDeleteCalendar={id => { handleDeleteCalendar(id); setShowMobileSidebar(false); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Move change decision dialog */}
      {pendingMove && (
        <Suspense fallback={null}>
          <MoveConfirmDialog
            pendingMove={pendingMove}
            committing={isMoveCommitting}
            onCommitWithNotify={() => commitMove(true)}
            onCommitWithoutNotify={() => commitMove(false)}
            onReturnToEdit={returnMoveToEdit}
            onCancel={() => setPendingMove(null)}
          />
        </Suspense>
      )}

      {/* Resize change decision dialog */}
      {pendingResize && (
        <Suspense fallback={null}>
          <ResizeConfirmDialog
            pendingResize={pendingResize}
            committing={isResizeCommitting}
            onCommitWithNotify={() => commitResize(true)}
            onCommitWithoutNotify={() => commitResize(false)}
            onReturnToEdit={returnResizeToEdit}
            onCancel={() => setPendingResize(null)}
          />
        </Suspense>
      )}

      {/* Meeting Inbox FAB — fixed bottom-right, only visible on calendar page */}
      <MeetingInboxButton currentUserId={currentUserId} />
    </div>
  );
}
