const fs=require('fs'),vm=require('vm');
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-09-27T18:00:00-03:00']))}static now(){return Date.parse('2026-09-27T18:00:00-03:00')}}
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class MockStorage{constructor(raw){this.m=new Map(raw==null?[]:[['imperio-demo-v1',raw]]);this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);return x},insertBefore(x){this.children.unshift(x);return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(){},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(raw){const els=new Map(),qsAll=new Map();const doc={body:element('body'),documentElement:element('html'),_qsAll:qsAll,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(sel){return qsAll.get(sel)||[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};const ls=new MockStorage(raw),ss=new MockStorage(null);const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch{}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date:FixedDate,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null}};ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}return {ctx,ls,ss,els,doc,errors}}
function ev(ctx,code){return vm.runInContext(code,ctx)}
function assert(c,m){if(!c)throw new Error(m)}let tests=0;function ok(c,m){tests++;assert(c,m)}
function setup(r){for(const id of ['adminTabs','unitPicker','subbar','adminPage','loginUser','loginPass','modalHost'])r.ctx[id]=r.doc.getElementById(id);r.doc.getElementById('unitPicker').value='u1'}
function baseDb(){return {schemaVersion:64,migrationHistory:[{id:'v58-legacy-commission-unit-tip-money-hardening',version:58},{id:'v59-reports-services-stock',version:59},{id:'v60-reports-finance-dre',version:60},{id:'v61-finance-dre-stabilization',version:61},{id:'v62-reports-marketing',version:62},{id:'v63-settings-users-operators',version:63},{id:'v64-audit-core-critical-events',version:64}],units:[{id:'u1',name:'Big Shopping',active:true},{id:'u2',name:'Shopping Contagem',active:true},{id:'u3',name:'Centro de Contagem',active:true}],categories:[{id:'cat1',name:'Unhas',active:true}],acquisitionSources:[],services:[{id:'s1',name:'Manutenção em gel',category:'cat1',price:100,duration:60,active:true,generatesReturn:true,returnDays:21,proRules:{p1:{enabled:true,commission:30}}}],pros:[{id:'p1',name:'Ana',active:true,units:['u1'],services:['s1'],online:true,schedule:{'u1-0':{work:true,start:'09:00',end:'18:00'},'u1-1':{work:true,start:'09:00',end:'18:00'},'u1-2':{work:true,start:'09:00',end:'18:00'},'u1-3':{work:true,start:'09:00',end:'18:00'},'u1-4':{work:true,start:'09:00',end:'18:00'},'u1-5':{work:true,start:'09:00',end:'18:00'},'u1-6':{work:true,start:'09:00',end:'18:00'}}}],clients:[{id:'c1',name:'Cliente Atual',phone:'3191',origin:'WhatsApp',source:'Instagram',registrationUnit:'u1',createdAt:'2026-09-05T10:00:00.000Z'},{id:'c2',name:'Cliente Anterior',phone:'3192',origin:'Presencial',source:'Indicação',registrationUnit:'u1',createdAt:'2026-08-05T10:00:00.000Z'}],bookings:[{id:'b1',clientId:'c1',client:'Cliente Atual',date:'2026-09-10',unit:'u1',status:'Concluído',items:[{serviceId:'s1',service:'Manutenção em gel',pro:'p1',time:'10:00',duration:60,price:100}]}],paymentMethods:[{id:'pm_pix',name:'Pix'}],financialAccounts:[{id:'bank',name:'Banco Big',unitId:'u1',type:'BANK',active:true,openingBalance:1000,openingBalanceDate:'2026-08-01',paymentMethodIds:['pm_pix'],feeRules:{}}],demoCashMovements:[],demoFinancialEntries:[{id:'e1',unitId:'u1',date:'2026-09-12',amount:-20,status:'Efetivado',accountId:'bank',account:'Banco Big',nature:'Despesa operacional',category:'Outros',dreImpact:true,origin:'Despesa teste'},{id:'e0',unitId:'u1',date:'2026-08-12',amount:-10,status:'Efetivado',accountId:'bank',account:'Banco Big',nature:'Despesa operacional',category:'Outros',dreImpact:true,origin:'Despesa anterior'}],cashSessions:[],cashAudits:[],auditEvents:[],professionalCommissionAdjustments:[],tipMovements:[],clientAppointments:[],clientCommands:[{id:'cmd1',clientId:'c1',unitId:'u1',date:'2026-09-10',status:'Pago',lines:[{id:'l1',type:'service',serviceId:'s1',name:'Manutenção em gel',professionalId:'p1',professionalName:'Ana',qty:1,unitPrice:100,discount:0}],historySnapshot:{serviceLines:[{lineId:'l1',serviceId:'s1',serviceName:'Manutenção em gel',categoryId:'cat1',categoryName:'Unhas',qty:1,gross:100,manualDiscount:0,comboDiscount:0,netCommercial:100,professionalId:'p1',professionalName:'Ana',unitId:'u1',duration:60,returnRule:{generatesReturn:true,returnDays:21}}],comboApplications:[],partnership:{enabled:false}}},{id:'cmd0',clientId:'c2',unitId:'u1',date:'2026-08-10',status:'Pago',lines:[{id:'l0',type:'service',serviceId:'s1',name:'Manutenção em gel',professionalId:'p1',professionalName:'Ana',qty:1,unitPrice:80,discount:0}],historySnapshot:{serviceLines:[{lineId:'l0',serviceId:'s1',serviceName:'Manutenção em gel',categoryId:'cat1',categoryName:'Unhas',qty:1,gross:80,manualDiscount:0,comboDiscount:0,netCommercial:80,professionalId:'p1',professionalName:'Ana',unitId:'u1',duration:60,returnRule:{generatesReturn:true,returnDays:21}}],comboApplications:[],partnership:{enabled:false}}}],demoProducts:[],demoPackageCatalog:[],clientCreditMovements:[],clientPackages:[],clientReturns:[],combos:[],financeCategories:[{id:'fc1',name:'Outros',dre:true}],companyEntities:[],financeGoals:[],stockProducts:[{id:'sp1',sku:'INS1',name:'Insumo 1',type:'INPUT',group:'Insumos',unit:'un',active:true,defaultCost:10,allocations:{}}],stockBalances:[{productId:'sp1',locationId:'u1',qty:10,avgCost:10,minQty:12}],stockPurchases:[],stockRequests:[],stockTransfers:[],stockMovements:[{id:'sm1',date:'2026-09-11',productId:'sp1',locationId:'u1',qty:-1,unitCost:10,type:'CONSUMPTION',reason:'Consumo',ref:'cmd1'}],stockInputCosts:[],stockFamilies:[],stockSubstitutions:[],commissionSettlements:[],commissionPayments:[],remunerationRules:[],professionalDailyWork:[],clientReceivables:[{id:'cr1',clientId:'c1',clientName:'Cliente Atual',commandId:'cmd1',unitId:'u1',date:'2026-09-10',dueDate:'2026-09-20',originalAmount:50,amount:50}],clientReceivablePayments:[],commissionEvents:[{id:'ce1',commandId:'cmd1',lineId:'l1',professionalId:'p1',unitId:'u1',date:'2026-09-10',serviceId:'s1',serviceName:'Manutenção em gel',base:100,pct:30,amount:30}],tipDeductionRules:[],reportSettings:{inactiveDays:90,returnLateGraceDays:7,capacityProductivityFactor:95},marketingSettings:{attributionSnapshotVersion:1},storageMeta:{dataMode:'real',createdAt:'2026-09-27T00:00:00.000Z',storageSafetyVersion:1},userAccounts:[{id:'uadmin',name:'Administrador',username:'admin',password:'demo',role:'admin',active:true,allUnits:true,unitIds:[]}],systemSettings:{settingsVersion:1},communicationSettings:{whatsapp:{mode:'manual_link',version:1,unitNumbers:{},templates:{confirmation:'Olá',reminder:'Lembrete',reactivation:'Volte',monthly_receivable:'Saldo'}}}}}


