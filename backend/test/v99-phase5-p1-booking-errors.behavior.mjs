import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
let checks=0;const eq=(x,y,m)=>{checks++;assert.deepEqual(x,y,m)};
const part=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return html.slice(i,j)};
const missing=(status,message)=>Object.assign(new Error(message),{status});
async function scenario(kind){
 const db={clients:[{id:'C',active:true,central:true,name:'Validada'}],services:[{id:'S',name:'Manicure'}],bookings:[]},ids=new Set(['C']);
 const draft={clientId:'C',date:'2026-10-15',status:'Agendado',items:[{serviceId:'S',pro:'P',time:'10:00',duration:30,price:50}]};
 const overlay={},document={getElementById:()=>({querySelector:()=>overlay})};
 let session=1,calls=0,creates=0,toasts=[],keys=[],local=0,success=false;
 const api={
  client:async()=>{calls++;if(kind==='not-found'||kind==='inactive')throw missing(404,'Cliente não encontrada');
   if(calls===2&&kind==='network')throw missing(503,'Falha temporária');
   if(calls===2&&kind==='expired'){session++;throw missing(401,'Sessão expirada')}
   return {id:'C',active:true};},
  createBooking:async(body,key)=>{creates++;keys.push(key);if(['service','professional','network','expired'].includes(kind))throw missing(404,kind+' não encontrado');success=true;return{id:'B',clientId:body.clientId,status:'Agendado'}},
  updateBooking:async()=>{throw Error('should not update')}
 };
 const win={resDraft:draft,saveReservation:()=>{local++;return false},commandReturnId:null,__imperioCentralClientIdentity:{valid:c=>ids.has(c.id)}};
 const names=['window','saveReservation','centralEnabled','officialProductionMode','toast','centralReservationBusy','syncResDraftFromDom','resDraft','db','validateDraftLines','centralLocalUnitId','centralApi','mergeCentralClients','centralItemPayload','operationKey','refreshCentralAgenda','closeModal','legacyRenderAgenda','centralClientIds','save','openCommand','syncCommandAgendaItems','money','document','phase5Context'];
 const args=[win,win.saveReservation,()=>true,()=>true,s=>toasts.push(s),false,()=>{},draft,db,()=>null,()=> 'u1',api,()=>{},it=>({serviceId:it.serviceId,professionalId:it.pro,startAt:'2026-10-15T10:00:00-03:00'}),()=> 'operation-stable',async()=>true,()=>{},()=>{},ids,()=>{},()=>{},()=>{},x=>x,document,{session:()=>session}];
 const submit=new Function(...names,part('const legacySaveReservation=window.saveReservation','const legacySaveExistingBooking=window.saveExistingBooking')+';return ()=>window.saveReservation()')(...args);
 const result=await submit();
 if(kind==='success'){
  eq(result.clientId,'C','valid booking created');
  await submit();eq(keys.join(','),'operation-stable,operation-stable','same draft retry uses stable key');
  eq(ids.has('C'),true,'successful booking preserves client');
 }else{
  eq(result,false,'failed booking not acknowledged: '+kind);
  eq(success,false,'no false success for '+kind);
  eq(ids.has('C'),!(kind==='not-found'||kind==='inactive'),'only specific Client 404 invalidates: '+kind);
  if(kind==='service'||kind==='professional'||kind==='network'||kind==='expired')eq(creates,1,'booking attempted once; never silently retried: '+kind);
 }
 eq(local,0,'no local write fallback');
 return calls;
}
for(const kind of ['service','professional','not-found','inactive','network','expired','success'])await scenario(kind);
// The production opener must never carry an idempotency key into a different draft.
const opener=new Function('window','unitPicker','agendaDate','defaultReservationItem','renderReservationModal',
 part("function openReservation(proId='',time='',clientId='',date=agendaDate)","function syncResDraftFromDom(){")+
 ';return openReservation;');
const selection={resDraft:null};const open=opener(selection,{value:'u1'},'2026-10-15',()=>({serviceId:'S',pro:'P'}),()=>{});
open();const draftA=selection.resDraft;draftA.centralOperationKey='booking-key-A';
open();const draftB=selection.resDraft;
eq(draftA===draftB,false,'T17 distinct reservations have distinct draft identities');
eq(draftB.centralOperationKey,undefined,'T17 new draft cannot inherit the previous idempotency key');
console.log(JSON.stringify({result:'P1 BOOKING 404 CLASSIFICATION: PASS',checks}));