import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {BookingAvailabilityService} from '../dist/src/core/booking-availability.service.js';

const prisma=new PrismaClient();
let checks=0;
const ok=(value,message)=>{checks++;assert.ok(value,message)};
const eq=(actual,expected,message)=>{checks++;assert.equal(actual,expected,message)};
const date='2030-10-08';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ids={services:['wa3a-main','wa3a-inactive'],pros:['wa3a-p1','wa3a-p2','wa3a-no-service','wa3a-unlinked'],bookings:['wa3a-occupied','wa3a-cancelled','wa3a-block']};
const oldOperational=process.env.OPERATIONAL_WRITES_ENABLED,oldUnits=process.env.OPERATIONAL_WRITES_UNITS;

function localUtc(hour,minute=0,offsetHours=3){
  return new Date(Date.UTC(2030,9,8,hour+offsetHours,minute,0));
}
async function cleanup(){
  await prisma.auditEvent.deleteMany({where:{entityId:{in:ids.bookings}}}).catch(()=>{});
  await prisma.booking.deleteMany({where:{id:{in:ids.bookings}}}).catch(()=>{});
  await prisma.professionalUnit.deleteMany({where:{professionalId:{in:ids.pros}}}).catch(()=>{});
  await prisma.professional.deleteMany({where:{id:{in:ids.pros}}}).catch(()=>{});
  await prisma.service.deleteMany({where:{id:{in:ids.services}}}).catch(()=>{});
}
async function setup(){
  await ensureCanonicalUnits(prisma);
  await cleanup();
  await prisma.unit.updateMany({where:{id:{in:['big','centro','shopping-contagem']}},data:{active:true,timezone:'America/Sao_Paulo'}});
  await prisma.service.createMany({data:[
    {id:'wa3a-main',name:'WA3A Manicure',price:'50',durationMin:30,active:true,legacyPayload:{show:true,online:true,showPrice:true,proRules:{
      'wa3a-p1':{enabled:true,online:true,duration:45,price:55},
      'wa3a-p2':{enabled:true,online:true,duration:30,price:50},
    }}},
    {id:'wa3a-inactive',name:'WA3A Inativo',price:'10',durationMin:30,active:false,legacyPayload:{show:true,online:true}},
  ]});
  const schedule={
    'centro-2':{work:true,start:'09:00',end:'12:00'},
    'big-2':{work:true,start:'10:00',end:'13:00'},
    'shopping-contagem-2':{work:true,start:'11:00',end:'14:00'},
  };
  await prisma.professional.createMany({data:[
    {id:'wa3a-p1',name:'WA3A Ana',publicName:'Ana WA3A',active:true,legacyPayload:{show:true,online:true,services:['wa3a-main'],schedule}},
    {id:'wa3a-p2',name:'WA3A Maria',publicName:'Maria WA3A',active:true,legacyPayload:{show:true,online:true,services:['wa3a-main'],schedule}},
    {id:'wa3a-no-service',name:'WA3A Sem Serviço',active:true,legacyPayload:{show:true,online:true,services:[],schedule}},
    {id:'wa3a-unlinked',name:'WA3A Sem Unidade',active:true,legacyPayload:{show:true,online:true,services:['wa3a-main'],schedule}},
  ]});
  for(const pro of ['wa3a-p1','wa3a-p2','wa3a-no-service']){
    for(const unitId of ['big','centro','shopping-contagem']){
      await prisma.professionalUnit.create({data:{professionalId:pro,unitId,active:true}});
    }
  }
  await prisma.booking.create({data:{
    id:'wa3a-occupied',unitId:'centro',serviceDate:new Date(date+'T00:00:00.000Z'),startAt:localUtc(10),serviceId:'wa3a-main',professionalId:'wa3a-p1',
    status:'Confirmado',legacyPayload:{source:'wa3a-test'},
    items:{create:{id:'wa3a-bi-occupied',unitId:'centro',serviceId:'wa3a-main',professionalId:'wa3a-p1',startAt:localUtc(10),durationMin:45,unitPrice:'55',sortOrder:0}},
  }});
  await prisma.booking.create({data:{
    id:'wa3a-cancelled',unitId:'centro',serviceDate:new Date(date+'T00:00:00.000Z'),startAt:localUtc(11),serviceId:'wa3a-main',professionalId:'wa3a-p1',
    status:'Cancelado',legacyPayload:{source:'wa3a-test'},
    items:{create:{id:'wa3a-bi-cancelled',unitId:'centro',serviceId:'wa3a-main',professionalId:'wa3a-p1',startAt:localUtc(11),durationMin:45,unitPrice:'55',sortOrder:0}},
  }});
}
async function expectReject(fn,status,message){
  let caught=null;try{await fn()}catch(e){caught=e}
  ok(caught&&caught.getStatus?.()===status,message);
}
async function startServer(port,agentEnabled){
  let stdout='',stderr='',exit=null,error=null;
  const secret='wa3a-agent-secret-never-log';
  const child=spawn(process.execPath,['dist/src/main.js'],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true',OPERATIONAL_WRITES_UNITS:'',
      WHATSAPP_AGENT_API_ENABLED:agentEnabled?'true':'false',WHATSAPP_AGENT_API_SECRET:secret,
      EVOLUTION_WEBHOOK_ENABLED:'false',WHATSAPP_AUTOMATION_ENABLED:'false'},
    stdio:['ignore','pipe','pipe'],
  });
  child.stdout.on('data',d=>stdout+=String(d));child.stderr.on('data',d=>stderr+=String(d));child.on('error',e=>error=e);child.on('exit',(code,signal)=>exit={code,signal});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<80;i++){if(error)throw error;if(exit)throw Error('backend exited '+JSON.stringify({exit,stderr,stdout}));try{if((await fetch(base+'/api/v1/health')).ok)return {child,base,secret,logs:()=>stdout+stderr}}catch{}await sleep(250)}
  throw Error('backend start timeout '+stderr);
}
async function stopServer(server){
  if(server.child.exitCode===null&&server.child.signalCode===null){
    server.child.kill('SIGTERM');await Promise.race([once(server.child,'exit'),sleep(3000)]).catch(()=>{});
  }
}
async function getJson(url,headers={}){
  const response=await fetch(url,{headers:{accept:'application/json',...headers}});
  let data=null;try{data=await response.json()}catch{}
  return {response,data};
}

