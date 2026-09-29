import assert from 'node:assert/strict';
const {evaluateAccess}=await import('../src/auth/permission-policy.ts');
const owner={networkAdmin:true,globalPermissions:[],unitAccesses:[]};
assert.equal(evaluateAccess({...owner,adminOnly:true}).allowed,true);
assert.equal(evaluateAccess({...owner,unitScoped:true,unitId:'big',requiredPermissions:['finance.read']}).allowed,true);

const reception={
  networkAdmin:false,
  globalPermissions:['units.read','catalog.read'],
  unitAccesses:[
    {unitId:'big',permissions:['agenda.read','agenda.manage','clients.read']},
    {unitId:'centro',permissions:['agenda.read','clients.read']},
  ],
};
assert.equal(evaluateAccess({...reception,unitScoped:true,unitId:'big',requiredPermissions:['agenda.manage']}).allowed,true);
assert.equal(evaluateAccess({...reception,unitScoped:true,unitId:'centro',requiredPermissions:['agenda.read']}).allowed,true);
assert.deepEqual(evaluateAccess({...reception,unitScoped:true,unitId:'centro',requiredPermissions:['agenda.manage']}),{allowed:false,reason:'permission_denied'});
assert.deepEqual(evaluateAccess({...reception,unitScoped:true,unitId:'shopping-contagem',requiredPermissions:['agenda.read']}),{allowed:false,reason:'unit_denied'});
assert.deepEqual(evaluateAccess({...reception,adminOnly:true}),{allowed:false,reason:'network_admin_required'});

const administrativo={
  networkAdmin:false,
  globalPermissions:['units.read'],
  unitAccesses:[
    {unitId:'big',permissions:['finance.read']},
    {unitId:'centro',permissions:['finance.read']},
    {unitId:'shopping-contagem',permissions:['finance.read']},
  ],
};
for(const unitId of ['big','centro','shopping-contagem'])assert.equal(evaluateAccess({...administrativo,unitScoped:true,unitId,requiredPermissions:['finance.read']}).allowed,true);
assert.equal(evaluateAccess({...administrativo,adminOnly:true}).allowed,false);
console.log(JSON.stringify({ok:true,assertions:11,suite:'V98b three-unit authorization'}));
