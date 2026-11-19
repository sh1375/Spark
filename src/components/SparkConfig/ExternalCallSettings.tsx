import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { CredentialIdentityField } from '../ui/CredentialIdentityField';

const labels = { audio: 'تماس صوتی', video: 'تماس تصویری', conference: 'ویدئوکنفرانس' };

interface Connection {
  capability: keyof typeof labels;
  endpoint: string;
  has_key: boolean;
  alert_timing: 'immediate' | 'unanswered';
  sms_enabled: boolean;
  bale_enabled: boolean;
  sms_template: string;
  bale_template: string;
}

function ConnectionForm({ initial }: { initial: Connection }) {
  const [settings, setSettings] = useState(initial);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const inputClass = 'mt-1 w-full rounded-lg border bg-transparent p-2 text-sm';
  return (
    <form className="space-y-3 rounded-xl border p-4" onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const { error } = await (supabase as any).rpc('save_external_call_connection_v2', {
          p_alert_timing: settings.alert_timing, p_capability: settings.capability, p_endpoint: settings.endpoint, p_key: key || null,
          p_sms_enabled: settings.sms_enabled, p_bale_enabled: settings.bale_enabled,
          p_sms_template: settings.sms_template, p_bale_template: settings.bale_template,
        });
        if (error) throw error;
        setSettings(current => ({ ...current, has_key: current.has_key || Boolean(key) }));
        setKey('');
        toast.success('تنظیمات ذخیره شد');
      } catch {
        toast.error('ذخیره انجام نشد. نشانی HTTPS و کلید مربوط به آن را بررسی کنید.');
      } finally { setSaving(false); }
    }}>
      <fieldset disabled={saving} className="space-y-3">
        <legend className="font-bold">{labels[settings.capability]}</legend>
        <CredentialIdentityField identity={settings.capability} />
        <label className="block">سرویس تماس
          <select className={inputClass} name="provider" value={settings.endpoint.replace(/\/$/, '') === 'https://api.daily.co/v1' ? 'daily' : ''}
            onChange={e => setSettings({ ...settings, endpoint: e.target.value === 'daily' ? 'https://api.daily.co/v1' : '' })}>
            <option value="">انتخاب سرویس</option>
            <option value="daily">Daily</option>
          </select>
        </label>
        <label className="block">نشانی API سرویس
          <input className={inputClass} type="url" dir="ltr" name="endpoint" value={settings.endpoint}
            onChange={e => setSettings({ ...settings, endpoint: e.target.value })} />
        </label>
        <label className="block">کلید API {settings.has_key && ' (کلید ذخیره شده است)'}
          <input className={inputClass} type="password" autoComplete="new-password" dir="ltr" name="api_key"
            value={key} onChange={e => setKey(e.target.value)} />
        </label>
        <label className="block">زمان ارسال پیامک و بله
          <select name="alert_timing" className={inputClass} value={settings.alert_timing} onChange={e => setSettings({ ...settings, alert_timing: e.target.value as Connection['alert_timing'] })}>
            <option value="immediate">هم‌زمان با دعوت در اسپارک</option>
            <option value="unanswered">اگر تا ۳۰ ثانیه به دعوت پاسخ داده نشد</option>
          </select>
        </label>
        {(['sms', 'bale'] as const).map(channel => {
          const title = channel === 'sms' ? 'پیامک' : 'بله';
          const enabled = `${channel}_enabled` as const;
          const template = `${channel}_template` as const;
          return <div key={channel} className="space-y-1">
            <label className="flex items-center gap-2">
              <input name={enabled} type="checkbox" checked={settings[enabled]}
                onChange={e => setSettings({ ...settings, [enabled]: e.target.checked })} />
              ارسال از طریق {title}
            </label>
            <label className="block">متن {title}
              <textarea required className={inputClass} name={template} value={settings[template]}
                onChange={e => setSettings({ ...settings, [template]: e.target.value })} />
            </label>
          </div>;
        })}
        <button type="submit" className="rounded-lg bg-violet-700 px-4 py-2 text-white">ذخیره</button>
      </fieldset>
    </form>
  );
}

export function ExternalCallSettings() {
  const [rows, setRows] = useState<Connection[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_external_call_connections_v2');
        if (error) throw error;
        if (active) setRows(data);
      } catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, []);
  if (failed) return <p role="alert">دریافت تنظیمات اتصال به دسترسی مدیر سامانه نیاز دارد. دسترسی و ارتباط با سرور را بررسی کنید.</p>;
  if (!rows.length) return <p role="status">در حال دریافت تنظیمات تماس…</p>;
  return <section className="space-y-4">
    <h3 className="font-bold">اتصال به سرویس تماس بیرونی</h3>
    <p className="text-sm">برای فعال‌سازی هر قابلیت، Daily را انتخاب و کلید API آن را ذخیره کنید.</p>
    {rows.map(row => <ConnectionForm key={row.capability} initial={row} />)}
  </section>;
}
