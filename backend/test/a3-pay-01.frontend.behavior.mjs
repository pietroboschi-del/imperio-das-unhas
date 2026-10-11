import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../../assets/js/a3-finance-central.js',import.meta.url),'utf8');
function extract(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'Required production code missing: '+start);
 return source.slice(a,b).trim();
}
const methodSrc=extract(html,'function centralRemotePaymentMethod(','\n function centralLocalPaymentMethod(');
const planSrc=extract(html,'async function centralPaymentRetryPlanV99(','\n const legacyFinalizeCommandV99=');
const catalogue=[
 {id:'pm_custom_pix',name:'Recebimento X sem nome Pix',kind:'pix',active:true},
 {id:'pm_custom_other',name:'Pix falso no rótulo',kind:'other',active:true},
 {id:'pm_custom_cash',name:'Dinheiro alternativo',kind:'cash',active:true},
 {id:'pm_custom_debit',name:'Cartão modelo A',kind:'debit',active:true},
 {id:'pm_custom_credit',name:'Cartão modelo B',kind:'credit',active:true},
 {id:'pm_custom_transfer',name:'Transferência X',kind:'transfer',active:true},
 {id:'pm_custom_unknown',name:'Pix que não foi classificado',active:true},
];
const kinds=vm.runInNewContext('('+methodSrc+')',{db:{paymentMethods:catalogue}});
const expected=[
 ['pm_custom_pix','PIX'],['pm_custom_other','OTHER'],['pm_custom_cash','CASH'],
 ['pm_custom_debit','DEBIT_CARD'],['pm_custom_credit','CREDIT_CARD'],
 ['pm_custom_transfer','TRANSFER'],['pm_custom_unknown','OTHER'],['missing','OTHER'],
 ['pm_pix','PIX'],['pm_cash','CASH'],['pm_debit','DEBIT_CARD'],['pm_credit','CREDIT_CARD'],
 ['pm_direct','DIRECT_PROFESSIONAL'],['pm_barter','BARTER'],['pm_monthly','MONTHLY_RECEIVABLE'],
];
for(const [id,kind] of expected)assert.equal(kinds(id),kind,'authoritative kind '+id);
assert.equal(kinds('pm_custom_other'),'OTHER','display name Pix must NEVER change declared OTHER classification');
const plan=vm.runInNewContext('('+planSrc+')',{
 centralRemotePaymentMethod:kinds,roundMoney:n=>Math.round(Number(n)*100)/100,
 centralPaymentIdempotencyKey:(cmd,p)=>cmd+'|'+p,
 centralPaymentRecordIdV99:async(cmd,p)=>cmd+'|'+p,
});
for(const unit of ['centro','big','shopping-contagem']){
 const c={id:'cmd_'+unit,excessToCredit:false,paymentDraft:[
  {id:'p1',methodId:'pm_custom_pix',amount:15,accountId:'acc_'+unit},
  {id:'p2',methodId:'pm_custom_other',amount:8,accountId:'acc_'+unit},
  {id:'p3',methodId:'pm_custom_debit',amount:7,accountId:'acc_'+unit},
 ]};
 const result=await plan(c,null,{id:'cash_'+unit},{totalDue:30,change:0});
 assert.deepEqual(Array.from(result,p=>p.body.method),['PIX','OTHER','DEBIT_CARD'],'mixed payment classification '+unit);
 assert.equal(result.reduce((s,p)=>s+p.body.amount,0),30);
 assert(result.every(p=>p.body.cashSessionId==='cash_'+unit),'cash session preserved '+unit);
}
async function monthly(unit,methodId,declaredKind){
 const local={centro:'u3',big:'u1','shopping-contagem':'u2'};
 const id='acc_'+unit,receivableId='rv_'+unit;
 const db={financialAccounts:[{id,name:'Account',unitId:local[unit],central:true,active:true,type:'BANK',paymentMethodIds:[methodId],feeRules:{},details:{}}],
 paymentMethods:[{id:methodId,name:'Pix fake visible label',kind:declaredKind,active:true}],
 clientReceivables:[{id:receivableId,clientId:'client',unitId:local[unit],balance:40,central:true}],
 clientReceivablePayments:[],demoFinancialEntries:[],stockPurchases:[],cashSessions:[]};
 const vals={cmPayAccount:id,cmPayDate:'2026-10-11',cmPayAmount:'10',cmPayMethod:methodId};
 const modal={dataset:{}},calls=[];
 const document={body:modal,getElementById:key=>key==='modalHost'?modal:vals[key]!==undefined?{value:vals[key]}:null,
 querySelectorAll:key=>key==='.a3-receivable:checked'?[{value:receivableId}]:[]};
 const window={__imperioCentralApi:{status:()=>({endpoint:'http://synthetic.invalid'})},saveClientMonthlySettlement:()=>{throw Error('Legacy handler not allowed')},openClient:()=>{},closeModal:()=>{},toast:()=>{}};
 const sessionStorage={getItem:k=>k==='imperio-v99-central-authenticated'?'1':k==='imperio-v99-central-principal'?JSON.stringify({networkAdmin:true}):'csrf'};
 const fetchStub=async (url,opt={})=>{
  const api=String(url).replace('http://synthetic.invalid','');
  const unitHeader=opt.headers?.['X-Unit-Id'];
  if(opt.method==='POST'){
   assert.equal(api,'/api/v1/finance/receivables/settle');
   calls.push({unit:unitHeader,body:JSON.parse(opt.body)});
   return {ok:true,status:201,json:async()=>({id:'new_settle'})};
  }
  if(api==='/api/v1/finance/accounts')return{ok:true,json:async()=>unitHeader===unit?[{id,unitId:unit,name:'Account',type:'BANK',active:true,metadata:{paymentMethodIds:[methodId],feeRules:{},details:{},previousNames:[]}}]:[]};
  if(api.startsWith('/api/v1/finance/receivables'))return{ok:true,json:async()=>unitHeader===unit?[{id:receivableId,clientId:'client',unitId:unit,originalAmount:40,balance:30,status:'PARTIAL',sourceDate:'2026-10-11T00:00:00Z'}]:[]};
  return{ok:true,json:async()=>[]};
 };
 const sandbox={window,document,db,sessionStorage,fetch:fetchStub,structuredClone,crypto:{randomUUID:()=>unit+'-uuid'},location:{hostname:'ui.imperio.localhost',protocol:'http:'},console};
 vm.createContext(sandbox);vm.runInContext(bridge,sandbox,{filename:'a3-finance-central.js'});
 const out=await window.saveClientMonthlySettlement('client');
 assert.ok(out,'monthly settle must succeed '+unit+' '+methodId);
 assert.equal(calls.length,1);
 assert.equal(calls[0].unit,unit);
 assert.equal(calls[0].body.method,declaredKind==='pix'?'PIX':'OTHER','typed monthly method persisted');
 assert.deepEqual(Array.from(calls[0].body.receivableIds),[receivableId]);
 return calls[0].body;
}
for(const unit of ['centro','big','shopping-contagem']){
 await monthly(unit,'custom_pix_'+unit,'pix');
 await monthly(unit,'custom_other_'+unit,'other');
}
assert(!/updateMany|rawSQL|migration/i.test(methodSrc),'no automatic historic reclassification');
console.log(JSON.stringify({ok:true,case:'A3-PAY-01 frontend typed methods',checks:expected.length+3*3+3*2,units:3,commandMixed:true,monthlyTyped:true,OTHERPreserved:true,historyNotModified:true}));
