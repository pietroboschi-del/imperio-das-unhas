import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../assets/js/a3-finance-central.js',import.meta.url),'utf8');
const commandRows=[
 {id:'cmd1',source:'command',unitId:'centro',cashSessionId:'cash1',accountId:'acc1',date:'2026-10-07',method:'PIX',amount:'40'},
 {id:'cmd2',source:'command',unitId:'centro',cashSessionId:'cash1',accountId:'acc1',date:'2026-10-08',method:'PIX',amount:'60'},
 {id:'m1',source:'manual',unitId:'centro',cashSessionId:'cash1',accountId:'acc1',date:'2026-10-08',method:'CASH',amount:'20'},
 {id:'monthly1',source:'monthly',unitId:'centro',cashSessionId:'cash1',accountId:'acc1',date:'2026-10-08',method:'PIX',amount:'15'},
];
const remote=[{id:'acc1',unitId:'centro',name:'Banco central',type:'BANK',active:true,updatedAt:'2026-10-10T00:00:00Z',metadata:{paymentMethodIds:[],feeRules:{},details:{},previousNames:[]}}];
const db={
 financialAccounts:[{id:'acc1',unitId:'u3',name:'Banco legado',type:'BANK',active:true,paymentMethodIds:[],feeRules:{},details:{}}],
 demoFinancialEntries:[{id:'old-entry',unitId:'u3',amount:20,status:'Efetivado',nature:'Receita manual'}],
 clientReceivables:[{id:'old-recv',unitId:'u3',balance:10}],
 clientReceivablePayments:[{id:'old-pay',unitId:'u3',amount:10}],
 stockPurchases:[],
 cashSessions:[]
};
let financialRows=Array.from({length:1555},(_,i)=>({id:'central-entry-'+String(i).padStart(5,'0'),unitId:'centro',kind:'MANUAL',amount:2,date:'2026-10-07',competenceDate:'2026-10-07',status:'Efetivado',accountId:'acc1',metadata:{dreImpact:true}}));
const fetchStub=async (url)=>{
 let items=[];
 if(url.includes('/reports/receipt-summary'))return {ok:true,json:async()=>({receipts:[...commandRows,commandRows[0]]})};
 if(url.includes('/finance/accounts'))items=remote;
 if(url.includes('/finance/entries?'))items=financialRows;
 if(url.includes('/finance/receivables'))items=[];
 if(url.includes('/finance/purchase-payables'))items=[];
 if(url.includes('/finance/entries?')&&url.includes('cursor='))items=financialRows.filter(x=>x.id>new URL(url).searchParams.get('cursor'));
 if(url.includes('/finance/entries?'))items=items.slice(0,500);
 return {ok:true,json:async()=>items};
};
const window={__imperioCentralApi:{status:()=>({endpoint:'http://fake.test'})},financeNonReceiptRows:()=>[{id:'manual',central:true},{id:'legacy',central:false}]};
const storage={getItem:k=>k==='imperio-v99-central-authenticated'?'1':k==='imperio-v99-central-principal'?JSON.stringify({networkAdmin:true}):'csrf'};
const document={getElementById:()=>null,body:{dataset:{}},querySelectorAll:()=>[]};
const sandbox={window,db,location:{hostname:'ui.imperio.localhost',protocol:'http:'},sessionStorage:storage,document,
 fetch:fetchStub,crypto:{randomUUID:()=>'test-uuid'},structuredClone,console};
vm.createContext(sandbox);
vm.runInContext(code,sandbox,{filename:'a3-finance-central.js'});
const api=window.__a3Finance;
assert.ok(api,'bridge loaded');
await api.receipts('2026-10-07','2026-10-08',['centro']);
const closed=api.centralClosedRows();
assert.equal(closed.length,2,'same account/session separated by date');
assert.deepEqual(closed.map(x=>x.date).sort(),['2026-10-07','2026-10-08']);
assert.equal(closed.reduce((sum,x)=>sum+x.amount,0),115,'manual income not duplicated in cash closures');
assert.equal(closed.flatMap(x=>x.movements).length,3,'command receipts and monthly counted exactly once');
assert.equal(api.centralNonReceiptRows().length,1,'unverified local postings excluded');
await assert.rejects(api.hydrate(['centro']),/reconciliação/,'unreconciled accounts block central projection');
assert.equal(db.financialAccounts[0].name,'Banco legado','no local account deleted before approval');
assert.equal(window.__a3AccountsPending.length,1);
remote[0].name='Banco legado';
await api.hydrate(['centro']);
assert.equal(db.financialAccounts.filter(x=>x.central).length,1);
assert.equal(db.demoFinancialEntries.filter(x=>x.central).length,1555,'complete 4-page hydration without truncation');
assert.equal(db.a3LegacyFinanceArchive.entries.length,1,'historic posting preserved outside official ledger');
assert.equal(db.a3LegacyFinanceArchive.receivables.length,1,'historic receivable preserved');
assert.equal(db.a3LegacyFinanceArchive.payments.length,1,'historic payment preserved');
await api.hydrate(['centro']);
assert.equal(db.demoFinancialEntries.filter(x=>x.central).length,1555,'refresh does not duplicate');
assert.equal(db.a3LegacyFinanceArchive.entries.length,1,'archive not duplicated');
console.log(JSON.stringify({ok:true,scenario:'A3-REA frontend bridge: date grouping, deduplication, account reconciliation gate, history quarantine, 1555-row pagination'}));
