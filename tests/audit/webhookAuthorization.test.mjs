import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { webcrypto, createHash } from 'node:crypto';
const secret='fixture-secret-32-character-long';
const derived=createHash('sha256').update('spark:bale:webhook:v1:'+secret).digest('hex');
async function invoke(channel, {active=true, configured=secret, credential, envToken=''}={}) {
  const src=readFileSync('supabase/functions/'+channel+'-webhook/index.ts','utf8').replace(/^import.*$/gm,'');
  const {code}=await transform(src,{loader:'ts'});
  let handler, writes=0, sends=0;
  const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{is_active:active,bot_token:'fixture-bot',webhook_secret:configured},error:null};}};
  vm.runInNewContext(code,{Request,Response,URL,TextEncoder,crypto:webcrypto,console,
    Deno:{serve(fn){handler=fn;},env:{get(k){return {SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',BALE_BOT_TOKEN:envToken}[k];}}},
    createClient(){return {from(t){return t==='audit_logs'?{async insert(){writes++;}}:q;},async rpc(){writes++;return {data:{ok:true},error:null};}};},
    async fetch(){sends++;return new Response('{}');}});
  const url=new URL('https://example.invalid/functions/v1/'+channel+'-webhook');
  const headers={};
  if (credential!==undefined) {
    if(channel==='telegram')headers['x-telegram-bot-api-secret-token']=credential;
    else url.searchParams.set('proof',credential);
  }
  const res=await handler(new Request(url,{method:'POST',headers,body:JSON.stringify({message:{chat:{id:123,type:'private'},text:'/start '+'a'.repeat(32)}})}));
  return {status:res.status,writes,sends};
}
for(const channel of ['telegram','bale']) {
  test(channel+' rejects missing and invalid webhook proof before writes',async()=>{
    for(const credential of [undefined,'wrong']) {
      const result=await invoke(channel,{credential});
      assert.equal(result.status,401);assert.equal(result.writes,0);assert.equal(result.sends,0);
    }
  });
  test(channel+' rejects missing configuration and inactive bot even with token',async()=>{
    for(const options of [{configured:'',credential:secret},{active:false,credential:secret,envToken:'fixture-bot'}]){
      const result=await invoke(channel,options);
      assert.ok([401,403,503].includes(result.status));assert.equal(result.writes,0);assert.equal(result.sends,0);
    }
  });
  test(channel+' authentic proof preserves link flow',async()=>{
    const result=await invoke(channel,{credential:channel==='telegram'?secret:derived});
    assert.equal(result.status,200);assert.ok(result.writes>0);assert.equal(result.sends,1);
  });
}
