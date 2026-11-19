import assert from 'node:assert/strict';
import test from 'node:test';
import { liveReaderHarness } from './liveReaderHarness';
const hook='/src/shared/realtime/useLiveData.ts';

test('shared reader retains latest callback, replaces room/user scope and respects client isolation',async()=>{
 const f=await liveReaderHarness([hook]);
 try{
  const {useLiveData}=await f.load(hook);const clientA:any={},clientB:any={};let first=0,latest=0;
  f.render(()=>useLiveData(['conference_rooms'],async()=>{first++;},true,clientA,'room-a'));
  await f.watches[0].refresh();assert.equal(first,1);
  f.render(()=>useLiveData(['conference_rooms'],async()=>{latest++;},true,clientA,'room-a'));
  assert.equal(f.watches.length,1);await f.watches[0].refresh();assert.equal(latest,1);
  f.render(()=>useLiveData(['conference_rooms'],async()=>{},true,clientA,'room-b'));
  assert.equal(f.watches[0].disposed,true);assert.equal(f.watches.length,2);
  f.render(()=>useLiveData(['conference_rooms'],async()=>{},true,clientB,'room-b'));
  assert.equal(f.watches[1].disposed,true);assert.equal(f.watches[2].client,clientB);
  f.render(()=>useLiveData(['conference_rooms'],async()=>{},false,clientB,'room-b'));
  assert.equal(f.watches[2].disposed,true);assert.equal(f.watches.length,3);
 }finally{await f.close();}
});

test('runtime flags follow authoritative shared snapshots, including deleted flags',async()=>{
 let rows:any[]=[{section:'spark',key:'spark_visible',value:'true'},{section:'security',key:'maintenance_mode',value:'true'}];
 const f=await liveReaderHarness(['/src/app/hooks/useAppRuntimeConfig.ts'],{from:()=>({select:()=>({in:()=>({in:async()=>({data:rows,error:null})})})})});
 const original=(globalThis as any).window;(globalThis as any).window=new EventTarget();
 try{
  const {useAppRuntimeConfig}=await f.load('/src/app/hooks/useAppRuntimeConfig.ts');
  f.render(()=>useAppRuntimeConfig());assert.deepEqual(f.watches[0].tables,['system_config']);
  await f.watches[0].refresh();assert.deepEqual(f.render(()=>useAppRuntimeConfig()),{sparkVisible:true,maintenanceMode:true});
  rows=[];await f.watches[0].refresh();assert.deepEqual(f.render(()=>useAppRuntimeConfig()),{sparkVisible:false,maintenanceMode:false});
 }finally{await f.close();(globalThis as any).window=original;}
});

test('forward target invalidation only reads destinations and never recreates Saved Messages',async()=>{
 let creations=0,reads=0;
 const client={rpc:async()=>{creations++;return{data:'saved'};},from:()=>({select:()=>({or:()=>({order:async()=>{reads++;return{data:[],error:null};}})})})};
 const path='/src/components/Chat/ForwardModal.tsx';const f=await liveReaderHarness([hook,path],client);
 try{
  const {ForwardModal}=await f.load(path);const props={body:'draft',fileUrl:null,currentUserId:'me',allUsers:[],senderName:'Me',onClose(){}};
  f.render(()=>ForwardModal(props));await Promise.resolve();f.render(()=>ForwardModal(props));
  const active=f.watches.findLast((w:any)=>!w.disposed && w.tables.includes('chat_conversations'));
  assert.ok(active);await active.refresh();await active.refresh();await active.refresh();
  assert.equal(creations,1);assert.ok(reads>=3);
 }finally{await f.close();}
});
