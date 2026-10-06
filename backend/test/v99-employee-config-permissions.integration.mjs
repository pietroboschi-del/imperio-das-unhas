import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient(),base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(String(v)).digest('hex');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
async function waitHealth(){for(let i=0;i<60;i++){try{let r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}

async function main(){
 const username='employee_config_ci',sessionToken='employee-config-session',csrfToken='employee-config-csrf';
 const ids={cat:'emp_cfg_cat_ci',svc:'emp_cfg_svc_ci',pro:'emp_cfg_pro_ci',ws:'emp_cfg_ws_ci'};
 await prisma.user.deleteMany({where:{username}}).catch(()=>{});
 const user=await prisma.user.create({data:{
  username,displayName:'Funcionária Config CI',passwordResetRequired:false,active:true,networkAdmin:false,systemRole:'OPERATOR',
  permissions:['units.read','catalog.manage','professionals.manage'],
 }});
 await prisma.session.create({data:{userId:user.id,tokenHash:sha(sessionToken),csrfHash:sha(csrfToken),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
 for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name},update:{name,active:true}});
 await prisma.auditEvent.deleteMany({where:{entityId:{in:Object.values(ids)}}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:ids.pro}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:ids.pro}}).catch(()=>{});
 await prisma.workstation.deleteMany({where:{id:ids.ws}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:ids.svc}}).catch(()=>{});
 await prisma.serviceCategory.deleteMany({where:{id:ids.cat}}).catch(()=>{});

 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:'centro'},stdio:['ignore','pipe','pipe']});
 try{
  await waitHealth();
  const auth={cookie:'imperio_session='+sessionToken,'x-csrf-token':csrfToken,'content-type':'application/json','x-unit-id':'centro'};
  let r=await fetch(base+'/api/v1/auth/me',{headers:{cookie:'imperio_session='+sessionToken}});ok(r.ok,'funcionária entra');
  const me=await r.json();ok(me.user?.networkAdmin===false,'funcionária não é networkAdmin');

  r=await fetch(base+'/api/v1/units',{headers:{cookie:'imperio_session='+sessionToken}});
  ok(r.ok,'funcionária acessa unidades centrais');
  const units=await r.json(),unitMap=new Map(units.map(x=>[x.id,x.name]));
  assert.deepEqual([...unitMap.keys()].filter(x=>['centro','big','shopping-contagem'].includes(x)).sort(),['big','centro','shopping-contagem']);tests++;
  ok(unitMap.get('centro')==='Centro de Contagem'&&unitMap.get('big')==='Big Shopping'&&unitMap.get('shopping-contagem')==='Shopping Contagem','três unidades aparecem com nomes canônicos');

  for(const p of ['/api/v1/config/categories','/api/v1/config/services','/api/v1/config/professionals','/api/v1/config/workstations']){
   r=await fetch(base+p,{headers:{cookie:'imperio_session='+sessionToken,'x-unit-id':'centro'}});ok(r.ok,'funcionária acessa '+p);
  }
  r=await fetch(base+'/api/v1/admin/users',{headers:{cookie:'imperio_session='+sessionToken,'x-unit-id':'centro'}});ok(r.status===403,'funcionária não acessa administração de usuários');

  r=await fetch(base+'/api/v1/config/categories',{method:'POST',headers:auth,body:JSON.stringify({id:ids.cat,name:'Categoria Funcionária CI',description:'teste',sortOrder:10,active:true,config:{serviceDefaults:{clientArea:'hands',mustFinishBeforeSameArea:true}}})});ok(r.ok,'categoria salva');
  r=await fetch(base+'/api/v1/config/services',{method:'POST',headers:auth,body:JSON.stringify({id:ids.svc,name:'Serviço Funcionária CI',categoryId:ids.cat,categoryName:'Categoria Funcionária CI',price:90,durationMin:50,active:true,config:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{}}})});ok(r.ok,'serviço salva');
  let service=await r.json();ok(service.config.clientArea==='hands'&&service.config.mustFinishBeforeSameArea===true,'regras estruturais do serviço recarregam');

  r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:auth,body:JSON.stringify({id:ids.pro,name:'Profissional Funcionária CI',publicName:'Pro CI',active:true,unitIds:['centro','big','shopping-contagem'],config:{schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'},'big-2':{work:true,start:'10:00',end:'19:00'},'shopping-contagem-3':{work:true,start:'11:00',end:'20:00'}}},serviceRules:{[ids.svc]:{enabled:true,duration:40,commission:50,price:95,online:true}}})});ok(r.ok,'profissional multiunidade salva');
  const pro=await r.json();assert.deepEqual([...pro.unitIds].sort(),['big','centro','shopping-contagem']);tests++;
  ok(pro.config.schedule['centro-1'].start==='09:00'&&pro.serviceRules[ids.svc].duration===40&&Number(pro.serviceRules[ids.svc].price)===95,'escala e overrides recarregam');

  r=await fetch(base+'/api/v1/config/professionals',{headers:{cookie:'imperio_session='+sessionToken,'x-unit-id':'centro'}});
  ok(r.ok,'profissionais recarregam após salvar');
  const reloaded=(await r.json()).find(x=>x.id===ids.pro);
  assert.ok(reloaded);tests++;
  assert.deepEqual([...reloaded.unitIds].sort(),['big','centro','shopping-contagem']);tests++;
  ok(
   reloaded.config.schedule['centro-1'].start==='09:00'&&reloaded.config.schedule['centro-1'].end==='18:00'&&
   reloaded.config.schedule['big-2'].start==='10:00'&&reloaded.config.schedule['big-2'].end==='19:00'&&
   reloaded.config.schedule['shopping-contagem-3'].start==='11:00'&&reloaded.config.schedule['shopping-contagem-3'].end==='20:00',
   'refresh mantém escalas independentes por unidade'
  );

  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:auth,body:JSON.stringify({id:ids.ws,unitId:'big',name:'Estação Funcionária CI',allowedCategoryIds:[ids.cat],active:true,config:{}})});ok(r.ok,'workstation salva');
  const ws=await r.json();ok(ws.unitId==='big'&&ws.allowedCategoryIds.includes(ids.cat),'allowedCategoryIds recarrega sem mistura de unidade');

  ok(await prisma.professionalUnit.count({where:{professionalId:ids.pro,active:true}})===3,'vínculos multiunidade persistem no banco');
  ok(await prisma.auditEvent.count({where:{entityId:{in:Object.values(ids)}}})>=4,'alterações ficam auditadas');
  console.log(JSON.stringify({ok:true,tests,feature:'employee_configuration_permissions',networkAdmin:false,catalog:true,professionals:true,usersAdmin:false,multiUnit:true}));
 }finally{
  server.kill('SIGTERM');
  await prisma.professionalUnit.deleteMany({where:{professionalId:ids.pro}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:ids.pro}}).catch(()=>{});
  await prisma.workstation.deleteMany({where:{id:ids.ws}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:ids.svc}}).catch(()=>{});
  await prisma.serviceCategory.deleteMany({where:{id:ids.cat}}).catch(()=>{});
  await prisma.auditEvent.deleteMany({where:{entityId:{in:Object.values(ids)}}}).catch(()=>{});
  await prisma.session.deleteMany({where:{userId:user.id}}).catch(()=>{});
  await prisma.user.deleteMany({where:{id:user.id}}).catch(()=>{});
  await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
