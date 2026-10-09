import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {BookingAvailabilityService}=require('../dist/src/core/booking-availability.service.js');
const {evaluateAccess}=require('../dist/src/auth/permission-policy.js');
process.env.OPERATIONAL_WRITES_ENABLED='true';
process.env.OPERATIONAL_WRITES_UNITS='centro,big,shopping-contagem';
const service=(id,extra={})=>({id,name:id,price:50,durationMin:30,categoryId:'unhas',category:{id:'unhas',name:'Unhas',active:true},legacyPayload:{show:true,online:true},...extra});
const rows=[service('eligible'),service('unlinked'),service('hidden',{legacyPayload:{show:false,online:true}}),service('inactive',{active:false})];
const professional={id:'pro',name:'Pro',legacyPayload:{services:['eligible','hidden'],show:true,online:true,schedule:{'centro-2':{work:true,start:'09:00',end:'18:00'},'big-2':{work:true,start:'09:00',end:'09:00'}}}};
let occupancyReads=0;
const prisma={
 unit:{findFirst:async({where})=>({id:where.id,name:where.id,timezone:'America/Sao_Paulo'})},
 service:{findMany:async()=>rows.filter(x=>x.active!==false)},
 professionalUnit:{findMany:async()=>[{professional}]},
 bookingItem:{findMany:async()=>{occupancyReads++;return []}}
};
const api=new BookingAvailabilityService(prisma);
let catalog=await api.catalog('centro');
assert.deepEqual(catalog.services.map(x=>x.id),['eligible'],'serviço sem profissional habilitado não é público');
assert.equal(catalog.bookingEnabled,true);
assert.equal(occupancyReads,0,'agenda lotada não interfere na elegibilidade do catálogo');
catalog=await api.catalog('big');
assert.deepEqual(catalog.services,[],'escala inválida não publica serviço nessa unidade');
assert.deepEqual(catalog.professionals,[]);
catalog=await api.catalog('shopping-contagem');
assert.deepEqual(catalog.services,[],'escala de outra unidade não é suficiente');
professional.legacyPayload.schedule['shopping-contagem-2']={work:true,start:'10:00',end:'18:00'};
catalog=await api.catalog('shopping-contagem');
assert.deepEqual(catalog.services.map(x=>x.id),['eligible']);
professional.legacyPayload.schedule={'centro-invalid':{work:true,start:'09:00',end:'18:00'}};
assert.deepEqual((await api.catalog('centro')).services,[],'dia inválido não é escala válida');
for(const unitId of ['centro','big','shopping-contagem']){
 assert.equal(evaluateAccess({networkAdmin:true,globalPermissions:[],unitAccesses:[],unitScoped:true,unitId,requiredPermissions:['catalog.manage']}).allowed,true,'Master global autorizado em '+unitId);
 assert.equal(evaluateAccess({networkAdmin:false,globalPermissions:['catalog.manage'],unitAccesses:[{unitId:'centro',permissions:[]}],unitScoped:true,unitId,requiredPermissions:['catalog.manage']}).allowed,unitId==='centro','funcionário permanece restrito em '+unitId);
}
console.log(JSON.stringify({ok:true,feature:'phase4_public_catalog_eligibility_and_rbac',checks:15}));
