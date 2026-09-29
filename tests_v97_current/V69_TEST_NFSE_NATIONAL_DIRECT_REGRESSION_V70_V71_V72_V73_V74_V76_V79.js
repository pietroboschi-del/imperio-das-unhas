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
d.schemaVersion=68;
d.migrationHistory.push(
 {id:'v65-executive-overview',version:65},{id:'v66-notifications-management-tasks',version:66},
 {id:'v67-custom-user-permissions',version:67},{id:'v68-fiscal-foundation',version:68}
);
d.managementTasks=[];d.notificationAlertStates={};d.notificationSettings={};
d.fiscalSettings={version:1,integrationMode:'none'};
d.fiscalDocuments=[{id:'fd69',commandId:'cmd1',unitId:'u1',companyEntityId:'ce1',clientId:'c1',clientNameSnapshot:'Cliente Atual',documentType:'NFSE_SERVICE',status:'PENDING',referenceDate:'2026-09-10',amount:100,history:[],attempts:[],createdAt:'2026-09-27T18:00:00.000Z'}];
d.companyEntities=[{id:'ce1',name:'Empresa Teste',legalName:'Empresa Teste LTDA',cnpj:'12345678000195',unitId:'u1',active:true,fiscalNational:{municipalityCode:'3100000',dpsSeries:'1',nextDpsNumber:1,opSimpNac:'3',regApTribSN:'1',regEspTrib:'0',ready:true}}];
d.services[0].fiscalNational={cTribNac:'010101',cTribMun:'',cNBS:'',cLocPrestacao:'3100000',tribISSQN:'1',tpRetISSQN:'1',pAliq:'',totTribMode:'ind',totTribFed:'',totTribEst:'',totTribMun:'',pTotTribSN:''};
d.clients[0].cpf='52998224725';d.clients[0].email='cliente@example.test';
let r=run(JSON.stringify(d));setup(r);
ok(!r.errors.length,'A runtime V69 sem erros');ok(scripts.length===61,'A 32 scripts');
ok(ev(r.ctx,'db.schemaVersion')===97,'A schema 69');
ok(ev(r.ctx,"db.migrationHistory.some(x=>(typeof x==='string'?x:x.id)==='v69-national-nfse-direct-integration')"),'A migration V69');
ok(ev(r.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v69-national-nfse-direct-integration').length")===1,'A migration V69 única');
ok(ev(r.ctx,"typeof __imperioV69==='object'&&__imperioV69.schema===69"),'A API V69');
ok(ev(r.ctx,"db.fiscalSettings.provider")==='sefin_nacional_direct','A provider direto');
ok(ev(r.ctx,"db.fiscalSettings.environment")==='restricted','A homologação por padrão');
ok(ev(r.ctx,"db.fiscalSettings.productionEnabled")===false,'A produção bloqueada por padrão');
ok(ev(r.ctx,"!('certificate' in db.fiscalSettings)&&!('certificatePassword' in db.fiscalSettings)"),'A certificado não vai ao localStorage');
let clean=r.ls.getItem('imperio-demo-v1');

// B. Prontidão e payload declarativo da DPS.
ev(r.ctx,"__imperioV63.sessionSet('uadmin')");
ok(ev(r.ctx,"__imperioV69.companyReady(db.companyEntities[0])")===true,'B CNPJ configurado pronto');
ok(ev(r.ctx,"__imperioV69.serviceReady(db.services[0])")===true,'B serviço configurado pronto');
let pack=ev(r.ctx,"__imperioV69.buildPayload('fd69')");
ok(pack.payload.ambiente==='restrita','B payload restrita');
ok(pack.payload.prestador.cnpj==='12345678000195','B CNPJ no payload');
ok(pack.payload.prestador.serie==='1'&&pack.payload.emissao.nDPS==='1','B série e DPS congeladas');
ok(pack.payload.servico.cTribNac==='010101'&&pack.payload.servico.cLocPrestacao==='3100000','B classificação fiscal');
ok(pack.payload.emissao.valores.vServ==='100.00','B valor fiscal da comanda');
ok(pack.payload.emissao.tomador.CPF==='52998224725','B tomador real quando CPF existe');
ok(pack.payload.emissao.totTrib.indTotTrib==='0','B tributos conforme configuração explícita');
ok(ev(r.ctx,"db.fiscalDocuments[0].nationalFiscalSnapshot.source")==='captured_v69_at_preparation','B snapshot fiscal congelado');
let beforeEconomic=ev(r.ctx,"JSON.stringify({fe:db.demoFinancialEntries.length,cm:db.demoCashMovements.length,recv:db.clientReceivables.length,ce:db.commissionEvents.length,cmd:db.clientCommands.length})");

// C. Validação local pelo Gateway, sem transmissão.
r.ctx.fetch=async(url,opt)=>({ok:true,status:200,text:async()=>JSON.stringify({ok:true,dpsId:'DPS-TESTE-1'})});
let vr=await ev(r.ctx,"__imperioV69.validateDoc('fd69')");
ok(!!vr&&vr.dpsId==='DPS-TESTE-1','C validação retorna DPS');
ok(ev(r.ctx,"db.fiscalDocuments[0].status")==='PENDING','C validar não emite');
ok(ev(r.ctx,"db.fiscalDocuments[0].attempts.some(x=>x.operation==='VALIDATE_DPS'&&x.result==='VALID')"),'C tentativa validação registrada');

// D. Emissão autorizada simulada no boundary do Gateway.
r.ctx.fetch=async(url,opt)=>({ok:true,status:200,text:async()=>JSON.stringify({ok:true,chaveAcesso:'CHAVE-TESTE-001',idDps:'DPS-TESTE-1',number:'101',processedAt:'2026-09-27T21:00:00.000Z',xmlRef:'gateway://storage/CHAVE-TESTE-001.xml',versaoAplicativo:'TEST'})});
let ir=await ev(r.ctx,"__imperioV69.issueDoc('fd69')");
ok(!!ir&&ir.chaveAcesso==='CHAVE-TESTE-001','D emissão simulada autorizada');
ok(ev(r.ctx,"db.fiscalDocuments[0].status")==='ISSUED_EXTERNAL','D status compatível V68');
ok(ev(r.ctx,"db.fiscalDocuments[0].origin")==='sefin_nacional_direct_v69','D origem API direta');
ok(ev(r.ctx,"db.fiscalDocuments[0].transmissionState")==='ISSUED','D transmissão emitida');
ok(ev(r.ctx,"db.companyEntities[0].fiscalNational.nextDpsNumber")===2,'D numeração avança somente após autorização');
ok(ev(r.ctx,"db.auditEvents.some(x=>x.module==='fiscal'&&x.action==='SEFIN_ISSUE')"),'D emissão auditada');
let afterEconomic=ev(r.ctx,"JSON.stringify({fe:db.demoFinancialEntries.length,cm:db.demoCashMovements.length,recv:db.clientReceivables.length,ce:db.commissionEvents.length,cmd:db.clientCommands.length})");
ok(beforeEconomic===afterEconomic,'D emissão fiscal não cria fato econômico');

// E. Produção sem liberação é bloqueio local, sem chamada de rede e sem falso incerto.
ev(r.ctx,"db.fiscalDocuments.push({id:'fdprod',commandId:'cmd1',unitId:'u1',companyEntityId:'ce1',clientId:'c1',clientNameSnapshot:'Cliente Atual',documentType:'NFSE_SERVICE',status:'PENDING',referenceDate:'2026-09-10',amount:100,history:[],attempts:[]});db.fiscalSettings.environment='production';db.fiscalSettings.productionEnabled=false");
let calls=0;r.ctx.fetch=async()=>{calls++;throw new Error('não deveria chamar rede')};
let pr=await ev(r.ctx,"__imperioV69.issueDoc('fdprod')");
ok(pr===false&&calls===0,'E produção bloqueada sem rede');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdprod').transmissionState")==='NOT_SENT','E bloqueio local não vira incerto');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdprod').status")==='PENDING','E documento permanece pendente');

// F. Falha de transporte após iniciar chamada fica incerta para impedir reenvio cego.
ev(r.ctx,"db.fiscalSettings.environment='restricted';db.fiscalDocuments.push({id:'fdunc',commandId:'cmd1',unitId:'u1',companyEntityId:'ce1',clientId:'c1',clientNameSnapshot:'Cliente Atual',documentType:'NFSE_SERVICE',status:'PENDING',referenceDate:'2026-09-10',amount:100,history:[],attempts:[]})");
r.ctx.fetch=async()=>{throw new Error('timeout simulado')};
let ur=await ev(r.ctx,"__imperioV69.issueDoc('fdunc')");
ok(ur===false,'F falha de transporte tratada');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdunc').transmissionState")==='UNCERTAIN','F transmissão incerta explícita');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdunc').status")==='PENDING','F não inventa rejeição');

