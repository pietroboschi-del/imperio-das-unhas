import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient(),base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=v=>createHash('sha256').update(String(v)).digest('hex');
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)},cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function waitHealth(){for(let i=0;i<60;i++){try{let r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
async function main(){
  const ownerUsername='cfg_owner_ci',sessionToken='cfg-session-token-ci',csrfToken='cfg-csrf-token-ci';
  await prisma.user.upsert({where:{username:ownerUsername},create:{username:ownerUsername,displayName:'Config Owner CI',passwordResetRequired:false,active:true,networkAdmin:true,systemRole:'OWNER',permissions:['*']},update:{passwordResetRequired:false,active:true,networkAdmin:true,systemRole:'OWNER',permissions:['*']}});
  const owner=await prisma.user.findUniqueOrThrow({where:{username:ownerUsername}});
  await prisma.session.deleteMany({where:{userId:owner.id}});
  await prisma.session.create({data:{userId:owner.id,tokenHash:sha(sessionToken),csrfHash:sha(csrfToken),status:'ACTIVE',expiresAt:new Date(Date.now()+3600000)}});
  for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name},update:{name,active:true}});
  await prisma.auditEvent.deleteMany({where:{entityId:{in:['cfg_service_ci','cfg_pro_ci','cfg_cat_ci','cfg_ws_ci']}}});
  await prisma.workstation.deleteMany({where:{id:'cfg_ws_ci'}});
  await prisma.professionalUnit.deleteMany({where:{professionalId:'cfg_pro_ci'}});await prisma.professional.deleteMany({where:{id:'cfg_pro_ci'}});await prisma.service.deleteMany({where:{id:'cfg_service_ci'}});await prisma.serviceCategory.deleteMany({where:{id:'cfg_cat_ci'}});
  const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:'centro'},stdio:['ignore','pipe','pipe']});
  try{
    await waitHealth();
    let r;const h={'content-type':'application/json','x-csrf-token':csrfToken,'cookie':'imperio_session='+sessionToken,'x-unit-id':'big'};
    r=await fetch(base+'/api/v1/auth/me',{headers:{cookie:'imperio_session='+sessionToken}});ok(r.ok,'owner session');
    r=await fetch(base+'/api/v1/config/services',{method:'POST',headers:h,body:JSON.stringify({id:'cfg_service_ci',name:'Config CI',categoryId:'cfg_cat_ci',categoryName:'Categoria CI',price:77.5,durationMin:45,active:true,config:{show:true,online:true,clientArea:'hands',proRules:{}}})});ok(r.ok,'serviço estrutural é criado com operação global bloqueada');
    r=await fetch(base+'/api/v1/config/categories',{method:'POST',headers:h,body:JSON.stringify({id:'cfg_cat_ci',name:'Categoria CI',description:'Categoria central',sortOrder:20,active:true,config:{serviceDefaults:{clientArea:'hands'}}})});ok(r.ok,'categoria estrutural é persistida centralmente');
    let cat=await r.json();ok(cat.description==='Categoria central'&&cat.sortOrder===20,'metadados da categoria persistem');
    r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:h,body:JSON.stringify({id:'cfg_ws_ci',unitId:'big',name:'Mesa CI 01',allowedCategoryIds:['cfg_cat_ci'],active:true,config:{source:'integration'}})});ok(r.ok,'estação estrutural é criada no Big');
    let ws=await r.json();ok(ws.unitId==='big'&&ws.allowedCategoryIds.includes('cfg_cat_ci'),'estação preserva unidade e categorias');
    ok(await prisma.workstation.count({where:{id:'cfg_ws_ci',unitId:'big',active:true}})===1,'estação persistida no PostgreSQL');
    r=await fetch(base+'/api/v1/config/professionals',{method:'POST',headers:h,body:JSON.stringify({id:'cfg_pro_ci',name:'Profissional Config CI',publicName:'Config CI',active:true,unitIds:['big','centro','shopping-contagem'],config:{specialty:'Teste',schedule:{'centro-1':{work:true,start:'09:00',end:'18:00'}}},serviceRules:{cfg_service_ci:{enabled:true,duration:40,commission:50,price:80,online:true}}})});ok(r.ok,'profissional estrutural é criada nas três unidades mesmo com Big operacionalmente bloqueado');
    const p=await r.json();assert.deepEqual([...p.unitIds].sort(),['big','centro','shopping-contagem']);tests++;
    ok(await prisma.professionalUnit.count({where:{professionalId:'cfg_pro_ci',active:true}})===3,'três vínculos persistidos');
    const service=await prisma.service.findUnique({where:{id:'cfg_service_ci'}}),legacy=service?.legacyPayload||{};
    ok(legacy?.proRules?.cfg_pro_ci?.enabled===true,'regra profissional-serviço persistida');
    r=await fetch(base+'/api/v1/config/services/cfg_service_ci',{method:'PATCH',headers:h,body:JSON.stringify({id:'cfg_service_ci',name:'Config CI Atualizado',categoryId:'cfg_cat_ci',categoryName:'Categoria CI',price:88,durationMin:50,active:true,config:{show:true,online:false,clientArea:'hands',proRules:{cfg_pro_ci:{enabled:true,duration:50,commission:55,price:90,online:false}}}})});ok(r.ok,'serviço estrutural atualiza');
    r=await fetch(base+'/api/v1/config/professionals/cfg_pro_ci/active',{method:'PATCH',headers:h,body:JSON.stringify({active:false})});ok(r.ok,'status profissional atualiza');
    ok(await prisma.auditEvent.count({where:{entityId:{in:['cfg_service_ci','cfg_pro_ci']}}})>=4,'configurações ficam auditadas');
    r=await fetch(base+'/api/v1/public/bookings',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'cfg-blocked-booking'},body:JSON.stringify({unitId:'big',serviceId:'cfg_service_ci',professionalId:'cfg_pro_ci',startAt:'2026-10-08T10:00',clientName:'Teste Gate',clientPhone:'31999999991'})});ok(r.status===503,'configurar Big não libera operação no Big');
    console.log(JSON.stringify({ok:true,tests,feature:'central_catalog_professional_configuration'}));
  }finally{
    server.kill('SIGTERM');
    await prisma.professionalUnit.deleteMany({where:{professionalId:'cfg_pro_ci'}}).catch(()=>{});await prisma.professional.deleteMany({where:{id:'cfg_pro_ci'}}).catch(()=>{});await prisma.workstation.deleteMany({where:{id:'cfg_ws_ci'}}).catch(()=>{});await prisma.service.deleteMany({where:{id:'cfg_service_ci'}}).catch(()=>{});await prisma.serviceCategory.deleteMany({where:{id:'cfg_cat_ci'}}).catch(()=>{});await prisma.auditEvent.deleteMany({where:{entityId:{in:['cfg_service_ci','cfg_pro_ci','cfg_cat_ci','cfg_ws_ci']}}}).catch(()=>{});await prisma.session.deleteMany({where:{user:{username:'cfg_owner_ci'}}}).catch(()=>{});await prisma.user.deleteMany({where:{username:'cfg_owner_ci'}}).catch(()=>{});await prisma.$disconnect();
  }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
