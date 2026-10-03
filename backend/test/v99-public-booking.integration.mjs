import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};
const port=Number(process.env.PUBLIC_BOOKING_TEST_PORT||3104),base='http://127.0.0.1:'+port,sleep=ms=>new Promise(r=>setTimeout(r,ms));
let childStdout='',childStderr='',childError=null,childExit=null;
async function health(){for(let i=0;i<60;i++){if(childError)throw childError;if(childExit)throw Error(`backend exited before health: code=${childExit.code} signal=${childExit.signal} stderr=${childStderr.trim()} stdout=${childStdout.trim()}`);try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(500)}throw Error(`backend start timeout: stderr=${childStderr.trim()} stdout=${childStdout.trim()}`)}
async function book(unit,start,phone,key,service='long'){return fetch(base+'/api/v1/public/bookings',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify({unitId:unit,serviceId:service,professionalId:'p-all',startAt:start,clientName:'Cliente Site',clientPhone:phone})})}
async function main(){
 await prisma.auditEvent.deleteMany();await prisma.booking.deleteMany();await prisma.clientUnitLink.deleteMany();await prisma.client.deleteMany();await prisma.professionalUnit.deleteMany();await prisma.professional.deleteMany();await prisma.service.deleteMany();await prisma.serviceCategory.deleteMany();await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();await prisma.unit.deleteMany();
 for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name}});
 await prisma.service.createMany({data:[
  {id:'long',name:'Alongamento',price:'120',durationMin:90,legacyPayload:{show:true,online:true,showPrice:true,publicDescription:'Alongamento público',websiteOrder:2,proRules:{'p-all':{enabled:true,duration:90,commission:55,price:125,online:true}}}},
  {id:'short',name:'Manicure',price:'50',durationMin:30,legacyPayload:{show:true,online:true,showPrice:false,websiteOrder:1,proRules:{'p-all':{enabled:true,duration:30,commission:50,price:50,online:true}}}},
  {id:'hidden',name:'Oculto',price:'1',durationMin:15,legacyPayload:{show:false,online:true,showPrice:true,websiteOrder:0}},
  {id:'unlinked',name:'Sem vínculo',price:'60',durationMin:30,legacyPayload:{show:true,online:true,showPrice:true,websiteOrder:3}}
 ]});
 await prisma.professional.create({data:{id:'p-all',name:'Profissional Multiunidade',publicName:'Profissional Pública',legacyPayload:{show:true,online:true,specialty:'Unhas',bio:'Perfil público',photo:'https://example.invalid/photo.jpg',bank:'DADO_PRIVADO',cpf:'00000000000',services:['long','short','hidden'],schedule:{'centro-2':{work:true,start:'09:00',end:'19:00'},'big-2':{work:true,start:'10:00',end:'19:00'}}},units:{create:['big','centro','shopping-contagem'].map(unitId=>({unitId}))}}});
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),OPERATIONAL_WRITES_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>{childStdout+=String(d)});server.stderr.on('data',d=>{childStderr+=String(d)});server.on('error',e=>{childError=e});server.on('exit',(code,signal)=>{childExit={code,signal}});
 try{await health();
  const catalogResponse=await fetch(base+'/api/v1/public/catalog?unitId=centro');ok(catalogResponse.ok,'catálogo público central do Centro');const catalog=await catalogResponse.json(),catalogJson=JSON.stringify(catalog);
  ok(catalog.unit?.id==='centro'&&catalog.bookingEnabled===true,'catálogo público informa unidade e gate operacional');
  ok(catalog.services?.map(x=>x.id).join(',')==='short,long,unlinked'&&!catalog.services.some(x=>x.id==='hidden'),'catálogo filtra e ordena serviços públicos');
  ok(catalog.services.find(x=>x.id==='short')?.price===null&&catalog.services.find(x=>x.id==='long')?.price===120,'catálogo respeita visibilidade de preço');
  ok(catalog.professionals?.length===1&&catalog.professionals[0].serviceIds.includes('long')&&!catalog.professionals[0].serviceIds.includes('unlinked')&&catalog.professionals[0].schedule['centro-2']&&!catalog.professionals[0].schedule['big-2'],'profissional pública é filtrada por unidade, escala e regra profissional-serviço');
  ok(!catalogJson.includes('commission')&&!catalogJson.includes('DADO_PRIVADO')&&!catalogJson.includes('00000000000'),'catálogo público não vaza comissão nem dados privados');
  let shoppingCatalogResponse=await fetch(base+'/api/v1/public/catalog?unitId=shopping-contagem');ok(shoppingCatalogResponse.ok,'catálogo Shopping disponível para consulta');let shoppingCatalog=await shoppingCatalogResponse.json();ok(shoppingCatalog.bookingEnabled===false&&shoppingCatalog.professionals?.[0]&&Object.keys(shoppingCatalog.professionals[0].schedule||{}).length===0,'sem escala mantém operação interna separada e fecha booking público');
  let r=await book('shopping-contagem','2026-10-06T12:00','31999990002','site-shopping-closed');ok(r.status===409,'profissional sem escala rejeita POST público direto');ok(await prisma.booking.count({where:{unitId:'shopping-contagem'}})===0,'sem escala não persiste booking público');
  r=await book('centro','2026-10-07T10:00','31999990003','wrong-weekday','short');ok(r.status===409,'dia sem escala é rejeitado');
  r=await book('centro','2026-10-06T08:30','31999990004','before-shift','short');ok(r.status===409,'início antes da jornada é rejeitado');
  r=await book('centro','2026-10-06T18:45','31999990005','after-shift','short');ok(r.status===409,'duração que termina após a jornada é rejeitada');
  r=await book('centro','2026-10-06T10:00','31999990000','site-centro');ok(r.ok,'site booking centro dentro da escala');ok(await prisma.booking.count({where:{unitId:'centro'}})===1,'central booking centro');
  r=await book('big','2026-10-06T11:00','31999990001','site-big');ok(r.ok,'site booking big dentro da escala');ok(await prisma.booking.count({where:{unitId:'big'}})===1,'central booking big');
  r=await book('centro','2026-10-06T12:30','31999990006','unlinked-service','unlinked');ok(r.status===409,'POST direto respeita regra profissional-serviço');
  r=await book('centro','2026-10-06T13:00','31999990007','hidden-service','hidden');ok(r.status===404,'POST direto não contorna visibilidade pública do serviço');
  r=await book('centro','2026-10-06T10:30','3199999010','overlap','short');ok(r.status===409,'duration overlap blocked');
  r=await book('centro','2026-10-06T10:00','3199999011','same-slot','short');ok(r.status===409,'same slot blocked');
  r=await book('centro','2026-10-06T14:00','3199999030','network-centro','short');ok(r.ok,'network client Centro');
  r=await book('big','2026-10-06T14:00','3199999030','network-big','short');ok(r.ok,'network client Big');
  const networkPhone='+553199999030';ok(await prisma.client.count({where:{phone:networkPhone}})===1,'one network client');ok(await prisma.clientUnitLink.count({where:{client:{phone:networkPhone}}})===2,'two unit links');
  const proRow=await prisma.professional.findUniqueOrThrow({where:{id:'p-all'}}),proLegacy=proRow.legacyPayload||{};await prisma.professional.update({where:{id:'p-all'},data:{legacyPayload:{...proLegacy,schedule:{...(proLegacy.schedule||{}),'shopping-contagem-2':{work:true,start:'09:00',end:'18:00'}}}}});
  shoppingCatalogResponse=await fetch(base+'/api/v1/public/catalog?unitId=shopping-contagem');shoppingCatalog=await shoppingCatalogResponse.json();ok(shoppingCatalog.bookingEnabled===true&&shoppingCatalog.professionals[0].schedule['shopping-contagem-2'],'cadastrar escala abre booking público sem alterar gate operacional');
  r=await book('shopping-contagem','2026-10-06T12:00','31999990002','site-shopping-open');ok(r.ok,'site booking shopping após escala válida');
  r=await book('shopping-contagem','2026-10-06T15:00','3199999040','idem','short');ok(r.ok,'idempotency first');const a=await r.json();
  r=await book('shopping-contagem','2026-10-06T15:00','3199999040','idem','short');ok(r.ok,'idempotency repeat');const b=await r.json();ok(a.id===b.id,'same booking id');
  const concurrent=await Promise.all([book('centro','2026-10-06T16:00','3199999051','race-a','short'),book('centro','2026-10-06T16:00','3199999052','race-b','short')]);
  const statuses=concurrent.map(x=>x.status).sort((a,b)=>a-b);ok(statuses[0]>=200&&statuses[0]<300,'one concurrent booking accepted');ok(statuses[1]===409,'other concurrent booking rejected');
  ok(await prisma.booking.count({where:{unitId:'centro',professionalId:'p-all',startAt:new Date('2026-10-06T19:00:00.000Z')}})===1,'only one concurrent slot persisted');
  r=await book('centro','2026-10-06T18:00:30','3199999060','seconds','short');ok(r.ok,'seconds timestamp accepted');ok(await prisma.booking.count({where:{unitId:'centro',startAt:new Date('2026-10-06T21:00:30.000Z')}})===1,'seconds timestamp persisted correctly');
  await prisma.booking.create({data:{id:'legacy-cancelled',unitId:'centro',serviceDate:new Date('2026-10-06T00:00:00.000Z'),startAt:new Date('2026-10-06T20:00:00.000Z'),serviceId:'short',professionalId:'p-all',status:'Cancelado',legacyPayload:{durationMin:30}}});
  r=await book('centro','2026-10-06T17:00','3199999070','reuse-cancelled','short');ok(r.ok,'legacy cancelled slot can be reused');
  r=await book('big','2026-10-06T18:00','---','invalid-phone','short');ok(r.status===409,'empty normalized phone rejected');
  await prisma.booking.create({data:{id:'all-day-block',unitId:'big',serviceDate:new Date('2026-10-06T00:00:00.000Z'),startAt:new Date('2026-10-06T12:00:00.000Z'),serviceId:null,professionalId:'p-all',status:'Bloqueado',blockAllDay:true,legacyPayload:{source:'test'}}});
  r=await book('big','2026-10-06T16:00','3199999080','all-day-blocked','short');ok(r.status===409,'bloqueio de dia inteiro rejeita POST público');
  ok(await prisma.auditEvent.count({where:{action:'booking.created_online'}})===9,'online bookings audited');
  console.log(JSON.stringify({ok:true,tests:n,feature:'public_booking_three_units'}));
 }finally{if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),sleep(3000)]).catch(()=>{})}await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
