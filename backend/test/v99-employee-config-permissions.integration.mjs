import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(String(v)).digest('hex');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
async function waitHealth(){for(let i=0;i<60;i++){try{let r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
async function cleanupUser(username){const u=await prisma.user.findUnique({where:{username}});if(!u)return;await prisma.session.deleteMany({where:{userId:u.id}});await prisma.userUnitAccess.deleteMany({where:{userId:u.id}});await prisma.user.delete({where:{id:u.id}})}
async function makeUser(username,displayName,permissions,unitIds){
 await cleanupUser(username);
 const user=await prisma.user.create({data:{username,displayName,passwordResetRequired:false,active:true,networkAdmin:false,systemRole:'OPERATOR',permissions}});
 const sessionToken=username+'-session',csrfToken=username+'-csrf';
 await prisma.session.create({data:{userId:user.id,tokenHash:sha(sessionToken),csrfHash:sha(csrfToken),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
 if(unitIds.length)await prisma.userUnitAccess.createMany({data:unitIds.map(unitId=>({userId:user.id,unitId,role:'OPERATOR',permissions:[],active:true}))});
 return {user,sessionToken,csrfToken,auth:{cookie:'imperio_session='+sessionToken,'x-csrf-token':csrfToken,'content-type':'application/json','x-unit-id':unitIds[0]||'centro'}};
}

async function main(){
 const usernames=['employee_config_ci','employee_scope_centro_ci','employee_scope_multi_ci','employee_scope_noperm_ci'];
 const ids={
  cat:'emp_cfg_cat_ci',svc:'emp_cfg_svc_ci',pro:'emp_cfg_pro_ci',ws:'emp_cfg_ws_ci',
  proCentro:'emp_cfg_pro_centro_ci',proShared:'emp_cfg_pro_shared_ci',
  proDeniedBig:'emp_cfg_pro_denied_big_ci',proDeniedMixed:'emp_cfg_pro_denied_mixed_ci',proDeniedSchedule:'emp_cfg_pro_denied_schedule_ci',proDeniedShopping:'emp_cfg_pro_denied_shopping_ci',
  wsCentro:'emp_cfg_ws_centro_ci',wsDeniedBig:'emp_cfg_ws_denied_big_ci',wsDeniedShopping:'emp_cfg_ws_denied_shopping_ci',wsShopping:'emp_cfg_ws_shopping_ci',
 };
 for(const username of usernames)await cleanupUser(username).catch(()=>{});
 for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name},update:{name,active:true}});
 const all=await makeUser('employee_config_ci','Funcionária Config CI',['units.read','catalog.manage','professionals.manage'],['big','centro','shopping-contagem']);
 const centro=await makeUser('employee_scope_centro_ci','Funcionária Centro CI',['units.read','catalog.manage','professionals.manage'],['centro']);
 const multi=await makeUser('employee_scope_multi_ci','Funcionária Centro Big CI',['units.read','catalog.manage','professionals.manage'],['centro','big']);
 const noPerm=await makeUser('employee_scope_noperm_ci','Funcionária Sem Gestão CI',['units.read'],['centro']);

 const proIds=[ids.pro,ids.proCentro,ids.proShared,ids.proDeniedBig,ids.proDeniedMixed,ids.proDeniedSchedule,ids.proDeniedShopping];
 const wsIds=[ids.ws,ids.wsCentro,ids.wsDeniedBig,ids.wsDeniedShopping,ids.wsShopping];
 await prisma.auditEvent.deleteMany({where:{entityId:{in:[...Object.values(ids)]}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:{in:proIds}}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:{in:proIds}}}).catch(()=>{});
 await prisma.workstation.deleteMany({where:{id:{in:wsIds}}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:ids.svc}}).catch(()=>{});
 await prisma.serviceCategory.deleteMany({where:{id:ids.cat}}).catch(()=>{});

 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:'centro'},stdio:['ignore','pipe','pipe']});
 try{
  await waitHealth();
  let r=await fetch(base+'/api/v1/auth/me',{headers:{cookie:'imperio_session='+all.sessionToken}});ok(r.ok,'funcionária entra');
  const me=await r.json();ok(me.user?.networkAdmin===false,'funcionária não é networkAdmin');

  r=await fetch(base+'/api/v1/units',{headers:{cookie:'imperio_session='+all.sessionToken}});
  ok(r.ok,'funcionária acessa unidades centrais');
  const units=await r.json(),unitMap=new Map(units.map(x=>[x.id,x.name]));
  assert.deepEqual([...unitMap.keys()].filter(x=>['centro','big','shopping-contagem'].includes(x)).sort(),['big','centro','shopping-contagem']);tests++;
  ok(unitMap.get('centro')==='Centro de Contagem'&&unitMap.get('big')==='Big Shopping'&&unitMap.get('shopping-contagem')==='Shopping Contagem','três unidades aparecem com nomes canônicos');

  for(const p of ['/api/v1/config/categories','/api/v1/config/services','/api/v1/config/professionals','/api/v1/config/workstations']){
   r=await fetch(base+p,{headers:{cookie:'imperio_session='+all.sessionToken,'x-unit-id':'centro'}});ok(r.ok,'funcionária acessa '+p);
  }
  r=await fetch(base+'/api/v1/admin/users',{headers:{cookie:'imperio_session='+all.sessionToken,'x-unit-id':'centro'}});ok(r.status===403,'funcionária não acessa administração de usuários');

  r=await fetch(base+'/api/v1/config/categories',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.cat,name:'Categoria Funcionária CI',description:'teste',sortOrder:10,active:true,config:{serviceDefaults:{clientArea:'hands',mustFinishBeforeSameArea:true}}})});ok(r.ok,'categoria salva');
  r=await fetch(base+'/api/v1/config/services',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.svc,name:'Serviço Funcionária CI',categoryId:ids.cat,categoryName:'Categoria Funcionária CI',price:90,durationMin:50,active:true,config:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{}}})});ok(r.ok,'serviço salva');
  let service=await r.json();ok(service.config.clientArea==='hands'&&service.config.mustFinishBeforeSameArea===true,'regras estruturais do serviço recarregam');

  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.pro,name:'Profissional Funcionária CI',publicName:'Pro CI',active:true,unitIds:['centro','big','shopping-contagem'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'},'big-2':{work:true,start:'10:00',end:'19:00'},'shopping-contagem-3':{work:true,start:'11:00',end:'20:00'}}},serviceRules:{[ids.svc]:{enabled:true,duration:40,commission:50,price:95,online:true}}})});ok(r.ok,'profissional multiunidade salva');
  const pro=await r.json();assert.deepEqual([...pro.unitIds].sort(),['big','centro','shopping-contagem']);tests++;
  ok(pro.config.schedule['centro-1'].start==='09:00'&&pro.serviceRules[ids.svc].duration===40&&Number(pro.serviceRules[ids.svc].price)===95,'escala e overrides recarregam');

  r=await fetch(base+'/api/v1/config/professionals',{headers:{cookie:'imperio_session='+all.sessionToken,'x-unit-id':'centro'}});
  ok(r.ok,'profissionais recarregam após salvar');
  const reloaded=(await r.json()).find(x=>x.id===ids.pro);
  assert.ok(reloaded);tests++;
  assert.deepEqual([...reloaded.unitIds].sort(),['big','centro','shopping-contagem']);tests++;
  ok(reloaded.config.schedule['centro-1'].start==='09:00'&&reloaded.config.schedule['big-2'].start==='10:00'&&reloaded.config.schedule['shopping-contagem-3'].start==='11:00','refresh mantém escalas independentes por unidade');

  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.ws,unitId:'big',name:'Estação Funcionária CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.ok,'workstation salva');
  const ws=await r.json();ok(ws.unitId==='big'&&ws.allowedCategoryIds.includes(ids.cat),'allowedCategoryIds recarrega sem mistura de unidade');
  ok(await prisma.professionalUnit.count({where:{professionalId:ids.pro,active:true}})===3,'vínculos multiunidade persistem no banco');

  // 1: usuário Centro pode criar profissional somente Centro.
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.proCentro,name:'Profissional Centro CI',publicName:'Centro CI',active:true,unitIds:['centro'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.ok,'usuário Centro cria profissional somente Centro');

  // 2, 3 e 13: Big, Centro+Big e Shopping Contagem ficam fora do escopo do usuário Centro.
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.proDeniedBig,name:'Pro Big Negada',active:true,unitIds:['big'],config:{schedule:{'big-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.status===403,'usuário Centro não cria profissional Big');
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.proDeniedMixed,name:'Pro Mista Negada',active:true,unitIds:['centro','big'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'},'big-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.status===403,'usuário Centro não cria profissional Centro + Big');
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.proDeniedShopping,name:'Pro Shopping Negada',active:true,unitIds:['shopping-contagem'],config:{schedule:{'shopping-contagem-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.status===403,'Shopping Contagem recebe a mesma proteção');

  // Escala não pode escapar do escopo mesmo quando unitIds contém somente Centro.
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.proDeniedSchedule,name:'Pro Escala Negada',active:true,unitIds:['centro'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'},'big-2':{work:true,start:'10:00',end:'19:00'}}},serviceRules:{}})});ok(r.status===403,'escala Big é bloqueada mesmo com vínculo solicitado somente Centro');

  // Profissional já Centro + Big: Centro isolado não pode editar nem alterar active.
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.proShared,name:'Profissional Compartilhada CI',active:true,unitIds:['centro','big'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'},'big-1':{work:true,start:'10:00',end:'19:00'}}},serviceRules:{}})});ok(r.ok,'fixture profissional Centro + Big criada');
  r=await fetch(base+'/api/v1/config/professionals/'+ids.proShared,{method:'PATCH',headers:centro.auth,body:JSON.stringify({id:ids.proShared,name:'Tentativa Centro',active:true,unitIds:['centro'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.status===403,'usuário somente Centro não edita profissional já vinculada ao Big');
  r=await fetch(base+'/api/v1/config/professionals/'+ids.proShared+'/active',{method:'PATCH',headers:centro.auth,body:JSON.stringify({active:false})});ok(r.status===403,'usuário Centro não altera active global de profissional Centro + Big');

  // 5: usuário Centro + Big pode editar profissional quando todas as unidades afetadas pertencem ao seu escopo.
  r=await fetch(base+'/api/v1/config/professionals/'+ids.proShared,{method:'PATCH',headers:multi.auth,body:JSON.stringify({id:ids.proShared,name:'Profissional Compartilhada Editada',active:true,unitIds:['centro','big'],config:{schedule:{'centro-1':{work:true,start:'08:30',end:'17:30'},'big-1':{work:true,start:'10:30',end:'19:30'}}},serviceRules:{}})});ok(r.ok,'usuário Centro + Big edita profissional apenas nessas unidades');

  // 8-13: autorização de workstation considera unidade atual e nova.
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.wsCentro,unitId:'centro',name:'Mesa Centro Escopo CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.ok,'usuário Centro cria workstation Centro');
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.wsDeniedBig,unitId:'big',name:'Mesa Big Negada CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.status===403,'usuário Centro não cria workstation Big');
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:centro.auth,body:JSON.stringify({id:ids.wsDeniedShopping,unitId:'shopping-contagem',name:'Mesa Shopping Negada CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.status===403,'usuário Centro não cria workstation Shopping Contagem');
  r=await fetch(base+'/api/v1/config/workstations/'+ids.wsCentro,{method:'PATCH',headers:centro.auth,body:JSON.stringify({id:ids.wsCentro,unitId:'big',name:'Mesa Centro Escopo CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.status===403,'usuário Centro não move workstation Centro para Big');
  let wsStored=await prisma.workstation.findUniqueOrThrow({where:{id:ids.wsCentro}});ok(wsStored.unitId==='centro','movimento negado preserva unidade original');
  r=await fetch(base+'/api/v1/config/workstations/'+ids.wsCentro,{method:'PATCH',headers:multi.auth,body:JSON.stringify({id:ids.wsCentro,unitId:'big',name:'Mesa Centro Big CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.ok,'usuário Centro + Big pode mover workstation entre unidades permitidas');
  r=await fetch(base+'/api/v1/config/workstations/'+ids.wsCentro+'/active',{method:'PATCH',headers:centro.auth,body:JSON.stringify({active:false})});ok(r.status===403,'usuário Centro não altera active de workstation agora pertencente ao Big');
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:all.auth,body:JSON.stringify({id:ids.wsShopping,unitId:'shopping-contagem',name:'Mesa Shopping Fixture CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.ok,'fixture workstation Shopping criada');
  r=await fetch(base+'/api/v1/config/workstations/'+ids.wsShopping+'/active',{method:'PATCH',headers:centro.auth,body:JSON.stringify({active:false})});ok(r.status===403,'active de workstation Shopping Contagem também exige acesso à unidade');

  // 14: acesso à unidade sem permissão funcional continua bloqueado.
  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:noPerm.auth,body:JSON.stringify({id:'emp_cfg_no_perm_pro_ci',name:'Sem Permissão',active:true,unitIds:['centro'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{}})});ok(r.status===403,'acesso Centro sem professionals.manage não altera profissional');
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:noPerm.auth,body:JSON.stringify({id:'emp_cfg_no_perm_ws_ci',unitId:'centro',name:'Sem Permissão',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.status===403,'acesso Centro sem catalog.manage não altera workstation');

  ok(await prisma.auditEvent.count({where:{entityId:{in:[...Object.values(ids)]}}})>=8,'alterações permitidas ficam auditadas');
  console.log(JSON.stringify({ok:true,tests,feature:'employee_configuration_permissions',networkAdmin:false,catalog:true,professionals:true,usersAdmin:false,multiUnit:true,unitScopeEnforced:true}));
 }finally{
  server.kill('SIGTERM');
  await prisma.professionalUnit.deleteMany({where:{professionalId:{in:proIds}}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:{in:proIds.concat('emp_cfg_no_perm_pro_ci')}}}).catch(()=>{});
  await prisma.workstation.deleteMany({where:{id:{in:wsIds.concat('emp_cfg_no_perm_ws_ci')}}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:ids.svc}}).catch(()=>{});
  await prisma.serviceCategory.deleteMany({where:{id:ids.cat}}).catch(()=>{});
  await prisma.auditEvent.deleteMany({where:{entityId:{in:[...Object.values(ids)]}}}).catch(()=>{});
  for(const username of usernames)await cleanupUser(username).catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
