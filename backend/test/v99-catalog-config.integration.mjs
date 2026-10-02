import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient(),base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)},cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function waitHealth(){for(let i=0;i<60;i++){try{let r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
async function main(){
  for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.upsert({where:{id},create:{id,name},update:{name,active:true}});
  await prisma.auditEvent.deleteMany({where:{entityId:{in:['cfg_service_ci','cfg_pro_ci']}}});
  await prisma.professionalUnit.deleteMany({where:{professionalId:'cfg_pro_ci'}});await prisma.professional.deleteMany({where:{id:'cfg_pro_ci'}});await prisma.service.deleteMany({where:{id:'cfg_service_ci'}});await prisma.serviceCategory.deleteMany({where:{id:'cfg_cat_ci'}});
  const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'false',OPERATIONAL_WRITES_UNITS:'centro'},stdio:['ignore','pipe','pipe']});
  try{
    await waitHealth();
    let r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});ok(r.ok,'owner login');
    const c=cookieOf(r),a=await r.json(),h={'content-type':'application/json','x-csrf-token':a.csrfToken,'cookie':c,'x-unit-id':'big'};
    r=await fetch(base+'/api/v1/config/services',{method:'POST',headers:h,body:JSON.stringify({id:'cfg_service_ci',name:'Config CI',categoryId:'cfg_cat_ci',categoryName:'Categoria CI',price:77.5,durationMin:45,active:true,config:{show:true,online:true,clientArea:'hands',proRules:{}}})});ok(r.ok,'serviço estrutural é criado com operação global bloqueada');
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
    await prisma.professionalUnit.deleteMany({where:{professionalId:'cfg_pro_ci'}}).catch(()=>{});await prisma.professional.deleteMany({where:{id:'cfg_pro_ci'}}).catch(()=>{});await prisma.service.deleteMany({where:{id:'cfg_service_ci'}}).catch(()=>{});await prisma.serviceCategory.deleteMany({where:{id:'cfg_cat_ci'}}).catch(()=>{});await prisma.auditEvent.deleteMany({where:{entityId:{in:['cfg_service_ci','cfg_pro_ci']}}}).catch(()=>{});await prisma.$disconnect();
  }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
