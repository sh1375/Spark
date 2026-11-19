import { ReorderableAgendaList } from '../../../../components/Agenda/ReorderableAgendaList';
import { reorderMeetingAgenda } from '../../../../components/Agenda/reorderAgenda';
import { useState } from 'react';
import { AgendaDecisionPicker } from '../../../../components/Agenda/AgendaDecisionPicker';
import { LinkedDecisionDialog } from '../../../../components/Agenda/LinkedDecisionDialog';
import { linkedDecisionAgendaDescription, linkedDecisionAgendaTitle, type PickerDecision } from '../../../../lib/linkedAgendaDecisions';
import { ClipboardList, Pencil, Trash2, Check, Plus, UserCheck, Clock } from 'lucide-react';
import type { AgendaItem } from '../../../../types';

type AgendaDraftItem = Omit<AgendaItem, 'id' | 'meeting_id' | 'created_at'>;

export interface AgendaEditorProps {
  enabled: boolean;
  items: AgendaDraftItem[];
  participantNames: string[];
  externalNames: string[];

  onEnabledChange: (enabled: boolean) => void;
  onItemsChange: (items: AgendaDraftItem[]) => void;
  onValidationError?: (message: string) => void;
}

export function AgendaEditor({
  enabled,
  items,
  participantNames,
  externalNames,
  onEnabledChange,
  onItemsChange,
  onValidationError,
}: AgendaEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', presenter: '', duration_minutes: '' });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const addDecisions = (decisions: PickerDecision[]) => {
    const seen = new Set(items.map(item => (item as AgendaDraftItem & { source_decision_id?: string | null }).source_decision_id).filter(Boolean));
    const next = [...items];
    for (const decision of decisions) {
      if (seen.has(decision.id)) continue;
      seen.add(decision.id);
      next.push({
        id: crypto.randomUUID(),
        title: linkedDecisionAgendaTitle(decision), presenter: null,
        duration_minutes: null, description: linkedDecisionAgendaDescription(decision), sort_order: next.length,
        source_decision_id: decision.id,
      } as AgendaDraftItem);
    }
    onItemsChange(next);
  };

  return (
    <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="checkbox"
          id="agendaToggle"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
        <label htmlFor="agendaToggle" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> دستور جلسه
        </label>
        <button type="button" onClick={() => { onEnabledChange(true); setPickerOpen(true); }} className="ms-auto rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-700 dark:border-blue-700 dark:text-blue-300">افزودن از پیگیری مصوبات</button>
      </div>

      {enabled && (
        <div className="space-y-3 mt-3">
          {items.length > 0 && (
            <ReorderableAgendaList items={items} disabled={showForm} onMove={(from, to) => onItemsChange(reorderMeetingAgenda(items, from, to))}>
              {(item, idx, handle) => (
                <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-sm">
                  {handle}
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="break-words font-medium text-gray-800 dark:text-white">{item.title}</p>
                    {(item as { source_decision_id?: string | null }).source_decision_id && item.description && (
                      <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                    )}
                    {(item as AgendaDraftItem & { source_decision_id?: string | null }).source_decision_id && (
                      <button type="button" className="mt-1 text-xs text-blue-600 hover:underline" onClick={() => setDetailId((item as AgendaDraftItem & { source_decision_id: string }).source_decision_id)}>مشاهده مصوبه اصلی</button>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                      {item.presenter && <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" />{item.presenter}</span>}
                      {item.duration_minutes != null && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.duration_minutes} دقیقه</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ title: item.title, presenter: item.presenter || '', duration_minutes: item.duration_minutes != null ? String(item.duration_minutes) : '' });
                      setEditingIndex(idx);
                      setShowForm(true);
                    }}
                    className="p-1 text-gray-400 hover:text-amber-500 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onItemsChange(items.filter((_, i) => i !== idx))}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </ReorderableAgendaList>
          )}

          {showForm ? (
            <div className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-blue-200 dark:border-blue-700 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">عنوان دستور جلسه <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  placeholder="مثال: بررسی گزارش مالی"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">ارائه‌دهنده</label>
                  <select
                    value={form.presenter}
                    onChange={e => setForm(f => ({ ...f, presenter: e.target.value }))}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  >
                    <option value="">انتخاب ارائه‌دهنده...</option>
                    {participantNames.length > 0 && (
                      <optgroup label="شرکت‌کنندگان سازمان">
                        {participantNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </optgroup>
                    )}
                    {externalNames.length > 0 && (
                      <optgroup label="افراد خارج سازمان">
                        {externalNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">مدت زمان (دقیقه)</label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="مثال: 20"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!form.title.trim()) { onValidationError?.('عنوان دستور جلسه را وارد کنید'); return; }
                    const newItem = {
                      ...(editingIndex !== null ? items[editingIndex] : {}),
                      title: form.title.trim(),
                      presenter: form.presenter.trim() || null,
                      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
                      sort_order: 0,
                    };
                    if (editingIndex !== null) {
                      onItemsChange(items.map((it, i) => i === editingIndex ? newItem : it));
                      setEditingIndex(null);
                    } else {
                      onItemsChange([...items, newItem]);
                    }
                    setForm({ title: '', presenter: '', duration_minutes: '' });
                    setShowForm(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {editingIndex !== null ? 'ذخیره ویرایش' : 'افزودن دستور جلسه'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingIndex(null); setForm({ title: '', presenter: '', duration_minutes: '' }); }}
                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  انصراف
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setShowForm(true); setEditingIndex(null); setForm({ title: '', presenter: '', duration_minutes: '' }); }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" /> ایجاد دستور جلسه
            </button>
            </div>
          )}
          {pickerOpen && <AgendaDecisionPicker existingIds={items.map(item => (item as AgendaDraftItem & { source_decision_id?: string | null }).source_decision_id).filter((id): id is string => !!id)} onSelect={addDecisions} onClose={() => setPickerOpen(false)} />}
          {detailId && <LinkedDecisionDialog decisionId={detailId} onClose={() => setDetailId(null)} />}
        </div>
      )}
    </div>
  );
}
