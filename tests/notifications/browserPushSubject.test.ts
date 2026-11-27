import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source=readFileSync('supabase/functions/pwa-push-worker/index.ts','utf8').replace(/^import .+;\s*$/gm,'');
for(const title of ['  زمان جلسه تغییر کرد  ',null, {private:'not a title'}]) {
  test(`background push uses only a valid notification subject (${JSON.stringify(title)})`,async()=>{
    let handler: (request:Request)=>Promise<Response>;const sent:any[]=[];
    const query:any={select(){return query;},eq(){return query;},update(){return query;},
      is:async()=>({data:[{id:'subscription',endpoint:'https://fcm.googleapis.com/fcm/send/fixture',p256dh:'key',auth_key:'auth'}],error:null})};
    const client={from:()=>query,rpc:async(name:string)=>({error:null,data:name==='verify_pwa_push_worker_secret_service'?true
      :name==='get_pwa_vapid_config_service'?{public_key:'public',private_key:'private'}
      :name==='claim_pwa_push_outbox_service'?[{id:'job',notification_id:'notification',user_id:'owner',
        payload:{title,body:'متن خصوصی اعلان',actionUrl:'/?page=calendar'}}]:null})};
    const sandbox={Request,Response,URL,createClient:()=>client,Deno:{env:{get:()=> 'test'},serve:(callback:any)=>handler=callback},
      webpush:{setVapidDetails(){},sendNotification:async(_subscription:any,payload:string)=>sent.push(JSON.parse(payload))}};
    vm.runInNewContext((await transform(source,{loader:'ts'})).code,sandbox);
    const response=await handler!(new Request('https://spark.test/worker',{method:'POST',headers:{'X-Spark-Worker-Token':'test'}}));
    assert.equal(response.status,200);assert.equal(sent.length,1);
    assert.equal(sent[0].title,'اسپارک');
    assert.equal(sent[0].body,typeof title==='string'?title.trim():'یک اعلان جدید در اسپارک دارید.');
    assert.equal(sent[0].notificationId,'notification');
    assert.ok(!JSON.stringify(sent[0]).includes('متن خصوصی اعلان'));
  });
}
