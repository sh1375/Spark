import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import moment from 'moment-jalaali';
import { normalizeIranPhone } from '../../src/lib/phoneNormalize';
import { computeMeetingChangeSet, computeScopedMeetingChangeSet, computeExternalDiff } from '../../src/lib/meetingEditDiff';

process.env.TZ = 'Asia/Tehran';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
function evaluate(source: string, dependencies: Record<string, unknown>, result: string) {
  const javascript = stripTypeScriptTypes(source, { mode: 'transform' });
  return new Function(...Object.keys(dependencies), `${javascript}\nreturn ${result};`)(...Object.values(dependencies));
}
const before = { request_date: '2026-11-05T07:00:00.000Z', start_time: '07:00', end_time: '08:00', participant_user_ids: ['old'] };
const after = { ...before, request_date: '2026-11-04T20:30:00.000Z', participant_user_ids: ['old', 'new'] };

test('adding an attendee with the same Tehran calendar day does not change the meeting schedule', () => {
  const changes = computeMeetingChangeSet(before, after);
  assert.deepEqual(changes.importantFields, []);
  assert.equal(changes.participantChanged, true);
  assert.deepEqual(computeMeetingChangeSet(before, { ...after, request_date: '2026-11-05T20:30:00.000Z' }).importantFields, ['request_date']);
  assert.deepEqual(computeMeetingChangeSet(before, { ...before, start_time: '07:30' }).importantFields, ['start_time']);
  assert.deepEqual(computeScopedMeetingChangeSet(before, after, true).importantFields, []);
});

test('recurring creation submits one atomic series command without per-occurrence browser dispatch', async () => {
  const source = read('src/components/CalendarMeetingForm.tsx');
  const start = source.indexOf('        if (!repeatEndDate) throw new Error');
  const end = source.indexOf('      } else {', start);
  const calls: any[][] = [];
  const repeatRecords = Array.from({length:51},(_,n)=>({request_date:`date-${n}`}));
  const run = evaluate(`async function run() { ${source.slice(start,end)} }`, {
    repeatEndDate:'1406/12/29',record:{subject:'test'},repeatType:'weekly',repeatInterval:1,repeatWeekday:3,
    repeatMonthlyMode:'specific',repeatMonthlyNth:1,repeatMonthlyNthWeekday:0,
    buildCalendarRepeatRecords:()=>repeatRecords,seriesOperationRef:{current:'stable-operation'},
    meetingDateStr:'1405/08/05',agendaEnabled:false,agendaItems:[],
    createMeetingSeries:async(...args:any[])=>{calls.push(args);return Array.from({length:52},(_,n)=>String(n));},
    toast:{success(){}},
  },'run');
  await run();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'stable-operation');assert.equal(calls[0][1].length,52);assert.match(calls[0][3],/سه‌شنبه/);
});

for (const importantChange of [false, true]) {
  test(`edit sends only new-member invites; retained members receive changes only on a real schedule change (${importantChange})`, async () => {
    let source = read('src/components/CalendarMeetingForm/commitEdit.ts');
    source = source.replace(/^import[\s\S]*?;\n/gm, '').replace('export async function', 'async function').replaceAll('import.meta.env?.DEV', 'false');
    const events: any[] = [];
    const external: any[][] = [];
    const dispatched: string[] = [];
    const rpcDiffs = ['one', 'two'].map(meeting_id => ({ meeting_id, added_participant_ids: ['new'], retained_participant_ids: ['old'], removed_participant_ids: [] }));
    const mockDb = {
      from: () => ({
        update: () => ({ in: async () => ({}), eq: async () => ({}) }),
        delete: () => ({ eq: async () => ({}) }),
        select: () => ({ eq: () => ({single:async()=>({data:{series_id:null}})}), in: async () => ({ data: rpcDiffs.map(d => ({ id: d.meeting_id, subject: 'test', request_date: before.request_date, start_time: '07:00', end_time: '08:00' })) }) }),
      }),
      rpc: async () => ({ data: rpcDiffs }),
    };
    const commit = evaluate(source, {
      moment, supabase: mockDb, computeExternalDiff, normalizeIranPhone,
      persistCalendarChanges: async (_client: unknown, ids: string[]) => ids.map(id => ({ id, timing_changed: importantChange })),
      dispatchRecurringMeetingDelivery: async (id: string) => { dispatched.push(id); },
      insertNotification: async (payload: any) => { events.push(payload); return { status: 'sent' }; },
      sendSmsToExternals: async (...args: any[]) => { external.push(args); return { ok: true, sent: 1, skipped: 0 }; },
      showSmsSummary: () => {}, getMeetingTemplateKey: (_role: string, event: string) => event,
      toast: { success() {}, error(message: string) { assert.fail(message); } },
    }, 'commitCalendarMeetingEdit');
    const changes = computeMeetingChangeSet(before, importantChange ? { ...after, start_time: '08:00' } : after);
    const byId = (value: any) => Object.fromEntries(rpcDiffs.map(d => [d.meeting_id, value]));
    await commit({
      snapshot: {
        operationId: 'edit', updateRecord: {}, baseFields: {}, isFirstSchedule: false,
        senderName: 'Owner', meetingDateStr: '', meetingTimeStr: '', smsPlaceholders: {}, agendaSummary: '', participantNameMap: {},
        observerIds: ['observer', 'new-observer'], gregDate: before.request_date,
        selectedParticipantIds: ['old', 'new'], selectedExternal: ['old external', 'new external'], selectedExternalInformees: ['old informee', 'new informee'], sendSms: true,
        agendaEnabled: false, agendaItems: [], isOnline: false, wasOnline: false,
        changeSetsByMeetingId: byId(changes), previousNotifyUserIdsByMeetingId: byId(['observer']),
        prevExternalByMeetingId: byId(['old external']), prevExternalInformeesByMeetingId: byId(['old informee']),
      },
      notifyExistingParticipants: true, userId: 'owner', prefillMeetingId: 'one', prefillEditAllIds: ['one', 'two'],
      subject: 'test', startTime: '07:00', endTime: '08:00', contacts: [],
      commitLockRef: { current: false }, setCommitting() {}, setEditDecision() {}, onSuccess() {},
    });
    assert.deepEqual(dispatched, importantChange ? ['one', 'two'] : []);
    assert.equal(events.filter(e => e.userId === 'owner').length, 0);
    for (const id of ['one', 'two']) {
      const current = events.filter(e => e.meetingId === id);
      assert.deepEqual(current.filter(e => e.eventType === 'invite').map(e => e.userId), ['new', 'new-observer']);
      assert.deepEqual(current.filter(e => e.eventType === 'change').map(e => e.userId), importantChange ? ['old', 'observer'] : []);
      const sms = external.filter(e => e[6] === id);
      assert.deepEqual(sms.filter(e => e[5].endsWith('invite')).flatMap(e => e[0]).sort(), importantChange ? [] : ['new external', 'new informee']);
      assert.equal(sms.filter(e => e[5].endsWith('change')).length, 0);
    }
  });
}


