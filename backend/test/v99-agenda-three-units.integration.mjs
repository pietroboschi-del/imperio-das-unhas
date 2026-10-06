import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(){for(let i=0;i<70;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(400)}throw Error('backend start timeout')}
const cookie=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function login(username,password){const r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});ok(r.ok,'login '+username);const body=await r.json();return {cookie:cookie(r),csrf:body.csrfToken}}
async function activate(ownerHeaders,user,password){let r=await fetch(base+`/api/v1/auth/users/${user.id}/activation-token`,{method:'POST',headers:ownerHeaders,body:'{}'});ok(r.ok,'activation token '+user.username);const inv=await r.json();r=await fetch(base+'/api/v1/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:inv.token,newPassword:password})});ok(r.ok,'activate '+user.username)}
const item=(serviceId,professionalId,startAt)=>({serviceId,professionalId,startAt});
async function api(path,{method='GET',headers={},body}={}){return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}

async function main(){
 await prisma.auditEvent.deleteMany();await prisma.booking.deleteMany();await prisma.clientUnitLink.deleteMany();await prisma.client.deleteMany();await prisma.professionalUnit.deleteMany();await prisma.professional.deleteMany();await prisma.service.deleteMany();await prisma.serviceCategory.deleteMany();await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();await prisma.unit.deleteMany();
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name,active:true}});
 await prisma.service.createMany({data:[
  {id:'hands',name:'Mãos',price:'45',durationMin:45,legacyPayload:{clientArea:'hands',mustFinishBeforeSameArea:false,proRules:{p1:{enabled:true,duration:50,price:55},p2:{enabled:true,duration:45,price:52}}}},
  {id:'feet',name:'Pés',price:'50',durationMin:40,legacyPayload:{clientArea:'feet',mustFinishBeforeSameArea:false,proRules:{p1:{enabled:true,duration:40,price:50},p2:{enabled:true,duration:35,price:60}}}},
  {id:'hands-lead',name:'Gel mãos',price:'90',durationMin:60,legacyPayload:{clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{p1:{enabled:true,duration:60,price:95},p2:{enabled:true,duration:60,price:90}}}},
 ]});
 for(const pid of ['p1','p2'])await prisma.professional.create({data:{id:pid,name:'Profissional '+pid,legacyPayload:{services:['hands','feet','hands-lead']},units:{create:['centro','big','shopping-contagem'].map(unitId=>({unitId,active:true}))}}});

 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'centro,big,shopping-contagem'},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  const owner=await login(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD),oh={'content-type':'application/json','cookie':owner.cookie,'x-csrf-token':owner.csrf};
  let r=await api('/api/v1/admin/users',{method:'POST',headers:oh,body:{username:'agenda_multi_ci',displayName:'Agenda Multi CI',systemRole:'OPERATOR',permissions:['units.read','catalog.read'],units:['centro','big','shopping-contagem'].map(unitId=>({unitId,role:'reception',permissions:['clients.read','clients.manage','agenda.read','agenda.manage','professionals.read']}))}});ok(r.ok,'create multi user');const multiUser=await r.json();
  r=await api('/api/v1/admin/users',{method:'POST',headers:oh,body:{username:'agenda_centro_ci',displayName:'Agenda Centro CI',systemRole:'OPERATOR',permissions:['units.read','catalog.read'],units:[{unitId:'centro',role:'reception',permissions:['clients.read','clients.manage','agenda.read','agenda.manage','professionals.read']}]}});ok(r.ok,'create centro user');const centroUser=await r.json();
  await activate(oh,multiUser,'agenda-multi-123');await activate(oh,centroUser,'agenda-centro-123');
  const multi=await login('agenda_multi_ci','agenda-multi-123'),centro=await login('agenda_centro_ci','agenda-centro-123');
  const mh={'content-type':'application/json','cookie':multi.cookie,'x-csrf-token':multi.csrf},ch={'content-type':'application/json','cookie':centro.cookie,'x-csrf-token':centro.csrf};

  const created={};
  for(const [i,unitId] of ['centro','big','shopping-contagem'].entries()){
   r=await api('/api/v1/clients',{method:'POST',headers:{...mh,'x-unit-id':unitId,'idempotency-key':'agenda-client-'+unitId},body:{name:'Cliente '+unitId,phone:'3197777000'+i}});ok(r.ok,'client '+unitId);const cli=await r.json();
   const date='2026-10-10',hour=10+i;
   r=await api('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':unitId,'idempotency-key':'agenda-multi-'+unitId},body:{clientId:cli.id,serviceDate:date,status:'Agendado',items:[
    item('hands','p1',`2026-10-10T${String(hour).padStart(2,'0')}:00:00-03:00`),
    item('feet','p2',`2026-10-10T${String(hour).padStart(2,'0')}:00:00-03:00`),
   ]}});ok(r.ok,'create multi-service '+unitId);const b=await r.json();created[unitId]={b,cli};
   const db=await prisma.booking.findUnique({where:{id:b.id}}),items=db.legacyPayload.items;
   ok(db.unitId===unitId&&items.length===2,'persist unit/items '+unitId);
   ok(items[0].professionalId==='p1'&&items[1].professionalId==='p2','professional per item '+unitId);
   ok(items[0].durationMin===50&&Number(items[0].price)===55&&items[1].durationMin===35&&Number(items[1].price)===60,'professional duration/price snapshots '+unitId);
  }

  // Edit Big: service, professional and time all change while unit remains Big.
  const big=created.big.b;
  r=await api('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'big'},body:{serviceDate:'2026-10-10',status:'Confirmado',items:[
   item('feet','p2','2026-10-10T14:00:00-03:00'),
   item('hands','p1','2026-10-10T14:45:00-03:00'),
  ]}});ok(r.ok,'edit big booking');
  let db=await prisma.booking.findUnique({where:{id:big.id}});let its=db.legacyPayload.items;
  ok(db.unitId==='big'&&db.status==='Confirmado','edit keeps Big');
  ok(its[0].serviceId==='feet'&&its[0].professionalId==='p2'&&its[0].startAt==='2026-10-10T17:00:00.000Z','edit service/pro/time');

  // Rebook Shopping Contagem to another date/time.
  const sc=created['shopping-contagem'].b;
  r=await api('/api/v1/bookings/'+sc.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{serviceDate:'2026-10-11',items:[
   item('hands','p1','2026-10-11T09:00:00-03:00'),
   item('feet','p2','2026-10-11T09:00:00-03:00'),
  ]}});ok(r.ok,'reschedule shopping-contagem');
  db=await prisma.booking.findUnique({where:{id:sc.id}});ok(db.unitId==='shopping-contagem'&&db.serviceDate.toISOString().slice(0,10)==='2026-10-11','reschedule keeps unit');

  // Cancel Centro without rewriting items.
  const cb=created.centro.b;
  r=await api('/api/v1/bookings/'+cb.id,{method:'PATCH',headers:{...mh,'x-unit-id':'centro'},body:{status:'Cancelado'}});ok(r.ok,'cancel centro');
  db=await prisma.booking.findUnique({where:{id:cb.id}});ok(db.status==='Cancelado'&&db.unitId==='centro'&&db.legacyPayload.items.length===2,'cancel preserves items/unit');

  // Restricted user cannot edit Big.
  r=await api('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...ch,'x-unit-id':'big'},body:{status:'Agendado'}});ok(r.status===403,'single-unit user cannot edit Big');

  // Even a multi-unit user cannot address a Big booking through Shopping scope.
  r=await api('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Agendado'}});ok(r.status===404,'booking cannot leak across unit scope');
  db=await prisma.booking.findUnique({where:{id:big.id}});ok(db.unitId==='big'&&db.status==='Confirmado','cross-unit attempt changed nothing');

  // Same-area simultaneity/sequence remains blocked.
  const cli=created.big.cli;
  r=await api('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'area-invalid'},body:{clientId:cli.id,serviceDate:'2026-10-12',items:[
   item('hands-lead','p1','2026-10-12T10:00:00-03:00'),
   item('hands','p2','2026-10-12T10:30:00-03:00'),
  ]}});ok(r.status===409,'same-area sequence blocked');

  // Professional overlap remains blocked.
  r=await api('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'pro-a'},body:{clientId:cli.id,serviceDate:'2026-10-13',items:[item('feet','p1','2026-10-13T10:00:00-03:00')]}});ok(r.ok,'baseline professional booking');
  r=await api('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'pro-b'},body:{clientId:cli.id,serviceDate:'2026-10-13',items:[item('hands','p1','2026-10-13T10:20:00-03:00')]}});ok(r.status===409,'professional overlap blocked');

  for(const unitId of ['centro','big','shopping-contagem'])ok(await prisma.auditEvent.count({where:{unitId,entityType:'Booking'}})>0,'booking audit '+unitId);
  console.log(JSON.stringify({ok:true,tests:n,feature:'three_unit_central_agenda'}));
 }finally{server.kill('SIGTERM');await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