(async()=>{
let d=baseDb();
d.schemaVersion=69;
d.migrationHistory.push(
 {id:'v65-executive-overview',version:65},{id:'v66-notifications-management-tasks',version:66},
 {id:'v67-custom-user-permissions',version:67},{id:'v68-fiscal-foundation',version:68},
 {id:'v69-national-nfse-direct-integration',version:69}
);
d.managementTasks=[];d.notificationAlertStates={};d.notificationSettings={};d.fiscalDocuments=[];
d.fiscalSettings={version:2,provider:'sefin_nacional_direct',integrationMode:'gateway_direct',environment:'restricted',productionEnabled:false,gatewayUrl:'http://127.0.0.1:8787'};
d.companyEntities=[];
// Escala real: p1 trabalha, p2 pertence à unidade mas não possui escala.
d.pros=[
 {id:'p1',name:'Ana',active:true,units:['u1'],services:['s1'],online:true,schedule:{'u1-2':{work:true,start:'09:00',end:'18:00'}}},
 {id:'p2',name:'Bia',active:true,units:['u1'],services:['s1'],online:true,schedule:{}}
];
d.clients=[
 {id:'c1',name:'Cliente 1',phone:'1',origin:'WhatsApp',source:'Instagram',registrationUnit:'u1'},
 {id:'c2',name:'Cliente 2',phone:'2',origin:'Presencial',source:'Google',registrationUnit:'u1'},
 {id:'c3',name:'Cliente 3',phone:'3',origin:'WhatsApp',source:'Indicação',registrationUnit:'u1'}
];
function item(time,duration=60){return {serviceId:'s1',service:'Manutenção em gel',pro:'p1',time,duration,price:100}}
function bk(id,date,clientId,status='Concluído',items=[item('10:00')],unit='u1'){return {id,date,unit,clientId,client:d.clients.find(x=>x.id===clientId)?.name||clientId,status,items}}
// Dia atual: 2 clientes, 3 serviços. Duas reservas se sobrepõem 30 min; um bloqueio ocupa 60 min.
d.bookings=[
 bk('cur1','2026-09-15','c1','Confirmado',[item('10:00',60),{serviceId:'s1',service:'Manicure',pro:'p1',time:'11:30',duration:30,price:40}]),
 bk('cur2','2026-09-15','c2','Aguardando confirmação',[item('10:30',60)]),
 bk('curCancel','2026-09-15','c3','Cancelado',[item('15:00',60)]),
 {id:'block1',date:'2026-09-15',unit:'u1',client:'Bloqueado',status:'Bloqueado',items:[{service:'Compromisso',pro:'p1',time:'12:00',duration:60}]}
];
// Histórico comparável: 3ª terça de cada mês. 10, 8 e 12 clientes => meta ponderada arredonda para 10.
for(let i=0;i<10;i++)d.bookings.push(bk('aug'+i,'2026-08-18','aug'+i,'Concluído',[item('09:00',30)]));
for(let i=0;i<8;i++)d.bookings.push(bk('jul'+i,'2026-07-21','jul'+i,'Concluído',[item('09:00',30)]));
for(let i=0;i<12;i++)d.bookings.push(bk('jun'+i,'2026-06-16','jun'+i,'Concluído',[item('09:00',30)]));
// Cobertura mensal sem contaminar a comparação por dia da semana/posição.
for(let i=0;i<20;i++)d.bookings.push(bk('monday'+i,'2026-08-17','m'+i,'Concluído',[item('09:00',15)]));
// Outra unidade no mesmo dia comparável também não pode contaminar.
for(let i=0;i<25;i++)d.bookings.push(bk('other'+i,'2026-08-18','o'+i,'Concluído',[item('09:00',15)],'u2'));
let r=run(JSON.stringify(d));setup(r);r.doc.getElementById('unitPicker').value='u1';r.ctx.unitPicker=r.doc.getElementById('unitPicker');r.ctx.agendaDate='2026-09-15';
ok(!r.errors.length,'A runtime V70 sem erros');
ok(scripts.length===59,'A 35 blocos JavaScript');
ok(ev(r.ctx,'db.schemaVersion')===95,'A schema 70');
ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v70-agenda-operational-metrics').length")===1,'A migração V70 única');
ok(ev(r.ctx,"typeof __imperioV70==='object'&&__imperioV70.schema===70"),'A API V70 exposta');

// B. Clientes únicos e múltiplos serviços.
let op=ev(r.ctx,"__imperioV70.ops('u1','2026-09-15')");
ok(op.clients===2,'B múltiplos serviços não duplicam cliente');
ok(op.services===3,'B serviços do dia preservados no detalhe');
ok(op.bookings===2,'B cancelamento não conta como reserva prevista');
ok(op.awaiting===1,'B aguardando confirmação derivado da agenda');

// C. Ocupação canônica: escala p1 9h, bloqueio 1h => 8h produtivas. Ocupado = união 10:00-11:30 + 11:30-12:00 = 120min? cur1 second service 11:30-12 + overlap 10-11/10:30-11:30 => união 10-12 = 120; bloqueio 12-13 não entra em produtivo.
ok(op.metrics.occupiedMin===120,'C sobreposição não duplica horas ocupadas');
ok(Math.round(op.metrics.occupancy)===25,'C ocupação usa fonte canônica');
ok(op.metrics.cells.every(c=>c.proId!=='p2'),'C profissional sem escala não cria capacidade fictícia');
let sumFree=op.windows.reduce((s,w)=>s+w.duration,0);
ok(sumFree===op.metrics.freeMin,'C janelas livres reconciliam com horas livres canônicas');

// D. Meta histórica comparável.
ok(ev(r.ctx,"__imperioV70.comparableDate('2026-09-15',1)")==='2026-08-18','D mês anterior usa terça equivalente');
ok(op.goal.available===true,'D histórico suficiente encontrado');
ok(op.goal.target===10,'D média histórica ponderada');
ok(op.goal.refs[0].date==='2026-08-18'&&op.goal.refs[0].clients===10,'D mês anterior tem maior referência');
ok(op.goal.refs.every(x=>['2026-08-18','2026-07-21','2026-06-16'].includes(x.date)),'D dia da semana/posição diferente não contamina');
ok(!op.goal.refs.some(x=>x.clients>=25),'D unidade diferente não contamina');
let nohist=ev(r.ctx,"__imperioV70.ops('u3','2026-09-15')");
ok(nohist.goal.available===false&&nohist.goal.target===null,'D sem histórico não inventa meta');

// E. Mudança de dia/unidade altera os indicadores.
let prev=ev(r.ctx,"__imperioV70.ops('u1','2026-08-18')");
ok(prev.clients===10,'E mudança de dia altera clientes');
let other=ev(r.ctx,"__imperioV70.ops('u2','2026-09-15')");
ok(other.clients===0,'E mudança de unidade altera clientes');

// F. Faixa compacta é injetada sem substituir o calendário.
let injected='';let toolbar={insertAdjacentHTML(pos,h){injected=h}},oldGet=r.doc.getElementById.bind(r.doc);r.doc.getElementById=(id)=>id==='v70AgendaOps'?null:oldGet(id);r.ctx.document=r.doc;r.doc.querySelector=(sel)=>sel==='.agenda-toolbar'?toolbar:null;
ev(r.ctx,"agendaDate='2026-09-15';unitPicker.value='u1';__imperioV70.inject()");
ok(injected.includes('v70-agenda-kpis'),'F faixa compacta de KPIs renderizada');
ok(injected.includes('Agendamentos')&&injected.includes('Meta do dia')&&injected.includes('Ocupação')&&injected.includes('Horários livres'),'F quatro indicadores principais');
ok(injected.includes('Oportunidades'),'F oportunidades seguras aparecem quando relevantes');

// G. Clique em janela direciona para a engine real de disponibilidade.
let called=0;r.ctx.openAvailabilityFinder=()=>{called++};r.ctx.closeModal=()=>{};
ev(r.ctx,"v70ValidateFreeWindow('p1','14:00','15:00')");
ok(called===1,'G janela livre abre busca real de disponibilidade');

// H. Idempotência em base já V70.
let raw=r.ls.getItem('imperio-demo-v1'),r2=run(raw);setup(r2);let wc=r2.ls.writeCount;ev(r2.ctx,'__imperioV70.migrate()');
ok(r2.ls.writeCount===wc,'H segunda migração não grava novamente');
ok(ev(r2.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v70-agenda-operational-metrics').length")===1,'H migração não duplica histórico');

console.log(JSON.stringify({ok:true,scripts:scripts.length,tests,clients:op.clients,services:op.services,target:op.goal.target,occupancy:op.metrics.occupancy,freeMin:op.metrics.freeMin,windows:op.windows.length}));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
