import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const src=fs.readFileSync('supabase/functions/pwa-push-worker/index.ts','utf8').replace(/^import.*$/gm,'');
const {code}=await transform(src,{loader:'ts'});
async function invoke(endpoints, completionError=false){
 let handler;const sent=[],completions=[];
 const q={select(){return q;},eq(){return q;},update(){return q;},async is(){return {data:endpoints.map((endpoint,i)=>({id:String(i),endpoint,p256dh:'fixture',auth_key:'fixture'})),error:null};}};
 const service={from(){return q;},async rpc(name,args){
  if(name==='verify_pwa_push_worker_secret_service')return {data:true,error:null};
  if(name==='get_pwa_vapid_config_service')return {data:{public_key:'fixture',private_key:'fixture'},error:null};
  if(name==='claim_pwa_push_outbox_service')return {data:[{id:'job1',notification_id:'n1',user_id:'u',payload:{}},{id:'job2',notification_id:'n2',user_id:'u',payload:{}}],error:null};
  if(name==='complete_pwa_push_outbox_service'){completions.push(args);return {error:completionError?{message:'fixture'}:null};}
  throw Error(name);
 }};
 vm.runInNewContext(code,{Request,Response,URL,Date,createClient:()=>service,Deno:{env:{get:()=> 'fixture'},serve:f=>handler=f},webpush:{setVapidDetails(){},async sendNotification(s){sent.push(s.endpoint);}}});
 const response=await handler(new Request('https://fixture.invalid/worker',{method:'POST',headers:{'X-Spark-Worker-Token':'fixture'}}));
 return {status:response.status,body:await response.json(),sent,completions};
}
test('worker never contacts an unapproved push destination',async()=>{
 const result=await invoke(['https://127.0.0.1/fixture','https://fcm.googleapis.com.example.invalid/fixture','http://fcm.googleapis.com/fixture','https://fcm.googleapis.com:444/fixture','https://name@fcm.googleapis.com/fixture']);
 assert.equal(result.sent.length,0);assert.ok(result.completions.every(r=>r.p_success===false));
});
test('deployed browser push providers remain usable',async()=>{
 const urls=['https://fcm.googleapis.com/fixture','https://web.push.apple.com/fixture','https://updates.push.services.mozilla.com/fixture','https://jmt17.google.com/fixture','https://wns2-am3p.notify.windows.com/fixture'];
 const result=await invoke(urls);assert.equal(result.sent.length,10);assert.equal(result.status,200);
});
test('completion failure cannot be reported as persisted success and does not stop later jobs',async()=>{
 const result=await invoke(['https://fcm.googleapis.com/fixture'],true);
 assert.equal(result.completions.length,2);assert.equal(result.status,503);assert.equal(result.body.recordingFailures,2);assert.equal(result.body.sentRows,0);
});
