const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
class MockStorage{constructor(raw){this.m=new Map(raw==null?[]:[['imperio-demo-v1',raw]]);this.writeCount=0}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.writeCount++;this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}clear(){this.m.clear()}}
function element(id=''){return {id,value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},children:[],options:[],selectedIndex:0,className:'',src:'',href:'',files:[],disabled:false,firstChild:null,parentNode:null,classList:{add(){},remove(){},toggle(){return false},contains(){return false}},appendChild(x){this.children.push(x);return x},insertBefore(x){this.children.unshift(x);return x},remove(){},click(){},focus(){},select(){},insertAdjacentElement(){},insertAdjacentHTML(){},addEventListener(){},removeEventListener(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},contains(){return false},setAttribute(){},getAttribute(){return null}}}
function run(raw){
 const els=new Map(),qsAll=new Map();
 const doc={body:element('body'),documentElement:element('html'),_qsAll:qsAll,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id)},querySelector(){return null},querySelectorAll(sel){return qsAll.get(sel)||[]},createElement(tag){return element(tag)},addEventListener(){},removeEventListener(){}};
 const ls=new MockStorage(raw),ss=new MockStorage(null);
 const ctx={console,localStorage:ls,sessionStorage:ss,document:doc,window:null,navigator:{clipboard:{writeText:async()=>{}}},location:{},history:{},setTimeout:(f)=>{try{f()}catch{}},clearTimeout(){},setInterval(){return 1},clearInterval(){},structuredClone:global.structuredClone,Date,JSON,Math,Number,String,Array,Object,Map,Set,Intl,RegExp,Promise,Blob:function(){},FileReader:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},confirm:()=>true,prompt:()=>'',alert:()=>{},fetch:async()=>({ok:false,json:async()=>({})}),event:{target:null}};
 ctx.window=ctx;vm.createContext(ctx);const errors=[];for(let i=0;i<scripts.length;i++){try{vm.runInContext(scripts[i],ctx,{filename:`script${i}.js`})}catch(e){errors.push(`script ${i}: ${e.stack||e}`);break}}
 try{vm.runInContext(`/*AUTO_ADMIN_V67*/if(window.__imperioV63){let a=(db.userAccounts||[]).find(u=>u.role==='admin'&&u.active!==false);if(a)__imperioV63.sessionSet(a.id)}`,ctx)}catch{};return {ctx,ls,ss,els,doc,errors}
}
function ev(ctx,code){return vm.runInContext(code,ctx)}
function assert(c,m){if(!c)throw new Error(m)}
let tests=0;function ok(c,m){tests++;assert(c,m)}
function setupGlobals(r){for(const id of ['adminTabs','unitPicker','subbar','adminPage','loginUser','loginPass','modalHost'])r.ctx[id]=r.doc.getElementById(id)}

function baseDb(){return {schemaVersion:62,migrationHistory:[{id:'v62-reports-marketing',version:62}],units:[{id:'u1',name:'Big Shopping',active:true},{id:'u2',name:'Shopping Contagem',active:true},{id:'u3',name:'Centro de Contagem',active:true}],categories:[],acquisitionSources:[],services:[],pros:[],clients:[],bookings:[],paymentMethods:[],financialAccounts:[],demoCashMovements:[],demoFinancialEntries:[],cashSessions:[],cashAudits:[],professionalCommissionAdjustments:[],tipMovements:[],clientAppointments:[],clientCommands:[],demoProducts:[],demoPackageCatalog:[],clientCreditMovements:[],clientPackages:[],clientReturns:[],combos:[],financeCategories:[],companyEntities:[],financeGoals:[],stockProducts:[],stockBalances:[],stockPurchases:[],stockRequests:[],stockTransfers:[],stockMovements:[],stockInputCosts:[],stockFamilies:[],stockSubstitutions:[],commissionSettlements:[],commissionPayments:[],remunerationRules:[],professionalDailyWork:[],clientReceivables:[],clientReceivablePayments:[],commissionEvents:[],tipDeductionRules:[],reportSettings:{inactiveDays:90,returnLateGraceDays:7,capacityProductivityFactor:95},marketingSettings:{attributionSnapshotVersion:1},storageMeta:{dataMode:'real',createdAt:'2026-09-27T00:00:00.000Z',storageSafetyVersion:1}}}

