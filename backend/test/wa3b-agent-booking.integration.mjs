import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';

const prisma=new PrismaClient();
let checks=0;
const ok=(v,m)=>{checks++;assert.ok(v,m)};
const eq=(a,b,m)=>{checks++;assert.equal(a,b,m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const date='2030-10-08';
const secret='wa3b-agent-secret-never-log';
const serviceId='wa3b-service',proId='wa3b-pro',knownClient='wa3b-known-client';
const bookingPrefix='wa_';

async function cleanup(){
 await prisma.auditEvent.deleteMany({where:{OR:[{action:'booking.created_from_whatsapp'},{entityId:{startsWith:bookingPrefix}}]}}).catch(()=>{});
 await prisma.booking.deleteMany({where:{OR:[{id:{startsWith:bookingPrefix}},{serviceId}]}}).catch(()=>{});
 await prisma.clientUnitLink.deleteMany({where:{clientId:{in:[knownClient,'wa3b-idem-client']}}}).catch(()=>{});
 await prisma.client.deleteMany({where:{OR:[{id:{in:[knownClient,'wa3b-idem-client']}},{legacyPayload:{path:['source'],equals:'whatsapp_agent'}}]}}).catch(()=>{});
 await prisma.professionalUnit.deleteMany({where:{professionalId:proId}}).catch(()=>{});
 await prisma.professional.deleteMany({where:{id:proId}}).catch(()=>{});
 await prisma.service.deleteMany({where:{id:serviceId}}).catch(()=>{});
}
async function setup(){
 await ensureCanonicalUnits(prisma);await cleanup();
 await prisma.unit.updateMany({where:{id:{in:['big','centro','shopping-contagem']}},data:{active:true,timezone:'America/Sao_Paulo'}});
 await prisma.service.create({data:{id:serviceId,name:'WA3B Manicure',price:'55',durationMin:30,active:true,legacyPayload:{show:true,online:true,showPrice:true,proRules:{[proId]:{enabled:true,online:true,duration:30,price:57}}}}});
 await prisma.professional.create({data:{id:proId,name:'WA3B Ana',publicName:'Ana WA3B',active:true,legacyPayload:{show:true,online:true,services:[serviceId],schedule:{
  'big-2':{work:true,start:'09:00',end:'18:00'},
  'centro-2':{work:true,start:'09:00',end:'18:00'},
  'shopping-contagem-2':{work:true,start:'09:00',end:'18:00'},
 }}}});
 for(const unitId of ['big','centro','shopping-contagem'])await prisma.professionalUnit.create({data:{professionalId:proId,unitId,active:true}});
 await prisma.client.create({data:{id:knownClient,name:'Cliente Existente WA3B',phone:'+5531999111000',email:'existente@example.com',active:true,registrationUnitId:'centro',legacyPayload:{source:'wa3b_test'}}});
}
async function startServer(port,enabled=true,operational=true){
 let stdout='',stderr='',exit=null,error=null;
 const child=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{
  ...process.env,PORT:String(port),WHATSAPP_AGENT_API_ENABLED:enabled?'true':'false',WHATSAPP_AGENT_API_SECRET:secret,
  OPERATIONAL_WRITES_ENABLED:operational?'true':'false',OPERATIONAL_WRITES_UNITS:'',
  EVOLUTION_WEBHOOK_ENABLED:'false',WHATSAPP_AUTOMATION_ENABLED:'false',
 },stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>stdout+=String(d));child.stderr.on('data',d=>stderr+=String(d));child.on('error',e=>error=e);child.on('exit',(code,signal)=>exit={code,signal});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<80;i++){if(error)throw error;if(exit)throw Error('backend exited '+JSON.stringify({exit,stderr,stdout}));try{if((await fetch(base+'/api/v1/health')).ok)return {child,base,logs:()=>stdout+stderr}}catch{}await sleep(250)}
 throw Error('backend start timeout '+stderr);
}
async function stopServer(s){if(s.child.exitCode===null&&s.child.signalCode===null){s.child.kill('SIGTERM');await Promise.race([once(s.child,'exit'),sleep(3000)]).catch(()=>{})}}
async function req(server,path,{method='GET',body,key,secretValue=secret}={}){
 const headers={accept:'application/json','x-whatsapp-agent-secret':secretValue};
 if(body!==undefined)headers['content-type']='application/json';
 if(key!==undefined)headers['idempotency-key']=key;
 const response=await fetch(server.base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={message:text}}
 return {response,data};
}
async function slot(server,unitId,time,professionalId=proId,service=serviceId){
 const r=await req(server,'/api/v1/integrations/whatsapp-agent/availability?unitId='+encodeURIComponent(unitId)+'&date='+date+'&serviceId='+encodeURIComponent(service)+'&professionalId='+encodeURIComponent(professionalId));
 eq(r.response.status,200,'consulta de slot responde 200');
 const found=r.data.slots.find(x=>x.localStart===time);
 ok(found,'slot '+unitId+' '+time+' existe antes da criação');
 return found;
}
function payload(unitId,startAt,extra={}){
 return {unitId,date,serviceId,professionalId:proId,startAt,channelId:'CENTRAL',...extra};
}

