import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=readFileSync('supabase/functions/minutes-attachment-cleanup/index.ts','utf8').replace(/^import\s+(?:(?!;)[\s\S])*?;\s*/gm,'');
const {code}=await transform(source,{loader:'ts'});
async function invoke(storageError){
 let handler, deletes=0, removed=0;
 const client={from(table){
  if(table==='profiles'){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{is_admin:true,is_active:true},error:null};}};return q;}
  assert.equal(table,'minutes_attachments');
  const q={select(){return q;},eq(){return q;},async lt(){return {data:[{id:'fixture-id',storage_path:'fixture-path'}],error:null};},delete(){deletes++;return q;},async in(){return {error:null};}};
  return q;
 },storage:{from(bucket){assert.equal(bucket,'minutes-attachments');return {async remove(paths){assert.equal(paths.length,1);removed++;return {error:storageError?{message:'synthetic storage failure'}:null};}};}}};
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
