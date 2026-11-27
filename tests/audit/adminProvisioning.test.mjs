import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const src=fs.readFileSync('supabase/functions/admin-users/index.ts','utf8').replace(/^import.*$/gm,'');
const {code}=await transform(src,{loader:'ts'});
async function invoke({verifyFailure=false,missing=false,hireFailure=false,lookupFailure=false}={}){
 let handler,creates=0,verifies=0,deletes=0;
 const client={from(table){
  if(table==='audit_log')return {async insert(){return {error:null};}};
  let fields='',column='';
  const q={select(s){fields=s;return q;},eq(k){column=k;return q;},update(){return q;},
    async maybeSingle(){
      if(fields.includes('is_admin'))return {data:{is_admin:true,is_active:true},error:null};
      if(fields.includes('registration_source')){
        verifies++;if(verifyFailure&&verifies===1)return {data:null,error:{message:'fixture'}};
        return {data:missing?null:{user_id:'new-user',registration_source:'admin_created',account_status:'ACTIVE'},error:null};
      }
      return {data:null,error:lookupFailure&&column==='normalized_username'?{message:'fixture'}:null};
    },
    then(resolve){return Promise.resolve({error:hireFailure?{message:'fixture'}:null}).then(resolve);}
  };return q;
 },auth:{admin:{async createUser(){creates++;return {data:{user:{id:'new-user'}},error:null};},async deleteUser(){deletes++;}}}};
 vm.runInNewContext(code,{Request,Response,URL,console,createClient:()=>client,normalizeIranPhone:()=> '989123456789',
 Deno:{env:{get:()=> 'fixture'},serve:f=>handler=f},requireFullAuthAccess:async()=>({ok:true,userId:'admin'}),recordAccessDenial:async()=>{},deniedResponse:()=>new Response('{}',{status:403})});
 const response=await handler(new Request('https://fixture.invalid/admin-users/create',{method:'POST',body:JSON.stringify({email:'fixture@example.invalid',password:'fixture-password',profile:{username:'fixture',phone:'09123456789',hire_date:'2024-01-01'}})}));
 return {status:response.status,body:await response.json(),creates,verifies,deletes};
}
test('transient profile read failure retries verification of the same identity, never creates or deletes another',async()=>{
 const result=await invoke({verifyFailure:true});assert.equal(result.status,200);assert.equal(result.creates,1);assert.equal(result.verifies,2);assert.equal(result.deletes,0);
});
test('unconfirmed profile is preserved and reported for reconciliation',async()=>{
 const result=await invoke({missing:true});assert.equal(result.status,500);assert.equal(result.body.code,'PROFILE_NOT_FOUND');assert.equal(result.creates,1);assert.equal(result.deletes,0);
});
test('failed metadata write cannot be reported as complete provisioning',async()=>{
 const result=await invoke({hireFailure:true});assert.equal(result.status,500);assert.equal(result.body.code,'PROFILE_METADATA_UPDATE_FAILED');assert.equal(result.deletes,0);
});
test('failed duplicate lookup prevents creation',async()=>{
 const result=await invoke({lookupFailure:true});assert.equal(result.status,503);assert.equal(result.creates,0);
});