try{
 await prisma.$connect();await setup();

 const off=await startServer(3120,false,true);
 try{
  const r=await req(off,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro','2030-10-08T12:00:00.000Z',{clientId:knownClient}),key:'off'});
  eq(r.response.status,404,'agent API OFF torna criação inacessível');
 }finally{await stopServer(off)}

 const server=await startServer(3121,true,true);
 try{
  let s=await slot(server,'centro','09:00');
  let r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro',s.startAt,{clientId:knownClient}),key:'bad-secret',secretValue:'wrong-secret'});
  eq(r.response.status,401,'secret inválido é rejeitado');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro',s.startAt,{clientId:knownClient})});
  eq(r.response.status,409,'Idempotency-Key ausente é rejeitada');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('missing-unit',s.startAt,{clientId:knownClient}),key:'bad-unit'});
  eq(r.response.status,404,'unidade inválida é rejeitada');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:{...payload('centro',s.startAt,{clientId:knownClient}),serviceId:'missing-service'},key:'bad-service'});
  eq(r.response.status,404,'serviço inválido é rejeitado');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:{...payload('centro',s.startAt,{clientId:knownClient}),professionalId:'missing-pro'},key:'bad-pro'});
  eq(r.response.status,404,'profissional inválida é rejeitada');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro','2030-10-08T12:07:00.000Z',{clientId:knownClient}),key:'invented-slot'});
  eq(r.response.status,409,'slot fora da disponibilidade canônica é rejeitado');

  const gateOff=await startServer(3122,true,false);
  try{
   const rr=await req(gateOff,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro',s.startAt,{clientId:knownClient}),key:'gate-off'});
   eq(rr.response.status,503,'bookingEnabled false é rejeitado');
  }finally{await stopServer(gateOff)}

  s=await slot(server,'centro','09:00');
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro',s.startAt,{clientId:knownClient}),key:'valid-known'});
  eq(r.response.status,201,'slot válido cria booking');
  const knownBooking=r.data;
  eq(knownBooking.unitId,'centro','booking fica na unidade explícita');
  eq(knownBooking.clientId,knownClient,'clientId existente é reutilizado');
  eq(knownBooking.status,'Aguardando confirmação','status inicial preservado');
  eq(knownBooking.localStart,'09:00','resposta contém horário local útil');
  eq(knownBooking.durationMin,30,'resposta contém duração real');
  eq(knownBooking.price,57,'resposta contém preço profissional/serviço');

  let dbBooking=await prisma.booking.findUniqueOrThrow({where:{id:knownBooking.bookingId},include:{items:true}});
  eq(dbBooking.unitId,'centro','booking persiste na agenda canônica');
  eq(dbBooking.items.length,1,'BookingItem único no WA3B');
  eq(dbBooking.items[0].serviceId,serviceId,'BookingItem serviço correto');
  eq(dbBooking.items[0].professionalId,proId,'BookingItem profissional correto');
  eq(dbBooking.items[0].durationMin,30,'BookingItem duração correta');
  eq(dbBooking.legacyPayload.source,'whatsapp_agent','Booking source whatsapp_agent');
  eq(dbBooking.items[0].legacyPayload.source,'whatsapp_agent','BookingItem source whatsapp_agent');
  eq(await prisma.auditEvent.count({where:{action:'booking.created_from_whatsapp',entityId:knownBooking.bookingId}}),1,'AuditEvent específico criado');
  ok(await prisma.clientUnitLink.findUnique({where:{clientId_unitId:{clientId:knownClient,unitId:'centro'}}}),'ClientUnitLink criado para clientId existente');

  s=await slot(server,'centro','10:00');
  const byIdentity=payload('centro',s.startAt,{clientName:'Cliente Existente WA3B',clientPhone:'(31) 99911-1000',clientEmail:'novo-email@example.com'});
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:byIdentity,key:'identity-existing'});
  eq(r.response.status,201,'cliente existente por nome/telefone cria booking');
  eq(r.data.clientId,knownClient,'nome+telefone localizam cliente existente sem duplicar');
  eq(await prisma.client.count({where:{phone:'+5531999111000'}}),1,'cliente existente não é duplicada');

  s=await slot(server,'centro','11:00');
  const newIdentity=payload('centro',s.startAt,{clientName:'Cliente Nova WA3B',clientPhone:'31 98888-7777',clientEmail:'nova@example.com'});
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:newIdentity,key:'new-client'});
  eq(r.response.status,201,'cliente nova é criada');
  const newClientId=r.data.clientId;
  eq(await prisma.client.count({where:{id:newClientId}}),1,'cliente nova criada uma única vez');
  ok(await prisma.clientUnitLink.findUnique({where:{clientId_unitId:{clientId:newClientId,unitId:'centro'}}}),'ClientUnitLink da cliente nova criado');

  s=await slot(server,'centro','12:00');
  const idemBody=payload('centro',s.startAt,{clientName:'Cliente Idem WA3B',clientPhone:'31 97777-6666'});
  const idem=await Promise.all([
   req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:idemBody,key:'same-key'}),
   req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:idemBody,key:'same-key'}),
  ]);
  ok(idem.every(x=>x.response.status===201),'duas chamadas simultâneas com mesma key convergem');
  eq(idem[0].data.bookingId,idem[1].data.bookingId,'mesma key retorna mesmo booking');
  eq(await prisma.booking.count({where:{id:idem[0].data.bookingId}}),1,'mesma key persiste um único Booking');
  eq(await prisma.auditEvent.count({where:{action:'booking.created_from_whatsapp',entityId:idem[0].data.bookingId}}),1,'mesma key gera um único audit');

  const changed={...idemBody,clientName:'Outro Payload'};
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:changed,key:'same-key'});
  eq(r.response.status,409,'mesma key com payload diferente gera conflito');

  s=await slot(server,'centro','13:00');
  const raceA=payload('centro',s.startAt,{clientName:'Race A',clientPhone:'31 96666-0001'});
  const raceB=payload('centro',s.startAt,{clientName:'Race B',clientPhone:'31 96666-0002'});
  const race=await Promise.all([
   req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:raceA,key:'race-a'}),
   req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:raceB,key:'race-b'}),
  ]);
  const statuses=race.map(x=>x.response.status).sort((a,b)=>a-b);
  ok(statuses[0]>=200&&statuses[0]<300,'uma key concorrente vence o slot');
  eq(statuses[1],409,'outra key concorrente recebe conflito');
  eq(await prisma.bookingItem.count({where:{unitId:'centro',professionalId:proId,startAt:new Date(s.startAt)}}),1,'somente um Booking ocupa o slot concorrente');

  s=await slot(server,'centro','14:00');
  await prisma.booking.create({data:{
   id:'wa3b-intervening',unitId:'centro',clientId:knownClient,serviceDate:new Date(date+'T00:00:00.000Z'),startAt:new Date(s.startAt),serviceId,professionalId:proId,status:'Confirmado',
   legacyPayload:{source:'wa3b-test'},items:{create:{id:'wa3b-bi-intervening',unitId:'centro',serviceId,professionalId:proId,startAt:new Date(s.startAt),durationMin:30,unitPrice:'57',sortOrder:0}},
  }});
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('centro',s.startAt,{clientId:knownClient}),key:'occupied-between'});
  eq(r.response.status,409,'slot ocupado entre leitura e criação é rejeitado');

  for(const [unitId,time,key] of [['big','15:00','unit-big'],['shopping-contagem','15:00','unit-shopping']]){
   const su=await slot(server,unitId,time);
   const rr=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload(unitId,su.startAt,{clientId:knownClient}),key});
   eq(rr.response.status,201,unitId+' cria booking via agente');
   eq(rr.data.unitId,unitId,'channelId CENTRAL não altera unitId '+unitId);
  }

  const beforeOutbox=await prisma.messagingOutbox.count();
  const financeBefore={
   commands:await prisma.openCommand.count(),cash:await prisma.cashSession.count(),payments:await prisma.commandPayment.count(),obligations:await prisma.professionalObligation.count(),
  };
  const su=await slot(server,'big','16:00');
  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:payload('big',su.startAt,{clientId:knownClient}),key:'no-side-effects'});
  eq(r.response.status,201,'booking adicional criado para teste de efeitos colaterais');
  eq(await prisma.messagingOutbox.count(),beforeOutbox,'criação WA3B não gera mensagem outbound');
  const financeAfter={
   commands:await prisma.openCommand.count(),cash:await prisma.cashSession.count(),payments:await prisma.commandPayment.count(),obligations:await prisma.professionalObligation.count(),
  };
  eq(JSON.stringify(financeAfter),JSON.stringify(financeBefore),'criação WA3B não altera financeiro');

  r=await req(server,'/api/v1/integrations/whatsapp-agent/bookings',{method:'POST',body:{...payload('big',su.startAt,{clientId:knownClient}),channelId:'FAKE_CHANNEL'},key:'bad-channel'});
  eq(r.response.status,409,'channelId inventado é rejeitado');

  ok(!server.logs().includes(secret)&&!server.logs().includes('wrong-secret'),'segredos do agente não aparecem em logs');
 }finally{await stopServer(server)}

 console.log(JSON.stringify({ok:true,checks,feature:'wa3b_authoritative_agent_booking',multiService:false,outboundMessages:false,financialWrites:false}));
}finally{
 await cleanup().catch(()=>{});
 await prisma.booking.deleteMany({where:{id:'wa3b-intervening'}}).catch(()=>{});
 await prisma.client.deleteMany({where:{legacyPayload:{path:['source'],equals:'whatsapp_agent'}}}).catch(()=>{});
 await prisma.$disconnect();
}
