/* A3-FIN-REP: central-only financial projections; never trust browser storage as an accounting source. */
(function(){
 'use strict';
 const map={u1:'big',u2:'shopping-contagem',u3:'centro',big:'big',centro:'centro','shopping-contagem':'shopping-contagem'};
 const local={big:'u1','shopping-contagem':'u2',centro:'u3'};
 const validUnit=id=>['centro','big','shopping-contagem'].includes(id);
 const state=()=>typeof db!=='undefined'?db:window.db;
 const reportState=()=>typeof reportFilters!=='undefined'?reportFilters:window.reportFilters||{};
 const session=()=>!!window.__imperioCentralApi&&sessionStorage.getItem('imperio-v99-central-authenticated')==='1';
 const production=()=>!['localhost','127.0.0.1',''].includes(location.hostname)&&location.protocol!=='file:';
 const principal=()=>{try{return JSON.parse(sessionStorage.getItem('imperio-v99-central-principal')||'null')}catch{return null}};
 const selected=()=>map[document.getElementById('unitPicker')?.value||window.unitPicker?.value||'']||window.__imperioCentralApi?.status()?.unitId||'';
 const units=permission=>{const p=principal();if(!p)return[];return ['centro','big','shopping-contagem'].filter(unit=>p.networkAdmin||p.unitAccesses?.some(a=>a.unitId===unit&&(a.permissions?.includes('*')||a.permissions?.includes(permission)||p.permissions?.includes(permission))))};
 const input=(id)=>document.getElementById(id)?.value||'';
 const currency=n=>Number(n||0);
 let refreshing=false,reporting=false,reportRows=[],accountsCache=[],ledgerCache=[],receivableCache=[],purchaseCache=[];
 const keyFor=()=>{const el=document.getElementById('modalHost')||document.body;return el.dataset.a3Key||(el.dataset.a3Key=crypto.randomUUID())};
 const clearKey=()=>{const el=document.getElementById('modalHost')||document.body;delete el.dataset.a3Key};
 function errorMessage(e){try{window.toast?.('Financeiro central: '+e.message)}catch{}}
 async function request(path,unit,opt={}){
  if(!session()||!validUnit(unit))throw Error('Sessão ou unidade central indisponível');
  const endpoint=window.__imperioCentralApi.status().endpoint;
  const csrf=sessionStorage.getItem('imperio-v96-shadow-csrf')||'';
  const hasBody=opt.body!==undefined;
  const resp=await fetch(endpoint+path,{credentials:'include',cache:'no-store',method:opt.method||'GET',headers:{Accept:'application/json','X-Unit-Id':unit,...(csrf?{'X-CSRF-Token':csrf}:{}),...(hasBody?{'Content-Type':'application/json'}:{}),...(opt.key?{'Idempotency-Key':opt.key}:{})},body:hasBody?JSON.stringify(opt.body):undefined});
  let result=null;try{result=await resp.json()}catch{}
  if(!resp.ok)throw Error(result?.message||('HTTP '+resp.status));
  return result;
 }
 async function registerAccount(a){
  const unit=map[a?.unitId]||a?.unitId;
  if(!validUnit(unit))throw Error('Conta sem unidade financeira válida');
  return request('/api/v1/finance/accounts',unit,{method:'POST',body:{id:a.id,name:a.name,type:a.type||'BANK',active:a.active!==false,unitId:unit}});
 }
 async function needAccount(id,unit){
  const a=(state()?.financialAccounts||[]).find(x=>x.id===id);
  if(!a||(map[a.unitId]||a.unitId)!==unit)throw Error('Conta financeira não pertence à unidade');
  await registerAccount(a);return a;
 }
 function cashSession(unit,date){
  const rows=state()?.cashSessions||[];
  const row=rows.find(s=>(map[s.unitId]||s.unitId)===unit&&s.status==='open'&&s.date===date);
  return row?.id||null;
 }
 function entryLocal(x){
  const metadata=x.metadata||{};
  return{id:x.id,unitId:local[x.unitId]||x.unitId,date:String(x.date).slice(0,10),obligationDate:String(x.competenceDate||x.date).slice(0,10),competenceDate:String(x.competenceDate||x.date).slice(0,10),dueDate:x.dueDate?String(x.dueDate).slice(0,10):'',paidDate:x.status==='Previsto'?'':String(x.date).slice(0,10),amount:currency(x.amount),nature:x.kind==='MANUAL'?(currency(x.amount)<0?'Despesa manual':'Receita manual'):x.kind==='PURCHASE_SETTLEMENT'?'Compra de estoque a pagar':'Recebimento de conta mensal',category:x.category||'',accountId:x.accountId,account:metadata.accountName||'',origin:x.description||'',status:x.status,dreImpact:metadata.dreImpact===true,sourceType:x.kind==='MANUAL'?'manual_finance_entry':x.kind==='PURCHASE_SETTLEMENT'?'stock_purchase':'client_receivable_settlement',sourceId:x.sourceId||'',central:true,createdAt:x.createdAt,clientId:x.clientId||''};
 }
 async function hydrate(unitList,from='2000-01-01',to='2099-12-31'){
  const access=unitList.filter(validUnit);
  const reads=await Promise.all(access.map(async unit=>{
   const [accounts,entries,receivables,payables]=await Promise.all([
    request('/api/v1/finance/accounts',unit),
    request('/api/v1/finance/entries?from='+from+'&to='+to,unit),
    request('/api/v1/finance/receivables',unit),
    request('/api/v1/finance/purchase-payables',unit)
   ]);
   return{unit,accounts,entries,receivables,payables};
  }));
  const db=state();if(!db)return;
  const covered=new Set(access);
  const isCovered=row=>covered.has(map[row.unitId]||row.unitId);
  db.demoFinancialEntries=(db.demoFinancialEntries||[]).filter(x=>!isCovered(x)||!['manual_finance_entry','stock_purchase','client_receivable_settlement'].includes(x.sourceType));
  db.financialAccounts=(db.financialAccounts||[]).filter(x=>!isCovered(x));
  db.clientReceivables=(db.clientReceivables||[]).filter(x=>!isCovered(x));
  db.clientReceivablePayments=(db.clientReceivablePayments||[]).filter(x=>!x.central||!isCovered(x));
  for(const {unit,accounts,entries,receivables,payables} of reads){
   for(const a of accounts||[])db.financialAccounts.push({...a,unitId:local[unit]||unit,central:true});
   for(const e of entries||[]){
    if(e.kind==='MANUAL'||e.kind==='PURCHASE_SETTLEMENT')db.demoFinancialEntries.push(entryLocal(e));
    if(e.kind==='MONTHLY_RECEIPT')db.clientReceivablePayments.push({id:e.id,clientId:e.clientId,unitId:local[unit]||unit,date:String(e.date).slice(0,10),amount:currency(e.amount),methodId:({PIX:'pm_pix',CASH:'pm_cash',DEBIT_CARD:'pm_debit',CREDIT_CARD:'pm_credit',TRANSFER:'pm_transfer'})[e.metadata?.method]||'pm_other',accountId:e.accountId,allocations:e.metadata?.allocations||[],central:true});
   }
   for(const rv of receivables||[])if(!db.clientReceivables.some(x=>x.id===rv.id))db.clientReceivables.push({id:rv.id,clientId:rv.clientId,unitId:local[rv.unitId]||rv.unitId,commandId:rv.legacyPayload?.commandId||'',date:String(rv.sourceDate||rv.createdAt).slice(0,10),dueDate:rv.dueDate?String(rv.dueDate).slice(0,10):'',originalAmount:currency(rv.originalAmount),balance:currency(rv.balance),status:rv.status==='PAID'?'Quitado':rv.status==='PARTIAL'?'Parcial':'Em aberto',central:true});
   for(const p of payables||[]){let row=(db.stockPurchases||[]).find(x=>x.id===p.id);if(row){row.financeUnitId=local[unit]||unit;row.financeStatus=p.financeStatus;row.paidDate=p.settlement?.date?String(p.settlement.date).slice(0,10):'';row.paidAccountId=p.settlement?.accountId||'';}}
  }
  window.__a3FinanceHydratedAt=Date.now();
 }
 async function receipts(from,to,unitList){
  const all=await Promise.all(unitList.map(u=>request('/api/v1/finance/reports/receipt-summary?from='+from+'&to='+to,u)));
  const combined=[];const seen=new Set();
  for(const group of all)for(const receipt of group.receipts||[]){if(seen.has(receipt.id))continue;seen.add(receipt.id);combined.push(receipt);}
  reportRows=combined;window.__a3FinanceCashSummaries=all;return all;
 }
 const baseClosed=typeof financeClosedCashRows==='function'?financeClosedCashRows:window.financeClosedCashRows;
 function centralClosedRows(){
  if(!session())return typeof baseClosed==='function'?baseClosed():[];
  const groups=new Map();
  for(const r of reportRows){
   const k=[r.unitId,r.cashSessionId,r.accountId||''].join('|');
   if(!groups.has(k))groups.set(k,[]);
   groups.get(k).push(r);
  }
  return [...groups].map(([k,rows])=>{
   const first=rows[0],unit=local[first.unitId]||first.unitId,movs=rows.map(p=>({id:'finance:'+p.id,unitId:unit,amount:currency(p.amount),paymentMethod:({CASH:'Dinheiro',PIX:'Pix',DEBIT_CARD:'Cartão débito',CREDIT_CARD:'Cartão crédito'})[p.method]||p.method,accountId:p.accountId||'',date:p.date,processorFee:currency(p.processorFee||0),central:true}));
   return{id:'a3_cash_'+k,sourceType:'cash_closure',unitId:unit,date:first.date,referenceDate:first.date,accountId:first.accountId||'',account:(state()?.financialAccounts||[]).find(x=>x.id===first.accountId)?.name||'Conta financeira',cashSessionId:first.cashSessionId,amount:movs.reduce((a,b)=>a+b.amount,0),nature:'Fechamento de caixa',category:'Recebimentos',origin:'Recebimentos centrais confirmados',status:'Efetivado',dreImpact:false,movementIds:movs.map(x=>x.id),movements:movs,central:true};
  });
 }
 window.financeClosedCashRows=centralClosedRows;
 try{financeClosedCashRows=centralClosedRows}catch{}
 window.__a3Finance={request,hydrate,receipts,centralClosedRows};

 const oldEntry=window.saveFinanceEntry;
 if(oldEntry)window.saveFinanceEntry=async function(){
  if(!session()){if(production()){errorMessage(Error('Faça login no backend antes de registrar finanças'));return false}return oldEntry.apply(this,arguments)}
  const unit=map[input('finEntryUnit')]||selected(),accountId=input('finEntryAccount'),date=input('finEntryDate'),status=input('finEntryStatus')||'Efetivado',amount=currency(input('finEntryAmount'));
  const acc=(state()?.financialAccounts||[]).find(x=>x.id===accountId);
  if(!acc){errorMessage(Error('Selecione uma conta financeira'));return false}
  try{
   await needAccount(accountId,unit);
   const row=await request('/api/v1/finance/entries',unit,{method:'POST',key:keyFor(),body:{direction:input('finEntryDirection')||'income',amount,status,date,competenceDate:date,dueDate:input('finEntryDueDate')||'',accountId,category:(state()?.financeCategories||[]).find(x=>x.id===input('finEntryCategory'))?.name||'Outros',description:input('finEntryDesc')||'Lançamento manual',dreImpact:(state()?.financeCategories||[]).find(x=>x.id===input('finEntryCategory'))?.dre!==false,cashSessionId:status==='Efetivado'&&acc.type==='CASH'?cashSession(unit,date):undefined}});
   await hydrate([unit]);clearKey();window.closeModal?.();window.renderFinance?.();window.toast?.('Lançamento confirmado no PostgreSQL');return row;
  }catch(e){errorMessage(e);return false}
 };
 try{saveFinanceEntry=window.saveFinanceEntry}catch{}

 const oldAccount=window.saveFinanceAccount;
 if(oldAccount)window.saveFinanceAccount=async function(){
  if(!session()){if(production()){errorMessage(Error('Cadastro financeiro central exige autenticação'));return false}return oldAccount.apply(this,arguments)}
  const before=JSON.stringify(state()?.financialAccounts||[]);
  try{
   const result=oldAccount.apply(this,arguments);
   const id=arguments[0],a=(state()?.financialAccounts||[]).find(x=>x.id===id);
   if(!a)throw Error('Conta local não encontrada');
   await registerAccount(a);await hydrate([map[a.unitId]||a.unitId]);
   return result;
  }catch(e){if(state())state().financialAccounts=JSON.parse(before);errorMessage(e);return false}
 };
 try{saveFinanceAccount=window.saveFinanceAccount}catch{}

 const oldMonthly=window.saveClientMonthlySettlement;
 if(oldMonthly)window.saveClientMonthlySettlement=async function(clientId){
  if(!session()){if(production()){errorMessage(Error('Conta Mensal exige conexão ao banco central'));return false}return oldMonthly.apply(this,arguments)}
  const accountId=input('cmPayAccount'),acc=(state()?.financialAccounts||[]).find(x=>x.id===accountId),unit=map[acc?.unitId]||acc?.unitId,date=input('cmPayDate')||new Date().toISOString().slice(0,10);
  try{
   await needAccount(accountId,unit);
   const method=({pm_cash:'CASH',pm_pix:'PIX',pm_debit:'DEBIT_CARD',pm_credit:'CREDIT_CARD',pm_transfer:'TRANSFER'})[input('cmPayMethod')]||'OTHER';
   const pay=await request('/api/v1/finance/receivables/settle',unit,{method:'POST',key:keyFor(),body:{clientId,accountId,amount:currency(input('cmPayAmount')),date,method,cashSessionId:cashSession(unit,date)}});
   await hydrate(units('finance.read'));clearKey();window.closeModal?.();window.openClient?.(clientId,'conta_mensal');window.toast?.('Conta Mensal baixada no PostgreSQL');return pay;
  }catch(e){errorMessage(e);return false}
 };
 try{saveClientMonthlySettlement=window.saveClientMonthlySettlement}catch{}

 const oldPurchasePayment=window.saveStockPurchasePayment;
 if(oldPurchasePayment)window.saveStockPurchasePayment=async function(purchaseId){
  if(!session()){if(production()){errorMessage(Error('Pagamento de compra exige banco central'));return false}return oldPurchasePayment.apply(this,arguments)}
  const purchase=(state()?.stockPurchases||[]).find(p=>p.id===purchaseId);
  const unit=map[purchase?.financeUnitId]||purchase?.financeUnitId,accountId=input('stkBuyPayAccount'),date=input('stkBuyPayDate')||new Date().toISOString().slice(0,10);
  try{
   await needAccount(accountId,unit);
   const account=(state()?.financialAccounts||[]).find(a=>a.id===accountId);
   const row=await request('/api/v1/finance/purchase-payables/'+encodeURIComponent(purchaseId)+'/settle',unit,{method:'POST',key:keyFor(),body:{accountId,date,cashSessionId:account?.type==='CASH'?cashSession(unit,date):undefined}});
   await hydrate([unit]);clearKey();window.closeModal?.();window.renderStockPurchases?.();window.toast?.('Obrigação da compra liquidada no PostgreSQL');return row;
  }catch(e){errorMessage(e);return false}
 };
 try{saveStockPurchasePayment=window.saveStockPurchasePayment}catch{}

 const oldRenderReports=window.renderReports;
 if(oldRenderReports)window.renderReports=async function(){
  if(!session())return oldRenderReports.apply(this,arguments);
  if(reporting)return false;reporting=true;
  try{
   const f=reportState(),from=f.from||'2000-01-01',to=f.to||'2099-12-31',unit=f.unit&&f.unit!=='all'?[map[f.unit]||f.unit]:units('reports.read');
   if(!unit.length)throw Error('Sem unidades autorizadas para relatórios');
   await receipts(from,to,unit);await hydrate(units('finance.read'),from,to);
   return oldRenderReports.apply(this,arguments);
  }catch(e){if(typeof adminPage!=='undefined')adminPage.innerHTML='<div class="inline-note">Relatório financeiro central não verificado: '+String(e.message).replace(/[<>]/g,'')+'</div>';errorMessage(e);return false}finally{reporting=false}
 };
 try{renderReports=window.renderReports}catch{}

 const oldRenderFinance=window.renderFinance;
 if(oldRenderFinance)window.renderFinance=async function(){
  if(!session())return oldRenderFinance.apply(this,arguments);
  if(refreshing)return false;refreshing=true;
  try{await hydrate(units('finance.read'));await receipts('2000-01-01','2099-12-31',units('reports.read'));return oldRenderFinance.apply(this,arguments)}
  catch(e){if(typeof adminPage!=='undefined')adminPage.innerHTML='<div class="inline-note">Financeiro central indisponível: '+String(e.message).replace(/[<>]/g,'')+'</div>';return false}
  finally{refreshing=false}
 };
 try{renderFinance=window.renderFinance}catch{}
})();
