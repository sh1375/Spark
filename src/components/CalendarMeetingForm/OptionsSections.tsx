import { Video, MessageSquare, Save } from 'lucide-react';

export function OnlineMeetingSection(props: {
  isOnline: boolean;
  setIsOnline: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { isOnline, setIsOnline } = props;
  return (
    <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-gray-50 dark:bg-gray-700/30">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Video className="w-4 h-4" />
        این جلسه به صورت آنلاین برگزار می‌گردد
      </span>
      <input type="checkbox" checked={isOnline} onChange={event => setIsOnline(event.target.checked)} />
    </label>
  );
}

export function SmsOptionsSection(props: {
  recurring?: boolean;
  sendSms: boolean;
  setSendSms: React.Dispatch<React.SetStateAction<boolean>>;
  saveContact: boolean;
  setSaveContact: React.Dispatch<React.SetStateAction<boolean>>;
  repFromContacts: boolean;
  representative: string;
}) {
  const { sendSms, setSendSms, saveContact, setSaveContact, repFromContacts, representative, recurring } = props;
  return (
    <div className="space-y-2">
      {recurring ? <p className="text-sm text-gray-600 dark:text-gray-300">ارسال پیامک به مخاطبان جلسات تکرارشونده مطابق تنظیمات پیامک سامانه انجام می‌شود.</p> : <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={sendSms} onChange={e=>setSendSms(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" />ارسال پیامک</span>
      </label>}
      {!repFromContacts && representative.trim() && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={saveContact} onChange={e=>setSaveContact(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
          <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Save className="w-4 h-4" />ذخیره اطلاعات تماس در دفترچه</span>
        </label>
      )}
    </div>
  );
}
