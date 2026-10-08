import assert from 'node:assert/strict';
const mod=await import('../src/auth/permission-policy.ts');
assert.deepEqual(mod.normalizePermissions({b:false,a:true,c:true}),['a','c']);
assert.deepEqual(mod.normalizePermissions(['b','a','a']),['a','b']);
assert.equal(mod.hasPermissions(new Set(['agenda.read']),['agenda.read']),true);
assert.equal(mod.hasPermissions(new Set(['agenda.read']),['agenda.manage']),false);
assert.equal(mod.hasPermissions(new Set(['*']),['anything']),true);
const merged=mod.permissionSet(['agenda.read'],{clients:true,no:false});
assert.equal(merged.has('agenda.read'),true);
assert.equal(merged.has('clients'),true);
const cross={networkAdmin:false,globalPermissions:['agenda.read','agenda.manage','clients.read'],unitAccesses:[{unitId:'centro',permissions:['clients.read']}],unitScoped:true,unitId:'big'};
assert.equal(mod.evaluateAccess({...cross,requiredPermissions:['agenda.manage']}).allowed,true,'network agenda global permission allows Big booking');
assert.equal(mod.evaluateAccess({...cross,requiredPermissions:['agenda.read']}).allowed,true,'network agenda global permission allows Big availability');
assert.equal(mod.evaluateAccess({...cross,requiredPermissions:['clients.read']}).allowed,true,'explicit network clients.read allows global search');
for(const permission of ['cash.open','cash.close','stock.manage','finance.manage','catalog.manage','clients.manage']){
  assert.equal(mod.evaluateAccess({...cross,requiredPermissions:[permission]}).allowed,false,'global agenda cannot access '+permission+' in Big');
}
assert.equal(mod.evaluateAccess({...cross,globalPermissions:[],requiredPermissions:['agenda.manage']}).allowed,false,'unit-local agenda cannot cross unit');
assert.equal(mod.evaluateAccess({...cross,unitAccesses:[],requiredPermissions:['agenda.manage']}).allowed,false,'unassigned account cannot use network agenda');
assert.equal(mod.evaluateAccess({...cross,unitId:'centro',requiredPermissions:['agenda.manage']}).allowed,true,'global agenda works in home unit');
console.log(JSON.stringify({ok:true,assertions:19,suite:'V98b permission policy'}));
