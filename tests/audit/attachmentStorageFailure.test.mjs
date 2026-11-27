import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=readFileSync('supabase/functions/minutes-attachment-cleanup/index.ts','utf8').replace(/^import\s+(?:(?!;)[\s\S])*?;\s*/gm,'');
const {code}=await transform(source,{loader:'ts'});
async function invoke(storageError, options={}){
 let handler, deletes=0, removed=0;
 const client={async rpc(name){assert.equal(name,"claim_stale_minutes_attachments_service");return {data:options.malformed?{}:[{id:"fixture-id",storage_path:"fixture-path"}],error:null};},from(table){
  if(table==='profiles'){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{is_admin:true,is_active:true},error:null};}};return q;}
  assert.equal(table,'minutes_attachments');
  const q={async select(){return {data:options.alreadyDeleted?[]:[{id:"fixture-id"}],error:options.dbError?{message:"fixture DB error"}:null};},eq(key,value){assert.equal(key,"upload_status");assert.equal(value,"cleanup_claimed");return q;},delete(){deletes++;return q;},in(){return q;}};
  return q;
 },storage:{from(bucket){assert.equal(bucket,'minutes-attachments');return {async remove(paths){assert.equal(paths.length,1);removed++;if(options.throwStorage)throw Error('fixture transport');return {data:options.absent?[]:[{name:'fixture-path'}],error:storageError?{message:'synthetic storage failure'}:null};}};}}};
 vm.runInNewContext(code,{Request,Response,Date,createClient(){return client;},Deno:{serve(fn){handler=fn;},env:{get(){return 'fixture';}}},
   requireFullAuthAccess:async()=>({ok:true,userId:'fixture-admin'}),deniedResponse:()=>new Response('{}',{status:403})},{timeout:1000});
 const res=await handler(new Request('https://example.invalid/cleanup',{method:'POST',body:'{}'}));
 return {status:res.status,body:await res.json(),deletes,removed};
}
test('storage error preserves metadata for retry and returns failure',async()=>{
 const r=await invoke(true);assert.equal(r.removed,1);assert.equal(r.deletes,0,'must not remove metadata after failed Storage cleanup');assert.equal(r.status,500);
});
test('successful Storage cleanup preserves normal deletion path',async()=>{
 const r=await invoke(false);assert.equal(r.removed,1);assert.equal(r.deletes,1);assert.equal(r.status,200);assert.equal(r.body.deleted_records,1);
});

test('ambiguous storage exception preserves metadata and returns structured failure',async()=>{
 const result=await invoke(false,{throwStorage:true});assert.equal(result.status,500);assert.equal(result.deletes,0);
});
test('malformed claim response cannot touch storage or metadata',async()=>{
 const result=await invoke(false,{malformed:true});assert.equal(result.status,500);assert.equal(result.removed,0);assert.equal(result.deletes,0);
});
test('already absent storage object and already deleted metadata are not counted as deletions',async()=>{
 const result=await invoke(false,{absent:true,alreadyDeleted:true});assert.equal(result.status,200);assert.equal(result.body.deleted_objects,0);assert.equal(result.body.deleted_records,0);
});
test('metadata failure after storage removal reports the failure',async()=>{
 const result=await invoke(false,{dbError:true});assert.equal(result.status,500);assert.equal(result.body.deleted_objects,1);
});
