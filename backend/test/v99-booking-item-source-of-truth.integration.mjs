import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)};
const port=3137,base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
async function wait(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(250)}throw Error('backend start timeout')}
async function login(username,password){const r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});ok(r.ok,'login '+username);const a=await r.json();return {'content-type':'application/json','cookie':cookieOf(r),'x-csrf-token':a.csrfToken}}
async function activate(oh,user,password){let r=await fetch(base+`/api/v1/auth/users/${user.id}/activation-token`,{method:'POST',headers:oh,body:'{}'});ok(r.ok,'activation token');const t=await r.json();r=await fetch(base+'/api/v1/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:t.token,newPassword:password})});ok(r.ok,'activation')}
async function req(path,{method='GET',headers={},body}={}){return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
const item=(serviceId,professionalId,startAt,extra={})=>({serviceId,professionalId,startAt,...extra});

async function clean(){
 await prisma.auditEvent.deleteMany();await prisma.bookingItem.deleteMany();await prisma.booking.deleteMany();await prisma.clientUnitLink.deleteMany();await prisma.client.deleteMany();
 await prisma.professionalUnit.deleteMany();await prisma.professional.deleteMany();await prisma.workstation.deleteMany();await prisma.service.deleteMany();await prisma.serviceCategory.deleteMany();
 await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();await prisma.user.deleteMany({where:{username:{not:process.env.ADMIN_USERNAME}}});await prisma.unit.deleteMany();
}
async function main(){
 await clean();
 for(const [id,name] of [['centro','Centro de Contagem'],['big','Big Shopping'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name,active:true}});
 await prisma.serviceCategory.createMany({data:[{id:'hands-cat',name:'Mãos'},{id:'feet-cat',name:'Pés'}]});
 await prisma.service.createMany({data:[
  {id:'mani',categoryId:'hands-cat',name:'Manicure',price:'45',durationMin:45,legacyPayload:{clientArea:'hands',mustFinishBeforeSameArea:false,proRules:{p1:{enabled:true,duration:50,price:55},p2:{enabled:true,duration:40,price:52}}}},
  {id:'gel',categoryId:'hands-cat',name:'Gel',price:'90',durationMin:60,legacyPayload:{clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{p1:{enabled:true,duration:60,price:95},p2:{enabled:true,duration:60,price:90}}}},
  {id:'pedi',categoryId:'feet-cat',name:'Pedicure',price:'50',durationMin:45,legacyPayload:{clientArea:'feet',mustFinishBeforeSameArea:false,proRules:{p1:{enabled:true,duration:45,price:50},p2:{enabled:true,duration:35,price:60}}}},
 ]});
 for(const p of ['p1','p2'])await prisma.professional.create({data:{id:p,name:'Profissional '+p,active:true,legacyPayload:{services:['mani','gel','pedi'],schedule:Object.fromEntries(['centro','big','shopping-contagem'].flatMap(u=>Array.from({length:7},(_,d)=>[u+'-'+d,{work:true,start:'09:00',end:'23:00'}])))},units:{create:['centro','big','shopping-contagem'].map(unitId=>({unitId,active:true}))}}});

 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'centro,big,shopping-contagem'},stdio:['ignore','pipe','pipe']});
 try{
  await wait();
  const owner=await login(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD);
  let r=await req('/api/v1/admin/users',{method:'POST',headers:owner,body:{username:'bookingitem_multi',displayName:'BookingItem Multi',systemRole:'OPERATOR',permissions:['units.read','catalog.read'],units:['centro','big','shopping-contagem'].map(unitId=>({unitId,role:'reception',permissions:['clients.read','clients.manage','agenda.read','agenda.manage','professionals.read']}))}});ok(r.ok,'create multi');const multiUser=await r.json();
  r=await req('/api/v1/admin/users',{method:'POST',headers:owner,body:{username:'bookingitem_centro',displayName:'BookingItem Centro',systemRole:'OPERATOR',permissions:['units.read','catalog.read'],units:[{unitId:'centro',role:'reception',permissions:['clients.read','clients.manage','agenda.read','agenda.manage','professionals.read']}]}});ok(r.ok,'create restricted');const restrictedUser=await r.json();
  await activate(owner,multiUser,'multi-bookingitem-123');await activate(owner,restrictedUser,'centro-bookingitem-123');
  const mh=await login('bookingitem_multi','multi-bookingitem-123'),rh=await login('bookingitem_centro','centro-bookingitem-123');

  const created={};
  for(const [idx,unitId] of ['centro','big','shopping-contagem'].entries()){
   r=await req('/api/v1/clients',{method:'POST',headers:{...mh,'x-unit-id':unitId,'idempotency-key':'client-'+unitId},body:{name:'Cliente '+unitId,phone:'3198666000'+idx}});ok(r.ok,'client '+unitId);const client=await r.json();
   const hour=13+idx;
   r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':unitId,'idempotency-key':'multi-'+unitId},body:{clientId:client.id,serviceDate:'2026-10-14',items:[
    item('mani','p1',`2026-10-14T${String(hour).padStart(2,'0')}:00:00.000Z`),
    item('pedi','p2',`2026-10-14T${String(hour).padStart(2,'0')}:00:00.000Z`),
   ]}});ok(r.ok,'create 2 items '+unitId);const booking=await r.json();created[unitId]={booking,client};
   const row=await prisma.booking.findUniqueOrThrow({where:{id:booking.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
   ok(row.items.length===2,'2 items persisted '+unitId);
   ok(row.items.every(x=>x.unitId===row.unitId),'BookingItem.unitId invariant '+unitId);
   ok(row.items.map(x=>x.sortOrder).join(',')==='0,1','sortOrder '+unitId);
   ok(row.items[0].professionalId==='p1'&&row.items[1].professionalId==='p2','professional per item '+unitId);
   ok(row.items[0].durationMin===50&&Number(row.items[0].unitPrice)===55,'professional duration/price '+unitId);
   ok(row.items[0].clientAreaSnapshot==='hands'&&row.items[0].mustFinishBeforeSameAreaSnapshot===false,'area snapshot '+unitId);
   ok(row.serviceId===row.items[0].serviceId&&row.professionalId===row.items[0].professionalId&&row.startAt?.getTime()===row.items[0].startAt.getTime(),'header mirrors first item '+unitId);
   r=await req('/api/v1/bookings/'+booking.id,{headers:{...mh,'x-unit-id':unitId}});ok(r.ok,'GET '+unitId);const get=await r.json();ok(get.items.length===2&&get.items[0].sortOrder===0&&get.items[1].sortOrder===1,'GET returns ordered items '+unitId);
  }

  const big=created.big.booking;
  r=await req('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'big'},body:{items:[
   item('pedi','p2','2026-10-14T18:00:00.000Z'),
   item('gel','p1','2026-10-14T19:00:00.000Z'),
  ]}});ok(r.ok,'edit service/pro/time');
  let row=await prisma.booking.findUniqueOrThrow({where:{id:big.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  ok(row.items[0].serviceId==='pedi'&&row.items[0].professionalId==='p2'&&row.items[0].startAt.toISOString()==='2026-10-14T18:00:00.000Z','edit persisted from items');
  ok(row.serviceId==='pedi'&&row.professionalId==='p2'&&row.startAt?.toISOString()==='2026-10-14T18:00:00.000Z','mirror follows first edited item');

  r=await req('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'big'},body:{serviceDate:'2026-10-15',items:[
   item('pedi','p2','2026-10-15T18:00:00.000Z'),
   item('gel','p1','2026-10-15T19:00:00.000Z'),
  ]}});ok(r.ok,'reschedule');
  row=await prisma.booking.findUniqueOrThrow({where:{id:big.id},include:{items:true}});ok(row.serviceDate.toISOString().slice(0,10)==='2026-10-15'&&row.items.every(x=>x.startAt.toISOString().startsWith('2026-10-15')),'reschedule items/date');

  const shopping=created['shopping-contagem'].booking;
  const beforeCancel=await prisma.bookingItem.findMany({where:{bookingId:shopping.id},orderBy:{sortOrder:'asc'}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Cancelado'}});ok(r.ok,'cancel');
  const afterCancel=await prisma.bookingItem.findMany({where:{bookingId:shopping.id},orderBy:{sortOrder:'asc'}});
  ok(afterCancel.length===beforeCancel.length&&afterCancel.map(x=>x.id).join(',')===beforeCancel.map(x=>x.id).join(','),'cancel preserves items');


  // A1-AG01 P1: a cancelled multi-item visit can only be reactivated within all current shifts.
  const savedShopping=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Agendado'}});
  ok(r.ok,'cancelled booking reactivates within professional shifts');
  let reopened=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  ok(reopened.items.map(x=>x.id).join(',')===savedShopping.items.map(x=>x.id).join(',')&&reopened.status==='Agendado','reactivation preserves existing BookingItems');
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Cancelado'}});
  ok(r.ok,'normal cancellation remains valid');
  const previousPro=await prisma.professional.findUniqueOrThrow({where:{id:'p2'}});
  const previousConfig=previousPro.legacyPayload;
  await prisma.professional.update({where:{id:'p2'},data:{legacyPayload:{...previousConfig,schedule:{...previousConfig.schedule,'shopping-contagem-3':{work:false,start:'09:00',end:'23:00'}}}}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{notes:'Observação histórica preservada'}});
  ok(r.ok,'notes on cancelled booking do not require current shift');
  const beforeRejected=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Agendado'}});
  ok(r.status===409,'cancelled multi-item booking rejects second professional outside shift');
  const afterRejected=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  ok(JSON.stringify(afterRejected)===JSON.stringify(beforeRejected),'rejected reactivation preserves booking, items, version and status');
  await prisma.bookingItem.updateMany({where:{bookingId:shopping.id,professionalId:'p2'},data:{forceFit:true}});
  const forcedBefore=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Agendado'}});
  ok(r.status===409,'stored forceFit cannot bypass current shift on reactivation');
  const forcedAfter=await prisma.booking.findUniqueOrThrow({where:{id:shopping.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  ok(JSON.stringify(forcedAfter)===JSON.stringify(forcedBefore),'forced rejection preserves full booking state');
  await prisma.professional.update({where:{id:'p2'},data:{legacyPayload:previousConfig}});
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Agendado'}});
  ok(r.ok,'restored valid shift permits reactivation');
  r=await req('/api/v1/bookings/'+shopping.id,{method:'PATCH',headers:{...mh,'x-unit-id':'shopping-contagem'},body:{status:'Cancelado'}});
  ok(r.ok,'cancellation after reactivation remains available');

  r=await req('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...rh,'x-unit-id':'big'},body:{status:'Agendado'}});ok(r.status===403,'restricted user blocked outside scope');
  r=await req('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'centro'},body:{status:'Agendado'}});ok(r.status===404,'cross-unit booking invisible');

  const areaClient=created.centro.client;
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'area-conflict'},body:{clientId:areaClient.id,serviceDate:'2026-10-16',items:[
   item('gel','p1','2026-10-16T13:00:00.000Z'),
   item('mani','p2','2026-10-16T13:30:00.000Z'),
  ]}});ok(r.status===409,'same-area sequencing enforced');

  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'force-base'},body:{clientId:areaClient.id,serviceDate:'2026-10-17',items:[item('pedi','p1','2026-10-17T13:00:00.000Z')]}});ok(r.ok,'forceFit baseline');
  r=await req('/api/v1/clients',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'force-client'},body:{name:'Outra Cliente',phone:'31985550000'}});const other=await r.json();
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'force-overlap'},body:{clientId:other.id,serviceDate:'2026-10-17',items:[item('mani','p1','2026-10-17T13:15:00.000Z',{forceFit:true})]}});ok(r.ok,'forceFit preserves explicit override');
  row=await prisma.booking.findFirstOrThrow({where:{id:{startsWith:'op_'}},orderBy:{createdAt:'desc'},include:{items:true}});ok(row.items.every(x=>x.unitId===row.unitId),'forceFit write unit invariant');


  // A1-AG01: within shift, including approved Encaixe outside public hours.
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'a1-after-public-hours'},body:{serviceDate:'2026-10-18',status:'Encaixe',items:[item('mani','p1','2026-10-18T22:10:00-03:00')]}});ok(r.ok,'Encaixe after published Sunday hours inside shift accepted');
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'a1-outside-shift'},body:{serviceDate:'2026-10-18',items:[item('mani','p1','2026-10-18T23:30:00-03:00')]}});ok(r.status===409,'outside shift rejected');
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'a1-force-outside'},body:{serviceDate:'2026-10-18',items:[item('mani','p1','2026-10-18T23:30:00-03:00',{forceFit:true})]}});ok(r.status===409,'forceFit cannot override shift');

  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'a1-utc-late-local-day'},body:{serviceDate:'2026-10-18',items:[item('pedi','p2','2026-10-19T01:10:00.000Z')]}});ok(r.ok,'UTC next day timestamp accepted when unit-local date and shift are valid');
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'big','idempotency-key':'a1-utc-wrong-local-day'},body:{serviceDate:'2026-10-18',items:[item('pedi','p2','2026-10-18T01:00:00.000Z')]}});ok(r.status===409,'UTC timestamp with wrong unit-local booking date rejected');
  const altered=Object.fromEntries(['centro','big','shopping-contagem'].flatMap(u=>Array.from({length:7},(_,d)=>[u+'-'+d,{work:true,start:'09:00',end:'23:00'}])));altered['centro-1']={work:false,start:'09:00',end:'23:00'};
  await prisma.professional.update({where:{id:'p2'},data:{legacyPayload:{services:['mani','gel','pedi'],schedule:altered}}});
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'a1-off-day'},body:{serviceDate:'2026-10-19',items:[item('pedi','p2','2026-10-19T11:00:00-03:00')]}});ok(r.status===409,'no working day rejected');
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'a1-invalid-multi'},body:{serviceDate:'2026-10-19',items:[item('mani','p1','2026-10-19T10:00:00-03:00'),item('pedi','p2','2026-10-19T10:00:00-03:00')]}});ok(r.status===409,'every BookingItem schedule checked');
  const beforeA1=await prisma.booking.findUniqueOrThrow({where:{id:big.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  r=await req('/api/v1/bookings/'+big.id,{method:'PATCH',headers:{...mh,'x-unit-id':'big'},body:{serviceDate:'2026-10-18',items:[item('pedi','p2','2026-10-18T17:00:00-03:00'),item('gel','p1','2026-10-18T23:10:00-03:00')]}});ok(r.status===409,'invalid reschedule rejected');
  const afterA1=await prisma.booking.findUniqueOrThrow({where:{id:big.id},include:{items:{orderBy:{sortOrder:'asc'}}}});
  ok(beforeA1.version===afterA1.version&&beforeA1.serviceDate.getTime()===afterA1.serviceDate.getTime()&&beforeA1.items.map(x=>x.id+'|'+x.startAt.toISOString()).join()===afterA1.items.map(x=>x.id+'|'+x.startAt.toISOString()).join(),'rejected reschedule is atomic');
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'a1-block-day-off'},body:{serviceDate:'2026-10-19',status:'Bloqueado',items:[item(undefined,'p2','2026-10-19T06:00:00-03:00',{durationMin:30,unitPrice:0})]}});ok(r.ok,'Bloqueado remains independent of shift');


  // A blocked marker is not a service; it cannot become an active visit by status alone.
  r=await req('/api/v1/bookings',{method:'POST',headers:{...mh,'x-unit-id':'centro','idempotency-key':'a1-block-inside-shift'},body:{serviceDate:'2026-10-20',status:'Bloqueado',items:[item(undefined,'p1','2026-10-20T10:00:00-03:00',{durationMin:30})]}});
  ok(r.ok,'blocked marker inside shift created');
  const blockRecord=await r.json();
  const blockBefore=await prisma.booking.findUniqueOrThrow({where:{id:blockRecord.id},include:{items:true}});
  r=await req('/api/v1/bookings/'+blockRecord.id,{method:'PATCH',headers:{...mh,'x-unit-id':'centro'},body:{status:'Agendado'}});
  ok(r.status===409,'Bloqueado without service cannot become active appointment');
  const blockAfter=await prisma.booking.findUniqueOrThrow({where:{id:blockRecord.id},include:{items:true}});
  ok(JSON.stringify(blockAfter)===JSON.stringify(blockBefore),'blocked conversion rejection preserves items, status and version');

  const validWithoutItems=await prisma.booking.count({where:{status:{notIn:['Bloqueado','Cancelado','Faltou','CANCELLED','CANCELED','CANCELADO']},items:{none:{}}}});
  ok(validWithoutItems===0,'gate: operational bookings do not remain without BookingItem');
  console.log(JSON.stringify({ok:true,checks,feature:'booking_item_source_of_truth_three_units'}));
 }finally{
  if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),sleep(3000)]).catch(()=>{})}
  await clean().catch(()=>{});await prisma.$disconnect();
 }
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
