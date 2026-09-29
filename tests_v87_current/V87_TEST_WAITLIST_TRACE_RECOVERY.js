const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-09-28T11:30:00-03:00']))}static now(){return Date.parse('2026-09-28T11:30:00-03:00')}}
class MockStorage{constructor(raw){this.m=new Map(raw==null?[]:[['imperio-demo-v1',raw]]);this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',outerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);x.parentNode=this;return x},insertBefore(x){this.children.unshift(x);x.parentNode=this;return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(pos,h){this.innerHTML+=h},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(raw){const els=new Map(),qsAll=new Map();const doc={body:element('body'),documentElement:element('html'),_qsAll:qsAll,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(sel){return qsAll.get(sel)||[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};const ls=new MockStorage(raw),ss=new MockStorage(null);const opened=[];const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch{}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date:FixedDate,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null},open:(url)=>{opened.push(url);return null}};ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}return {ctx,ls,ss,els,doc,errors,opened}}
function ev(ctx,code){return vm.runInContext(code,ctx)}
function assert(c,m){if(!c)throw new Error(m)}let tests=0;function ok(c,m){tests++;assert(c,m)}function eq(a,b,m){ok(JSON.stringify(a)===JSON.stringify(b),`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)}
function hist(){return ['v58-legacy-commission-unit-tip-money-hardening','v59-reports-services-stock','v60-reports-finance-dre','v61-finance-dre-stabilization','v62-reports-marketing','v63-settings-users-operators','v64-audit-core-critical-events','v65-executive-overview','v66-notifications-management-tasks','v67-custom-user-permissions','v68-fiscal-foundation','v69-nfse-national-direct','v70-agenda-operational-metrics','v71-configurable-fields-options-clients','v72-configurable-fields-options-agenda-commands','v73-configurable-fields-options-professionals-stock','v74-configurable-fields-options-finance','v75-dre-combo-profitability-allocation','v76-fiscal-payments-booking-authorship','v77-workstations-physical-capacity','v78-physical-capacity-alerts'].map(id=>({id}))}
function sch(start='09:00',end='20:00'){let x={};for(let i=0;i<7;i++)x['u1-'+i]={work:true,start,end},x['u2-'+i]={work:true,start,end};return x}
function baseDb(){return {schemaVersion:78,migrationHistory:hist(),units:[{id:'u1',name:'Big Shopping',active:true,show:true,online:true},{id:'u2',name:'Shopping Contagem',active:true,show:true,online:true}],categories:[{id:'c_man',name:'Manicure',active:true},{id:'c_long',name:'Alongamento',active:true}],services:[{id:'s_man',name:'Manicure',category:'c_man',price:40,duration:40,active:true,show:true,online:true,proRules:{}},{id:'s_long',name:'Alongamento',category:'c_long',price:120,duration:60,active:true,show:true,online:true,proRules:{}}],pros:[{id:'p1',name:'Ana',active:true,show:true,online:true,units:['u1'],services:['s_man','s_long'],schedule:sch()},{id:'p2',name:'Camila',active:true,show:true,online:true,units:['u1'],services:['s_man'],schedule:sch()},{id:'p3',name:'Bia',active:true,show:true,online:true,units:['u2'],services:['s_man'],schedule:sch()}],clients:[{id:'cl1',name:'Juliana',phone:'31999999999',cpf:'',source:'Instagram',origin:'Presencial',registrationUnit:'u1'},{id:'cl2',name:'Marina',phone:'31888888888',cpf:'',source:'Google',origin:'Presencial',registrationUnit:'u1'}],bookings:[],clientAppointments:[],clientCommands:[],paymentMethods:[],financialAccounts:[],demoCashMovements:[],demoFinancialEntries:[],cashSessions:[],cashAudits:[],auditEvents:[],clientCreditMovements:[],clientReceivables:[],clientReceivablePayments:[],commissionEvents:[],remunerationRules:[],tipMovements:[],tipDeductionRules:[],demoProducts:[],demoPackageCatalog:[],clientPackages:[],clientReturns:[],combos:[],financeCategories:[],companyEntities:[],financeGoals:[],stockProducts:[],stockBalances:[],stockPurchases:[],stockRequests:[],stockTransfers:[],stockMovements:[],stockInputCosts:[],stockFamilies:[],stockSubstitutions:[],commissionSettlements:[],commissionPayments:[],commissionAdjustments:[],professionalCommissionAdjustments:[],professionalDailyWork:[],managementTasks:[],notificationAlertStates:{},notificationSettings:{},fiscalDocuments:[],fiscalSettings:{},reportSettings:{inactiveDays:90,returnLateGraceDays:7,capacityProductivityFactor:95},commissionSettings:{discountsReduceBase:true,directPaymentReducesSettlement:true,comboAllocation:'proportional'},storageMeta:{dataMode:'real',createdAt:'2026-09-01T00:00:00.000Z',storageSafetyVersion:1},userAccounts:[{id:'usr_admin',name:'Admin',username:'admin',password:'x',role:'admin',active:true,allUnits:true,unitIds:[]},{id:'usr_mgr',name:'Gerente Big',username:'mgr',password:'x',role:'manager',active:true,allUnits:false,unitIds:['u1']},{id:'usr_mgr2',name:'Gerente Contagem',username:'mgr2',password:'x',role:'manager',active:true,allUnits:false,unitIds:['u2']}],systemSettings:{settingsVersion:1,formFields:{},optionSets:{}},communicationSettings:{whatsapp:{mode:'manual_link',version:1,unitNumbers:{},templates:{confirmation:'',reminder:'',reactivation:'',monthly_receivable:''}}},workstations:[{id:'ws1',unitId:'u1',name:'Mesa 1',allowedCategoryIds:['c_man'],active:true,createdAt:'x',updatedAt:'x'}]}}
function setup(r,user='usr_mgr'){for(const id of ['adminTabs','unitPicker','subbar','adminPage','loginUser','loginPass','modalHost','rDate','rStatus','rNotes','v79Unit','v79Service','v79Date','v79Start','v79End','v79ProMode','v79PreferredPro','v79Notes'])r.ctx[id]=r.doc.getElementById(id);r.doc.getElementById('unitPicker').value='u1';r.ctx.unitPicker=r.doc.getElementById('unitPicker');r.ctx.page='agenda';r.ctx.agendaDate='2026-10-03';r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';r.doc.getElementById('rNotes').value='';ev(r.ctx,`__imperioV63.sessionSet('${user}')`)}
function form(r,{client='cl1',service='s_man',unit='u1',date='2026-10-03',start='13:00',end='18:00',mode='any',pro='',notes=''}={}){r.ctx.__v79QueueDraft={clientId:client};r.doc.getElementById('v79Unit').value=unit;r.doc.getElementById('v79Service').value=service;r.doc.getElementById('v79Date').value=date;r.doc.getElementById('v79Start').value=start;r.doc.getElementById('v79End').value=end;r.doc.getElementById('v79ProMode').value=mode;r.doc.getElementById('v79PreferredPro').value=pro;r.doc.getElementById('v79Notes').value=notes}

function fresh(user='usr_mgr'){let r=run(JSON.stringify(baseDb()));setup(r,user);if(r.errors.length)throw new Error(r.errors.join('\n'));r.ctx.__imperioV62.getReportFilters=()=>({from:'2026-10-01',to:'2026-10-31',unit:'all',professional:'all',service:'all',category:'all',origin:'all',source:'all'});return r}
function pushReq(r,o={}){let q={id:o.id||('rq'+Math.random().toString(36).slice(2,8)),clientId:o.client||'cl1',clientNameSnapshot:o.clientName||'Juliana',unitId:o.unit||'u1',unitPreferenceMode:'required',acceptedUnitIds:[o.unit||'u1'],serviceId:o.service||'s_man',serviceNameSnapshot:o.serviceName||'Manicure',serviceDurationSnapshot:o.duration||40,availabilityDate:o.date||'2026-10-03',availabilityStartTime:o.start||'15:00',availabilityEndTime:o.end||'16:00',professionalPreferenceMode:o.mode||'required',preferredProfessionalId:o.pro===undefined?'p1':o.pro,preferredProfessionalNameSnapshot:o.proName||'Ana',status:'WAITING',createdAt:'2026-09-28T10:00:00.000Z',createdByUserId:'usr_mgr',createdByUserName:'Gerente Big',updatedAt:'2026-09-28T10:00:00.000Z'};r.ctx._q=q;ev(r.ctx,'db.waitlistRequests.push(_q)');return q}
function addBooking(r,o={}){let b={id:o.id||('b'+Math.random().toString(36).slice(2,8)),unit:o.unit||'u1',date:o.date||'2026-10-03',clientId:o.client||'cl2',client:o.clientName||'Marina',status:o.status||'Agendado',origin:'Interno',createdAt:'2026-09-28T09:00:00.000Z',createdByUserId:'usr_mgr',createdByUserName:'Gerente Big',items:o.items||[{serviceId:o.service||'s_man',service:o.serviceName||'Manicure',pro:o.pro||'p1',time:o.time||'15:00',duration:o.duration||40,price:o.price===undefined?40:o.price,preference:false,forceFit:false}]};r.ctx._b=b;ev(r.ctx,'db.bookings.push(_b)');return b}
function reevaluate(r){return ev(r.ctx,'v80ReevaluateWaitlistOpportunities("v87_test")')}
function histFor(r,id){return ev(r.ctx,`db.waitlistOpportunities.filter(x=>x.requestId==='${id}')`)}
function cancelBooking(r,id){r.ctx.editBookingId=id;r.ctx.editBookingDraft=global.structuredClone(ev(r.ctx,`db.bookings.find(x=>x.id==='${id}')`));r.doc.getElementById('ebStatus').value='Cancelado';r.doc.getElementById('ebDate').value=r.ctx.editBookingDraft.date;return ev(r.ctx,'saveExistingBooking()')}
function rescheduleBooking(r,id,time){r.ctx.editBookingId=id;r.ctx.editBookingDraft=global.structuredClone(ev(r.ctx,`db.bookings.find(x=>x.id==='${id}')`));r.ctx.editBookingDraft.items[0].time=time;r.doc.getElementById('ebStatus').value=r.ctx.editBookingDraft.status;r.doc.getElementById('ebDate').value=r.ctx.editBookingDraft.date;return ev(r.ctx,'saveExistingBooking()')}

// FASE 0 / migration
{
 let r=fresh();
 ok(scripts.length===50,'V87 possui 50 scripts');
 ok(ev(r.ctx,'db.schemaVersion')===87,'schema 87');
 ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v87-waitlist-opportunity-trace-recovery').length")===1,'migration V87 única');
 ok(ev(r.ctx,"Array.isArray(db.waitlistOpportunities)"),'coleção de histórico criada');
 ok(ev(r.ctx,"typeof evaluatePhysicalCapacity==='function'&&__imperioV77.schema===77"),'capacidade física canônica preservada');
 ok(ev(r.ctx,"__imperioV87.canonicalReceptionMetrics.includes('V83')"),'V83 declarada fonte canônica de métricas');
 ok(ev(r.ctx,"__imperioV87.canonicalOpportunityEngine.includes('V80')"),'V80 declarado motor canônico de oportunidades');
 r.ctx._rf={from:'2026-09-28',to:'2026-09-28',unit:'u1',professional:'all',service:'all',category:'all',origin:'all',source:'all'};let t82=ev(r.ctx,"__imperioV82.trend({agendaCurrent:{f:_rf},current:{f:_rf},data:{}})");ok(t82&&t82.rows.length===1&&t82.rows[0].productiveMin>0,'V82 full-runtime reutiliza capacidade canônica e não fica sem base por escopo lexical');
 r.ctx.adminPage=r.doc.getElementById('adminPage');r.ctx.adminPage.innerHTML='<div class="report-shell"><div class="report-section-head"><div><h2>Agenda</h2><div>base</div></div></div></div>';r.ctx.__imperioV82.render=()=>'<div class="v82-trend">hist</div>';r.ctx.__imperioV85.panelHtml=()=>'<div id="v85Performance">perf</div>';ok(ev(r.ctx,'__imperioV87.injectAgendaReports()')===true,'integração de Relatórios Agenda executa sem chamada manual');ok((r.ctx.adminPage.innerHTML.match(/id="v87WaitlistRecovery"/g)||[]).length===1,'painel V87 aparece uma vez');ok((r.ctx.adminPage.innerHTML.match(/id="v85Performance"/g)||[]).length===1&&(r.ctx.adminPage.innerHTML.match(/id="v83BookingAudit"/g)||[]).length===1&&(r.ctx.adminPage.innerHTML.match(/class="v82-trend"/g)||[]).length===1,'V82-V85 consolidados no fluxo real do relatório');ok(ev(r.ctx,'__imperioV87.injectAgendaReports()')===true&&(r.ctx.adminPage.innerHTML.match(/id="v87WaitlistRecovery"/g)||[]).length===1,'rerender não duplica painéis');
 let w=r.ls.writeCount;ok(ev(r.ctx,'__imperioV87.migrate()')===false,'migration V87 idempotente');ok(r.ls.writeCount===w,'reabrir migration não grava de novo');
}

// 1 Cancelamento -> oportunidade -> booking recuperado.
{
 let r=fresh();let b=addBooking(r,{id:'bcancel',pro:'p1',time:'15:00',client:'cl2'}),q=pushReq(r,{id:'qcancel',mode:'required',pro:'p1'});reevaluate(r);ok(histFor(r,q.id).length===0,'sem oportunidade antes do cancelamento');
 cancelBooking(r,b.id);let hs=histFor(r,q.id),o=hs[0];ok(hs.length===1&&o.sourceType==='CANCELLATION','origem cancelamento rastreada');ok(o.sourceBookingId==='bcancel'&&!!o.sourceEventId,'cancelamento ligado ao booking/evento');
 ok(ev(r.ctx,`v80BeginQueueBooking('${q.id}')`)===true,'agendar revalida oportunidade');r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';ev(r.ctx,'saveReservation()');o=histFor(r,q.id)[0];ok(o.status==='CONVERTED'&&!!o.bookingId,'recuperação só após booking real');ok(o.commercialValueAtConversion===40,'valor comercial recuperado 40');ok(ev(r.ctx,`db.waitlistRequests.find(x=>x.id==='${q.id}').status`)==='BOOKED','request BOOKED após save real');
}

// 2 Cancelamento -> recusa, sem recuperação.
{
 let r=fresh();let b=addBooking(r,{id:'bcancel2'}),q=pushReq(r,{id:'qdecline'});reevaluate(r);cancelBooking(r,b.id);ok(histFor(r,q.id)[0].sourceType==='CANCELLATION','recusa preserva origem cancelamento');ev(r.ctx,`v79DeclineQueue('${q.id}')`);let o=histFor(r,q.id)[0];ok(o.status==='DECLINED'&&!o.bookingId,'recusa não recupera');
}

// 3 Oportunidade invalidada quando vaga é ocupada.
{
 let r=fresh();let b=addBooking(r,{id:'bcancel3'}),q=pushReq(r,{id:'qinvalid'});reevaluate(r);cancelBooking(r,b.id);ok(histFor(r,q.id)[0].status==='FOUND','oportunidade encontrada');addBooking(r,{id:'btaken',pro:'p1',time:'15:00'});reevaluate(r);let o=histFor(r,q.id)[0];ok(o.status==='INVALIDATED'&&!!o.invalidatedAt,'vaga ocupada invalida e preserva histórico');ok(!o.bookingId,'invalidada não recupera');
}

// 4 Reagendamento libera vaga.
{
 let r=fresh();let b=addBooking(r,{id:'bres',pro:'p1',time:'15:00'}),q=pushReq(r,{id:'qres'});reevaluate(r);rescheduleBooking(r,b.id,'17:00');let o=histFor(r,q.id)[0];ok(o.sourceType==='RESCHEDULE','origem reagendamento');ok(o.sourceType!=='CANCELLATION','reagendamento não vira cancelamento recuperado');
}

// 5 Desbloqueio libera vaga.
{
 let r=fresh();let blk=addBooking(r,{id:'blk1',status:'Bloqueado',client:'',clientName:'Bloqueado',pro:'p1',time:'15:00',duration:60,price:0}),q=pushReq(r,{id:'qunblock'});reevaluate(r);ok(histFor(r,q.id).length===0,'bloqueio impede oportunidade');ev(r.ctx,"deleteBlock('blk1')");let o=histFor(r,q.id)[0];ok(o&&o.sourceType==='UNBLOCK','origem desbloqueio');
}

// 6 Vaga já existente.
{
 let r=fresh();let q=pushReq(r,{id:'qexisting'});reevaluate(r);let o=histFor(r,q.id)[0];ok(o.sourceType==='EXISTING_AVAILABILITY','origem disponibilidade existente');
}

// 7/8/9 preferred/required.
{
 let r=fresh();let q=pushReq(r,{id:'qideal',mode:'preferred',pro:'p1'});reevaluate(r);ok(histFor(r,q.id)[0].classification==='IDEAL','preferred com preferida = ideal');
}
{
 let r=fresh();addBooking(r,{id:'bpref',pro:'p1',time:'15:00',duration:60});let q=pushReq(r,{id:'qalt',mode:'preferred',pro:'p1'});reevaluate(r);let o=histFor(r,q.id)[0];ok(o&&o.classification==='ALTERNATIVE'&&o.professionalId==='p2','preferred aceita alternativa válida');
}
{
 let r=fresh();addBooking(r,{id:'breq',pro:'p1',time:'15:00',duration:60});let q=pushReq(r,{id:'qrequired',mode:'required',pro:'p1'});reevaluate(r);ok(histFor(r,q.id).length===0,'required rejeita outra profissional');
}

// 10 capacidade física é warning, não bloqueio.
{
 let r=fresh();addBooking(r,{id:'bphys',pro:'p2',time:'15:00',duration:40});let q=pushReq(r,{id:'qphys',mode:'required',pro:'p1',start:'15:00',end:'15:40'});reevaluate(r);let o=histFor(r,q.id)[0];ok(!!o&&o.physicalCapacityWarning===true,'conflito físico registrado como warning');ok(o.status==='FOUND','warning físico não bloqueia oportunidade');
}

// 11 contato sem booking não é recuperação.
{
 let r=fresh();let q=pushReq(r,{id:'qcontact'});reevaluate(r);ev(r.ctx,`v79MarkQueueContacted('${q.id}')`);let o=histFor(r,q.id)[0],m=ev(r.ctx,'__imperioV87.metrics(db.waitlistOpportunities)');ok(o.status==='CONTACTED'&&!!o.contactedAt,'contato rastreado');ok(m.converted===0&&m.bookings===0&&m.value===0,'contato sem booking não recupera');
}

// 12 booking real vincula cadeia e valor.
{
 let r=fresh();let q=pushReq(r,{id:'qbook'});reevaluate(r);ev(r.ctx,`v80BeginQueueBooking('${q.id}')`);r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';ev(r.ctx,'saveReservation()');let o=histFor(r,q.id)[0];ok(o.status==='CONVERTED'&&o.requestId===q.id&&!!o.bookingId,'solicitação → oportunidade → booking');ok(o.commercialValueAtConversion===40,'valor comercial no booking efetivo');
}

// 13 booking posteriormente cancelado preserva conversão e zera valor atual recuperado.
{
 let r=fresh();let q=pushReq(r,{id:'qlatercancel'});reevaluate(r);ev(r.ctx,`v80BeginQueueBooking('${q.id}')`);r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';ev(r.ctx,'saveReservation()');let o=histFor(r,q.id)[0],bid=o.bookingId;cancelBooking(r,bid);o=histFor(r,q.id)[0];ok(o.status==='CONVERTED'&&o.bookingLaterCancelled===true,'conversão histórica preservada após cancelamento');ok(ev(r.ctx,`__imperioV87.currentRecoveryValue(db.waitlistOpportunities.find(x=>x.id==='${o.id}'))`)===0,'booking cancelado deixa de compor valor recuperado atual');
}

// 14/15 duas oportunidades distintas e reavaliação repetida sem duplicação.
{
 let r=fresh();let q=pushReq(r,{id:'qmulti',mode:'preferred',pro:'p1'});reevaluate(r);let first=histFor(r,q.id)[0];ok(first.classification==='IDEAL','primeira oportunidade ideal');addBooking(r,{id:'bfillp1',pro:'p1',time:'15:00',duration:60});reevaluate(r);let hs=histFor(r,q.id);ok(hs.length===2&&hs[0].status==='INVALIDATED'&&hs[1].classification==='ALTERNATIVE','segunda oportunidade preservada separadamente');let n=hs.length;reevaluate(r);reevaluate(r);ok(histFor(r,q.id).length===n,'mesma oportunidade reavaliada não duplica');
}

// 16 multiunidade respeita visibilidade.
{
 let r=fresh('usr_mgr');let q1=pushReq(r,{id:'qu1',unit:'u1',pro:'p1'}),q2=pushReq(r,{id:'qu2',unit:'u2',pro:'p3',client:'cl2'});reevaluate(r);let all=ev(r.ctx,'db.waitlistOpportunities.length'),vis=ev(r.ctx,'__imperioV87.visibleHistory().length');ok(all>=2&&vis<all,'histórico preserva unidades mas métrica respeita escopo permitido');ok(ev(r.ctx,"__imperioV87.visibleHistory().every(x=>x.unitId==='u1')"),'Big não contamina unidade permitida');
}

// 17 neutralidade financeira.
{
 let r=fresh();let before=ev(r.ctx,"JSON.stringify({cash:db.demoCashMovements,fin:db.demoFinancialEntries,rec:db.clientReceivables,pay:db.clientReceivablePayments,comm:db.commissionEvents,cmd:db.clientCommands})"),q=pushReq(r,{id:'qfin'});reevaluate(r);ev(r.ctx,`v79MarkQueueContacted('${q.id}')`);ev(r.ctx,`v80BeginQueueBooking('${q.id}')`);r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';ev(r.ctx,'saveReservation()');let after=ev(r.ctx,"JSON.stringify({cash:db.demoCashMovements,fin:db.demoFinancialEntries,rec:db.clientReceivables,pay:db.clientReceivablePayments,comm:db.commissionEvents,cmd:db.clientCommands})");ok(before===after,'fila + conversão em booking não criam fatos financeiros');
}

// 18 combo 40 + 40 = 65 no valor recuperado.
{
 let r=fresh();ev(r.ctx,"db.services.push({id:'s_ped',name:'Pedicure',category:'c_man',price:40,duration:40,active:true,show:true,online:true,proRules:{}});db.pros.find(x=>x.id==='p1').services.push('s_ped');db.combos.push({id:'cmb',name:'Mão + Pé',serviceIds:['s_man','s_ped'],price:65,active:true,autoApply:true})");let q=pushReq(r,{id:'qcombo',mode:'required',pro:'p1'});reevaluate(r);ev(r.ctx,`v80BeginQueueBooking('${q.id}')`);ev(r.ctx,"resDraft.items.push({serviceId:'s_ped',service:'Pedicure',pro:'p1',time:'15:40',duration:40,price:40,preference:false,forceFit:false})");r.doc.getElementById('rDate').value='2026-10-03';r.doc.getElementById('rStatus').value='Agendado';ev(r.ctx,'saveReservation()');let o=histFor(r,q.id)[0];ok(o.status==='CONVERTED','combo convertido');ok(Math.abs(o.commercialValueAtConversion-65)<1e-9,'combo recuperado usa valor comercial 65, não 80');
}

// Fonte desconhecida para oportunidade já ativa anterior à V87: não inventa cancelamento.
{
 let d=baseDb();d.schemaVersion=86;d.migrationHistory.push({id:'v79-waitlist-operational-foundation'},{id:'v80-waitlist-opportunity-engine'},{id:'v81-agenda-full-alert'},{id:'v82-historical-fill-demand-trend'},{id:'v83-booking-author-performance-audit'},{id:'v84-reception-booking-goals'},{id:'v85-reception-performance-dashboard'},{id:'v86-consolidation-sanitation-v80-v85'});d.waitlistRequests=[{id:'legacyActive',clientId:'cl1',clientNameSnapshot:'Juliana',unitId:'u1',serviceId:'s_man',serviceNameSnapshot:'Manicure',availabilityDate:'2026-10-03',availabilityStartTime:'15:00',availabilityEndTime:'16:00',professionalPreferenceMode:'required',preferredProfessionalId:'p1',status:'OPPORTUNITY',createdAt:'x',opportunityActive:true,opportunityClass:'IDEAL',opportunityStartTime:'15:00',opportunityEndTime:'15:40',opportunityProfessionalId:'p1',opportunityProfessionalName:'Ana',opportunityDetectedAt:'2026-09-27T10:00:00Z'}];let r=run(JSON.stringify(d));setup(r);let o=ev(r.ctx,"db.waitlistOpportunities.find(x=>x.requestId==='legacyActive')");ok(o&&o.sourceType==='UNKNOWN_LEGACY','ativo legado adotado sem inventar origem');
}


// Adversarial source attribution: cosmetic/catalog edits must not be misclassified as availability releases.
{
 let r=fresh();
 let pBefore=ev(r.ctx,"__imperioV87.proAvailabilitySignature('p1')"),sBefore=ev(r.ctx,"__imperioV87.serviceAvailabilitySignature('s_man')");
 ev(r.ctx,"db.pros.find(x=>x.id==='p1').name='Ana Silva'");
 let pCosmetic=ev(r.ctx,"__imperioV87.proAvailabilitySignature('p1')");
 ok(pBefore===pCosmetic,'alteração cosmética de profissional não muda assinatura de disponibilidade');
 ev(r.ctx,"db.pros.find(x=>x.id==='p1').schedule['u1-6'].end='19:00'");
 ok(pBefore!==ev(r.ctx,"__imperioV87.proAvailabilitySignature('p1')"),'alteração de escala profissional muda assinatura de disponibilidade');
 ev(r.ctx,"db.services.find(x=>x.id==='s_man').price=55");
 ok(sBefore===ev(r.ctx,"__imperioV87.serviceAvailabilitySignature('s_man')"),'alteração apenas de preço não muda assinatura de disponibilidade');
 ev(r.ctx,"db.services.find(x=>x.id==='s_man').duration=50");
 ok(sBefore!==ev(r.ctx,"__imperioV87.serviceAvailabilitySignature('s_man')"),'alteração de duração muda assinatura de disponibilidade');
 r.ctx._ctx={sourceType:'CANCELLATION',sourceBookingId:'other',releasedWindows:[{unitId:'u1',date:'2026-10-03',proId:'p2',startMin:900,endMin:960}]};r.ctx._req={serviceId:'s_man'};r.ctx._st={unitId:'u1',date:'2026-10-03',proId:'p1',start:'15:00',end:'15:40'};
 ok(ev(r.ctx,"__imperioV87.sourceFor(_ctx,_req,_st).type")==='EXISTING_AVAILABILITY','cancelamento não relacionado não é atribuído falsamente como origem');
}

console.log(JSON.stringify({ok:true,tests,scripts:scripts.length,scenarios:18}));
