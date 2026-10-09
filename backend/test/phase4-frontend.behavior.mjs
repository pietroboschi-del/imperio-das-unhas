import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const unitIds=['centro','big','shopping-contagem'];
const units=unitIds.map(id=>({id,name:id,active:true,profile:{publicName:id,whatsappUrl:'https://wa.me/5531999999999'}}));
const localUnits=[{id:'u3',active:true},{id:'u1',active:true},{id:'u2',active:true}];
const a=html.indexOf(' function allowedUnits(user=currentUser())'),z=html.indexOf('\n function unitNames',a);
let principal={networkAdmin:false,unitIds:['centro'],unitAccesses:[{unitId:'centro'}]};
const allowed=new Function('db','currentUser','sessionStorage','location',html.slice(a,z)+';return allowedUnits')(
 {units:localUnits},()=>({role:'admin',allUnits:true}),{getItem:k=>k==='imperio-v99-central-principal'?JSON.stringify(principal):'1'},{hostname:'production.example',protocol:'https:'});
assert.deepEqual(allowed().map(x=>x.id),['u3'],'escopo central restrito prevalece sobre admin local');
principal={networkAdmin:true,unitIds:[],unitAccesses:[]};
assert.deepEqual(allowed().map(x=>x.id),['u3','u1','u2'],'Master global usa as três unidades');
const i=html.indexOf('/* ===== V99 · PUBLIC BOOKING CENTRAL CATALOG');
const end=html.indexOf('/* ===== V99 · CLIENTS_ONLY',i);
const script=html.slice(i,end);
function setup({eligible=false,fail=false,failCatalog=false,empty=false}={}){
 const nodes=new Map(['publicServices','publicTeam','publicUnits','bkPublicServices'].map(x=>[x,{innerHTML:''}]));
 let modalHtml='',requests=[],step=0;
 const sandbox={console,Date,Map,Set,URL,structuredClone,
  location:{hostname:'production.example',protocol:'https:'},db:{units:[],services:[],categories:[],pros:[],bookings:[]},
  document:{getElementById:id=>id==='publicApp'?{classList:{contains:()=>true}}:nodes.get(id)||null},
  openBooking:()=>{},renderPublic:()=>{},escapeHtml:x=>String(x??''),escapeAttr:x=>String(x??''),money:x=>String(x),initials:x=>String(x).slice(0,1),
  normalizeService:x=>x,normalizeProfessional:x=>x,localDateISO:()=> '2026-10-11',toast:()=>{},
  modal:(_title,body)=>{modalHtml=body},bookingStep:n=>{step=n},
  fetch:async(url,opt={})=>{requests.push({url,method:opt.method||'GET'});if(fail||(failCatalog&&url.includes('/public/catalog')))throw Error('API indisponível');
   const id=new URL(url).searchParams.get('unitId');
   const body=url.includes('/public/units')?(empty?[]:units):{unit:{id,name:id},bookingEnabled:eligible,services:eligible?[{id:'s1',name:'Manicure',category:{id:'unhas',name:'Unhas'},price:50,durationMin:30},{id:'s2',name:'Corte',category:{id:'cabelo',name:'Cabelo'},price:60,durationMin:30}]:[],professionals:[]};
   return {ok:true,text:async()=>JSON.stringify(body)};
  }
 };
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(script,sandbox);
 return {sandbox,nodes,get modalHtml(){return modalHtml},get step(){return step},requests};
}
const closed=setup();await closed.sandbox.openBooking();
assert.equal((closed.modalHtml.match(/class="choice"/g)||[]).length,3,'modal usa unidades públicas sem seed local');
assert.match(closed.modalHtml,/Agendamento em breve/);
assert.equal((closed.modalHtml.match(/disabled/g)||[]).length,3,'unidades indisponíveis não são selecionáveis');
const open=setup({eligible:true});await open.sandbox.openBooking();
assert.equal(await open.sandbox.openBooking(null,'big'),true,'card usa unidade canônica na próxima etapa');
for(const id of unitIds){assert.equal(await open.sandbox.v99PublicSelectUnit(id),true);assert.equal(open.step,2);assert.match(open.nodes.get('bkPublicServices').innerHTML,/Manicure/)}
await open.sandbox.__imperioPublicCentralCatalog.refreshHome();
assert.match(open.nodes.get('publicServices').innerHTML,/Categoria/,'catálogo oferece filtro por categoria');
open.sandbox.v99PublicFilterCatalog('unhas');
assert.match(open.nodes.get('publicServices').innerHTML,/<h3[^>]*>Manicure/);
assert.doesNotMatch(open.nodes.get('publicServices').innerHTML,/<h3[^>]*>Corte/);
open.sandbox.v99PublicFilterCatalog('');
assert.match(open.nodes.get('publicServices').innerHTML,/<h3[^>]*>Corte/);
open.sandbox.v99PublicSearchCatalog('manicure');
assert.doesNotMatch(open.nodes.get('publicServices').innerHTML,/<h3[^>]*>Corte/);
open.sandbox.v99PublicSearchCatalog('');
open.sandbox.v99PublicFilterCatalog('missing');
assert.match(open.nodes.get('publicServices').innerHTML,/Nenhum serviço/);
const none=setup({empty:true});await none.sandbox.openBooking();assert.match(none.modalHtml,/Nenhuma unidade/);
const error=setup({fail:true});await error.sandbox.openBooking();assert.match(error.modalHtml,/Não foi possível/);
const catalogError=setup({failCatalog:true});await catalogError.sandbox.openBooking();assert.match(catalogError.modalHtml,/Falha na consulta/);
for(const f of [closed,open,none,error,catalogError])assert.ok(f.requests.every(r=>r.method==='GET'),'fluxos de consulta não escrevem');
// Execute the real public-profile loader with deliberately reordered responses.
const profileStart=html.indexOf('/* ===== V99 · PERFIL PÚBLICO CENTRAL DAS UNIDADES',html.indexOf('<script>',html.indexOf('/* ===== V99 · PERFIL PÚBLICO CENTRAL DAS UNIDADES')));
const profileEnd=html.indexOf('/* ===== V99 · PROFESSIONAL UNIT HYDRATION GATE',profileStart);
let picker={value:'u3'},pending=[],profileRequests=[];
const profile={console,subbar:{},adminPage:{innerHTML:''},page:'unit-profile',
 document:{getElementById:id=>id==='unitPicker'?picker:null,querySelectorAll:()=>[]},
 sessionStorage:{getItem:()=>''},toast:()=>{},escapeHtml:x=>String(x??''),escapeAttr:x=>String(x??''),
 __imperioCentralApi:{status:()=>({endpoint:'https://test.example'})},__imperioV67:{can:()=>true},
 fetch:(url,options)=>{profileRequests.push({url,options});return new Promise(resolve=>pending.push({url,resolve}))}
};
profile.window=profile;vm.createContext(profile);vm.runInContext(html.slice(profileStart,profileEnd),profile);
const centro=profile.v99uppLoad();picker.value='u1';const big=profile.v99uppLoad();
pending[1].resolve({ok:true,text:async()=>JSON.stringify({id:'big',name:'Big',profile:{}})});await big;
pending[0].resolve({ok:true,text:async()=>JSON.stringify({id:'centro',name:'Centro',profile:{}})});await centro;
assert.match(profile.adminPage.innerHTML,/Big · dados/,'resposta atrasada de Centro não substitui Big');
assert.equal(profileRequests[1].options.headers['X-Unit-Id'],'big');
picker.value='u2';assert.equal(await profile.v99uppSave(),false,'perfil anterior não pode ser salvo na unidade nova');
assert.equal(profileRequests.length,2,'guard de troca não envia PATCH');
console.log(JSON.stringify({ok:true,feature:'phase4_frontend',checks:28}));