// G. Rejeição HTTP 4xx é registrada como rejeição real.
ev(r.ctx,"db.fiscalDocuments.push({id:'fdrej',commandId:'cmd1',unitId:'u1',companyEntityId:'ce1',clientId:'c1',clientNameSnapshot:'Cliente Atual',documentType:'NFSE_SERVICE',status:'PENDING',referenceDate:'2026-09-10',amount:100,history:[],attempts:[]})");
r.ctx.fetch=async()=>({ok:false,status:422,text:async()=>JSON.stringify({message:'DPS rejeitada em teste'})});
let rr=await ev(r.ctx,"__imperioV69.issueDoc('fdrej')");
ok(rr===false,'G rejeição tratada');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdrej').transmissionState")==='REJECTED','G estado rejeitado');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdrej').status")==='ERROR_RECORDED','G status de erro compatível');

// H. Reconciliação consulta DPS antes de qualquer novo envio.
ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdunc').dpsId='DPS-UNC-1'");
let urls=[];r.ctx.fetch=async(url,opt)=>{urls.push(String(url));if(String(url).includes('/api/v1/dps/'))return {ok:true,status:200,text:async()=>JSON.stringify({exists:true,chaveAcesso:'CHAVE-REC-1'})};if(String(url).includes('/api/v1/nfse/'))return {ok:true,status:200,text:async()=>JSON.stringify({number:'202',xmlRef:'gateway://storage/CHAVE-REC-1.xml'})};return {ok:false,status:404,text:async()=>JSON.stringify({message:'rota inesperada'})}};
let rec=await ev(r.ctx,"__imperioV69.reconcileDoc('fdunc')");
ok(!!rec&&urls.some(x=>x.includes('/api/v1/dps/'))&&urls.some(x=>x.includes('/api/v1/nfse/')),'H reconcilia por consulta');
ok(!urls.some(x=>x.includes('/api/v1/nfse/issue')),'H reconciliação não reenvia DPS');
ok(ev(r.ctx,"db.fiscalDocuments.find(x=>x.id==='fdunc').transmissionState")==='ISSUED_RECONCILED','H emissão recuperada');

