import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inpMono } from './types';

export function Toggle({ value, onChange, color = 'bg-blue-500' }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${value ? color : 'bg-gray-200 dark:bg-gray-600'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export function FieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </span>
      {hint && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <form className="relative" onSubmit={event => event.preventDefault()}>
      <input
        className={inpMono + ' pl-10'}
        name="channel-secret" aria-label={placeholder || 'کلید محرمانه'} autoComplete="new-password"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        dir="ltr"
      />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </form>
  );
}

export function SectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</span>
      {badge && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-700">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
    </div>
  );
}
