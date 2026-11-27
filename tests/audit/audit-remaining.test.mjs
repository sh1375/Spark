import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

async function resolver(groups, levels, positions) {
  const src = readFileSync('src/features/permissions/services/loadResolvedUserPermissions.ts','utf8')
    .replace(/^import.*$/gm,'');
  const {code} = await transform(src,{loader:'ts',format:'cjs'});
  const data = {
    user_group_members: groups.map((_,i)=>({group_id:String(i)})),
    org_position_members: {position_id:'pos',org_positions:{level:0}},
    user_groups: groups.map(permissions=>({permissions})),
    org_level_permissions: levels,
    org_position_permissions: positions
  };
  const seen = [];
  const supabase = {from(table) {
    const q = {select(){return q;},eq(key,value){seen.push([table,key,value]);return q;},
      in(){return q;},maybeSingle(){return Promise.resolve({data:data[table],error:null});},
      then(resolve){return Promise.resolve({data:data[table],error:null}).then(resolve);}};
    return q;
  }};
  const module = {exports:{}};
  vm.runInNewContext(code,{supabase,module,exports:module.exports},{timeout:1000});
  const result = await module.exports.loadResolvedUserPermissions('fixture');
  return { result: JSON.parse(JSON.stringify(result)), seen };
}
test('permission resolution uses exact keys, group OR level and explicit position override', async()=>{
  const {result,seen}=await resolver([{all:true,read:true,write:true}],[
    {permission_key:'read',granted:false},{permission_key:'level_only',granted:true}
  ],[{permission_key:'write',granted:false}]);
  assert.deepEqual(result,{all:true,read:true,level_only:true});
  assert.ok(seen.some(([table,key,value])=>table==='org_level_permissions'&&key==='level'&&value===0));
});
