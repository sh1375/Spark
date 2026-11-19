import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, LogOut, MonitorSmartphone, RefreshCw, Search, Wifi, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLiveData } from '../../shared/realtime/useLiveData';
import { describeUserAgent } from '../UserGroups/eventClientContext';
import { elapsed, sessionDate } from '../../features/auth/components/sessionPresentation';
import { listCurrentUserTotpFactors, performTotpStepUp, type TotpFactor } from '../../features/auth/services/mfaOperations';
import { groupOnlineSessions, type OnlineSession } from './onlineSessionModel';
import toast from 'react-hot-toast';
const button='inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 px-3 py-2 text-xs disabled:opacity-50 dark:border-gray-700';
export function OnlineUsersPanel({ currentUserId }: { currentUserId: string }) {
  const [rows,setRows]=useState<OnlineSession[]>([]),[search,setSearch]=useState(''),[automatic,setAutomatic]=useState(true);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[canRevoke,setCanRevoke]=useState(false),[more,setMore]=useState(false);
  const [serverTime,setServerTime]=useState(Date.now());
  const [target,setTarget]=useState<{userId:string;sessionId:string|null;name:string}|null>(null);
  const [reason,setReason]=useState('خروج به درخواست مدیر سامانه'),[busy,setBusy]=useState(false);
  const [factors,setFactors]=useState<TotpFactor[]>([]),[factorId,setFactorId]=useState(''),[code,setCode]=useState(''),[modalError,setModalError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),request=useRef(0);
  const load=useCallback(async()=>{
    const id=++request.current;setLoading(true);
    try {
      const {data,error}=await supabase.rpc('get_online_sessions_v1' as never,{p_search:search} as never);
      if(id!==request.current)return;
      if(error)throw error;
      const result=data as unknown as {sessions:OnlineSession[];can_revoke:boolean;has_more:boolean;server_time:string};
      setRows(result.sessions);setCanRevoke(result.can_revoke);setMore(result.has_more);setServerTime(Date.parse(result.server_time));setError('');
    } catch {if(id===request.current)setError('به‌روزرسانی نشست‌ها ناموفق بود؛ نتایج قبلی ممکن است قدیمی باشند. اتصال، مجوز و به‌روزرسانی دیتابیس را بررسی کنید.');}
    finally{if(id===request.current)setLoading(false);}
  },[search]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer);},[load]);
  useEffect(()=>{if(!automatic)return;const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!target)void load();},30000);return()=>clearInterval(timer);},[automatic,load,target]);
  useLiveData(['user_presence','session_security_state'],async()=>{if(automatic&&!target)await load();});
  useEffect(()=>{const d=dialog.current;if(target&&!d?.open)d?.showModal();else if(!target&&d?.open)d.close();},[target]);
  const begin=(userId:string,sessionId:string|null,name:string)=>{setReason('خروج به درخواست مدیر سامانه');setFactors([]);setCode('');setModalError('');setTarget({userId,sessionId,name});};
  const revoke=async()=>{
    if(!target||!reason.trim())return;setBusy(true);setModalError('');
    try{
      if(factors.length){
        const grant=await performTotpStepUp({factorId,code,purpose:'account_security_change'});
        if(!grant.ok){setModalError('کد تأیید صحیح نیست یا دسترسی تأیید نشد.');return;}
      }
      const {data,error}=await supabase.rpc('revoke_online_sessions_v1' as never,{p_user_id:target.userId,p_session_id:target.sessionId,p_reason:reason.trim()} as never);
      if(error){
        if(error.message?.includes('STEP_UP_REQUIRED')){
          const available=(await listCurrentUserTotpFactors()).filter(f=>f.status==='verified');
          setFactors(available);setFactorId(available[0]?.id||'');
          setModalError(available.length?'کد برنامهٔ احراز هویت مدیر را وارد کنید.':'این عملیات به تأیید دومرحله‌ای مدیر امنیت نیاز دارد؛ ابتدا برنامهٔ احراز هویت را در پروفایل فعال کنید.');return;
        }
        setModalError(error.message?.includes('FORBIDDEN')?'مجوز اخراج نشست ندارید.':'اخراج نشست انجام نشد؛ دوباره بررسی کنید.');return;
      }
      const count=(data as unknown as {revoked_count:number}).revoked_count;
      toast.success(count?'دسترسی نشست‌های انتخاب‌شده قطع شد.':'نشست فعالی برای قطع دسترسی باقی نمانده است.');
      setTarget(null);await load();
    }catch{setModalError('ارتباط با سرور یا تأیید دومرحله‌ای ناموفق بود؛ دوباره تلاش کنید.');}finally{setBusy(false);}
  };
  const users=groupOnlineSessions(rows);
  return <section className="space-y-4" dir="rtl" aria-label="کاربران آنلاین و نشست‌های فعال">
    <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold text-gray-800 dark:text-white"><Wifi className="h-5 w-5 text-green-500" />کاربران آنلاین</h3><button type="button" onClick={()=>void load()} disabled={loading} className={button}><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`} />به‌روزرسانی</button></header>
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400"><span>{users.length.toLocaleString('fa-IR')} کاربر · {rows.length.toLocaleString('fa-IR')} نشست در نتایج</span><label className="flex items-center gap-2"><input name="online-auto-refresh" type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)} />به‌روزرسانی خودکار هر ۳۰ ثانیه</label></div>
    <p className="text-xs leading-6 text-gray-500 dark:text-gray-400">فقط نشست‌های معتبر با ارتباط در ۳ دقیقهٔ اخیر نمایش داده می‌شوند. IP هر نشست از آخرین درخواست تأییدشدهٔ همان دستگاه گرفته می‌شود. قطع دسترسی نیازمند مجوز و تأیید دومرحله‌ای مدیر امنیت است.</p>
    <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 dark:border-gray-700"><Search className="h-4 w-4 shrink-0 text-gray-400" /><input name="online-user-search" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی نام، IP، مرورگر یا دستگاه" aria-label="جست‌وجوی کاربران آنلاین" className="w-full min-w-0 bg-transparent py-3 text-sm outline-none dark:text-white" /></label>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {more&&<p className="text-xs text-amber-700">۲۰۰ نشست نخست نمایش داده شده؛ با جست‌وجو نتایج را محدود کنید.</p>}
    {!rows.length&&!loading&&!error&&<p className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500 dark:bg-gray-800">نشست آنلاینی در نتایج وجود ندارد.</p>}
    <div className="grid gap-4 xl:grid-cols-2">{users.map(({userId,sessions,profile})=><article key={userId} className="min-w-0 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words font-semibold text-gray-800 dark:text-white">{profile.full_name||'کاربر بدون نام'} {profile.is_admin&&<span className="text-xs text-blue-600">· مدیر</span>}</h4><p dir="auto" className="mt-1 break-all text-xs text-gray-500">{profile.email}</p>{profile.position&&<p className="text-xs text-gray-500">{profile.position}</p>}</div>{canRevoke&&userId!==currentUserId&&sessions.length>1&&<button type="button" className={`${button} text-red-600`} onClick={()=>begin(userId,null,profile.full_name||'کاربر')}>خروج همهٔ نشست‌های کاربر</button>}</header>
      <div className="space-y-3">{sessions.map(s=>{const device=describeUserAgent(s.device_summary,s.client_hints||{});return <div key={s.session_id} className="rounded-xl bg-gray-50 p-3 text-xs dark:bg-gray-800">
        <div className="flex items-start justify-between gap-2"><p className="flex min-w-0 items-start gap-2 break-words leading-6 text-gray-700 dark:text-gray-200"><MonitorSmartphone className="mt-1 h-4 w-4 shrink-0" />{device.os} · {device.browser}</p>{s.is_current&&<span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[10px] text-blue-700">همین نشست</span>}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-gray-500">IP فعال:</span><bdi className="break-all font-mono text-gray-900 dark:text-gray-100">{s.ip_address||'IP تأییدشدهٔ اخیر ثبت نشده'}</bdi>{s.ip_address&&<button type="button" aria-label={`کپی IP ${s.ip_address}`} onClick={()=>{if(!navigator.clipboard){toast.error('کپی IP در این مرورگر در دسترس نیست.');return;}void navigator.clipboard.writeText(s.ip_address!).then(()=>toast.success('IP کپی شد.')).catch(()=>toast.error('کپی IP انجام نشد.'));}} className="rounded p-1 text-gray-500"><Copy className="h-3.5 w-3.5" /></button>}</div>
        <p className="mt-2 leading-6 text-gray-500">آخرین ارتباط: {sessionDate(s.last_seen)} · {elapsed(s.last_seen,serverTime)} قبل</p><p className="leading-6 text-gray-500">شروع نشست: {sessionDate(s.created_at)}</p>
        {canRevoke&&userId!==currentUserId&&<button type="button" onClick={()=>begin(userId,s.session_id,profile.full_name||'کاربر')} className={`${button} mt-2 text-red-600`}><LogOut className="h-4 w-4" />بیرون کردن این نشست</button>}
      </div>;})}</div>
    </article>)}</div>
    <dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else setTarget(null);}} onClose={()=>{if(!busy)setTarget(null);}} aria-labelledby="revoke-online-title" dir="rtl" className="m-auto w-[min(460px,94vw)] rounded-2xl bg-white p-5 text-gray-800 shadow-xl backdrop:bg-black/50 dark:bg-gray-900 dark:text-white">
      <header className="flex items-center justify-between gap-3"><h4 id="revoke-online-title" className="font-bold">قطع دسترسی نشست</h4><button type="button" disabled={busy} aria-label="انصراف از اخراج نشست" onClick={()=>setTarget(null)}><X className="h-5 w-5" /></button></header>
      <p className="my-4 text-sm leading-7">{target?.sessionId?'نشست انتخاب‌شدهٔ':'همهٔ نشست‌های فعالِ'} {target?.name} قطع می‌شود. کاربر برای ادامه باید دوباره وارد شود.</p>
      <label className="block text-xs">علت اخراج<input name="online-revoke-reason" value={reason} maxLength={240} onChange={e=>setReason(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent p-2 text-sm" /></label>
      {factors.length>0&&<div className="mt-3 space-y-2">{factors.length>1&&<select name="online-auth-factor" aria-label="برنامهٔ احراز هویت مدیر" value={factorId} onChange={e=>setFactorId(e.target.value)} className="w-full rounded border bg-transparent p-2">{factors.map((f,i)=><option key={f.id} value={f.id}>برنامهٔ احراز هویت {i+1}</option>)}</select>}<input name="online-admin-otp" autoComplete="one-time-code" inputMode="numeric" aria-label="کد تأیید دومرحله‌ای مدیر" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="کد ۶ رقمی مدیر" className="w-full rounded border bg-transparent p-2 text-center" /></div>}
      {modalError&&<p role="alert" className="mt-3 text-xs leading-6 text-red-600">{modalError}</p>}
      <div className="mt-4 flex gap-3"><button type="button" disabled={busy||!reason.trim()||(factors.length>0&&code.length!==6)} onClick={()=>void revoke()} className={`${button} bg-red-600 text-white`}>{busy?'در حال قطع دسترسی...':'تأیید و قطع دسترسی'}</button><button type="button" disabled={busy} onClick={()=>setTarget(null)} className={button}>انصراف</button></div>
    </dialog>
  </section>;
}
