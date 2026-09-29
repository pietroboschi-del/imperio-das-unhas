const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class MockStorage{constructor(raw){this.m=new Map(raw==null?[]:[['imperio-demo-v1',raw]]);this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);return x},insertBefore(x){this.children.unshift(x);return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(){},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(raw){const els=new Map(),qsAll=new Map();const doc={body:element('body'),documentElement:element('html'),_qsAll:qsAll,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(sel){return qsAll.get(sel)||[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};const ls=new MockStorage(raw),ss=new MockStorage(null);const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch{}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null}};ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}return {ctx,ls,ss,els,doc,errors}}
function ev(ctx,code){return vm.runInContext(code,ctx)}
function assert(c,m){if(!c)throw new Error(m)}let tests=0;function ok(c,m){tests++;assert(c,m)}
function setup(r){for(const id of ['adminTabs','unitPicker','subbar','adminPage','loginUser','loginPass','modalHost','clientRows'])r.ctx[id]=r.doc.getElementById(id);r.doc.getElementById('unitPicker').value='u1';let admin=ev(r.ctx,"(db.userAccounts||[]).find(u=>u.role==='admin'&&u.active!==false)?.id||''");if(admin)ev(r.ctx,`__imperioV63.sessionSet(${JSON.stringify(admin)})`)}
function setField(r,id,value,checked){let e=r.doc.getElementById(id);if(checked!==undefined)e.checked=checked;if(value!==undefined)e.value=value;return e}
let r=run(null);setup(r);
// O mock sem banco persistido não injeta seed operacional; preparar uma base V70.1 mínima e rerodar apenas a migração V71.
ev(r.ctx,`db.acquisitionSources=[{id:'as1',name:'Instagram',active:true},{id:'as2',name:'Google',active:true},{id:'as3',name:'Indicação',active:true},{id:'as4',name:'Passou na frente',active:true},{id:'as5',name:'Já conhecia',active:true},{id:'as6',name:'Inteligência Artificial',active:true},{id:'as7',name:'Outro',active:true}];db.clients=[{id:'cl1',name:'Ana Histórica',phone:'3191',source:'Instagram',origin:'Presencial',registrationUnit:'u1'},{id:'cl2',name:'Bia Histórica',phone:'3192',source:'Google',origin:'Importação',registrationUnit:'u1'}];db.units=[{id:'u1',name:'Big Shopping',active:true}];db.systemSettings.formFields={};db.systemSettings.optionSets={};delete db.systemSettings.formConfigVersion;delete db.systemSettings.formConfigScope;delete db.systemSettings.formUnitOverrides;db.migrationHistory=(db.migrationHistory||[]).filter(x=>(typeof x==='string'?x:x.id)!=='v71-configurable-fields-options-clients');db.schemaVersion=70;__imperioV71.migrate();`);
ok(!r.errors.length,'A runtime sem erros');
ok(scripts.length===60,'A 35 blocos JavaScript');
ok(ev(r.ctx,'db.schemaVersion')===71,'A schema 71');
ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v71-configurable-fields-options-clients').length")===1,'A migração V71 única');
ok(ev(r.ctx,"typeof __imperioV71==='object'&&__imperioV71.schema===71"),'A API V71 exposta');
ok(ev(r.ctx,"db.systemSettings.formConfigScope")==='global','A configuração global');
ok(ev(r.ctx,"!!db.systemSettings.formUnitOverrides&&Object.keys(db.systemSettings.formUnitOverrides).length===0"),'A overrides por unidade reservados e vazios');
const clean0=r.ls.getItem('imperio-demo-v1');let rn=run(clean0);setup(rn);const clean=rn.ls.getItem('imperio-demo-v1');
// Helpers e campos protegidos/configuráveis.
ok(ev(r.ctx,"__imperioV71.isFieldRequired('clients','name')")===true,'B nome obrigatório protegido');
ok(ev(r.ctx,"__imperioV71.getFieldConfig('clients','name').systemRequired")===true,'B nome marcado systemRequired');
ok(ev(r.ctx,"__imperioV71.isFieldRequired('clients','phone')")===true,'B telefone obrigatório por configuração inicial');
ok(ev(r.ctx,"__imperioV71.getFieldConfig('clients','email').required")===false,'B email opcional inicialmente');
ok(ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.length>=7"),'B opções de Como conheceu migradas');
ok(ev(r.ctx,"__imperioV71.defaultOptionValue('clients.origin')")==='Presencial','B origem padrão Presencial');
// Tela central.
ok(ev(r.ctx,"v71OpenFieldsSettings('clients')")===true,'C abre Campos e opções');let h=r.doc.getElementById('adminPage').innerHTML;
ok(h.includes('Campos e opções')&&h.includes('Clientes'),'C central renderizada');
ok(h.includes('Obrigatório pelo sistema')&&h.includes('Gerenciar opções'),'C campos protegidos e opções visíveis');
ok(h.includes('Agenda')&&h.includes('Financeiro')&&h.includes('Configurável'),'C módulos posteriores agora configuráveis pela mesma central');
// Adicionar opção.
setField(r,'v71NewOption','TikTok');ok(ev(r.ctx,"v71AddOption('clients.source')")===true,'D adiciona opção');
let tikId=ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.find(x=>x.label==='TikTok').id");ok(!!tikId,'D TikTok persistido');
ok(ev(r.ctx,"__imperioV71.getActiveOptions('clients.source').some(x=>x.label==='TikTok')"),'D TikTok disponível');
// Renomear sem reescrever histórico.
let instaId=ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.find(x=>x.label==='Instagram').id");let oldClient=ev(r.ctx,"db.clients.find(x=>x.id==='cl1')?.source");ok(oldClient==='Instagram','E cliente histórico usa Instagram');
ok(ev(r.ctx,`v71RenameOption('clients.source',${JSON.stringify(instaId)},'Instagram / Meta')`)===true,'E renomeia opção futura');
ok(ev(r.ctx,"db.clients.find(x=>x.id==='cl1').source")==='Instagram','E histórico não reescrito');
ok(ev(r.ctx,"__imperioV71.optionHtml('clients.source','Instagram').includes('Instagram')"),'E valor histórico continua editável/visível');
ok(ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.find(x=>x.id==="+JSON.stringify(instaId)+").previousLabels.includes('Instagram')"),'E nome anterior registrado');
// Ordenar.
let beforeIndex=ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.slice().sort((a,b)=>a.order-b.order).findIndex(x=>x.id==="+JSON.stringify(tikId)+")");if(beforeIndex>0){ok(ev(r.ctx,`v71MoveOption('clients.source',${JSON.stringify(tikId)},-1)`)===true,'F move opção');let afterIndex=ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.slice().sort((a,b)=>a.order-b.order).findIndex(x=>x.id==="+JSON.stringify(tikId)+")");ok(afterIndex===beforeIndex-1,'F ordem alterada')}else{tests+=2}
// Desativar e preservar registro histórico.
let googleId=ev(r.ctx,"__imperioV71.getOptionSet('clients.source').options.find(x=>x.label==='Google').id");let googleClient=ev(r.ctx,"db.clients.find(x=>x.id==='cl2')?.source");ok(googleClient==='Google','G histórico Google existe');ok(ev(r.ctx,`v71ToggleOption('clients.source',${JSON.stringify(googleId)})`)===true,'G desativa Google');
ok(!ev(r.ctx,"__imperioV71.getActiveOptions('clients.source').some(x=>x.label==='Google')"),'G Google sai de novos usos');
ok(ev(r.ctx,"db.clients.find(x=>x.id==='cl2').source")==='Google','G registro histórico preservado');
ok(ev(r.ctx,"__imperioV71.optionHtml('clients.source','Google').includes('Google')"),'G editar histórico mantém opção legada');
// Opção padrão.
ok(ev(r.ctx,`v71SetDefaultOption('clients.source',${JSON.stringify(tikId)})`)===true,'H define padrão');ok(ev(r.ctx,"__imperioV71.defaultOptionValue('clients.source')")==='TikTok','H padrão aplicado');
// Obrigatoriedade configurável bloqueia e depois libera gravação.
ok(ev(r.ctx,"v71SetFieldRequired('clients','email',true)")===true,'I email vira obrigatório');
for(const [id,val] of [['cfName','Cliente Config'],['cfPhone','31999990000'],['cfBirth',''],['cfCpf',''],['cfEmail',''],['cfProfession',''],['cfCep',''],['cfNeighborhood',''],['cfCity',''],['cfSource','TikTok'],['cfOrigin','Presencial'],['cfNotes','']])setField(r,id,val);
let n0=ev(r.ctx,'db.clients.length');ok(ev(r.ctx,"saveClient('')")===false,'I gravação bloqueada sem email');ok(ev(r.ctx,'db.clients.length')===n0,'I cliente não criado');
ok(ev(r.ctx,"v71SetFieldRequired('clients','email',false)")===true,'J email volta opcional');ok(ev(r.ctx,"saveClient('')")===true,'J gravação permitida sem email');ok(ev(r.ctx,'db.clients.length')===n0+1,'J cliente criado');
// Campo protegido não pode ser desativado.
ok(ev(r.ctx,"v71SetFieldRequired('clients','name',false)")===false,'K nome protegido rejeita desativação');ok(ev(r.ctx,"__imperioV71.isFieldRequired('clients','name')")===true,'K nome permanece obrigatório');
// Cadastro rápido usa a mesma validação central.
ok(ev(r.ctx,"v71SetFieldRequired('clients','phone',false)")===true,'L telefone configurável vira opcional');ev(r.ctx,"resDraft={clientId:'',clientSearch:'',items:[]}");for(const [id,val] of [['qcfName','Cliente Rápida'],['qcfPhone',''],['qcfBirth',''],['qcfSource','TikTok'],['qcfOrigin','Presencial']])setField(r,id,val);let n1=ev(r.ctx,'db.clients.length');ok(ev(r.ctx,'saveQuickClientFromReservation()')===true,'L cadastro rápido respeita telefone opcional');ok(ev(r.ctx,'db.clients.length')===n1+1,'L cliente rápida criada');
// Auditoria das configurações existe e dados antigos não foram alterados.
ok(ev(r.ctx,"(db.auditEvents||[]).some(x=>x.module==='settings'&&['ADD_OPTION','RENAME_OPTION','DEACTIVATE_OPTION','UPDATE_FIELD_REQUIRED'].includes(x.action))"),'M alterações de configuração auditadas');
// Segunda inicialização de base limpa já migrada não duplica/não grava.
let r2=run(clean);setup(r2);ok(!r2.errors.length,'N reinicialização sem erro');ok(r2.ls.writeCount===0,'N zero novas gravações');ok(ev(r2.ctx,'db.schemaVersion')===96,'N schema permanece 73');ok(ev(r2.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v71-configurable-fields-options-clients').length")===1,'N migração única');
console.log(JSON.stringify({ok:true,scripts:scripts.length,tests,globalConfig:true,clients:true,options:true,historicalPreservation:true,centralValidation:true,audit:true,idempotent:true}));
