import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {CoreReadController} from '../dist/src/core/core-read.controller.js';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
const prisma=new PrismaClient();let n=0;const eq=(a,b,m)=>{n++;assert.equal(a,b,m)},ok=(v,m)=>{n++;assert.ok(v,m)};
async function cleanup(){await prisma.waitlistRequest.deleteMany({where:{id:{startsWith:'wa47-'}}}).catch(()=>{});await prisma.client.deleteMany({where:{id:'wa47-c'}}).catch(()=>{});}
try{await prisma.$connect();await ensureCanonicalUnits(prisma);await cleanup();await prisma.client.create({data:{id:'wa47-c',name:'Cliente WA47',phone:'+5531999470000',active:true,registrationUnitId:'centro',legacyPayload:{}}});await prisma.waitlistRequest.createMany({data:[
{id:'wa47-centro',unitId:'centro',clientId:'wa47-c',status:'WAITING',legacyPayload:{source:'WHATSAPP_AGENT',services:[{serviceId:'s1',serviceName:'Manutenção'},{serviceId:'s2',serviceName:'Pedicure'}],serviceIds:['s1','s2'],acceptsOtherUnits:true,acceptsOtherProfessional:true,desiredDateFrom:'2030-10-08',desiredDateTo:'2030-10-10',timeFrom:'17:00',timeTo:'19:00'}},
{id:'wa47-big',unitId:'big',status:'WAITING',legacyPayload:{source:'WHATSAPP_AGENT',serviceIds:['s1']}},
]});const ctl=new CoreReadController(prisma);const req={unitId:'centro',principal:{userId:'u',networkAdmin:false,unitIds:['centro'],unitAccesses:[]}};const rows=await ctl.waitlist(req);eq(rows.length,1,'read de fila respeita unidade');eq(rows[0].id,'wa47-centro','retorna pedido da unidade');eq(rows[0].clientName,'Cliente WA47','retorna snapshot útil da cliente');eq(rows[0].clientPhone,'+5531999470000','retorna telefone para ação operacional');ok(Array.isArray(rows[0].legacyPayload.services)&&rows[0].legacyPayload.services.length===2,'preserva intenção multi-serviço');console.log(JSON.stringify({ok:true,checks:n,feature:'wa4_7_waitlist_read'}));
}finally{await cleanup().catch(()=>{});await prisma.$disconnect()}
