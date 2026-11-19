import { minutesToTime } from '../../src/components/Calendar/utils';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {transform} from 'esbuild';
import {persistCalendarTiming,meetingTimingPlaceholders} from '../../src/components/Calendar/persistCalendarTiming';
import {renderSystemSmsTemplate} from '../../supabase/functions/send-sms/templateRenderer';
test('persistence requires one actual row and rejects RLS-filtered empty updates',async()=>{
 const client=(data:unknown,error:unknown)=>({rpc:async(name:string,args:any)=>{
   assert.equal(name,'save_calendar_meeting_changes_v1');
   assert.equal(args.p_notify,true);
   return {data,error};
 }}) as Parameters<typeof persistCalendarTiming>[0];
 await assert.rejects(()=>persistCalendarTiming(client(null,null),'m',{},true),/NOT_SAVED/);
 await assert.rejects(()=>persistCalendarTiming(client(null,new Error('denied')),'m',{},true),/denied/);
 const row={id:'m',start_time:'09:15',end_time:'10:45'};
 assert.equal(await persistCalendarTiming(client([row],null),'m',{},true),row);
});
test('meeting SMS receives both explicit clock fields and an identity',async()=>{
 const context=meetingTimingPlaceholders({id:'m',start_time:'09:15',end_time:'10:45'});
 const supabase={from(){const query:any={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:{id:'template',body:'{{start_time}} تا {{end_time}}'}})};return query;}};
 const result=await renderSystemSmsTemplate({supabase,category:'meeting',eventType:'change',audience:'observers',context});
 assert.equal(result.ok,true);if(result.ok)assert.equal(result.text,'09:15 تا 10:45');assert.equal(context.meeting_id,'m');
});
const source=readFileSync('src/components/CalendarPageCore.tsx','utf8');
for(const mode of ['Move','Resize'])test(`${mode} notifies only after successful persistence using returned times and meeting ID`,async()=>{
 const a=source.indexOf(`  const commit${mode} =`),b=source.indexOf(`  const return${mode}ToEdit`,a);const code=(await transform(source.slice(a,b).replace(`const commit${mode} =`,'globalThis.commit ='),{loader:'ts'})).code;
 for(const failed of [false,true]){
 const meeting={id:'m',subject:'جلسه',start_time:'08:15',end_time:'09:45',participant_user_ids:['p'],notify_users:['o']};
 const saved={id:'m',start_time:'10:15',end_time:'11:45',request_date:'2026-11-07',timing_changed:true};const notices:any[]=[];const dispatched:string[]=[];let refreshed=0;
 const sandbox:any={pendingMove:{meeting,updates:{start_time:'10:15',end_time:'11:45'},ns:20.5,ne:23.5},pendingResize:{meeting,newEndTime:'11:45'},isMoveCommitting:false,isResizeCommitting:false,
 setIsMoveCommitting(){},setIsResizeCommitting(){},setPendingMove(){},setPendingResize(){},setMeetings(){},supabase:{},
 persistCalendarTiming:async(_client:unknown,_id:string,_patch:unknown,notify:boolean)=>{assert.equal(notify,true);if(failed)throw Error('denied');return saved;},dispatchRecurringMeetingDelivery:async(id:string)=>{dispatched.push(id);},fetchMeetings:()=>refreshed++,currentUserId:'owner',sendNotification(){},
 buildMeetingPlaceholders:meetingTimingPlaceholders,insertNotificationFromTemplate:async(p:any)=>notices.push(p),toast:{success(){},error(){}},console:{error(){}}};
 vm.runInNewContext(code,sandbox);await sandbox.commit(true);
 assert.equal(notices.length,failed?0:3);assert.equal(refreshed,failed?0:1);assert.deepEqual(dispatched,failed?[]:['m']);
 for(const n of notices){assert.equal(n.meetingId,'m');assert.equal(n.placeholders.start_time,'10:15');assert.equal(n.placeholders.end_time,'11:45');}
 }
});

test('actual calendar card drag anchors preserve quarter-hour times instead of rounding duration',()=>{
 const source=readFileSync('src/components/Calendar/CalendarViewShared.tsx','utf8');
 const a=source.lastIndexOf('  const startMin = timeToMinutes(meeting.start_time);',source.indexOf('  const renderStartSlot =')),b=source.indexOf('  const color =',a);
 const code=`function slots(){${source.slice(a,b)}return {startSlot,endSlot};}`;
 const sandbox:any={meeting:{start_time:'09:15',end_time:'10:00'},slotHeight:48,timeToMinutes:(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m;},minutesToSlotIndex:(m:number)=>Math.round(m/30)};
 vm.runInNewContext(code,sandbox);const result=sandbox.slots();assert.equal(result.startSlot,18.5);assert.equal(result.endSlot,20);assert.equal((result.endSlot-result.startSlot)*30,45);
});

test('minute formatting removes floating point noise from fractional drag slots',()=>{
 assert.equal(minutesToTime((560/30+0.5)*30),'09:35');
 assert.equal(minutesToTime(560.00000000001),'09:20');
});

test('external change and informee templates include the heading and both schedules', async () => {
 const schedule='زمان قبلی: یکشنبه 1405/10/13، ساعت 09:00 تا 10:00\nزمان جدید: دوشنبه 1405/10/14، ساعت 11:00 تا 12:00';
 const supabase={from(){const query:any={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:{id:'template',body:'متن سفارشی'}})};return query;}};
 for (const eventType of ['change','informee_change']) {
  const result=await renderSystemSmsTemplate({supabase,category:'meeting',eventType,audience:'external',
   context:{meeting_subject:'شورای هماهنگی',external_schedule:schedule}});
  assert.ok(result.ok);
  assert.match(result.text,/شورای هماهنگی/);
  assert.ok(result.text.endsWith(schedule));
 }
});
