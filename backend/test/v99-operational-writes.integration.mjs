import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitHealth(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}await sleep(500)}throw new Error('backend não iniciou')}
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function main(){
 await prisma.auditEvent.deleteMany();await prisma.booking.deleteMany();await prisma.clientUnitLink.deleteMany();await prisma.client.deleteMany();await prisma.professionalUnit.deleteMany();await prisma.professional.deleteMany();await prisma.service.deleteMany();await prisma.serviceCategory.deleteMany();await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();await prisma.unit.deleteMany();
 for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name}});
 await prisma.service.create({data:{id:'s1',name:'Manicure',price:'50.00',durationMin:60}});
 await prisma.professional.create({data:{id:'p1',name:'Profissional 1',units:{create:[{unitId:'centro'},{unitId:'big'}]}}});
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'centro,big'},stdio:['ignore','pipe','pipe']});
 try{
  await waitHealth();
  let r=await fetch(base+'/api/v1/health');const health=await r.json();ok(health.operationalWritesEnabled===true&&Array.isArray(health.operationalWriteUnits)&&health.operationalWriteUnits.length===2&&health.operationalWriteUnits.includes('centro')&&health.operationalWriteUnits.includes('big'),'health expõe allowlist Centro + Big');
  r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});ok(r.ok,'owner login');
  const oc=cookieOf(r),oa=await r.json(),oh={'content-type':'application/json','x-csrf-token':oa.csrfToken,'cookie':oc};
  r=await fetch(base+'/api/v1/clients',{method:'POST',headers:{...oh,'x-unit-id':'shopping-contagem','idempotency-key':'owner-shopping-client'},body:JSON.stringify({name:'Bloqueado Shopping',phone:'+5531999990099'})});ok(r.status===503,'allowlist bloqueia cliente no Shopping até para owner');
  r=await fetch(base+'/api/v1/cash-sessions',{method:'POST',headers:{...oh,'x-unit-id':'shopping-contagem','idempotency-key':'owner-shopping-cash'},body:JSON.stringify({businessDate:'2026-10-06',openingAmount:100})});ok(r.status===503,'allowlist bloqueia financeiro no Shopping até para owner');
  r=await fetch(base+'/api/v1/public/bookings',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'public-shopping-blocked'},body:JSON.stringify({unitId:'shopping-contagem',serviceId:'s1',professionalId:'p1',startAt:'2026-10-06T11:00',clientName:'Cliente Site Bloqueado',clientPhone:'31999999999'})});ok(r.status===503,'allowlist bloqueia agendamento público no Shopping');
  r=await fetch(base+'/api/v1/admin/users',{method:'POST',headers:oh,body:JSON.stringify({username:'recepcao_centro_ci',displayName:'Recepção Centro CI',systemRole:'OPERATOR',permissions:[],units:[{unitId:'centro',role:'reception',permissions:['clients.read','clients.manage','agenda.read','agenda.manage']}]})});ok(r.ok,'cria recepção Centro');const user=await r.json();
  r=await fetch(base+`/api/v1/auth/users/${user.id}/activation-token`,{method:'POST',headers:oh,body:'{}'});const invite=await r.json();
  r=await fetch(base+'/api/v1/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:invite.token,newPassword:'centro-password-123'})});ok(r.ok,'ativa recepção');
  r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'recepcao_centro_ci',password:'centro-password-123'})});ok(r.ok,'login recepção');const uc=cookieOf(r),ua=await r.json(),h={'content-type':'application/json','x-csrf-token':ua.csrfToken,'cookie':uc,'x-unit-id':'centro','idempotency-key':'client-1'};
  r=await fetch(base+'/api/v1/clients',{method:'POST',headers:h,body:JSON.stringify({name:'Cliente Piloto',phone:'+5531999990001'})});ok(r.ok,'Centro cria cliente');const client=await r.json();
  r=await fetch(base+'/api/v1/clients',{method:'POST',headers:h,body:JSON.stringify({name:'Cliente Piloto',phone:'+5531999990001'})});ok(r.ok,'repetição idempotente');ok(await prisma.client.count({where:{phone:'+5531999990001'}})===1,'cliente não duplica');
  const bh={...h,'idempotency-key':'booking-1'};
  r=await fetch(base+'/api/v1/bookings',{method:'POST',headers:bh,body:JSON.stringify({clientId:client.id,serviceId:'s1',professionalId:'p1',serviceDate:'2026-10-06',startAt:'2026-10-06T12:00:00.000Z'})});ok(r.ok,'Centro cria agendamento');
  r=await fetch(base+'/api/v1/bookings',{method:'POST',headers:bh,body:JSON.stringify({clientId:client.id,serviceId:'s1',professionalId:'p1',serviceDate:'2026-10-06',startAt:'2026-10-06T12:00:00.000Z'})});ok(r.ok,'agendamento idempotente');ok(await prisma.booking.count({where:{unitId:'centro'}})===1,'agendamento não duplica');
  r=await fetch(base+'/api/v1/bookings',{method:'POST',headers:bh,body:JSON.stringify({clientId:client.id,serviceId:'s1',professionalId:'p1',serviceDate:'2026-10-06',startAt:'2026-10-06T15:00:00.000Z'})});ok(r.status===409,'mesma Idempotency-Key não pode apontar para outro agendamento');ok(await prisma.booking.count({where:{unitId:'centro'}})===1,'reuso inválido da chave não cria nem mascara outro booking');
  for(const unitId of ['big','shopping-contagem']){r=await fetch(base+'/api/v1/bookings',{method:'POST',headers:{...bh,'x-unit-id':unitId,'idempotency-key':'cross-'+unitId},body:JSON.stringify({clientId:client.id,serviceId:'s1',professionalId:'p1',serviceDate:'2026-10-06',startAt:'2026-10-06T13:00:00.000Z'})});ok(r.status===403,`Centro não escreve em ${unitId}`)}
  ok(await prisma.booking.count({where:{unitId:{not:'centro'}}})===0,'outras unidades permanecem intactas');
  const operationalAudit=await prisma.auditEvent.findMany({where:{unitId:'centro',action:{in:['client.created','booking.created']}},select:{action:true}}),operationalActions=operationalAudit.map(x=>x.action);
  ok(operationalActions.filter(x=>x==='client.created').length===1&&operationalActions.filter(x=>x==='booking.created').length===1,'cliente e agendamento auditados');
  const parallelClients=await Promise.all(['centro','big'].map(unit=>fetch(base+'/api/v1/clients',{method:'POST',headers:{...oh,'x-unit-id':unit,'idempotency-key':'parallel-identity-'+unit},body:JSON.stringify({name:'Concurrent Network Client',phone:'+5531999990077'})})));
  ok(parallelClients.every(x=>x.ok),'cadastros concorrentes autorizados');const parallelRows=await Promise.all(parallelClients.map(x=>x.json()));ok(parallelRows[0].id===parallelRows[1].id&&await prisma.client.count({where:{phone:'+5531999990077'}})===1,'cadastros concorrentes entre unidades convergem para identidade global');
  const sharedKey='owner-shared-client-key';
  r=await fetch(base+'/api/v1/clients',{method:'POST',headers:{...oh,'x-unit-id':'centro','idempotency-key':sharedKey},body:JSON.stringify({name:'Cliente Owner Centro',phone:'+5531999990081'})});ok(r.ok,'owner cria cliente no Centro com chave compartilhada');const ownerCentro=await r.json();
  r=await fetch(base+'/api/v1/clients',{method:'POST',headers:{...oh,'x-unit-id':'big','idempotency-key':sharedKey},body:JSON.stringify({name:'Cliente Owner Big',phone:'+5531999990082'})});ok(r.ok,'mesma Idempotency-Key pode ser usada em outra unidade sem colisão');const ownerBig=await r.json();
  ok(ownerCentro.id!==ownerBig.id,'idempotência de cliente é escopada por unidade');
  ok(await prisma.clientUnitLink.count({where:{clientId:ownerCentro.id,unitId:'centro',active:true}})===1&&await prisma.clientUnitLink.count({where:{clientId:ownerBig.id,unitId:'big',active:true}})===1,'cada cliente preserva vínculo com sua unidade');
  // Domain-scoped network Agenda permission: cross-unit booking, not cash/stock.
  r=await fetch(base+'/api/v1/admin/users',{method:'POST',headers:oh,body:JSON.stringify({
    username:'recepcao_agenda_rede_ci',displayName:'Recepção Agenda Rede CI',systemRole:'OPERATOR',
    permissions:['agenda.read','agenda.manage','clients.read'],
    units:[{unitId:'centro',role:'reception',permissions:['clients.read']}]
  })});ok(r.ok,'owner creates network agenda receptionist');const crossUser=await r.json();
  r=await fetch(base+'/api/v1/auth/users/'+crossUser.id+'/activation-token',{method:'POST',headers:oh,body:'{}'});
  ok(r.ok,'network agenda activation token issued');const crossInvite=await r.json();
  r=await fetch(base+'/api/v1/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:crossInvite.token,newPassword:'network-agenda-password-123'})});
  ok(r.ok,'network agenda receptionist activated');
  r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'recepcao_agenda_rede_ci',password:'network-agenda-password-123'})});
  ok(r.ok,'network agenda receptionist authenticates through real API');const crossCookie=cookieOf(r),crossAuth=await r.json();
  const crossHeaders={'content-type':'application/json','x-csrf-token':crossAuth.csrfToken,'cookie':crossCookie,'x-unit-id':'big'};
  r=await fetch(base+'/api/v1/clients?q=Cliente%20Piloto',{headers:{cookie:crossCookie,'x-unit-id':'big'}});
  ok(r.ok,'explicit global clients.read enables cross-unit client search');
  ok((await r.json()).some(x=>x.id===client.id),'same client found in Big context');
  r=await fetch(base+'/api/v1/bookings',{method:'POST',headers:{...crossHeaders,'idempotency-key':'cross-agenda-big'},body:JSON.stringify({clientId:client.id,serviceId:'s1',professionalId:'p1',serviceDate:'2026-10-06',startAt:'2026-10-06T14:00:00.000Z'})});
  ok(r.ok,'globally authorized reception books Centro client in Big');const crossBooking=await r.json();
  ok(crossBooking.unitId==='big'&&crossBooking.clientId===client.id,'cross-unit booking reuses single global Client identity');
  r=await fetch(base+'/api/v1/cash-sessions',{method:'POST',headers:{...crossHeaders,'idempotency-key':'cross-cash-denied'},body:JSON.stringify({businessDate:'2026-10-06',openingAmount:0})});
  ok(r.status===403,'network agenda grant does not authorize Big cash');
  const locationCountBeforeDeniedStock=await prisma.stockLocation.count();
  r=await fetch(base+'/api/v1/stock/consumptions',{method:'POST',headers:{...crossHeaders,'idempotency-key':'cross-stock-denied'},body:JSON.stringify({locationId:'big',items:[{productId:'synthetic-denied',qty:1}]})});
  ok(r.status===403,'network agenda grant does not authorize Big stock');
  ok(await prisma.stockLocation.count()===locationCountBeforeDeniedStock,'denied stock request does not create locations');
  r=await fetch(base+'/api/v1/config/workstations',{method:'POST',headers:crossHeaders,body:JSON.stringify({id:'cross-config-denied',unitId:'big',name:'Forbidden',allowedCategoryIds:[]})});
  ok(r.status===403,'network agenda grant does not authorize structural configuration');
  ok(await prisma.client.count({where:{id:client.id}})===1,'same Client retained across Centro and Big');
  console.log(JSON.stringify({ok:true,tests,feature:'multi_unit_operational_writes'}));
 }finally{server.kill('SIGTERM');await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
