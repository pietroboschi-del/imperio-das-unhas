import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../../assets/js/central-users-admin.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
assert.match(html,/assets\/js\/central-users-admin\.js/);
assert.match(code,/\/api\/v1\/auth\/me/);
assert.match(code,/networkAdmin!==true/);
assert.match(code,/credentials:'include'/);
assert.match(code,/\/api\/v1\/admin\/users/);
assert.match(code,/\/access/);
assert.doesNotMatch(code,/localStorage|db\.userAccounts|v63SaveUser|canManageSettings/);
async function scenario({status=200,user,networkError=false,storedAdmin=false}){
 const calls=[],badge={textContent:''};
 const storage={getItem(k){return k==='imperio-v99-central-principal'&&storedAdmin?'{"networkAdmin":true}':k==='imperio-v96-shadow-csrf'?'csrf-test':null}};
 const sandbox={
  sessionStorage:storage,
  window:{__imperioCentralApi:{status:()=>({endpoint:'https://backend.example'})}},
  document:{getElementById:id=>id==='v63CurrentUserBadge'?badge:null},
  fetch:async(url,opt)=>{
   calls.push({url,opt});
   if(networkError)throw Error('network down');
   return {ok:status>=200&&status<300,status,json:async()=>({user})};
  }
 };
 vm.runInNewContext(code,sandbox);
 let allowed=true;
 try{await sandbox.window.__imperioCentralUsersSecure.verify()}catch{allowed=false}
 return {allowed,calls,badge};
}
const master={userId:'master-1',displayName:'Master',networkAdmin:true,unitIds:['centro','big','shopping-contagem']};
let r=await scenario({user:master});assert.equal(r.allowed,true);assert.match(r.badge.textContent,/Administração da rede/);assert.deepEqual(r.calls.map(x=>x.url),['https://backend.example/api/v1/auth/me']);assert.equal(r.calls[0].opt.credentials,'include');assert.equal(master.unitIds.length,3);
for(const user of [{userId:'reception',networkAdmin:false},{userId:'admin',systemRole:'ADMINISTRATIVE',networkAdmin:false},null]){
 r=await scenario({user,storedAdmin:true});assert.equal(r.allowed,false);
}
for(const status of [401,403,500]){r=await scenario({status,user:master,storedAdmin:true});assert.equal(r.allowed,false);}
r=await scenario({user:master,networkError:true});assert.equal(r.allowed,false);
assert.match(code,/if\(u\?\.networkAdmin\)/);
assert.match(code,/if\(method!=='GET'\)/);
assert.match(code,/data-unit-permission/);
console.log('central users security contract PASS');
