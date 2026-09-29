
/* ===== V57 · ESTABILIZAÇÃO FINANCEIRA: FECHAMENTO CONGELADO + CONTA MENSAL + SALDOS ===== */
(function(){
 const V57_SCHEMA=57, MIGRATION_ID='v57-finance-frozen-closure-monthly-dedup-balance';

 function v57LatestClosure(s){
  if(!s)return null;let h=Array.isArray(s.closureHistory)?s.closureHistory.filter(Boolean):[];
  if(s.lastClosureId){let x=h.find(c=>c.id===s.lastClosureId);if(x)return x}
  return h.length?[...h].sort((a,b)=>{let r=Number(a.revision||0)-Number(b.revision||0);if(r)return r;return String(a.closedAt||'').localeCompare(String(b.closedAt||''))}).slice(-1)[0]:null
 }
 function v57FreezeLegacyClosedSession(s){
  if(!s||s.status!=='closed')return false;let changed=false,closure=v57LatestClosure(s);
  let ids=Array.isArray(closure?.movementIds)&&closure.movementIds.length?[...closure.movementIds]:(Array.isArray(s.closedMovementIds)&&s.closedMovementIds.length?[...s.closedMovementIds]:(db.demoCashMovements||[]).filter(m=>m.cashSessionId===s.id).map(m=>m.id));
  if(!closure){
    let revision=Math.max(1,Number(s.reopenCount||0)+1),id=s.lastClosureId||`${s.id}:close:${revision}`;
    closure={id,revision,closedAt:s.closedAt||'',closedBy:s.closedBy||'',systemExpected:s.systemExpected,countedAmount:s.countedAmount,difference:s.difference,note:s.closeNote||'',snapshot:s.snapshot?structuredClone(s.snapshot):null,movementIds:[...ids],migratedLegacy:true};
    s.closureHistory=Array.isArray(s.closureHistory)?s.closureHistory:[];s.closureHistory.push(closure);s.lastClosureId=id;changed=true
  }else if(!Array.isArray(closure.movementIds)||!closure.movementIds.length){
    closure.movementIds=[...ids];closure.migratedLegacyComposition=true;changed=true
  }
  if(!Array.isArray(s.closedMovementIds)||s.closedMovementIds.join('|')!==ids.join('|')){s.closedMovementIds=[...ids];changed=true}
  if(!s.lastClosureId&&closure?.id){s.lastClosureId=closure.id;changed=true}
  return changed
 }

 function v57PairLegacyMonthly(){
  let changed=false,usedCash=new Set();
  for(const p of (db.clientReceivablePayments||[])){
    if(!p?.id)continue;
    if(!p.originType){p.originType='client_receivable_settlement';changed=true}if(!p.originId){p.originId=p.id;changed=true}if(!p.sourceType){p.sourceType='client_receivable_settlement';changed=true}
    if(!p.referenceDate&&p.date){p.referenceDate=p.date;changed=true}if(!p.paidAt&&p.createdAt){p.paidAt=p.createdAt;changed=true}if(!p.financialAccountId&&p.accountId){p.financialAccountId=p.accountId;changed=true}if(!p.receivingUnitId&&p.accountUnitId){p.receivingUnitId=p.accountUnitId;changed=true}
    let cash=(db.demoCashMovements||[]).find(m=>m.sourceType==='client_receivable_settlement'&&m.sourceId===p.id);
    if(!cash){
      let candidates=(db.demoCashMovements||[]).filter(m=>!usedCash.has(m.id)&&String(m.type||'').toLowerCase().includes('recebimento conta mensal')&&m.clientId===p.clientId&&m.date===p.date&&Math.abs(Number(m.amount||0)-Number(p.amount||0))<.011&&(!p.accountId||!m.accountId||m.accountId===p.accountId));
      if(candidates.length===1){cash=candidates[0];cash.sourceType='client_receivable_settlement';cash.sourceId=p.id;cash.originType='client_receivable_settlement';cash.originId=p.id;changed=true}
    }
    if(cash){
      usedCash.add(cash.id);if(!p.cashMovementId){p.cashMovementId=cash.id;changed=true}if(p.ledgerMode!=='cash_closure'){p.ledgerMode='cash_closure';changed=true}
      if(!cash.originType){cash.originType='client_receivable_settlement';changed=true}if(!cash.originId){cash.originId=p.id;changed=true}if(!cash.referenceDate&&cash.date){cash.referenceDate=cash.date;changed=true}if(!cash.paidAt&&cash.createdAt){cash.paidAt=cash.createdAt;changed=true}if(!cash.financialAccountId&&cash.accountId){cash.financialAccountId=cash.accountId;changed=true}if(!cash.receivingUnitId){cash.receivingUnitId=cash.accountUnitId||cash.unitId||'';changed=true}
      let fes=(db.demoFinancialEntries||[]).filter(e=>(e.sourceType==='client_receivable_settlement'&&e.sourceId===p.id)||(String(e.nature||'').toLowerCase().includes('recebimento de conta mensal')&&e.clientId===p.clientId&&e.date===p.date&&Math.abs(Number(e.amount||0)-Number(p.amount||0))<.011&&(!p.accountId||!e.accountId||e.accountId===p.accountId)));
      for(const e of fes){if(e.excludedFromOperationalLedger!==true||e.legacyDuplicateOfCashMovementId!==cash.id){e.excludedFromOperationalLedger=true;e.legacyDuplicateOfCashMovementId=cash.id;e.deduplicationReason='cash_closure_is_canonical';e.revenueRecognition=false;e.dreImpact=false;changed=true}}
    }
  }
  return changed
 }

 function v57Migrate(){
  let changed=false;db.migrationHistory=Array.isArray(db.migrationHistory)?db.migrationHistory:[];
  for(const s of (db.cashSessions||[]))changed=v57FreezeLegacyClosedSession(s)||changed;
  changed=v57PairLegacyMonthly()||changed;
  if(!db.migrationHistory.some(x=>x?.id===MIGRATION_ID)){db.migrationHistory.push({id:MIGRATION_ID,version:V57_SCHEMA,status:'applied',appliedAt:new Date().toISOString(),note:'Financeiro passa a usar revisão congelada do fechamento; Conta Mensal usa um único fato operacional; saldo usa ledger consolidado.'});changed=true}
  if(Number(db.schemaVersion||0)<V57_SCHEMA){db.schemaVersion=V57_SCHEMA;db.schemaMigratedAt=new Date().toISOString();changed=true}
  if(changed)save({render:false})
 }
 v57Migrate();
 window.__imperioV57={financeCashClosureRevision,financeClosedCashRows,financeOperationalLedgerEntries,financeAccountBalance};
})();
