
/* ===== V54 · ETAPA 2: CAIXA E FINANCEIRO ===== */
(function(){
 const V54_SCHEMA=54, MIGRATION_ID='v54-cash-finance-sessions';
 function v54UnitExists(id){return !!id&&(db.units||[]).some(u=>u.id===id)}
 function v54SelectedUnit(){let id=document.getElementById('unitPicker')?.value||'';return v54UnitExists(id)?id:''}
 function v54AccountByIdOrName(id,name,unitId=''){
  if(id){let a=(db.financialAccounts||[]).find(x=>x.id===id);if(a)return a}
  let rows=(db.financialAccounts||[]).filter(a=>a.name===name||(Array.isArray(a.previousNames)&&a.previousNames.includes(name)));
  if(unitId){let same=rows.find(a=>a.unitId===unitId);if(same)return same}
  return rows.length===1?rows[0]:null
 }
 function v54SessionCandidates(unitId,date){return (db.cashSessions||[]).filter(s=>s.unitId===unitId&&s.date===date).sort((a,b)=>String(b.openedAt||'').localeCompare(String(a.openedAt||'')))}
 function v54SessionFor(unitId,date){return v54SessionCandidates(unitId,date)[0]||null}
 function v54RequireUnit(unitId,label='operação'){if(v54UnitExists(unitId))return true;toast(`Selecione uma unidade válida antes de ${label}.`);return false}
 function v54RequireOpenSession(unitId,date,label='registrar a movimentação'){
  if(!v54RequireUnit(unitId,label))return null;let s=v54SessionFor(unitId,date);
  if(!s){toast(`Abra o Caixa de ${formatDateBR(date)} antes de ${label}.`);return null}
  if(s.status!=='open'){toast(`O Caixa de ${formatDateBR(date)} está fechado. Reabra-o explicitamente antes de ${label}.`);return null}
  return s
 }
 function v54ResolveMovementAccount(m){return v54AccountByIdOrName(m.accountId,m.account,m.accountUnitId||m.unitId)}
 function v54MovementIsPhysical(m){
  if(m?.physicalImpact===true)return true;if(m?.physicalImpact===false)return false;
  let a=v54ResolveMovementAccount(m),t=String(m?.type||'');
  return m?.paymentMethod==='Dinheiro'||a?.type==='CASH'||t==='Suprimento'||t.startsWith('Sangria')||t==='Vale a funcionário'
 }
 function v54TagMovement(m,s,account=null){
  if(!m||!s)return;m.cashSessionId=s.id;m.sessionUnitId=s.unitId;m.sessionDate=s.date;
  let a=account||v54ResolveMovementAccount(m);if(a){m.accountId=m.accountId||a.id;m.accountUnitId=a.unitId;m.account=m.account||a.name}
  if(m.physicalImpact===undefined)m.physicalImpact=v54MovementIsPhysical(m)
 }
 function v54TagNewCash(start,s){for(const m of (db.demoCashMovements||[]).slice(start))v54TagMovement(m,s)}
 function v54TagNewFinance(start,s=null){for(const e of (db.demoFinancialEntries||[]).slice(start)){let a=v54AccountByIdOrName(e.accountId,e.account,e.accountUnitId||e.unitId);if(a){e.accountId=e.accountId||a.id;e.accountUnitId=a.unitId;e.account=e.account||a.name}if(s&&a?.unitId===s.unitId&&e.date===s.date)e.cashSessionId=s.id}}
 function v54MirrorFinanceToPhysicalCash(entry,account,session){
  if(!entry||!account||account.type!=='CASH'||entry.status==='Previsto'||!session)return null;
  let old=(db.demoCashMovements||[]).find(m=>m.financialEntryId===entry.id);if(old){v54TagMovement(old,session,account);return old}
  let m={id:`cm_fin_${entry.id}`,unitId:account.unitId,amount:Number(entry.amount||0),paymentMethod:'Dinheiro',accountId:account.id,accountUnitId:account.unitId,account:account.name,type:Number(entry.amount||0)>=0?'Entrada financeira em Caixa':'Saída financeira de Caixa',cashNature:'financial_entry',date:entry.date,createdAt:entry.createdAt||new Date().toISOString(),user:entry.createdBy||currentUserName(),note:entry.origin||entry.nature||'Lançamento financeiro',processorFee:0,cashSessionId:session.id,physicalImpact:true,financialEntryId:entry.id,sourceType:'financial_entry',sourceId:entry.id};
  db.demoCashMovements.push(m);entry.cashSessionId=session.id;entry.physicalCashMovementId=m.id;entry.accountId=account.id;entry.accountUnitId=account.unitId;return m
 }
 function v54AllocationByUnit(alloc){let out={};for(const a of alloc||[])out[a.unitId]=(out[a.unitId]||0)+Number(a.amount||0);return Object.entries(out).map(([unitId,amount])=>({unitId,amount:Number(amount.toFixed(2))}))}
 function v54WithSessionCapture(session,fn){
  let ca=db.demoCashMovements,fe=db.demoFinancialEntries,au=db.cashAudits;
  let install=(arr,handler)=>{if(!arr)return;Object.defineProperty(arr,'push',{configurable:true,writable:true,enumerable:false,value:function(...items){items.forEach(handler);return Array.prototype.push.apply(arr,items)}})};
  install(ca,m=>v54TagMovement(m,session));install(fe,e=>{let a=v54AccountByIdOrName(e.accountId,e.account,e.accountUnitId||e.unitId);if(a){e.accountId=e.accountId||a.id;e.accountUnitId=a.unitId}if((e.unitId===session.unitId||a?.unitId===session.unitId)&&e.date===session.date)e.cashSessionId=session.id});install(au,a=>{if(a.unitId===session.unitId&&a.date===session.date)a.cashSessionId=session.id});
  try{return fn()}finally{try{delete ca.push}catch{}try{delete fe.push}catch{}try{delete au.push}catch{}}
 }
 function v54WithDeferredSave(fn){let old=save,requested=false,lastOptions={};save=function(options={}){requested=true;lastOptions=options||{};return true};let result;try{result=fn()}finally{save=old}return {result,requested,lastOptions,flush(){return requested?old(lastOptions):true}}}

 // Sem fallback silencioso para unidade no Caixa/Financeiro.
 cashUnitId=function(){return v54SelectedUnit()};
 financeUnitId=function(){return v54SelectedUnit()};
 cashSessionFor=function(uid=cashUnitId(),date=cashDate){return uid&&date?v54SessionFor(uid,date):null};
 cashMovementsFor=function(uid=cashUnitId(),date=cashDate){
  if(!uid||!date)return[];let s=v54SessionFor(uid,date),rows=(db.demoCashMovements||[]);
  if(s)return rows.filter(m=>m.cashSessionId===s.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return rows.filter(m=>!m.cashSessionId&&m.unitId===uid&&m.date===date).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
 };
 cashIsPhysicalMovement=v54MovementIsPhysical;

 function v54CommandUsesMonthly(c){return !!c&&(!!c.receivableOpen||(c.paymentRecords||[]).some(p=>p.methodId==='pm_monthly')||(c.payments||[]).some(x=>/^Conta mensal/i.test(String(x||''))))}
 const _v54FinanceSyntheticEntriesBase=financeSyntheticEntries;
 financeSyntheticEntries=function(){return _v54FinanceSyntheticEntriesBase().filter(e=>{if(e._source!=='history')return true;let id=String(e.id||'');if(!id.startsWith('hist_'))return true;let c=(db.clientCommands||[]).find(x=>'hist_'+x.id===id);return !v54CommandUsesMonthly(c)})};

 saveOpenCashSession=function(){
  let uid=cashUnitId();if(!v54RequireUnit(uid,'abrir o Caixa'))return;if(v54SessionFor(uid,cashDate)){toast('Já existe uma sessão de Caixa para esta unidade e data. Se estiver fechada, use Reabrir caixa.');return}
  let opening=Math.max(0,Number(document.getElementById('cashOpeningAmount')?.value||0)),now=new Date(),id='cs'+Date.now();
  let s={id,unitId:uid,date:cashDate,status:'open',openingAmount:opening,openedAt:now.toISOString(),openedBy:currentUserName(),closedAt:null,closedBy:null,countedAmount:null,systemExpected:null,difference:null,closureHistory:[],reopenCount:0};db.cashSessions.push(s);
  db.cashAudits.push({id:'ca'+Date.now(),cashSessionId:id,unitId:uid,date:cashDate,action:'Abertura',user:currentUserName(),at:now.toISOString(),note:`Saldo inicial ${money(opening)}`});save();closeModal();renderCash();toast('Caixa aberto ✓')
 };

 const _v54SaveCashAdjustment=saveCashAdjustment;
 saveCashAdjustment=function(type){let uid=cashUnitId(),s=v54RequireOpenSession(uid,cashDate,`registrar ${String(type||'movimentação').toLowerCase()}`);if(!s)return;v54WithSessionCapture(s,()=>_v54SaveCashAdjustment(type))};

 saveCloseCash=function(){
  let t=cashTotals(),s=t.session;if(!s||s.status!=='open'){toast('Não há sessão de Caixa aberta para fechar.');return}
  let counted=Math.max(0,Number(document.getElementById('cashCounted')?.value||0)),now=new Date(),note=document.getElementById('cashCloseNote')?.value.trim()||'',snap={received:t.received,cash:t.cash,pix:t.pix,cards:t.cards,fees:t.fees,sangrias:t.sangrias,expenses:t.expenses,advances:t.advances,transfers:t.transfers,tips:t.tips,physicalExpected:t.physicalExpected};
  s.closureHistory=Array.isArray(s.closureHistory)?s.closureHistory:[];let revision=s.closureHistory.length+1,closure={id:`${s.id}:close:${revision}`,revision,closedAt:now.toISOString(),closedBy:currentUserName(),systemExpected:t.physicalExpected,countedAmount:counted,difference:counted-t.physicalExpected,note,snapshot:structuredClone(snap),movementIds:t.ms.map(m=>m.id)};s.closureHistory.push(closure);
  s.status='closed';s.systemExpected=closure.systemExpected;s.countedAmount=counted;s.difference=closure.difference;s.closedAt=closure.closedAt;s.closedBy=closure.closedBy;s.closeNote=note;s.snapshot=structuredClone(snap);s.closedMovementIds=[...closure.movementIds];s.lastClosureId=closure.id;
  db.cashAudits.push({id:'ca'+Date.now(),cashSessionId:s.id,closureId:closure.id,closureRevision:revision,unitId:s.unitId,date:s.date,action:'Fechamento',user:currentUserName(),at:now.toISOString(),note,difference:s.difference,movementIds:[...closure.movementIds]});save();closeModal();renderCash();toast(Math.abs(s.difference)<.005?'Caixa fechado sem diferença ✓ · sessão congelada':`Caixa fechado · diferença ${money(s.difference)} · sessão congelada`)
 };
 saveReopenCash=function(id){
  let s=(db.cashSessions||[]).find(x=>x.id===id),reason=document.getElementById('cashReopenReason')?.value.trim()||'';if(!s)return;if(s.status!=='closed'){toast('Este Caixa não está fechado.');return}if(!reason){toast('Informe o motivo da reabertura');return}
  let now=new Date(),last=(s.closureHistory||[]).slice(-1)[0]||null;db.cashAudits.push({id:'ca'+Date.now(),cashSessionId:s.id,closureId:last?.id||s.lastClosureId||'',unitId:s.unitId,date:s.date,action:'Reabertura',user:currentUserName(),at:now.toISOString(),note:reason,previousDifference:s.difference,previousClosedAt:s.closedAt||''});
  s.status='open';s.reopenedAt=now.toISOString();s.reopenedBy=currentUserName();s.reopenReason=reason;s.reopenCount=Number(s.reopenCount||0)+1;save();closeModal();cashDate=s.date;cashTab='current';renderCash();toast('Caixa reaberto com registro de auditoria ✓')
 };

 const _v54SaveClientCredit=saveClientCredit;
 saveClientCredit=function(clientId){
  let type=document.getElementById('creditType')?.value||'Ajuste',paid=creditCreatesCash(type),unitId=paid?(document.getElementById('creditUnit')?.value||''):'',accountId=paid?(document.getElementById('creditAccount')?.value||''):'',acc=v54AccountByIdOrName(accountId,'',unitId),date=localDateISO(),s=null;if(paid){if(!v54RequireUnit(unitId,'receber o crédito'))return;if(!acc||acc.unitId!==unitId){toast('Selecione uma conta válida da mesma unidade.');return}s=v54RequireOpenSession(unitId,date,'receber o crédito');if(!s)return}
  if(!paid){_v54SaveClientCredit(clientId);return}v54WithSessionCapture(s,()=>_v54SaveClientCredit(clientId))
 };

 const _v54FinalizeCommandPayment=finalizeCommandPayment;
 finalizeCommandPayment=function(cmdId){
  let c=(db.clientCommands||[]).find(x=>x.id===cmdId);if(!c)return;try{paymentReadDraft(c)}catch(e){}let plans=(c.paymentDraft||[]).filter(p=>Number(p.amount||0)>0&&!['pm_direct','pm_barter','pm_monthly'].includes(p.methodId)),date=localDateISO(),s=null;if(plans.length){if(!v54RequireUnit(c.unitId,'finalizar a comanda'))return;for(const p of plans){let a=v54AccountByIdOrName(p.accountId,'',c.unitId);if(!a||a.unitId!==c.unitId){toast('Existe uma forma de pagamento sem conta válida da unidade. Revise o pagamento.');return}}s=v54RequireOpenSession(c.unitId,date,'finalizar a comanda');if(!s)return}
  if(!s){_v54FinalizeCommandPayment(cmdId);return}v54WithSessionCapture(s,()=>_v54FinalizeCommandPayment(cmdId))
 };

 saveFinanceEntry=function(){
  let dir=document.getElementById('finEntryDirection')?.value||'income',amount=Math.max(0,Number(document.getElementById('finEntryAmount')?.value||0));if(!(amount>0)){toast('Informe um valor válido');return}
  let unitId=document.getElementById('finEntryUnit')?.value||'';if(!v54RequireUnit(unitId,'salvar o lançamento financeiro'))return;let accId=document.getElementById('finEntryAccount')?.value||'',acc=v54AccountByIdOrName(accId,'',unitId);if(!acc||acc.unitId!==unitId){toast('Selecione uma conta válida da unidade.');return}
  let cat=db.financeCategories.find(c=>c.id===document.getElementById('finEntryCategory')?.value),status=document.getElementById('finEntryStatus')?.value||'Efetivado',date=document.getElementById('finEntryDate')?.value||financeToday,dueDate=document.getElementById('finEntryDueDate')?.value||'',desc=document.getElementById('finEntryDesc')?.value.trim()||'Lançamento manual',session=null;if(status!=='Previsto'&&acc.type==='CASH'){session=v54RequireOpenSession(acc.unitId,date,'movimentar a conta Caixa');if(!session)return}
  let e={id:'fe_manual_'+Date.now(),unitId,date,obligationDate:date,competenceDate:date,dueDate,paidDate:status==='Previsto'?'':date,amount:dir==='expense'?-amount:amount,nature:dir==='expense'?'Despesa manual':'Receita manual',category:cat?.name||'Outros',accountId:acc.id,accountUnitId:acc.unitId,account:acc.name,origin:desc,dreImpact:cat?.dre!==false,status,createdBy:currentUserName(),createdAt:new Date().toISOString(),sourceType:'manual_finance_entry'};db.demoFinancialEntries.push(e);if(session)v54MirrorFinanceToPhysicalCash(e,acc,session);save();closeModal();renderFinance();toast(acc.type==='CASH'&&status!=='Previsto'?'Lançamento salvo · Caixa físico atualizado ✓':'Lançamento financeiro salvo ✓')
 };

 // Conta Mensal: um recebimento financeiro/operacional por pagamento, com alocações internas; nunca nova receita.
 saveClientMonthlySettlement=function(id){
  let c=db.clients.find(x=>x.id===id),rec=clientOpenReceivables(id),bal=clientReceivableBalance(id),amount=Math.max(0,Number(document.getElementById('cmPayAmount')?.value||0));if(!c||!(amount>0)||amount>bal+.009){toast('Informe um valor válido até o saldo em aberto');return}
  let date=document.getElementById('cmPayDate')?.value||localDateISO(),methodId=document.getElementById('cmPayMethod')?.value||'',accountId=document.getElementById('cmPayAccount')?.value||'',acc=v54AccountByIdOrName(accountId,''),method=db.paymentMethods.find(m=>m.id===methodId);if(!methodId||!method){toast('Selecione a forma de pagamento');return}if(!acc||!v54UnitExists(acc.unitId)){toast('Selecione uma conta de destino com unidade válida');return}
  let session=v54RequireOpenSession(acc.unitId,date,'receber a Conta Mensal');if(!session)return;let left=amount,alloc=[];for(const r of rec){if(left<=.009)break;let use=Math.min(left,Number(r.balance||0));r.balance=Math.max(0,Number(r.balance||0)-use);r.status=r.balance<=.009?'Quitado':'Parcial';left-=use;alloc.push({receivableId:r.id,commandId:r.commandId,unitId:r.unitId,amount:Number(use.toFixed(2))})}
  for(const commandId of [...new Set(alloc.map(a=>a.commandId).filter(Boolean))]){let cmd=db.clientCommands.find(x=>x.id===commandId);if(cmd&&!clientOpenReceivables(id).some(z=>z.commandId===commandId))cmd.receivableOpen=false}
  let now=new Date(),fee=paymentProcessorFee(methodId,accountId,amount),payId='crp'+Date.now(),byUnit=v54AllocationByUnit(alloc),receivableIds=alloc.map(a=>a.receivableId).filter(Boolean),commandIds=[...new Set(alloc.map(a=>a.commandId).filter(Boolean))];
  let pay={id:payId,clientId:id,date,referenceDate:date,paidAt:now.toISOString(),amount,methodId,paymentMethod:method.name||'',accountId:acc.id,financialAccountId:acc.id,accountName:acc.name,accountUnitId:acc.unitId,receivingUnitId:acc.unitId,cashSessionId:session.id,allocations:alloc,allocationByUnit:byUnit,receivableIds,commandIds,note:document.getElementById('cmPayNote')?.value.trim()||'',originType:'client_receivable_settlement',originId:payId,sourceType:'client_receivable_settlement',ledgerMode:'cash_closure',revenueRecognition:false,createdAt:now.toISOString(),createdBy:currentUserName()};db.clientReceivablePayments.push(pay);
  let cash={id:'cm_month_'+payId,clientId:id,unitId:acc.unitId,receivingUnitId:acc.unitId,amount,paymentMethod:method.name||'',accountId:acc.id,financialAccountId:acc.id,accountUnitId:acc.unitId,account:acc.name,type:'Recebimento conta mensal',date,referenceDate:date,paidAt:now.toISOString(),createdAt:now.toISOString(),user:currentUserName(),processorFee:fee,cashSessionId:session.id,physicalImpact:acc.type==='CASH',allocationByUnit:byUnit,receivableAllocations:structuredClone(alloc),receivableId:receivableIds.length===1?receivableIds[0]:'',receivableIds,commandId:commandIds.length===1?commandIds[0]:'',commandIds,originType:'client_receivable_settlement',originId:payId,sourceType:'client_receivable_settlement',sourceId:payId,revenueRecognition:false};db.demoCashMovements.push(cash);pay.cashMovementId=cash.id;let cap=window.__imperioV61?.v61CaptureSettlementSnapshot;if(typeof cap==='function'&&cap(cash)){for(const k of ['financialAccountId','paymentMethodId','grossAmount','processorFee','feePercentSnapshot','feeFixedSnapshot','settlementDaysSnapshot','expectedSettlementDate','ruleCapturedAt','settlementReliability'])if(cash[k]!==undefined)pay[k]=structuredClone(cash[k]);pay.receivingUnitId=pay.receivingUnitId||cash.receivingUnitId||cash.accountUnitId||cash.unitId;pay.accountUnitId=pay.accountUnitId||cash.accountUnitId||cash.unitId}
  // Não cria demoFinancialEntry duplicada: o fechamento da sessão consolida este mesmo fato no Financeiro.
  save();closeModal();openClient(id,'conta_mensal');toast(amount+0.009<bal?'Pagamento parcial registrado · recebível baixado sem nova receita ✓':'Conta mensal quitada · sem nova receita ✓')
 };

 const _v54SaveCommissionSettlement=saveCommissionSettlement;
 saveCommissionSettlement=function(proId){let accountId=document.getElementById('comSettleAccount')?.value||'',acc=v54AccountByIdOrName(accountId,''),date=document.getElementById('comSettleDate')?.value||localDateISO(),session=null;if(acc?.type==='CASH'){session=v54RequireOpenSession(acc.unitId,date,'pagar o acerto em dinheiro');if(!session)return}if(!session){_v54SaveCommissionSettlement(proId);return}let f0=(db.demoFinancialEntries||[]).length,d=v54WithDeferredSave(()=>_v54SaveCommissionSettlement(proId));for(const e of (db.demoFinancialEntries||[]).slice(f0)){let a=v54AccountByIdOrName(e.accountId,e.account,e.unitId);if(a?.id===acc.id)v54MirrorFinanceToPhysicalCash(e,acc,session)}d.flush()};

 const _v54SaveStockPurchasePayment=typeof saveStockPurchasePayment==='function'?saveStockPurchasePayment:null;
 if(_v54SaveStockPurchasePayment)saveStockPurchasePayment=function(id){let accountId=document.getElementById('stkBuyPayAccount')?.value||'',acc=v54AccountByIdOrName(accountId,''),date=document.getElementById('stkBuyPayDate')?.value||localDateISO(),session=null;if(acc?.type==='CASH'){session=v54RequireOpenSession(acc.unitId,date,'pagar a compra em dinheiro');if(!session)return}if(!session){_v54SaveStockPurchasePayment(id);return}let f0=(db.demoFinancialEntries||[]).length,d=v54WithDeferredSave(()=>_v54SaveStockPurchasePayment(id)),p=(db.stockPurchases||[]).find(x=>x.id===id),e=(db.demoFinancialEntries||[]).find(x=>x.id===p?.payableEntryId)||(db.demoFinancialEntries||[]).slice(f0).find(x=>x.accountId===acc.id);if(e)v54MirrorFinanceToPhysicalCash(e,acc,session);d.flush()};

 function v54ConsolidateMonthlyHistory(){let changed=false;for(const p of (db.clientReceivablePayments||[])){let id=p.id;if(!id)continue;let acc=v54AccountByIdOrName(p.accountId,p.accountName,p.accountUnitId),alloc=Array.isArray(p.allocations)?p.allocations:[],byUnit=v54AllocationByUnit(alloc);p.sourceType=p.sourceType||'client_receivable_settlement';if(acc){p.accountId=p.accountId||acc.id;p.accountUnitId=p.accountUnitId||acc.unitId}
   let fes=(db.demoFinancialEntries||[]).filter(e=>e.sourceType==='client_receivable_settlement'&&e.sourceId===id);if(fes.length>1){let keep=fes[0],sum=fes.reduce((s,e)=>s+Number(e.amount||0),0),fee=fes.reduce((s,e)=>s+Number(e.processorFee||0),0);keep.amount=sum;keep.processorFee=fee;keep.unitId=acc?.unitId||keep.accountUnitId||keep.unitId;keep.accountId=acc?.id||keep.accountId;keep.accountUnitId=acc?.unitId||keep.accountUnitId;keep.account=acc?.name||keep.account;keep.allocationByUnit=byUnit;keep.receivableAllocations=structuredClone(alloc);keep.dreImpact=false;keep.revenueRecognition=false;let ids=new Set(fes.slice(1).map(e=>e.id));db.demoFinancialEntries=db.demoFinancialEntries.filter(e=>!ids.has(e.id));changed=true}
   let cms=(db.demoCashMovements||[]).filter(m=>m.sourceType==='client_receivable_settlement'&&m.sourceId===id);if(cms.length>1){let keep=cms[0],sum=cms.reduce((s,m)=>s+Number(m.amount||0),0),fee=cms.reduce((s,m)=>s+Number(m.processorFee||0),0);keep.amount=sum;keep.processorFee=fee;keep.unitId=acc?.unitId||keep.accountUnitId||keep.unitId;keep.accountId=acc?.id||keep.accountId;keep.accountUnitId=acc?.unitId||keep.accountUnitId;keep.account=acc?.name||keep.account;keep.allocationByUnit=byUnit;keep.receivableAllocations=structuredClone(alloc);keep.physicalImpact=acc?.type==='CASH';let ids=new Set(cms.slice(1).map(m=>m.id));db.demoCashMovements=db.demoCashMovements.filter(m=>!ids.has(m.id));changed=true}
  }return changed}
 function v54Migrate(){let changed=false;db.migrationHistory=Array.isArray(db.migrationHistory)?db.migrationHistory:[];if(!db.migrationHistory.some(x=>x?.id===MIGRATION_ID)){
   for(const s of (db.cashSessions||[])){if(!Array.isArray(s.closureHistory)){s.closureHistory=[];changed=true}if(s.reopenCount===undefined){s.reopenCount=s.reopenedAt?1:0;changed=true}}
   for(const m of (db.demoCashMovements||[])){if(!m.cashSessionId&&m.unitId&&m.date){let candidates=v54SessionCandidates(m.unitId,m.date);if(candidates.length===1){v54TagMovement(m,candidates[0]);changed=true}}let a=v54ResolveMovementAccount(m);if(a&&!m.accountId){m.accountId=a.id;m.accountUnitId=a.unitId;changed=true}if(m.physicalImpact===undefined){m.physicalImpact=v54MovementIsPhysical(m);changed=true}}
   for(const e of (db.demoFinancialEntries||[])){let a=v54AccountByIdOrName(e.accountId,e.account,e.accountUnitId||e.unitId);if(a&&!e.accountId){e.accountId=a.id;e.accountUnitId=a.unitId;changed=true}}
   if(v54ConsolidateMonthlyHistory())changed=true;db.migrationHistory.push({id:MIGRATION_ID,version:V54_SCHEMA,status:'applied',appliedAt:new Date().toISOString()});changed=true}
  if(Number(db.schemaVersion||0)<V54_SCHEMA){db.schemaVersion=V54_SCHEMA;db.schemaMigratedAt=new Date().toISOString();changed=true}if(changed)save({render:false})
 }
 v54Migrate();window.__imperioDatabase=db;window.__imperioV54={v54SessionFor,v54RequireOpenSession,v54MovementIsPhysical,v54AccountByIdOrName};
})();