function setUserForm(r,{name,login,password='',role='reception',active=true,allUnits=false,units=[]}){
 r.doc.getElementById('v63UserName').value=name;r.doc.getElementById('v63UserLogin').value=login;r.doc.getElementById('v63UserPassword').value=password;r.doc.getElementById('v63UserRole').value=role;r.doc.getElementById('v63UserActive').checked=active;r.doc.getElementById('v63UserAllUnits').checked=allUnits;
 const checks=['u1','u2','u3'].map(id=>{let e=element('chk_'+id);e.value=id;e.checked=units.includes(id);return e});r.doc._qsAll.set('.v63-user-unit:checked',checks.filter(x=>x.checked));r.doc._qsAll.set('.v63-user-unit',checks)
}

// A. Runtime + migração.
let r=run(JSON.stringify(baseDb()));setupGlobals(r);ok(!r.errors.length,'A runtime sem erros');ok(scripts.length===49,'A 31 blocos JavaScript');ok(ev(r.ctx,'db.schemaVersion')===86,'A schema 68 preservando V63');ok(ev(r.ctx,"db.migrationHistory.some(x=>(typeof x==='string'?x:x.id)==='v63-settings-users-operators')"),'A migration registrada');ok(ev(r.ctx,'Array.isArray(db.userAccounts)'),'A coleção userAccounts');

// B. Migração do acesso legado sem criar fatos de negócio.
ok(ev(r.ctx,"db.userAccounts.length")===1,'B um usuário legado inicial');ok(ev(r.ctx,"db.userAccounts[0].username")==='master','B login master preservado');ok(ev(r.ctx,"db.userAccounts[0].role")==='admin','B perfil admin');ok(ev(r.ctx,"db.userAccounts[0].source")==='legacy_auth_migration','B origem da migração identificada');ok(ev(r.ctx,"db.userAccounts[0].allUnits")===true,'B admin todas unidades');

// C. Login individual e identificação atual.
r.doc.getElementById('loginUser').value='master';r.doc.getElementById('loginPass').value='demo';ok(ev(r.ctx,'doLogin()')===true,'C login master');ok(ev(r.ctx,"__imperioV63.currentUser().id")==='usr_legacy_master','C usuário atual identificado');ok(ev(r.ctx,'currentUserName()')==='Administrador','C currentUserName integrado');ok(ev(r.ctx,'currentUserId()')==='usr_legacy_master','C currentUserId disponível');ok(r.doc.getElementById('adminTabs').innerHTML.includes('Configurações'),'C Configurações visível para admin');ok(r.doc.getElementById('unitPicker').innerHTML.includes('Big Shopping')&&r.doc.getElementById('unitPicker').innerHTML.includes('Shopping Contagem')&&r.doc.getElementById('unitPicker').innerHTML.includes('Centro de Contagem'),'C admin vê todas unidades');

// D. Criação de operador com unidades específicas.
ev(r.ctx,"page='settings'");setUserForm(r,{name:'Juliana Recepção',login:'juliana',password:'1234',role:'reception',active:true,allUnits:false,units:['u1','u3']});ok(ev(r.ctx,"__imperioV63.saveUser('')")===true,'D criação de usuário');let opId=ev(r.ctx,"db.userAccounts.find(x=>x.username==='juliana').id");ok(!!opId,'D ID criado');ok(ev(r.ctx,"db.userAccounts.find(x=>x.username==='juliana').unitIds.join(',')")==='u1,u3','D unidades persistidas');ok(ev(r.ctx,"db.userAccounts.find(x=>x.username==='juliana').createdByUserId")==='usr_legacy_master','D criador identificado');

// E. Login duplicado rejeitado.
let before=ev(r.ctx,'db.userAccounts.length');setUserForm(r,{name:'Duplicado',login:'JULIANA',password:'x',role:'reception',units:['u1']});ok(ev(r.ctx,"__imperioV63.saveUser('')")===false,'E login duplicado rejeitado');ok(ev(r.ctx,'db.userAccounts.length')===before,'E não inseriu duplicado');

// F. Proteções administrativas.
ok(ev(r.ctx,"__imperioV63.toggleUser('usr_legacy_master')")===false,'F não inativa usuário da sessão');ok(ev(r.ctx,"db.userAccounts.find(x=>x.id==='usr_legacy_master').active")===true,'F admin continua ativo');

