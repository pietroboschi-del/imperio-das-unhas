import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function health(){for(let i=0;i<60;i++){try{if((await fetch(base+'/api/v1/health')).ok)return}catch{}await sleep(500)}throw Error('backend start timeout')}
async function book(unit,start,phone,key,service='long'){return fetch(base+'/api/v1/public/bookings',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify({unitId:unit,serviceId:service,professionalId:'p-all',startAt:start,clientName:'Cliente Site',clientPhone:phone})})}
async function main(){
 await prisma.auditEvent.deleteMany();await prisma.booking.deleteMany();await prisma.clientUnitLink.deleteMany();await prisma.client.deleteMany();await prisma.professionalUnit.deleteMany();await prisma.professional.deleteMany();await prisma.service.deleteMany();await prisma.serviceCategory.deleteMany();await prisma.loginRateLimit.deleteMany();await prisma.userCredentialToken.deleteMany();await prisma.session.deleteMany();await prisma.userUnitAccess.deleteMany();await prisma.unit.deleteMany();
 for(const [id,name] of [['big','Big Shopping'],['centro','Centro de Contagem'],['shopping-contagem','Shopping Contagem']])await prisma.unit.create({data:{id,name}});
 await prisma.service.createMany({data:[{id:'long',name:'Alongamento',price:'120',durationMin:90},{id:'short',name:'Manicure',price:'50',durationMin:30}]});
 await prisma.professional.create({data:{id:'p-all',name:'Profissional Multiunidade',units:{create:['big','centro','shopping-contagem'].map(unitId=>({unitId}))}}});
 const server=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,OPERATIONAL_WRITES_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
 try{await health();
  const units=[['centro','10'],['big','11'],['shopping-contagem','12']];
  for(let i=0;i<units.length;i++){const [u,h]=units[i];const r=await book(u,`2026-10-06T${h}:00`,`3199999000${i}`,`site-${u}`);ok(r.ok,'site booking '+u);ok(await prisma.booking.count({where:{unitId:u}})===1,'central booking '+u)}
  let r=await book('centro','2026-10-06T10:30','3199999010','overlap','short');ok(r.status===409,'duration overlap blocked');
  r=await book('centro','2026-10-06T10:00','3199999011','same-slot','short');ok(r.status===409,'same slot blocked');
  r=await book('centro','2026-10-06T14:00','3199999030','network-centro','short');ok(r.ok,'network client Centro');
  r=await book('big','2026-10-06T14:00','3199999030','network-big','short');ok(r.ok,'network client Big');
  ok(await prisma.client.count({where:{phone:'3199999030'}})===1,'one network client');ok(await prisma.clientUnitLink.count({where:{client:{phone:'3199999030'}}})===2,'two unit links');
  r=await book('shopping-contagem','2026-10-06T15:00','3199999040','idem','short');ok(r.ok,'idempotency first');const a=await r.json();
  r=await book('shopping-contagem','2026-10-06T15:00','3199999040','idem','short');ok(r.ok,'idempotency repeat');const b=await r.json();ok(a.id===b.id,'same booking id');
  ok(await prisma.auditEvent.count({where:{action:'booking.created_online'}})===6,'online bookings audited');
  console.log(JSON.stringify({ok:true,tests:n,feature:'public_booking_three_units'}));
 }finally{server.kill('SIGTERM');await prisma.$disconnect()}
}
main().catch(async e=>{console.error(e.stack||e);await prisma.$disconnect().catch(()=>{});process.exit(1)});
