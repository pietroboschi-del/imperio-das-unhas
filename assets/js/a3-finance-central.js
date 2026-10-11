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
 let pendingAccounts=[],legacyHistoryCount=0;
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
 const configOf=a=>({paymentMethodIds:Array.isArray(a?.paymentMethodIds)?a.paymentMethodIds:[],feeRules:a?.feeRules||{},details:a?.details||{},previousNames:a?.previousNames||[]});
 const normalizedAccount=a=>({...a,unitId:local[a.unitId]||a.unitId,...configOf(a.metadata||a),central:true});
 const snapshot=a=>JSON.stringify({name:a.name,type:a.type,active:a.active!==false,metadata:configOf(a)});
 async function registerAccount(a,prior){
  const unit=map[a?.unitId]||a?.unitId;
  if(!validUnit(unit))throw Error('Conta sem unidade financeira válida');
  return request('/api/v1/finance/accounts',unit,{method:'POST',body:{
   id:a.id,name:a.name,type:a.type||'BANK',active:a.active!==false,unitId:unit,
   metadata:configOf(a),...(prior?{expectedUpdatedAt:prior.updatedAt}:{})
  }});
 }
 async function needAccount(id,unit){
  // No implicit account creation/update. Backend accounts, not local projections, authorize money.
  const rows=await request('/api/v1/finance/accounts',unit);
  const account=rows.find(a=>a.id===id&&a.unitId===unit&&a.active!==false);
  if(!account)throw Error('Conta não reconciliada ou inativa no PostgreSQL; abra Contas para reconciliar');
  return account;
 }
 async function paged(path,unit){
  let cursor='',out=[];
  for(let page=0;page<10000;page++){
   const sep=path.includes('?')?'&':'?';
   const rows=await request(path+(cursor?sep+'cursor='+encodeURIComponent(cursor):''),unit);
   if(!Array.isArray(rows))throw Error('Consulta financeira paginada inválida');
   if(rows.length&&rows.some((x,i)=>!x.id||(i>0&&x.id<=rows[i-1].id)))throw Error('Resposta financeira sem ordem estável');
   out.push(...rows);
   if(rows.length<500)return out;
   const next=rows[rows.length-1].id;
   if(next===cursor)throw Error('Cursor repetido');
   cursor=next;
  }
  throw Error('Limite excepcional de paginação; relatório não foi exibido incompleto');
 }
 async function reconcileAccounts(){
  if(!session())throw Error('Autenticação central obrigatória');
  const pending=[...pendingAccounts];
  if(!pending.length)return false;
  if(!confirm('Foram encontradas '+pending.length+' contas locais sem equivalência confirmada no PostgreSQL. Revisar e enviar estas configurações, uma a uma, ao servidor? Nada será migrado sem sua confirmação.'))return false;
  for(const {localAccount,centralAccount} of pending){
   const unit=map[localAccount.unitId]||localAccount.unitId;
   const detail=centralAccount?'Conta central existente com informações divergentes.':'Conta ainda não cadastrada no backend.';
   if(!confirm(detail+'\n'+localAccount.name+' ('+unit+')\nConfirmar esta configuração como versão oficial?'))continue;
   await registerAccount(localAccount,centralAccount);
  }
  return hydrate(units('finance.read'));
 }
 window.__a3FinanceResolveAccounts=()=>reconcileAccounts().catch(errorMessage);
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
  const access=[...new Set(unitList.filter(validUnit))];
  const reads=await Promise.all(access.map(async unit=>{
   const [accounts,entries,receivables,payables]=await Promise.all([
    request('/api/v1/finance/accounts',unit),
    paged('/api/v1/finance/entries?from='+from+'&to='+to,unit),
    paged('/api/v1/finance/receivables',unit),
    paged('/api/v1/finance/purchase-payables',unit)
   ]);
   return{unit,accounts,entries,receivables,payables};
  }));
  const db=state();if(!db)return;
  const covered=new Set(access);
  const isCovered=row=>covered.has(map[row.unitId]||row.unitId);
  pendingAccounts=[];
  // Reconcile before replacing projections; never overwrite accounts silently.
  for(const {unit,accounts} of reads){
   const source=(db.financialAccounts||[]).filter(a=>!a.central&&!a._a3Draft&&(map[a.unitId]||a.unitId)===unit);
   for(const a of source){
    const central=accounts.find(x=>x.id===a.id);
    if(!central||snapshot(a)!==snapshot(normalizedAccount(central)))pendingAccounts.push({localAccount:structuredClone(a),centralAccount:central||null});
   }
  }
  window.__a3AccountsPending=pendingAccounts.map(({localAccount:a,centralAccount:c})=>({id:a.id,unitId:a.unitId,name:a.name,reason:c?'divergent':'missing'}));
  if(pendingAccounts.length)throw Error(pendingAccounts.length+' conta(s) aguardam reconciliação. Use Revisar contas antes de usar os relatórios.');
  // Keep a read-only copy of all unvalidated local facts; never count these as central revenue.
  db.a3LegacyFinanceArchive=db.a3LegacyFinanceArchive||{entries:[],receivables:[],payments:[]};
  const quarantine=(field,dest)=>{
   const old=db.a3LegacyFinanceArchive[dest]||[],known=new Set(old.map(x=>x.id));
   for(const row of db[field]||[])if(isCovered(row)&&!row.central&&!known.has(row.id)){old.push(structuredClone(row));known.add(row.id)}
   db.a3LegacyFinanceArchive[dest]=old;
   db[field]=(db[field]||[]).filter(x=>!isCovered(x));
  };
  quarantine('demoFinancialEntries','entries');
  quarantine('clientReceivables','receivables');
  quarantine('clientReceivablePayments','payments');
  legacyHistoryCount=Object.values(db.a3LegacyFinanceArchive).reduce((sum,items)=>sum+items.length,0);
  window.__a3UnreconciledHistoryCount=legacyHistoryCount;
  db.financialAccounts=(db.financialAccounts||[]).filter(x=>!isCovered(x));
  for(const {unit,accounts,entries,receivables,payables} of reads){
   for(const a of accounts||[])db.financialAccounts.push(normalizedAccount(a));
   for(const e of entries||[]){
    if(e.kind==='MANUAL'||e.kind==='PURCHASE_SETTLEMENT')db.demoFinancialEntries.push(entryLocal(e));
    if(e.kind==='MONTHLY_RECEIPT')db.clientReceivablePayments.push({id:e.id,clientId:e.clientId,unitId:local[unit]||unit,date:String(e.date).slice(0,10),amount:currency(e.amount),methodId:({PIX:'pm_pix',CASH:'pm_cash',DEBIT_CARD:'pm_debit',CREDIT_CARD:'pm_credit',TRANSFER:'pm_transfer'})[e.metadata?.method]||'pm_other',accountId:e.accountId,allocations:(e.metadata?.allocations||[]).map(x=>({...x,unitId:local[x.sourceUnitId]||x.sourceUnitId})),central:true});
   }
   for(const rv of receivables||[])if(!db.clientReceivables.some(x=>x.id===rv.id&&x.central))db.clientReceivables.push({id:rv.id,clientId:rv.clientId,unitId:local[rv.unitId]||rv.unitId,commandId:rv.legacyPayload?.commandId||'',date:String(rv.sourceDate||rv.createdAt).slice(0,10),dueDate:rv.dueDate?String(rv.dueDate).slice(0,10):'',originalAmount:currency(rv.originalAmount),balance:currency(rv.balance),status:rv.status==='PAID'?'Quitado':rv.status==='PARTIAL'?'Parcial':'Em aberto',central:true});
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
   if(r.source==='manual')continue; // already included once as an authoritative MANUAL ledger entry
   const k=[r.date,r.unitId,r.cashSessionId||'',r.accountId||''].join('|');
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
 const baseNonReceipt=typeof financeNonReceiptRows==='function'?financeNonReceiptRows:window.financeNonReceiptRows;
 function centralNonReceiptRows(){
  if(!session())return typeof baseNonReceipt==='function'?baseNonReceipt():[];
  return (typeof baseNonReceipt==='function'?baseNonReceipt():[]).filter(x=>x.central===true);
 }
 window.financeNonReceiptRows=centralNonReceiptRows;
 try{financeNonReceiptRows=centralNonReceiptRows}catch{}
 window.__a3Finance={request,paged,hydrate,receipts,centralClosedRows,centralNonReceiptRows,reconcileAccounts,accountPending:()=>pendingAccounts};
 function reportErrorMessage(e,label){
  if(typeof adminPage!=='undefined')adminPage.innerHTML='<div class="inline-note"><b>'+label+':</b> '+String(e.message).replace(/[<>]/g,'')+'</div>'+
    (pendingAccounts.length?'<button class="btn btn-primary" onclick="window.__a3FinanceResolveAccounts()">Revisar contas existentes</button>':'');
  errorMessage(e);
 }


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
 const oldAccountNew=window.openFinanceAccountNew;
 if(oldAccount)window.saveFinanceAccount=async function(id){
  if(!session()){if(production()){errorMessage(Error('Cadastro financeiro central exige autenticação'));return false}return oldAccount.apply(this,arguments)}
  const prior=(state()?.financialAccounts||[]).find(x=>x.id===id),unit=map[input('finAccUnit')||prior?.unitId]||input('finAccUnit')||map[prior?.unitId],name=input('finAccName').trim();
  if(!validUnit(unit)||!name){errorMessage(Error('Informe nome e unidade válidos'));return false}
  const account={
   id,unitId:unit,name,type:input('finAccType'),active:!!document.getElementById('finAccActive')?.checked,
   paymentMethodIds:[...document.querySelectorAll('.fin-acc-method:checked')].map(x=>x.value),
   details:{...prior?.details,institution:input('finAccInstitution').trim(),internalCode:input('finAccInternal').trim()},
   previousNames:prior?.previousNames||[],
   feeRules:Object.fromEntries([...document.querySelectorAll('[data-fin-rule]')].map(tr=>{
    const mid=tr.getAttribute('data-fin-rule');return [mid,{
     percent:Number(tr.querySelector('.fin-rule-percent')?.value||0),
     fixed:Number(tr.querySelector('.fin-rule-fixed')?.value||0),
     settlementDays:Number(tr.querySelector('.fin-rule-days')?.value||0)
    }];
   }))
  };
  try{
   const remote=await request('/api/v1/finance/accounts',unit);
   const existing=remote.find(x=>x.id===id);
   if(existing&&prior?.central!==true)throw Error('Conta local não reconciliada; use Revisar contas primeiro');
   await registerAccount(account,existing||null);
   if(prior?._a3Draft)state().financialAccounts=state().financialAccounts.filter(a=>a!==prior);
   await hydrate([unit]);clearKey();window.closeModal?.();window.renderFinanceAccounts?.();window.toast?.('Conta salva no PostgreSQL');return true;
  }catch(e){errorMessage(e);return false}
 };
 try{saveFinanceAccount=window.saveFinanceAccount}catch{}
 if(typeof openFinanceAccountNew==='function')window.openFinanceAccountNew=function(){
  if(!production())return oldAccountNew.apply(this,arguments);
  if(!session()){errorMessage(Error('Acesso central necessário'));return false}
  const unit=selected(),id='fa_'+crypto.randomUUID().replaceAll('-','');
  if(!validUnit(unit)){errorMessage(Error('Selecione uma unidade'));return false}
  state().financialAccounts.push({id,unitId:local[unit]||unit,name:'Nova conta',type:'BANK',active:true,paymentMethodIds:[],feeRules:{},details:{},_a3Draft:true});
  window.openFinanceAccount?.(id,true);return true;
 };
 try{openFinanceAccountNew=window.openFinanceAccountNew}catch{}
 const oldDraftDelete=window.financeAccountDeleteDraft;
 if(typeof oldDraftDelete==='function')window.financeAccountDeleteDraft=function(id){
  const a=(state()?.financialAccounts||[]).find(x=>x.id===id);
  if(!production())return oldDraftDelete.apply(this,arguments);
  if(a?._a3Draft){state().financialAccounts=state().financialAccounts.filter(x=>x.id!==id);window.closeModal?.();return true}
  throw Error('Conta central não pode ser excluída como rascunho');
 };
 try{financeAccountDeleteDraft=window.financeAccountDeleteDraft}catch{}
 const oldMonthlyOpen=window.openClientMonthlySettlement;
 function monthlyChoices(clientId){
  const acct=(state()?.financialAccounts||[]).find(x=>x.id===input('cmPayAccount'));
  const source=map[acct?.unitId]||acct?.unitId;
  return (state()?.clientReceivables||[]).filter(r=>r.central&&r.clientId===clientId&&currency(r.balance)>0&&(map[r.unitId]||r.unitId)===source);
 }
 function renderMonthlyChoices(clientId){
  const host=document.getElementById('a3MonthlyChoices');if(!host)return;
  const list=monthlyChoices(clientId);
  host.innerHTML='<label>Selecione as comandas/obrigações a receber nesta unidade</label>'+
   (list.length?list.map(r=>'<label style="display:block;padding:6px"><input type="checkbox" class="a3-receivable" value="'+String(r.id).replace(/[<>"']/g,'')+'"> '+(r.commandId||r.id)+' — R$ '+currency(r.balance).toFixed(2)+' — '+(map[r.unitId]||r.unitId)+'</label>').join(''):'<p>Nenhum recebível central desta unidade disponível.</p>');
 }
 if(oldMonthlyOpen)window.openClientMonthlySettlement=function(clientId){
  if(!session()){if(production()){errorMessage(Error('Conta Mensal exige conexão central'));return false}return oldMonthlyOpen.apply(this,arguments)}
  const result=oldMonthlyOpen.apply(this,arguments);
  const inputEl=document.getElementById('cmPayAmount');
  if(!inputEl)return result;
  const host=document.createElement('div');host.id='a3MonthlyChoices';host.className='field full';
  inputEl.closest('.field')?.insertAdjacentElement('beforebegin',host);
  const acc=document.getElementById('cmPayAccount');
  acc?.addEventListener('change',()=>renderMonthlyChoices(clientId));
  renderMonthlyChoices(clientId);return result;
 };
 try{openClientMonthlySettlement=window.openClientMonthlySettlement}catch{}
 const oldMonthly=window.saveClientMonthlySettlement;
 if(oldMonthly)window.saveClientMonthlySettlement=async function(clientId){
  if(!session()){if(production()){errorMessage(Error('Conta Mensal exige conexão central'));return false}return oldMonthly.apply(this,arguments)}
  const accountId=input('cmPayAccount'),acc=(state()?.financialAccounts||[]).find(x=>x.id===accountId),unit=map[acc?.unitId]||acc?.unitId,date=input('cmPayDate')||new Date().toISOString().slice(0,10);
  const receivableIds=[...document.querySelectorAll('.a3-receivable:checked')].map(x=>x.value);
  const selected=monthlyChoices(clientId).filter(x=>receivableIds.includes(x.id));
  if(!receivableIds.length||selected.length!==receivableIds.length){errorMessage(Error('Selecione as obrigações desta unidade que serão baixadas'));return false}
  const amount=currency(input('cmPayAmount'));
  if(!(amount>0)||amount>selected.reduce((sum,x)=>sum+currency(x.balance),0)+0.009){errorMessage(Error('Valor excede o saldo das obrigações selecionadas'));return false}
  try{
   await needAccount(accountId,unit);
   const method=({pm_cash:'CASH',pm_pix:'PIX',pm_debit:'DEBIT_CARD',pm_credit:'CREDIT_CARD',pm_transfer:'TRANSFER'})[input('cmPayMethod')]||'OTHER';
   const pay=await request('/api/v1/finance/receivables/settle',unit,{method:'POST',key:keyFor(),body:{clientId,accountId,receivableIds,amount,date,method,cashSessionId:cashSession(unit,date)}});
   await hydrate(units('finance.read'));clearKey();window.closeModal?.();window.openClient?.(clientId,'conta_mensal');window.toast?.('Baixa confirmada no PostgreSQL');return pay;
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
   await receipts('2000-01-01','2099-12-31',unit);await hydrate(units('finance.read'));
   return oldRenderReports.apply(this,arguments);
  }catch(e){reportErrorMessage(e,'Relatório financeiro central indisponível');return false}finally{reporting=false}
 };
 try{renderReports=window.renderReports}catch{}

 const oldRenderFinance=window.renderFinance;
 if(oldRenderFinance)window.renderFinance=async function(){
  if(!session())return oldRenderFinance.apply(this,arguments);
  if(refreshing)return false;refreshing=true;
  try{await hydrate(units('finance.read'));await receipts('2000-01-01','2099-12-31',units('reports.read'));return oldRenderFinance.apply(this,arguments)}
  catch(e){reportErrorMessage(e,'Financeiro central indisponível');return false}
  finally{refreshing=false}
 };
 try{renderFinance=window.renderFinance}catch{}
})();
