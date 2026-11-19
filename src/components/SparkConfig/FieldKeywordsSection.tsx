import { useId, useState } from 'react';
import { Info, Plus, X, Save, Trash2, Settings, Mic, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { FieldKeyword } from './types';
import { Spinner } from './constants';

export function FieldKeywordsSection({
  module, fieldKeywords, onRefresh,
}: { module: string; fieldKeywords: FieldKeyword[]; onRefresh: () => void }) {
  const fieldId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKw, setNewKw] = useState('');
  const [editForm, setEditForm] = useState<Partial<FieldKeyword>>({});
  const [newForm, setNewForm] = useState<Partial<FieldKeyword>>({
    module, field_key: '', field_label: '', extract_keywords: [], example: '', sort_order: 0,
  });
  const [newFieldKw, setNewFieldKw] = useState('');

  const myFields = fieldKeywords.filter(f => f.module === module).sort((a, b) => a.sort_order - b.sort_order);

  const startEdit = (f: FieldKeyword) => {
    setEditingId(f.id); setEditForm({ ...f }); setNewKw('');
  };
  const cancelEdit = () => { setEditingId(null); setEditForm({}); setNewKw(''); };

  const saveField = async () => {
    if (!editForm.field_key || !editForm.field_label) { toast.error('کلید فیلد و برچسب الزامی است'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('spark_field_keywords').update({
        field_label: editForm.field_label,
        extract_keywords: editForm.extract_keywords,
        example: editForm.example,
        sort_order: editForm.sort_order,
      }).eq('id', editingId!);
      if (error) { toast.error('خطا: ' + error.message); return; }
      toast.success('ذخیره شد');
      cancelEdit(); onRefresh();
    } finally { setSaving(false); }
  };

  const addNewField = async () => {
    if (!newForm.field_key?.trim() || !newForm.field_label?.trim()) { toast.error('کلید و برچسب الزامی است'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('spark_field_keywords').insert([{
        ...newForm, module, sort_order: myFields.length + 1,
      }]);
      if (error) { toast.error('خطا: ' + error.message); return; }
      toast.success('فیلد افزوده شد');
      setAddingNew(false);
      setNewForm({ module, field_key: '', field_label: '', extract_keywords: [], example: '', sort_order: 0 });
      setNewFieldKw(''); onRefresh();
    } finally { setSaving(false); }
  };

  const deleteField = async (id: string) => {
    if (!confirm('حذف این فیلد؟')) return;
    await supabase.from('spark_field_keywords').delete().eq('id', id);
    toast.success('حذف شد'); onRefresh();
  };

  const addKwToEdit = () => {
    const kw = newKw.trim();
    if (!kw || editForm.extract_keywords?.includes(kw)) { setNewKw(''); return; }
    setEditForm(f => ({ ...f, extract_keywords: [...(f.extract_keywords || []), kw] }));
    setNewKw('');
  };

  const addKwToNew = () => {
    const kw = newFieldKw.trim();
    if (!kw || newForm.extract_keywords?.includes(kw)) { setNewFieldKw(''); return; }
    setNewForm(f => ({ ...f, extract_keywords: [...(f.extract_keywords || []), kw] }));
    setNewFieldKw('');
  };

  const inp = 'w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <Info className="w-3.5 h-3.5" />
          نگاشت کلیدواژه به فیلدها
        </div>
        <button onClick={() => { setAddingNew(true); setEditingId(null); }}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-medium transition-colors">
          <Plus className="w-3 h-3" /> فیلد جدید
        </button>
      </div>

      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        وقتی اسپارک دستور شما را می‌شنود، کلیدواژه‌های فیلد را پیدا می‌کند و متن بعد از آن‌ها را در فرم قرار می‌دهد.
        <br />
        <strong>مثال:</strong> «موضوع» → هر چیزی بعد از کلمه «موضوع» در فیلد موضوع قرار می‌گیرد.
      </div>

      {addingNew && (
        <div className="p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">افزودن فیلد جدید</p>
            <button onClick={() => setAddingNew(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fieldId}-new-field`} className="block text-xs text-gray-500 mb-1">کلید فیلد (انگلیسی)*</label>
              <input id={`${fieldId}-new-field`} className={inp} placeholder="مثال: subject" dir="ltr"
                value={newForm.field_key || ''} onChange={e => setNewForm(f => ({ ...f, field_key: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={`${fieldId}-new-label`} className="block text-xs text-gray-500 mb-1">برچسب فارسی*</label>
              <input id={`${fieldId}-new-label`} className={inp} placeholder="مثال: موضوع جلسه"
                value={newForm.field_label || ''} onChange={e => setNewForm(f => ({ ...f, field_label: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label htmlFor={`${fieldId}-new-keyword`} className="block text-xs text-gray-500 mb-1">کلیدواژه‌های تشخیص</label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {(newForm.extract_keywords || []).map(kw => (
                  <span key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs border border-blue-200 dark:border-blue-700">
                    {kw}
                    <button onClick={() => setNewForm(f => ({ ...f, extract_keywords: (f.extract_keywords || []).filter(k => k !== kw) }))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input id={`${fieldId}-new-keyword`} className={inp} placeholder="کلیدواژه جدید..." value={newFieldKw}
                  onChange={e => setNewFieldKw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKwToNew())} />
                <button onClick={addKwToNew} className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="col-span-2">
              <label htmlFor={`${fieldId}-new-example`} className="block text-xs text-gray-500 mb-1">مثال دستور</label>
              <input id={`${fieldId}-new-example`} className={inp} placeholder="مثال: موضوع: بررسی گزارش مالی"
                value={newForm.example || ''} onChange={e => setNewForm(f => ({ ...f, example: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addNewField} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              {saving ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} افزودن
            </button>
            <button onClick={() => setAddingNew(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm">انصراف</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {myFields.map(f => (
          <div key={f.id} className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            {editingId === f.id ? (
              <div className="p-4 space-y-3 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">ویرایش: {f.field_label}</p>
                  <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div>
                  <label htmlFor={`${fieldId}-edit-label`} className="block text-xs text-gray-500 mb-1">برچسب فارسی</label>
                  <input id={`${fieldId}-edit-label`} className={inp} value={editForm.field_label || ''} onChange={e => setEditForm(ef => ({ ...ef, field_label: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-edit-keyword`} className="block text-xs text-gray-500 mb-1">کلیدواژه‌های تشخیص</label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    {(editForm.extract_keywords || []).map(kw => (
                      <span key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs border border-blue-200 dark:border-blue-700">
                        {kw}
                        <button onClick={() => setEditForm(ef => ({ ...ef, extract_keywords: (ef.extract_keywords || []).filter(k => k !== kw) }))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input id={`${fieldId}-edit-keyword`} className={inp} placeholder="کلیدواژه جدید..." value={newKw}
                      onChange={e => setNewKw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKwToEdit())} />
                    <button onClick={addKwToEdit} className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`${fieldId}-edit-example`} className="block text-xs text-gray-500 mb-1">مثال دستور</label>
                  <input id={`${fieldId}-edit-example`} className={inp} placeholder="مثال..." value={editForm.example || ''}
                    onChange={e => setEditForm(ef => ({ ...ef, example: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveField} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                    {saving ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} ذخیره
                  </button>
                  <button onClick={cancelEdit} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm">انصراف</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">{f.field_label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono">{f.field_key}</span>
                  </div>
                  {f.extract_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {f.extract_keywords.map(kw => (
                        <span key={kw} className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[11px] border border-blue-100 dark:border-blue-800">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  {f.example && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      <Mic className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      «{f.example}»
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(f)}
                    className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="ویرایش">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteField(f.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="حذف">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {myFields.length === 0 && !addingNew && (
          <div className="py-5 text-center text-gray-400 text-xs">
            هیچ فیلدی تعریف نشده. روی «فیلد جدید» کلیک کنید.
          </div>
        )}
      </div>
    </div>
  );
}