// G. Operador entra e fica limitado às unidades atribuídas; Configurações não aparece.
ev(r.ctx,'logout()');r.doc.getElementById('loginUser').value='juliana';r.doc.getElementById('loginPass').value='1234';ok(ev(r.ctx,'doLogin()')===true,'G login operador');ok(ev(r.ctx,'currentUserName()')==='Juliana Recepção','G nome do operador');let nav=r.doc.getElementById('adminTabs').innerHTML,picker=r.doc.getElementById('unitPicker').innerHTML;ok(!nav.includes('Configurações'),'G Configurações escondida do operador');ok(picker.includes('Big Shopping')&&picker.includes('Centro de Contagem')&&!picker.includes('Shopping Contagem'),'G seletor limitado a u1/u3');ev(r.ctx,"page='settings';renderAdmin()");ok(r.doc.getElementById('adminPage').innerHTML.includes('Acesso restrito'),'G acesso forçado bloqueado');

// H. Usuário inativo não autentica.
ev(r.ctx,"db.userAccounts.find(x=>x.id==='"+opId+"').active=false");ok(ev(r.ctx,"__imperioV63.authenticate('juliana','1234')===null"),'H inativo não autentica');ev(r.ctx,"db.userAccounts.find(x=>x.id==='"+opId+"').active=true");

// I. Edição com senha em branco preserva credencial e altera unidades.
ev(r.ctx,"__imperioV63.sessionSet('usr_legacy_master')");ev(r.ctx,"page='settings';buildAdminNav()");setUserForm(r,{name:'Juliana Recepção 2',login:'juliana',password:'',role:'reception',active:true,allUnits:false,units:['u2']});ok(ev(r.ctx,"__imperioV63.saveUser('"+opId+"')")===true,'I edição usuário');ok(ev(r.ctx,"db.userAccounts.find(x=>x.id==='"+opId+"').password")==='1234','I senha preservada');ok(ev(r.ctx,"db.userAccounts.find(x=>x.id==='"+opId+"').unitIds.join(',')")==='u2','I unidade atualizada');

// J. Comunicação/WhatsApp: configuração somente, sem API fictícia.
r.doc.getElementById('v63Wa_u1').value='5531999999999';r.doc.getElementById('v63Wa_u2').value='';r.doc.getElementById('v63Wa_u3').value='';r.doc.getElementById('v63Tpl_confirmation').value='Olá {{cliente}}, horário {{data}} {{hora}} - {{unidade}}';r.doc.getElementById('v63Tpl_reminder').value='Lembrete {{cliente}}';r.doc.getElementById('v63Tpl_reactivation').value='Volte {{cliente}}';r.doc.getElementById('v63Tpl_monthly_receivable').value='Saldo {{valor}}';ok(ev(r.ctx,'__imperioV63.saveCommunication()')===true,'J comunicação salva');ok(ev(r.ctx,"db.communicationSettings.whatsapp.unitNumbers.u1")==='5531999999999','J número por unidade');ok(ev(r.ctx,"db.communicationSettings.whatsapp.mode")==='manual_link','J modo sem API automática');let msg=ev(r.ctx,"__imperioV63.fillTemplate('confirmation',{cliente:'Ana',data:'01/10',hora:'10:00',unidade:'Big'})");ok(msg==='Olá Ana, horário 01/10 10:00 - Big','J variáveis do modelo');

// K. Renderização da Central de Configurações.
ev(r.ctx,"v63SetSettingsTab('users')");ok(r.doc.getElementById('adminPage').innerHTML.includes('Usuários e Acessos'),'K tela usuários');ev(r.ctx,"v63SetSettingsTab('communication')");ok(r.doc.getElementById('adminPage').innerHTML.includes('Número por unidade')&&r.doc.getElementById('adminPage').innerHTML.includes('Modelos de mensagem'),'K tela comunicação');ev(r.ctx,"v63SetSettingsTab('system')");ok(r.doc.getElementById('adminPage').innerHTML.includes('V77 · Estações + Capacidade física'),'K tela sistema atualizada V66');

// L. Idempotência limpa: inicialização de base já V63 não deve gravar novamente.
let raw=r.ls.getItem('imperio-demo-v1');let r2=run(raw);setupGlobals(r2);ok(!r2.errors.length,'L reinicialização sem erro');ok(r2.ls.writeCount===0,'L zero novas gravações');ok(ev(r2.ctx,'db.schemaVersion')===86,'L schema permanece 68');ok(ev(r2.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v63-settings-users-operators').length")===1,'L migration única');

console.log(JSON.stringify({ok:true,scripts:scripts.length,tests,users:true,unitAccess:true,settings:true,whatsappConfig:true,idempotent:true}));
