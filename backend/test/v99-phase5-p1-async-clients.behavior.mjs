import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
let checks=0;
const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)};
const ok=(v,m)=>{checks++;assert.ok(v,m)};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return html.slice(i,j)};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
function fixture(){
 let unit='u1',overlay=null,closeCount=0;
 const win={resDraft:null,modal:()=>{overlay={};return true},closeModal:()=>{overlay=null;closeCount++;return true}};
 const document={getElementById:x=>x==='modalHost'?{querySelector:()=>overlay}:null};
 const manager=new Function('window','document','centralLocalUnitId','modal','closeModal',slice('const phase5Context=(()=>{','window.__imperioPhase5Context=phase5Context;')+';return phase5Context')(win,document,()=>unit,win.modal,win.closeModal);
 return {win,document,manager,setUnit:x=>unit=x,unit:()=>unit,closed:()=>closeCount};
}
async function edits(){
 const h=fixture(),w=h.win,ctx=h.manager;
 const records={A:{id:'A',name:'Alice',active:true,source:'Instagram',origin:'Presencial'},B:{id:'B',name:'Beatriz',active:true,source:'Indicação',origin:'WhatsApp'},H:{id:'H',name:'Histórica',active:true,source:'Fonte antiga',origin:'Migração antiga'},Z:{id:'Z',name:'Sem origem',active:true,source:'',origin:''}};
 let fields={},gate=null,sendGate=null,patches=[],notices=[],refreshes=0;
 w.openClientForm=id=>{const r=records[id];fields={name:r.name,phone:'31999990000',source:r.source,origin:r.origin};return w.modal()};
 w.saveClient=()=>{throw Error('local fallback')};
 const api={client:id=>(id==='A'&&gate?gate.promise:Promise.resolve(records[id])),
  updateClient:(id,body)=>{patches.push({id,body});return sendGate?sendGate.promise:Promise.resolve({...records[id],...body})},
  createClient:async()=>({id:'new',active:true})};
 const formVal=k=>({get value(){return fields[k]}});
 const params=['window','saveClient','centralEnabled','officialProductionMode','cfName','cfPhone','cfSource','toast','centralApi','centralClientPayload','mergeCentralClients','closeModal','renderClients','phase5Context','centralLocalUnitId','db','cfOrigin'];
 const args=[w,w.saveClient,()=>true,()=>true,formVal('name'),formVal('phone'),formVal('source'),x=>notices.push(x),api,()=>({...fields}),()=>{},()=>w.closeModal(),()=>refreshes++,ctx,h.unit,{clients:[]},formVal('origin')];
 new Function(...params,slice('const legacySaveClient=window.saveClient','const oldOpenClientFormV99')+';return true')(...args);
 new Function('window','openClientForm','phase5Context','officialProductionMode','centralEnabled','toast','centralApi','mergeCentralClients','db',slice('const oldOpenClientFormV99=window.openClientForm','const oldQuickOpenV99=window.openQuickClientFromReservation')+';return true')(w,w.openClientForm,ctx,()=>true,()=>true,x=>notices.push(x),api,()=>{}, {clients:Object.values(records)});
 await w.openClientForm('A');
 gate=defer();const saveA=w.saveClient('A');
 await w.openClientForm('B');fields.name='Beatriz';
 gate.resolve(records.A);await saveA;
 eq(patches.length,0,'A response after B cannot submit mismatched PATCH');
 eq(refreshes,0,'A stale response never redraws B');
 eq(notices.filter(x=>x.includes('atualizada')).length,0,'stale A has no success notification');
 gate=null;await w.openClientForm('A');
 sendGate=defer();const saving=w.saveClient('A');await tick();
 eq(patches.length,1,'one PATCH was transmitted');
 eq(patches[0].body.name,'Alice','payload frozen before awaits');
 const closes=h.closed();await w.openClientForm('B');
 sendGate.resolve(records.A);await saving;
 eq(h.closed(),closes,'late PATCH confirmation does not close B');
 eq(refreshes,0,'late PATCH confirmation does not redraw B');
 sendGate=null;await w.openClientForm('B');
 gate=defer();const first=w.saveClient('B'),second=w.saveClient('B');
 eq(second,false,'double click blocked');gate.resolve(records.B);await first;
 eq(patches.filter(x=>x.id==='B').length,1,'only one PATCH for repeated click');
 gate=null;
 await w.openClientForm('H');fields.phone='31999991111';await w.saveClient('H');
 eq(Object.hasOwn(patches.at(-1).body,'origin'),false,'untouched historical origin omitted');
 eq(Object.hasOwn(patches.at(-1).body,'source'),false,'untouched historical acquisition omitted');
 await w.openClientForm('H');fields.origin='Presencial';await w.saveClient('H');
 eq(patches.at(-1).body.origin,'Presencial','explicit valid origin change sent');
 eq(Object.hasOwn(patches.at(-1).body,'source'),false,'changing origin does not rewrite source');
 await w.openClientForm('Z');fields.phone='31999992222';await w.saveClient('Z');
 eq(Object.hasOwn(patches.at(-1).body,'origin'),false,'missing origin not rewritten');
 eq(Object.hasOwn(patches.at(-1).body,'source'),false,'missing source not rewritten');
}
async function quick(){
 const h=fixture(),w=h.win,ctx=h.manager,posted=[],resolvers=[],selections=[];
 w.openQuickClientFromReservation=()=>w.modal();
 w.saveQuickClientFromReservation=()=>{throw Error('local fallback')};
 const inputs={qcfName:{value:'Teste'},qcfPhone:{value:'31999992222'},qcfSource:{value:'Indicação'},qcfOrigin:{value:'Presencial'},qcfBirth:{value:''}};
 const api={createClient:(body,key)=>{posted.push({body,key});const d=defer();resolvers.push(d);return d.promise}};
 const names=['window','openQuickClientFromReservation','saveQuickClientFromReservation','officialProductionMode','centralEnabled','phase5Context','toast','qcfName','qcfPhone','qcfSource','qcfOrigin','qcfBirth','operationKey','centralApi','mergeCentralClients','renderReservationModal','centralLocalUnitId'];
 const vals=[w,w.openQuickClientFromReservation,w.saveQuickClientFromReservation,()=>true,()=>true,ctx,()=>{},...Object.values(inputs),()=> 'key-'+posted.length,api,()=>{},()=>{selections.push(w.resDraft.clientId);w.modal()},h.unit];
 new Function(...names,slice('const oldQuickOpenV99=window.openQuickClientFromReservation','const oldReservationSearchV99=window.reservationClientSearch')+';return true')(...vals);
 const A={clientId:''};w.resDraft=A;w.openQuickClientFromReservation();const pA=w.saveQuickClientFromReservation();
 eq(w.saveQuickClientFromReservation(),false,'double quick save blocked on same modal');
 h.setUnit('u3');const B={clientId:''};w.resDraft=B;w.openQuickClientFromReservation();const pB=w.saveQuickClientFromReservation();
 eq(posted.length,2,'quick save for new draft not blocked by old draft');
 resolvers[0].resolve({id:'big-client',active:true});await pA;eq(B.clientId,'','old Big result cannot select client in Centro');
 resolvers[1].resolve({id:'centro-client',active:true});await pB;eq(B.clientId,'centro-client','matching Centro result selects client');
 const C={clientId:''};w.resDraft=C;w.openQuickClientFromReservation();const pC=w.saveQuickClientFromReservation();w.closeModal();resolvers[2].resolve({id:'closed-client',active:true});await pC;eq(C.clientId,'','close prevents stale selection');
 const D={clientId:''};w.resDraft=D;w.openQuickClientFromReservation();const pD=w.saveQuickClientFromReservation();ctx.invalidateSession();resolvers[3].resolve({id:'expired-client',active:true});await pD;eq(D.clientId,'','expired session prevents stale selection');
 const E={clientId:''};w.resDraft=E;w.openQuickClientFromReservation();const pE=w.saveQuickClientFromReservation();const F={clientId:''};w.resDraft=F;w.openQuickClientFromReservation();resolvers[4].resolve({id:'draft-E',active:true});await pE;eq(F.clientId,'','new reservation is not overwritten by previous create');
 ok(selections.includes('centro-client'),'valid selection committed for the original draft');
}

async function searchOrder(){
 const applied=[],a=defer(),b=defer();let generation=0,unit='u1',query={A:a.promise,B:b.promise};
 const remote={clients:q=>query[q]};
 const fn=new Function('centralEnabled','centralLocalUnitId','centralClientGeneration','centralApi','mergeCentralClients',
  slice("async function refreshCentralClients(q='')","window.__imperioCentralClientIdentity=")+";return refreshCentralClients")(
  ()=>true,()=>unit,generation,remote,rows=>applied.push(rows[0]?.id)
 );
 const old=fn('A'),latest=fn('B');b.resolve([{id:'B'}]);eq(await latest,true,'fresh search succeeds');
 a.resolve([{id:'A'}]);eq(await old,false,'stale search discarded');
 eq(applied,['B'],'T06 out-of-order search does not overwrite newer results');
 const c=defer();query.C=c.promise;const changed=fn('C');unit='u3';c.resolve([{id:'C'}]);
 eq(await changed,false,'unit switch invalidates pending client search');
 eq(applied,['B'],'unit change never applies old-unit search');
}

await edits();await quick();await searchOrder();console.log(JSON.stringify({result:'P1 POST AUDIT ASYNC CLIENTS: PASS',checks}));