try{
  await prisma.$connect();
  await setup();
  process.env.OPERATIONAL_WRITES_ENABLED='true';
  process.env.OPERATIONAL_WRITES_UNITS='';
  const service=new BookingAvailabilityService(prisma);

  await expectReject(()=>service.availability({unitId:'wa3a-missing',date,serviceId:'wa3a-main'}),404,'unidade inexistente é rejeitada');

  await prisma.unit.update({where:{id:'big'},data:{active:false}});
  await expectReject(()=>service.availability({unitId:'big',date,serviceId:'wa3a-main'}),404,'unidade inativa é rejeitada');
  await prisma.unit.update({where:{id:'big'},data:{active:true}});

  process.env.OPERATIONAL_WRITES_ENABLED='false';
  let result=await service.availability({unitId:'centro',date,serviceId:'wa3a-main'});
  eq(result.bookingEnabled,false,'bookingEnabled false é refletido');
  eq(result.slots.length,0,'bookingEnabled false não oferece slots');
  process.env.OPERATIONAL_WRITES_ENABLED='true';

  await expectReject(()=>service.availability({unitId:'centro',date,serviceId:'wa3a-inactive'}),404,'serviço inativo é rejeitado');

  result=await service.availability({unitId:'centro',date,serviceId:'wa3a-main',professionalId:'wa3a-unlinked'});
  eq(result.slots.length,0,'profissional não vinculada não oferece slots');
  result=await service.availability({unitId:'centro',date,serviceId:'wa3a-main',professionalId:'wa3a-no-service'});
  eq(result.slots.length,0,'profissional que não executa serviço não oferece slots');

  result=await service.availability({unitId:'centro',date,serviceId:'wa3a-main',professionalId:'wa3a-p1'});
  ok(result.slots.every(x=>x.localStart>='09:00'&&x.localEnd<='12:00'),'fora da escala não aparece');
  ok(!result.slots.some(x=>x.localStart==='10:00'),'horário ocupado não aparece');
  ok(result.slots.some(x=>x.localStart==='11:00'),'booking cancelado não bloqueia slot');
  ok(result.slots.every(x=>x.durationMin===45),'duração específica por profissional é respeitada');
  ok(!result.slots.some(x=>x.localStart==='11:30')&&result.slots.some(x=>x.localStart==='11:15'),'duração 45 min respeita fim da escala');
  ok(result.slots.every(x=>x.professionalId==='wa3a-p1'),'professionalId filtra corretamente');

  const allPros=await service.availability({unitId:'centro',date,serviceId:'wa3a-main'});
  ok(allPros.slots.some(x=>x.localStart==='09:00'&&x.professionalId==='wa3a-p1')&&allPros.slots.some(x=>x.localStart==='09:00'&&x.professionalId==='wa3a-p2'),'sem professionalId preserva duas profissionais no mesmo horário');

  await prisma.booking.create({data:{
    id:'wa3a-block',unitId:'centro',serviceDate:new Date(date+'T00:00:00.000Z'),startAt:localUtc(9),serviceId:null,professionalId:'wa3a-p1',
    status:'Bloqueado',blockAllDay:true,legacyPayload:{source:'wa3a-test'},
  }});
  result=await service.availability({unitId:'centro',date,serviceId:'wa3a-main',professionalId:'wa3a-p1'});
  eq(result.slots.length,0,'blockAllDay remove disponibilidade da profissional');
  await prisma.booking.delete({where:{id:'wa3a-block'}});

  for(const unitId of ['big','centro','shopping-contagem']){
    const unitResult=await service.availability({unitId,date,serviceId:'wa3a-main'});
    ok(unitResult.bookingEnabled&&unitResult.slots.length>0,unitId+' retorna disponibilidade real');
  }

  await prisma.unit.update({where:{id:'shopping-contagem'},data:{timezone:'America/Manaus'}});
  result=await service.availability({unitId:'shopping-contagem',date,serviceId:'wa3a-main',professionalId:'wa3a-p2'});
  const eleven=result.slots.find(x=>x.localStart==='11:00');
  eq(eleven?.startAt,'2030-10-08T15:00:00.000Z','timezone da unidade converte horário local corretamente');
  eq(result.timezone,'America/Manaus','timezone da unidade é devolvido explicitamente');
  await prisma.unit.update({where:{id:'shopping-contagem'},data:{timezone:'America/Sao_Paulo'}});

  const deterministicA=await service.availability({unitId:'centro',date,serviceId:'wa3a-main'});
  const deterministicB=await service.availability({unitId:'centro',date,serviceId:'wa3a-main'});
  eq(JSON.stringify(deterministicA),JSON.stringify(deterministicB),'consulta repetida é determinística');

  const beforeRead={
    bookings:await prisma.booking.count(),
    clients:await prisma.client.count(),
    waitlist:await prisma.waitlistRequest.count(),
    inbound:await prisma.messagingInbound.count(),
    audit:await prisma.auditEvent.count(),
  };
  await service.catalog('centro');
  await service.availability({unitId:'centro',date,serviceId:'wa3a-main'});
  await service.activeUnits();
  const afterRead={
    bookings:await prisma.booking.count(),
    clients:await prisma.client.count(),
    waitlist:await prisma.waitlistRequest.count(),
    inbound:await prisma.messagingInbound.count(),
    audit:await prisma.auditEvent.count(),
  };
  eq(JSON.stringify(afterRead),JSON.stringify(beforeRead),'consultas de disponibilidade não produzem escrita');

  const off=await startServer(3116,false);
  try{
    const {response}=await getJson(off.base+'/api/v1/integrations/whatsapp-agent/units',{'x-whatsapp-agent-secret':off.secret});
    eq(response.status,404,'endpoint do agente OFF é inacessível');
  }finally{await stopServer(off)}
  ok(!off.logs().includes(off.secret),'agent secret não aparece em logs quando OFF');

  const on=await startServer(3117,true);
  try{
    let response=await getJson(on.base+'/api/v1/integrations/whatsapp-agent/units',{'x-whatsapp-agent-secret':'invalid-agent-secret'});
    eq(response.response.status,401,'segredo inválido do agente é rejeitado');
    ok(!JSON.stringify(response.data).includes(on.secret),'resposta de autenticação não vaza secret');

    response=await getJson(on.base+'/api/v1/integrations/whatsapp-agent/units',{'x-whatsapp-agent-secret':on.secret});
    eq(response.response.status,200,'agente autenticado consulta unidades');
    ok(response.data.some(x=>x.id==='big')&&response.data.some(x=>x.id==='centro')&&response.data.some(x=>x.id==='shopping-contagem'),'agente recebe três unidades ativas');

    const catalogRes=await getJson(on.base+'/api/v1/public/catalog?unitId=centro');
    eq(catalogRes.response.status,200,'GET /public/catalog preservado');
    const occupancyRes=await getJson(on.base+'/api/v1/public/occupancy?unitId=centro&date='+date);
    eq(occupancyRes.response.status,200,'GET /public/occupancy preservado');
    const availabilityRes=await getJson(on.base+'/api/v1/public/availability?unitId=centro&date='+date+'&serviceId=wa3a-main&professionalId=wa3a-p1');
    eq(availabilityRes.response.status,200,'GET /public/availability disponível');

    const agentAvailability=await getJson(on.base+'/api/v1/integrations/whatsapp-agent/availability?unitId=centro&date='+date+'&serviceId=wa3a-main&professionalId=wa3a-p1',{'x-whatsapp-agent-secret':on.secret});
    eq(agentAvailability.response.status,200,'agente autenticado consulta disponibilidade');
    eq(JSON.stringify(agentAvailability.data),JSON.stringify(availabilityRes.data),'agente e endpoint público usam a mesma fonte canônica');

    const rule=catalogRes.data.professionals.find(x=>x.id==='wa3a-p1')?.serviceRules?.['wa3a-main'];
    ok(rule&&availabilityRes.data.slots.every(x=>x.durationMin===rule.durationMin&&x.price===rule.price),'slots respeitam serviceRules do catálogo atual');
    const occupied=occupancyRes.data.flatMap(b=>b.items||[]).filter(x=>x.professionalId==='wa3a-p1');
    const overlap=availabilityRes.data.slots.some(slot=>{
      const a=new Date(slot.startAt).getTime(),z=new Date(slot.endAt).getTime();
      return occupied.some(x=>{const s=new Date(x.startAt).getTime(),e=s+Number(x.durationMin)*60000;return s<z&&e>a});
    });
    eq(overlap,false,'paridade: slots não contradizem occupancy não terminal');
    ok(availabilityRes.data.slots.every((x,i,a)=>i===0||((new Date(x.startAt)-new Date(a[i-1].startAt))/60000)%15===0||x.startAt===a[i-1].startAt),'paridade mantém grid canônico de 15 minutos');

    const beforeHttp={bookings:await prisma.booking.count(),clients:await prisma.client.count(),waitlist:await prisma.waitlistRequest.count(),audit:await prisma.auditEvent.count()};
    await getJson(on.base+'/api/v1/integrations/whatsapp-agent/catalog?unitId=centro',{'x-whatsapp-agent-secret':on.secret});
    await getJson(on.base+'/api/v1/integrations/whatsapp-agent/availability?unitId=centro&date='+date+'&serviceId=wa3a-main',{'x-whatsapp-agent-secret':on.secret});
    const afterHttp={bookings:await prisma.booking.count(),clients:await prisma.client.count(),waitlist:await prisma.waitlistRequest.count(),audit:await prisma.auditEvent.count()};
    eq(JSON.stringify(afterHttp),JSON.stringify(beforeHttp),'consultas HTTP do agente são estritamente read-only');
  }finally{await stopServer(on)}
  ok(!on.logs().includes(on.secret)&&!on.logs().includes('invalid-agent-secret'),'agent secrets não aparecem em logs');

  console.log(JSON.stringify({ok:true,checks,feature:'wa3a_server_side_booking_availability',slotMinutes:15,multiService:false,writes:false}));
}finally{
  process.env.OPERATIONAL_WRITES_ENABLED=oldOperational;
  if(oldUnits===undefined)delete process.env.OPERATIONAL_WRITES_UNITS;else process.env.OPERATIONAL_WRITES_UNITS=oldUnits;
  await cleanup().catch(()=>{});
  await prisma.unit.updateMany({where:{id:{in:['big','centro','shopping-contagem']}},data:{active:true,timezone:'America/Sao_Paulo'}}).catch(()=>{});
  await prisma.$disconnect();
}
