import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {BookingAvailabilityService} from '../dist/src/core/booking-availability.service.js';
const prisma=new PrismaClient();let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)},eq=(a,b,m)=>{checks++;assert.equal(a,b,m)};
const date='2030-10-08',unit='centro',services=['w3c-maint','w3c-mani','w3c-pedi'],pros=['w3c-a','w3c-b','w3c-c','w3c-d'];
async function cleanup(){await prisma.booking.deleteMany({where:{serviceId:{in:services}}}).catch(()=>{});await prisma.workstation.deleteMany({where:{id:{startsWith:'w3c-ws'}}}).catch(()=>{});await prisma.professionalUnit.deleteMany({where:{professionalId:{in:pros}}}).catch(()=>{});await prisma.professional.deleteMany({where:{id:{in:pros}}}).catch(()=>{});await prisma.service.deleteMany({where:{id:{in:services}}}).catch(()=>{});await prisma.serviceCategory.deleteMany({where:{id:{in:['w3c-hands','w3c-feet']}}}).catch(()=>{})}
try{await prisma.$connect();await ensureCanonicalUnits(prisma);await cleanup();process.env.OPERATIONAL_WRITES_ENABLED='true';process.env.OPERATIONAL_WRITES_UNITS='';
await prisma.serviceCategory.createMany({data:[{id:'w3c-hands',name:'Hands',active:true},{id:'w3c-feet',name:'Feet',active:true}]});
await prisma.service.createMany({data:[
{id:'w3c-maint',name:'Manutenção',categoryId:'w3c-hands',price:'100',durationMin:75,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:true,proRules:{'w3c-a':{enabled:true,online:true,duration:75}}}},
{id:'w3c-mani',name:'Manicure',categoryId:'w3c-hands',price:'40',durationMin:45,active:true,legacyPayload:{show:true,online:true,clientArea:'hands',mustFinishBeforeSameArea:false,proRules:{'w3c-b':{enabled:true,online:true,duration:45},'w3c-d':{enabled:true,online:true,duration:45}}}},
{id:'w3c-pedi',name:'Pedicure',categoryId:'w3c-feet',price:'45',durationMin:50,active:true,legacyPayload:{show:true,online:true,clientArea:'feet',mustFinishBeforeSameArea:false,proRules:{'w3c-c':{enabled:true,online:true,duration:50}}}},
]});
const schedule={'centro-2':{work:true,start:'09:00',end:'18:00'}};
for(const [id,name,sv] of [['w3c-a','A',['w3c-maint']],['w3c-b','B',['w3c-mani']],['w3c-c','C',['w3c-pedi']],['w3c-d','D',['w3c-mani']]]){await prisma.professional.create({data:{id,name,active:true,legacyPayload:{show:true,online:true,services:sv,schedule}}});await prisma.professionalUnit.create({data:{professionalId:id,unitId:unit,active:true}})}
await prisma.workstation.createMany({data:[
{id:'w3c-ws-h1',unitId:unit,name:'Hands 1',allowedCategoryIds:['w3c-hands'],active:true},
{id:'w3c-ws-h2',unitId:unit,name:'Hands 2',allowedCategoryIds:['w3c-hands'],active:true},
{id:'w3c-ws-f1',unitId:unit,name:'Feet 1',allowedCategoryIds:['w3c-feet'],active:true},
]});
const svc=new BookingAvailabilityService(prisma);
let r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint',professionalId:'w3c-a',preferenceMode:'required'},{serviceId:'w3c-mani',professionalId:'w3c-b',preferenceMode:'required'}]});
ok(r.visits.length>0,'manutenção + manicure possui combinação');let v=r.visits[0],maint=v.items.find(x=>x.serviceId==='w3c-maint'),mani=v.items.find(x=>x.serviceId==='w3c-mani');ok(mani.startMin>=maint.endMin,'manicure só começa após manutenção na mesma clientArea');
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint',professionalId:'w3c-a',preferenceMode:'required'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});v=r.visits[0];maint=v.items.find(x=>x.serviceId==='w3c-maint');let pedi=v.items.find(x=>x.serviceId==='w3c-pedi');ok(pedi.startMin<maint.endMin,'pedicure pode começar durante manutenção');
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint',professionalId:'w3c-a',preferenceMode:'required'},{serviceId:'w3c-mani',professionalId:'w3c-b',preferenceMode:'required'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});v=r.visits[0];eq(new Set(v.items.map(x=>x.professionalId)).size,3,'três profissionais diferentes são válidas');maint=v.items.find(x=>x.serviceId==='w3c-maint');mani=v.items.find(x=>x.serviceId==='w3c-mani');pedi=v.items.find(x=>x.serviceId==='w3c-pedi');ok(pedi.startMin<mani.endMin&&pedi.endMin>maint.startMin,'pedicure ocorre em paralelo com a visita de mãos');ok(mani.startMin>=maint.endMin,'mesma área incompatível nunca sobrepõe');
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-mani',professionalId:'w3c-b',preferenceMode:'preferred'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});eq(r.visits[0].items.find(x=>x.serviceId==='w3c-mani').professionalId,'w3c-b','preferred prioriza profissional');
await prisma.booking.create({data:{id:'w3c-busy-b',unitId:unit,serviceDate:new Date(date+'T00:00:00Z'),startAt:new Date('2030-10-08T12:00:00Z'),serviceId:'w3c-mani',professionalId:'w3c-b',status:'Confirmado',legacyPayload:{},items:{create:{id:'w3c-busy-bi',unitId:unit,serviceId:'w3c-mani',professionalId:'w3c-b',startAt:new Date('2030-10-08T12:00:00Z'),durationMin:180,unitPrice:'40',sortOrder:0}}}});
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-mani',professionalId:'w3c-b',preferenceMode:'preferred'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});ok(r.visits.some(x=>x.items.find(i=>i.serviceId==='w3c-mani').professionalId==='w3c-d'),'preferred permite alternativa quando preferida indisponível');
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-mani',professionalId:'w3c-b',preferenceMode:'required'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});ok(r.visits.every(x=>x.items.find(i=>i.serviceId==='w3c-mani').professionalId==='w3c-b'),'required nunca substitui profissional');
await prisma.workstation.update({where:{id:'w3c-ws-f1'},data:{active:false}});r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint'},{serviceId:'w3c-pedi'}]});eq(r.visits.length,0,'falta de estação compatível rejeita combinação');await prisma.workstation.update({where:{id:'w3c-ws-f1'},data:{active:true}});
await prisma.workstation.update({where:{id:'w3c-ws-h2'},data:{active:false}});r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint'},{serviceId:'w3c-mani'}]});ok(r.visits.length>0,'sequência na mesma área cabe em uma única estação por não sobrepor');
await prisma.workstation.update({where:{id:'w3c-ws-h2'},data:{active:true}});
await prisma.workstation.update({where:{id:'w3c-ws-h1'},data:{allowedCategoryIds:['w3c-hands','w3c-feet']}});
await prisma.workstation.update({where:{id:'w3c-ws-h2'},data:{active:false}});
await prisma.workstation.update({where:{id:'w3c-ws-f1'},data:{active:false}});
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint',professionalId:'w3c-a',preferenceMode:'required'},{serviceId:'w3c-pedi',professionalId:'w3c-c',preferenceMode:'required'}]});
ok(r.visits.length>0,'capacidade esgotada ainda permite combinação sequencial');
ok(r.visits.every(v=>{const a=v.items.find(x=>x.serviceId==='w3c-maint'),b=v.items.find(x=>x.serviceId==='w3c-pedi');return !(a.startMin<b.endMin&&a.endMin>b.startMin)}),'capacidade esgotada rejeita sobreposição física impossível');
await prisma.workstation.update({where:{id:'w3c-ws-h1'},data:{allowedCategoryIds:['w3c-hands']}});
await prisma.workstation.update({where:{id:'w3c-ws-h2'},data:{active:true}});
await prisma.workstation.update({where:{id:'w3c-ws-f1'},data:{active:true}});
r=await svc.multiAvailability({unitId:unit,date,services:[{serviceId:'w3c-maint'},{serviceId:'w3c-mani'},{serviceId:'w3c-pedi'}]});ok(r.visits[0].visitDurationMin<=120,'menor duração total com paralelismo é priorizada');
console.log(JSON.stringify({ok:true,checks,feature:'wa3c1_multi_service_availability'}));
}finally{await cleanup().catch(()=>{});await prisma.$disconnect()}