test('calendar repeat builder only computes records; persistence belongs to the atomic series command', () => {
  const source = read('src/components/CalendarMeetingForm/services.ts');
  const build = evaluate(source.slice(source.indexOf('export function buildCalendarRepeatRecords')).replace('export function','function'), { moment }, 'buildCalendarRepeatRecords');
  const result = build({baseRecord:{request_date:'2026-10-28T20:30:00.000Z',user_id:'owner'},type:'weekly',interval:1,endDate:'1405/08/21',repeatWeekday:5});
  assert.equal(result.length,2);assert.deepEqual(result.map((r:any)=>r.request_jalaali_date),['1405/08/14','1405/08/21']);
  assert.ok(result.every((r:any)=>!r.id));
  assert.throws(()=>build({interval:0}),/فاصله تکرار/);
});

test('managed series editing submits membership and fields in one server command without legacy re-dispatch', async () => {
  let source=read('src/components/CalendarMeetingForm/commitEdit.ts');
  source=source.replace(/^import[\s\S]*?;\n/gm,'').replace('export async function','async function').replaceAll('import.meta.env?.DEV','false');
  const calls:any[]=[];let successful=false;
  const commit=evaluate(source,{
    supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{series_id:'series'}})})}),delete:()=>({eq:async()=>({})})}),rpc:async(name:string,args:any)=>{calls.push({name,args});return{};}},
    toast:{error(message:string){assert.fail(message);}},
    dispatchRecurringMeetingDelivery: async () => {},
    insertNotification(){assert.fail('legacy notification must not run');},
  },'commitCalendarMeetingEdit');
  await commit({snapshot:{operationId:'operation',updateRecord:{subject:'Updated'},baseFields:null,isOnline:false,wasOnline:false,agendaEnabled:false,agendaItems:[],selectedParticipantIds:['retained','new']},notifyExistingParticipants:true,userId:'owner',prefillMeetingId:'occurrence',prefillEditAllIds:null,subject:'Updated',contacts:[],commitLockRef:{current:false},setCommitting(){},setEditDecision(){},onSuccess(){successful=true;}});
  assert.equal(successful,true);assert.deepEqual(calls.map(call => call.name), ['update_meeting_series', 'sync_linked_meeting_agenda_v1']);
  assert.deepEqual(calls[0].args.p_patch,{subject:'Updated',participant_user_ids:['retained','new']});
});

test('saving a similar draft invites only its final recipients and never writes or cancels the source', async () => {
  const source = read('src/components/CalendarMeetingForm.tsx');
  const start = source.indexOf("        const { data: meeting, error: meetingError } = await supabase.from('meetings').insert");
  const end = source.indexOf('\n      }\n\n      if (saveContact', start);
  const events:any[]=[];const writes:any[]=[];
  const db={from(table:string){return {insert(rows:any){writes.push({table,rows});return {select(){return {single:async()=>({data:{id:'new-meeting'},error:null})};}};}};}};
  const run=evaluate(`async function run(){${source.slice(start,end)}}`,{
    supabase:db,record:{subject:'Similar',participant_user_ids:['retained']},
    saveNewMeetingDetails:async(steps:any)=>{await steps.saveParticipants();await steps.saveAgenda();},
    participantDisplayItems:[{name:'Retained'}],agendaEnabled:false,agendaItems:[],
    meetingDateStr:'1405/08/07',subject:'Similar',meetingTimeStr:'09:00-10:00',agendaSummary:'',smsPlaceholders:{},
    userId:'owner',senderName:'Owner',participantIds:['retained'],observerIds:[],participantNameMap:{retained:'Retained'},
    selectedExternal:[],selectedExternalInformees:[],sendSms:false,contacts:[],
    getMeetingTemplateKey:()=> 'meeting_created',insertNotification:async(event:any)=>{events.push(event);return {status:'skipped'};},
    showSmsSummary(){},
  },'run');
  await run();
  assert.deepEqual(writes[0],{table:'meetings',rows:[{subject:'Similar',participant_user_ids:['retained']}]});
  assert.deepEqual(events.map(event=>[event.meetingId,event.userId,event.eventType]),[
    ['new-meeting','owner','meeting_created'],['new-meeting','retained','invite'],
  ]);
  assert.ok(!events.some(event=>event.userId==='removed'||event.eventType==='cancel'));
});
