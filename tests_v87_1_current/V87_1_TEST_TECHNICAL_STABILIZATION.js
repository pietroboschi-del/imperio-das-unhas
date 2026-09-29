const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-09-28T11:30:00-03:00']))}static now(){return Date.parse('2026-09-28T11:30:00-03:00')}}
class MockStorage{constructor(){this.m=new Map();this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',outerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);x.parentNode=this;return x},insertBefore(x){this.children.unshift(x);x.parentNode=this;return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(pos,h){this.innerHTML+=h},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(){const els=new Map(),doc={body:element('body'),documentElement:element('html'),getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(){return[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};const ls=new MockStorage(),ss=new MockStorage();const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch(e){}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date:FixedDate,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null},open:()=>null};ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}return {ctx,ls,doc,errors}}
function ev(ctx,code){return vm.runInContext(code,ctx)}
let tests=0;function ok(v,m){tests++;if(!v)throw new Error(m)}
const r=run();
ok(!r.errors.length,'runtime V87.1 sem erro');
ok(scripts.length===51,'V87.1 possui 51 scripts');
ok(ev(r.ctx,"typeof __imperioV871==='object'&&__imperioV871.release==='87.1'"),'API V87.1 disponível');
ok(ev(r.ctx,'db.schemaVersion')===87,'V87.1 não consome schemaVersion 88');
ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v87-1-technical-stabilization').length")===1,'migration V87.1 única');
ok(ev(r.ctx,"IMPERIO_ARRAY_COLLECTIONS.filter(x=>x==='agendaFillSnapshots').length")===1,'coleção de snapshots registrada uma vez');
ev(r.ctx,`db.units=[{id:'u1',name:'Unidade 1',active:true},{id:'u2',name:'Unidade 2',active:true},{id:'u3',name:'Unidade 3',active:true}];db.categories=[{id:'c1',name:'Manicure'}];db.services=[{id:'s1',name:'Manicure',category:'c1',price:45,duration:45,active:true,proRules:{}}];db.pros=[{id:'p1',name:'Ana',active:true,units:['u1','u2','u3'],services:['s1'],schedule:{}}];db.clients=[{id:'cl1',name:'Cliente'}];__imperioV871.captureCheckpoints('test_seed')`);
ok(ev(r.ctx,'Array.isArray(db.agendaFillSnapshots)&&db.agendaFillSnapshots.length===18'),'3 unidades x 6 checkpoints prospectivos no primeiro dia');
ok(ev(r.ctx,"db.agendaFillSnapshots.every(x=>x.observedDate==='2026-09-28'&&x.targetDate>=x.observedDate&&x.source==='PROSPECTIVE_CANONICAL_OBSERVATION')"),'snapshots apenas prospectivos, sem backfill fictício');
ok(ev(r.ctx,'new Set(db.agendaFillSnapshots.map(x=>x.key)).size===db.agendaFillSnapshots.length'),'chave diária de snapshot única');
const before=ev(r.ctx,'db.agendaFillSnapshots.length');ev(r.ctx,"__imperioV871.captureCheckpoints('repeat')");ok(ev(r.ctx,'db.agendaFillSnapshots.length')===before,'recaptura do mesmo dia atualiza sem duplicar');
ev(r.ctx,"__eventCount=0;__off871=__imperioEvents.on('agenda.changed',()=>__eventCount++)");
ev(r.ctx,"db.bookings.push({id:'v871_evt',unit:'u2',date:'2026-10-05',clientId:'cl1',client:'Ângela Cristina Fernandes',status:'Agendado',items:[{serviceId:'s1',service:'Manicure',pro:'p2',time:'12:00',duration:45,price:45}]});save({render:false,reason:'test_agenda_change'})");
ok(ev(r.ctx,'__eventCount')>=1,'save gateway emite agenda.changed quando fato operacional muda');
ok(ev(r.ctx,'db.agendaFillSnapshots.length')===before,'evento de agenda atualiza snapshots do dia sem explosão de registros');
ev(r.ctx,'__off871()');
let diag=ev(r.ctx,'__imperioV871.integrity()');ok(diag&&Array.isArray(diag.critical)&&Array.isArray(diag.warnings),'diagnóstico de integridade retorna estrutura rastreável');
ev(r.ctx,"db.categories.push({...db.categories[0]});db.bookings.push({id:'bad_ref',unit:'unidade_inexistente',date:'2026-10-05',status:'Agendado',items:[{serviceId:'s1',pro:'pro_inexistente',time:'10:00',duration:45}]})");diag=ev(r.ctx,'__imperioV871.integrity()');ok(diag.critical.some(x=>x.code==='DUPLICATE_ID'),'integridade detecta IDs duplicados');ok(diag.critical.some(x=>x.code==='BOOKING_UNIT_ORPHAN'),'integridade detecta booking com unidade órfã');ok(diag.critical.some(x=>x.code==='BOOKING_PRO_ORPHAN'),'integridade detecta booking com profissional órfão');
ok(ev(r.ctx,"typeof v871OpenMobileNav==='function'&&typeof v871MobileUnitChanged==='function'"),'navegação móvel instalada');
ok(html.includes('class="btn btn-soft btn-sm v871-mobile-menu"'),'botão de menu móvel presente na topbar');
ok(html.includes('@media(max-width:800px)')&&html.includes('.v871-mobile-menu{display:inline-flex'),'menu móvel ativado abaixo de 800px');
ok(scripts[50].includes('installLogoFallbacks')&&scripts[50].includes('v871-brand-fallback'),'fallback de logo instalado sem inventar identidade visual');
ok(!scripts[50].includes('addEventListener('),'V87.1 não adiciona listeners DOM paralelos');
ok(ev(r.ctx,"__imperioV871.historicalPolicy==='prospective_only_no_backfill'&&__imperioV871.financialImpact==='none'"),'política histórica e neutralidade financeira explícitas');
console.log(JSON.stringify({ok:true,tests,scripts:scripts.length,snapshots:before,schema:ev(r.ctx,'db.schemaVersion'),release:'87.1'}));
