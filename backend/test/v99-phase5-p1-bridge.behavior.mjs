import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
let checks=0;
const eq=(a,b,label)=>{checks++;assert.deepEqual(a,b,label)};
const ok=(a,label)=>{checks++;assert.ok(a,label)};
const source=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'central script section '+start);
 return html.slice(a,b);
};

const db={clients:[{id:'cl_legacy_only',name:'Local'}, {id:'cl_canonical',name:'Cached'}],services:[{id:'s1',name:'Service A'},{id:'s2',name:'Service B'}]};
const ids=new Set(),normalizeClient=c=>c,localDateISO=()=> '2026-10-10';
const merge=new Function('db','centralClientIds','normalizeClient','localDateISO','UNIT_TO_LOCAL',
 source('function mergeCentralClients(rows){','function mergeCentralBookings(rows,uid')+';return mergeCentralClients;')
 (db,ids,normalizeClient,localDateISO,{big:'u1',centro:'u3','shopping-contagem':'u2'});
merge([{id:'cl_canonical',name:'Canônica',active:true,registrationUnitId:'big',source:'Instagram',origin:'Presencial'},{id:'op_central',name:'Rede',active:true,registrationUnitId:'centro',source:'Indicação',origin:'WhatsApp'},{id:'op_inactive',name:'Inativa',active:false}]);
eq(ids.has('cl_legacy_only'),false,'unreconciled local client never becomes trusted');
eq(ids.has('cl_canonical'),true,'canonical identity can have cl prefix');
eq(ids.has('op_central'),true,'central op ID is trusted');
eq(ids.has('op_inactive'),false,'inactive identity rejected');
eq(db.clients.find(c=>c.id==='cl_canonical').origin,'Presencial','business origin preserved');
eq(db.clients.find(c=>c.id==='cl_canonical').technicalProvenance,'central_api','technical provenance separate');

let loginValid=true,localWrites=0,requests=[],errors=[],fetchCount=0;
const selected=db.clients.find(c=>c.id==='op_central');
const window={resDraft:draft,commandReturnId:null,__imperioCentralClientIdentity:{valid:c=>!!c&&ids.has(c.id)&&c.central===true&&c.active===true},saveReservation:()=>{localWrites++;return false}};
const draft={clientId:'cl_legacy_only',date:'2026-10-12',status:'Agendado',items:[{serviceId:'s1',pro:'p1',time:'10:00',duration:30,price:50},{serviceId:'s2',pro:'p2',time:'10:30',duration:40,price:70}]};
const booking={
 client:async id=>{fetchCount++;return db.clients.find(c=>c.id===id&&ids.has(id))||null},
 createBooking:async(body,key)=>{requests.push({body,key});return{id:'booking_ci',clientId:body.clientId,status:'Agendado'}}
};
const ctx=new Function('window','saveReservation','centralEnabled','officialProductionMode','toast','centralReservationBusy','syncResDraftFromDom','resDraft','db','validateDraftLines','centralLocalUnitId','centralApi','mergeCentralClients','centralItemPayload','operationKey','refreshCentralAgenda','closeModal','legacyRenderAgenda','centralClientIds','save','openCommand','syncCommandAgendaItems','money','document','phase5Context',
 source('const legacySaveReservation=window.saveReservation','const legacySaveExistingBooking=window.saveExistingBooking')+
 ';return ()=>window.saveReservation();')(
 window,window.saveReservation,()=>loginValid,()=>true,m=>errors.push(m),false,()=>{},draft,db,()=>null,()=> 'u1',booking,merge,(it,date)=>({serviceId:it.serviceId,professionalId:it.pro,startAt:date+'T'+it.time+':00-03:00',unitPrice:it.price,durationMin:it.duration}),()=> 'stable-key',async()=>true,()=>{},()=>{},ids,()=>{},()=>{},()=>{},x=>x,{getElementById:()=>({querySelector:()=>null})},{session:()=>1}
);
eq(await ctx(),false,'local-only candidate blocked from booking');
eq(requests.length,0,'no central write for legacy ID');
draft.clientId=selected.id;
let result=await ctx();
eq(result.clientId,selected.id,'booking uses canonical selected client ID');
eq(requests[0].body.items.length,2,'all BookingItems forwarded');
eq(requests[0].key,'stable-key','stable idempotency key');
await ctx();eq(requests[1].key,'stable-key','retry reuses same key');
loginValid=false;eq(await ctx(),false,'absent session never falls back to legacy writer');eq(localWrites,0,'no local production writes');
ok(fetchCount>=2,'backend ID reverified before booking');

let cleared=0,shown='',status=401;
const requester=new Function('ensureCentralUnitId','centralCsrf','endpoint','fetch','officialProductionMode','setCentralSession','applyCentralUnitGate','showOnly','toast','centralError',
 source('async function centralRequest(path,opt={})','function localStatus(s)')+';return centralRequest;')(
 async()=> 'big',()=> 'csrf',()=> 'https://isolated.invalid',async(url,options)=>({ok:status===200,status,text:async()=>JSON.stringify(status===200?{id:'x'}:{message:'Sessão ausente'}),options}),
 ()=>true,()=>cleared++,()=>{},p=>shown=p,()=>{},(d,s)=>Object.assign(new Error(d.message),{status:s})
);
await assert.rejects(()=>requester('/api/v1/clients'),e=>e.status===401);
eq(cleared,1,'401 invalidates stale session state');eq(shown,'loginApp','401 routes back to authentication');
status=200;eq((await requester('/api/v1/clients')).id,'x','legitimate restored request succeeds');
console.log(JSON.stringify({result:'P1 FRONTEND BRIDGE BEHAVIOR: PASS',checks}));
