import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
import {webcrypto,createHash} from 'node:crypto';
const secret='fixture-webhook-secret';
const proof=createHash('sha256').update('spark:bale:webhook:v1:'+secret).digest('hex');

const marker = 'synthetic-secret-do-not-log-42';
async function load(name, client, fakeFetch, logs) {
  const src=readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import.*$/gm,'');
  const {code}=await transform(src,{loader:'ts'});
  let handler;
  vm.runInNewContext(code,{
    Request,Response,URL,TextEncoder,crypto:webcrypto,
    Deno:{serve(fn){handler=fn;},env:{get(k){return {SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-role',BALE_BOT_TOKEN:'fixture-bot'}[k];}}},
    createClient(){return name==="bale-webhook" ? {...client,from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{is_active:true,webhook_secret:secret,bot_token:"fixture-bot"},error:null};}};return q;}} : client;},fetch:fakeFetch,
    console:Object.fromEntries(['log','warn','error'].map(k=>[k,(...args)=>logs.push(args.map(String).join(' '))]))
  },{timeout:1000});
  assert.equal(typeof handler,'function');
  return handler;
}
function request(text) {
 return new Request('https://example.invalid/webhook?proof='+proof,{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({message:{chat:{id:123,type:"private"},text}})});
}
test('Telegram audit does not persist link nonce or arbitrary message text; token validation still receives the nonce',async()=>{
 const audit=[], lookups=[], logs=[];
 const client={async rpc(name,args){assert.equal(name,"consume_telegram_link_token_service");lookups.push(args.p_token);return {data:{ok:false},error:null};},from(table){
  if(table==='audit_logs')return {async insert(row){audit.push(row);return {error:null};}};
  const q={select(){return q;},eq(key,value){if(table==='telegram_link_tokens'&&key==='token')lookups.push(value);return q;},gt(){return q;},
   async maybeSingle(){return table==='social_channel_configs'?{data:{is_active:true,bot_token:'fixture-bot',webhook_secret:secret}}:{data:null,error:null};}};
  return q;
 }};
 let sends=0;
 const h=await load('telegram-webhook',client,async()=>{sends++;return new Response('{}');},logs);
 assert.equal((await h(request('/start '+marker))).status,200);
 assert.equal((await h(request('ordinary '+marker))).status,200);
 assert.equal(audit.length,2);
 assert.deepEqual(lookups,[marker]);assert.equal(sends,1);
 assert.ok(!JSON.stringify(audit).includes(marker),'raw user message or link nonce persisted in audit');
});
test('Bale logs contain no raw RPC diagnostics or provider error bodies',async()=>{
 const logs=[];
 const client={async rpc(){return {data:null,error:{message:marker}};}};
 const h=await load('bale-webhook',client,async()=>new Response(marker,{status:502}),logs);
 assert.equal((await h(request('/start '+marker))).status,200);
 assert.ok(logs.length>=2);
 assert.ok(!logs.join('\n').includes(marker),'provider or RPC error leaked into logs');
});
test('Bale logs contain no raw network exception text',async()=>{
 const logs=[];const client={async rpc(){return {data:null,error:{message:'fixture failure'}};}};
 const h=await load('bale-webhook',client,async()=>{throw new Error(marker);},logs);
 assert.equal((await h(request('/start '+marker))).status,200);
 assert.ok(!logs.join('\n').includes(marker),'network exception leaked into logs');
});
test('Bale top-level errors are logged without sensitive diagnostic text',async()=>{
 const logs=[];const client={async rpc(){throw new Error(marker);}};
 const h=await load('bale-webhook',client,async()=>new Response('{}'),logs);
 assert.equal((await h(request('/start '+marker))).status,200);
 assert.ok(logs.length>0);assert.ok(!logs.join('\n').includes(marker));
});