// I. NF-e de produto continua fora do escopo da integração nacional V69.
ev(r.ctx,"db.fiscalDocuments.push({id:'fdprodnote',commandId:'cmd1',unitId:'u1',companyEntityId:'ce1',clientId:'c1',documentType:'NFE_PRODUCT',status:'PENDING',referenceDate:'2026-09-10',amount:10,history:[],attempts:[]})");
let blocked=false;try{ev(r.ctx,"__imperioV69.buildPayload('fdprodnote')")}catch(e){blocked=true}ok(blocked,'I NF-e produto não é simulada');

// J. Configuração fiscal aparece em Configurações, sem campo de certificado no navegador.
ev(r.ctx,"page='settings';v69OpenFiscalSettings()");let h=r.doc.getElementById('adminPage').innerHTML;
ok(h.includes('Integração fiscal direta com a NFS-e Nacional')&&h.includes('Produção restrita / homologação'),'J tela fiscal V69');
ok(h.includes('Certificado')&&h.includes('Somente no Gateway'),'J certificado fora do browser');
ok(!h.includes('NFSE_CERTIFICATE_PASSWORD'),'J senha de certificado não exposta');

// K. Idempotência de base já migrada e sem alterações funcionais.
let r2=run(clean);setup(r2);ok(!r2.errors.length,'K reinicialização limpa');ok(r2.ls.writeCount===0,'K zero novas gravações');ok(ev(r2.ctx,'db.schemaVersion')===97,'K schema 69');ok(ev(r2.ctx,"db.migrationHistory.filter(x=>(typeof x==='string'?x:x.id)==='v69-national-nfse-direct-integration').length")===1,'K migration única');
console.log(JSON.stringify({ok:true,scripts:scripts.length,tests,nfseNationalDirect:true,homologationFirst:true,certificateOutsideBrowser:true,payloadSnapshot:true,validateNoEmission:true,issueBoundary:true,productionLock:true,uncertainTransport:true,reconcileNoResend:true,economicNeutrality:true,idempotent:true}));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
