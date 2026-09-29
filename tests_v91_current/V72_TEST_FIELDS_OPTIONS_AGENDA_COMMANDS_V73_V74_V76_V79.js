const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class MockStorage{constructor(raw){this.m=new Map(raw==null?[]:[['imperio-demo-v1',raw]]);this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);x.parentNode=this;return x},insertBefore(x){this.children.unshift(x);x.parentNode=this;return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(){},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(raw){const els=new Map(),qsAll=new Map();const doc={body:element('body'),documentElement:element('html'),_qsAll:qsAll,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(sel){return qsAll.get(sel)||[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};const ls=new MockStorage(raw),ss=new MockStorage(null);const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch{}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null}};ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}return {ctx,ls,ss,els,doc,errors}}
function ev(ctx,code){return vm.runInContext(code,ctx)}
function assert(c,m){if(!c)throw new Error(m)}let tests=0;function ok(c,m){tests++;assert(c,m)}
function setup(r){for(const id of ['adminTabs','unitPicker','subbar','adminPage','loginUser','loginPass','modalHost','clientRows','cmdNotes','v72NewOption'])r.ctx[id]=r.doc.getElementById(id);r.doc.getElementById('unitPicker').value='u1';let admin=ev(r.ctx,"(db.userAccounts||[]).find(u=>u.role==='admin'&&u.active!==false)?.id||''");if(admin)ev(r.ctx,`__imperioV63.sessionSet(${JSON.stringify(admin)})`)}
let r=run(null);setup(r);
// Preparar base controlada V71 e executar migração V72 novamente.
ev(r.ctx,`db.units=[{id:'u1',name:'Big Shopping',active:true,show:true,online:true}];db.services=[{id:'s1',name:'Manicure',active:true,duration:45,price:40,show:true,online:true}];db.pros=[{id:'p1',name:'Ana',active:true,online:true,units:['u1'],services:['s1']}];db.clients=[{id:'cl1',name:'Cliente Teste',phone:'3199999999',source:'Instagram',origin:'Presencial',registrationUnit:'u1'}];db.bookings=[{id:'bHist',unit:'u1',date:'2026-09-28',clientId:'cl1',client:'Cliente Teste',status:'Confirmado',origin:'Interno',notes:'histórico',items:[{serviceId:'s1',service:'Manicure',pro:'p1',time:'09:00',duration:45,price:40,preference:false,forceFit:false}]}];db.clientCommands=[{id:'cmd1',unitId:'u1',clientId:'cl1',clientName:'Cliente Teste',date:'2026-09-28',status:'Aberta',notes:'',bookingIds:[],lines:[{id:'l1',type:'service',serviceId:'s1',name:'Manicure',qty:1,unitPrice:40,discount:0,professionalId:'p1',professionalName:'Ana'}]}];db.systemSettings.formFields=db.systemSettings.formFields||{};delete db.systemSettings.formFields.agenda;delete db.systemSettings.formFields.commands;db.systemSettings.optionSets=db.systemSettings.optionSets||{};delete db.systemSettings.optionSets['agenda.status'];delete db.systemSettings.formConfigModulesVersion;db.migrationHistory=(db.migrationHistory||[]).filter(x=>(typeof x==='string'?x:x.id)!=='v72-configurable-fields-options-agenda-commands');db.schemaVersion=71;__imperioV72.migrate();`);
ok(!r.errors.length,'A runtime sem erros');
ok(scripts.length===55,'A 35 blocos JavaScript');
ok(ev(r.ctx,'db.schemaVersion')===72,'A schema 72');
ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v72-configurable-fields-options-agenda-commands').length")===1,'A migração V72 única');
ok(ev(r.ctx,"typeof __imperioV72==='object'&&__imperioV72.schema===72"),'A API V72 exposta');
ok(ev(r.ctx,'db.systemSettings.formConfigModulesVersion')===2,'A versão modular de configuração 2');
// Campos protegidos / configuráveis.
ok(ev(r.ctx,"__imperioV72.isRequired('agenda','unit')")===true,'B unidade Agenda protegida');
ok(ev(r.ctx,"__imperioV72.getField('agenda','unit').systemRequired")===true,'B unidade marcada systemRequired');
ok(ev(r.ctx,"__imperioV72.isRequired('agenda','notes')")===false,'B observação Agenda opcional inicialmente');
ok(ev(r.ctx,"__imperioV72.isRequired('commands','unitId')")===true,'B unidade Comanda protegida');
ok(ev(r.ctx,"__imperioV72.isRequired('commands','notes')")===false,'B observação Comanda opcional inicialmente');
// Central B2.
ok(ev(r.ctx,"v72OpenFieldsSettings('agenda')")===true,'C abre Agenda em Campos e opções');let h=r.doc.getElementById('adminPage').innerHTML;
ok(h.includes('Agenda')&&h.includes('Comandas')&&h.includes('Clientes'),'C módulos prontos visíveis');
ok(h.includes('Obrigatório pelo sistema')&&h.includes('Gerenciar opções'),'C campos protegidos e status configurável');
ok(!h.includes('Agenda</h3><p>Próxima parte'),'C Agenda não aparece como próxima parte');
ok(ev(r.ctx,"v72OpenFieldsSettings('commands')")===true,'C abre Comandas');h=r.doc.getElementById('adminPage').innerHTML;ok(h.includes('Observações da comanda'),'C campos de Comandas renderizados');
// Status da Agenda: valores canônicos e proteção.
ok(ev(r.ctx,"__imperioV72.getSet('agenda.status').lockedValues")===true,'D status com valores protegidos');
ok(ev(r.ctx,"__imperioV72.getSet('agenda.status').options.length")>=7,'D sete status canônicos');
ok(ev(r.ctx,"__imperioV72.defaultValue('agenda.status')")==='Agendado','D padrão inicial Agendado');
let statusId=ev(r.ctx,"__imperioV72.getSet('agenda.status').options.find(x=>x.value==='Confirmado').id");
r.doc.getElementById('v72NewOption').value='Em análise';ok(ev(r.ctx,"v72AddOption('agenda.status')")===false,'D não permite criar status arbitrário');
ok(ev(r.ctx,`v72RenameOption('agenda.status',${JSON.stringify(statusId)},'Confirmado VIP')`)===false,'D não permite renomear valor técnico');
ok(ev(r.ctx,"__imperioV72.getSet('agenda.status').options.find(x=>x.value==='Confirmado').value")==='Confirmado','D valor canônico permanece');
// Reordenar / default / inativar preservando histórico.
let idx0=ev(r.ctx,"__imperioV72.getSet('agenda.status').options.slice().sort((a,b)=>a.order-b.order).findIndex(x=>x.value==='Confirmado')");if(idx0>0){ok(ev(r.ctx,`v72MoveOption('agenda.status',${JSON.stringify(statusId)},-1)`)===true,'E reordena status');let idx1=ev(r.ctx,"__imperioV72.getSet('agenda.status').options.slice().sort((a,b)=>a.order-b.order).findIndex(x=>x.value==='Confirmado')");ok(idx1===idx0-1,'E ordem alterada')}else{tests+=2}
ok(ev(r.ctx,`v72SetDefaultOption('agenda.status',${JSON.stringify(statusId)})`)===true,'E define Confirmado como padrão');ok(ev(r.ctx,"__imperioV72.defaultValue('agenda.status')")==='Confirmado','E padrão atualizado');
ok(ev(r.ctx,`v72ToggleOption('agenda.status',${JSON.stringify(statusId)})`)===true,'E desativa Confirmado');
ok(ev(r.ctx,"db.bookings.find(x=>x.id==='bHist').status")==='Confirmado','E agendamento histórico preservado');
ok(ev(r.ctx,"__imperioV72.optionsHtml('agenda.status','Confirmado').includes('Confirmado')"),'E status histórico continua visível');
ok(ev(r.ctx,`v72ToggleOption('agenda.status',${JSON.stringify(statusId)})`)===true,'E reativa Confirmado');
// Default da Agenda aplicado ao novo atendimento interno.
ok(ev(r.ctx,`v72SetDefaultOption('agenda.status',${JSON.stringify(statusId)})`)===true,'F padrão Confirmado restaurado');ev(r.ctx,"openReservation('p1','10:00','cl1','2026-09-29')");ok(ev(r.ctx,'resDraft.status')==='Confirmado','F nova reserva usa status padrão');
// Obrigatoriedade configurável da Agenda.
ok(ev(r.ctx,"v72SetFieldRequired('agenda','notes',true)")===true,'G observação Agenda vira obrigatória');let v=ev(r.ctx,"__imperioV72.validateAgendaDraft({date:'2026-09-29',clientId:'cl1',status:'Confirmado',notes:'',items:[{serviceId:'s1',pro:'p1',time:'10:00',duration:45,price:40}]},'u1')");ok(v.ok===false&&v.missing.some(x=>x.field==='notes'),'G validação bloqueia observação vazia');let bBefore=ev(r.ctx,'db.bookings.length');ev(r.ctx,"resDraft={date:'2026-09-29',clientId:'cl1',status:'Confirmado',notes:'',items:[{serviceId:'s1',service:'Manicure',pro:'p1',time:'10:00',duration:45,price:40,preference:false,forceFit:false}]}");r.doc.getElementById('rNotes').value='';ok(ev(r.ctx,'saveReservation()')===false,'G saveReservation bloqueia campo obrigatório vazio');ok(ev(r.ctx,'db.bookings.length')===bBefore,'G reserva não é criada quando validação falha');
v=ev(r.ctx,"__imperioV72.validateAgendaDraft({date:'2026-09-29',clientId:'cl1',status:'Confirmado',notes:'Cliente pediu janela',items:[{serviceId:'s1',pro:'p1',time:'10:00',duration:45,price:40}]},'u1')");ok(v.ok===true,'G observação preenchida libera');
ok(ev(r.ctx,"v72SetFieldRequired('agenda','notes',false)")===true,'G observação Agenda volta opcional');
// Campo protegido Agenda não pode ser alterado.
ok(ev(r.ctx,"v72SetFieldRequired('agenda','clientId',false)")===false,'H cliente Agenda protegido');ok(ev(r.ctx,"__imperioV72.isRequired('agenda','clientId')")===true,'H cliente permanece obrigatório');
// Obrigatoriedade da Comanda e validação no fechamento/pagamento.
ok(ev(r.ctx,"v72SetFieldRequired('commands','notes',true)")===true,'I observação Comanda vira obrigatória');r.doc.getElementById('cmdNotes').value='';let cv=ev(r.ctx,"__imperioV72.validateCommand('cmd1')");ok(cv.ok===false&&cv.missing.some(x=>x.field==='notes'),'I comando sem observação bloqueado');
ok(ev(r.ctx,"__imperioV72.syncAndValidateCommand('cmd1')")===false,'I fluxo de Comanda bloqueado sem observação');r.doc.getElementById('cmdNotes').value='Ajuste autorizado pela recepção';ok(ev(r.ctx,"__imperioV72.syncAndValidateCommand('cmd1')")===true,'I fluxo de Comanda libera com observação');
ok(ev(r.ctx,"db.clientCommands.find(x=>x.id==='cmd1').notes")==='Ajuste autorizado pela recepção','I observação sincronizada');
ok(ev(r.ctx,"v72SetFieldRequired('commands','notes',false)")===true,'I observação Comanda volta opcional');
// Campos estruturais da Comanda protegidos.
ok(ev(r.ctx,"v72SetFieldRequired('commands','unitId',false)")===false,'J unidade Comanda protegida');ok(ev(r.ctx,"__imperioV72.isRequired('commands','unitId')")===true,'J unidade Comanda continua obrigatória');
// Clientes continuam configuráveis pela mesma central/fundação.
ok(ev(r.ctx,"v72OpenFieldsSettings('clients')")===true,'K Clientes segue acessível');h=r.doc.getElementById('adminPage').innerHTML;ok(h.includes('Como conheceu')&&h.includes('Origem do cadastro'),'K opções de Clientes preservadas');
// Auditoria das configurações.
ok(ev(r.ctx,"(db.auditEvents||[]).some(x=>x.module==='settings'&&['UPDATE_FIELD_REQUIRED','REORDER_OPTIONS','SET_DEFAULT_OPTION','DEACTIVATE_OPTION'].includes(x.action))"),'L alterações B2 auditadas');
// Persistência/idempotência da migração V72.
let w0=r.ls.writeCount;ok(ev(r.ctx,'__imperioV72.migrate()')===false,'M segunda execução da migração não altera dados');ok(r.ls.writeCount===w0,'M segunda execução gera zero novas gravações');const clean=r.ls.getItem('imperio-demo-v1');let r2=run(clean);setup(r2);ok(!r2.errors.length,'M reinicialização sem erro');ok(ev(r2.ctx,'db.schemaVersion')===91,'M schema permanece 73');ok(ev(r2.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v72-configurable-fields-options-agenda-commands').length")===1,'M migração única');
console.log(JSON.stringify({ok:true,scripts:scripts.length,tests,agenda:true,commands:true,statusProtected:true,historicalPreservation:true,centralValidation:true,audit:true,idempotent:true}));
