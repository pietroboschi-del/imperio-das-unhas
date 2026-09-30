import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateExport, sha256DataHash } from './reconcile-exports.mjs';
import { add, cmp, dec, money, mul, sub, sumMoney } from './decimal-money.mjs';

const ACTIVE_WAITLIST=new Set(['active','ativa','aberta','waiting','aguardando','pending','pendente']);
const TERMINAL_BOOKING=new Set(['cancelado','cancelada','canceled','cancelled']);
const TERMINAL_FISCAL=new Set(['concluido','concluída','concluida','autorizado','autorizada','emitido','emitida','cancelado','cancelada']);
const TERMINAL_PACKAGE=new Set(['cancelado','cancelada','encerrado','encerrada','expired','expirado','expirada']);
const low=v=>String(v||'').trim().toLowerCase();
const UNIT_CANONICAL=Object.freeze({u1:'big',u2:'shopping-contagem',u3:'centro'});
const canonicalUnitId=v=>UNIT_CANONICAL[String(v||'').trim()]||String(v||'').trim();
function normalizeCutoverUnitIds(d){
  if(Array.isArray(d.units))d.units=d.units.map(u=>({...u,id:canonicalUnitId(u.id)}));
  if(Array.isArray(d.pros))d.pros=d.pros.map(p=>({...p,units:Array.isArray(p.units)?p.units.map(canonicalUnitId):p.units}));
  if(Array.isArray(d.clients))d.clients=d.clients.map(x=>({...x,registrationUnit:x.registrationUnit?canonicalUnitId(x.registrationUnit):x.registrationUnit,registrationUnitId:x.registrationUnitId?canonicalUnitId(x.registrationUnitId):x.registrationUnitId}));
  if(Array.isArray(d.bookings))d.bookings=d.bookings.map(x=>({...x,unit:x.unit?canonicalUnitId(x.unit):x.unit,unitId:x.unitId?canonicalUnitId(x.unitId):x.unitId}));
  for(const key of ['waitlistRequests','waitlistOpportunities','clientCommands','clientReceivables','tipMovements','fiscalDocuments']){
    if(Array.isArray(d[key]))d[key]=d[key].map(x=>({...x,unit:x.unit?canonicalUnitId(x.unit):x.unit,unitId:x.unitId?canonicalUnitId(x.unitId):x.unitId}));
  }
  if(Array.isArray(d.stockBalances))d.stockBalances=d.stockBalances.map(x=>({...x,locationId:x.locationId?canonicalUnitId(x.locationId):x.locationId,unitId:x.unitId?canonicalUnitId(x.unitId):x.unitId}));
  if(Array.isArray(d.userAccounts))d.userAccounts=d.userAccounts.map(x=>({...x,unit:x.unit?canonicalUnitId(x.unit):x.unit,unitId:x.unitId?canonicalUnitId(x.unitId):x.unitId,unitIds:Array.isArray(x.unitIds)?x.unitIds.map(canonicalUnitId):x.unitIds}));
  if(d.professionalObligationSnapshot&&Array.isArray(d.professionalObligationSnapshot.rows))d.professionalObligationSnapshot={...d.professionalObligationSnapshot,rows:d.professionalObligationSnapshot.rows.map(x=>({...x,unitId:x.unitId?canonicalUnitId(x.unitId):x.unitId}))};
  return d;
}
const isoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
const id=(prefix,...xs)=>`${prefix}:${xs.map(x=>String(x??'')).join(':')}`;
const dval=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='')return o[k];return 0};
function sumDecimal(rows,key){return sumMoney((rows||[]).map(r=>r?.[key]??0));}
function group(rows,key){const out={};for(const r of rows||[]){const k=String(r?.[key]||'__none__');(out[k]||(out[k]=[])).push(r)}return out}
function paidReceivable(r){const paid=dval(r,'paidAmount','amountPaid','receivedAmount');const total=dval(r,'amount','total','originalAmount','value');const explicit=dval(r,'balance','remaining','remainingAmount','openAmount');return explicit!==0?money(explicit):money(sub(total,paid));}
function commandOpening(c){
  const gross=dval(c,'grossTotal','grossAmount','total','amount');
  const discount=dval(c,'discount','discountAmount');
  const signal=dval(c,'signalApplied','signalAmount','depositApplied');
  const credit=dval(c,'creditApplied','creditAmount');
  const fee=dval(c,'customerFee','customerFeeAmount');
  const paid=dval(c,'paidTotal','paidAmount','amountPaid');
  const remaining=money(sub(add(sub(sub(gross,discount),signal),fee),add(credit,paid)));
  return {id:String(c.id),unitId:String(c.unitId||c.unit||''),clientId:c.clientId?String(c.clientId):null,serviceDate:isoDate(c.date||c.serviceDate)||new Date().toISOString().slice(0,10),status:String(c.status||'open'),grossAmount:money(gross),discountAmount:money(discount),appliedSignalAmount:money(signal),appliedCreditAmount:money(credit),customerFeeAmount:money(fee),remainingAmount:remaining,legacyPayload:c};
}
function clientCreditBalances(d){
  if(Array.isArray(d.clientCreditBalances))return d.clientCreditBalances.filter(x=>cmp(x.amount??x.balance??0,0)>0).map(x=>({id:id('credit',x.clientId||x.id),clientId:String(x.clientId||x.id),amount:money(x.amount??x.balance??0),currency:'BRL',source:'legacy_balance'}));
  const totals=new Map();for(const m of (d.clientCreditMovements||[])){const cid=String(m.clientId||'');if(!cid)continue;const signed=dval(m,'signedAmount')||((['debit','use','consumption','saida'].includes(low(m.type)))?`-${dval(m,'amount','value')}`:dval(m,'amount','value'));totals.set(cid,add(totals.get(cid)||dec(0),signed));}
  return [...totals].filter(([,v])=>cmp(v,0)>0).map(([clientId,v])=>({id:id('credit',clientId),clientId,amount:money(v),currency:'BRL',source:'legacy_movements'}));
}
function packageBalances(d){return (d.clientPackages||[]).filter(p=>!TERMINAL_PACKAGE.has(low(p.status))).map(p=>{const total=dval(p,'totalUnits','sessions','quantity','qty');const used=dval(p,'usedUnits','usedSessions','consumed','used');const remaining=p.remainingUnits??p.remainingSessions??p.balance??sub(total,used);return {id:String(p.id),clientId:String(p.clientId||''),name:String(p.name||p.packageName||p.packageId||p.id),remainingUnits:String(remaining?.coeff!==undefined?Number(remaining.coeff)/10**remaining.scale:remaining||0),totalUnits:String(total||0),expiresAt:isoDate(p.expiresAt||p.expirationDate)||null,status:String(p.status||'active'),legacyPayload:p};}).filter(p=>p.clientId&&cmp(p.remainingUnits,0)>0)}
function receivableBalances(d){return (d.clientReceivables||[]).map(r=>({...r,_balance:paidReceivable(r)})).filter(r=>cmp(r._balance,0)>0&&!['paid','pago','quitado','cancelado'].includes(low(r.status))).map(r=>({id:String(r.id),clientId:r.clientId?String(r.clientId):null,unitId:r.unitId?String(r.unitId):null,sourceDate:isoDate(r.date||r.sourceDate)||null,dueDate:isoDate(r.dueDate)||null,originalAmount:money(dval(r,'amount','total','originalAmount','value')),balance:r._balance,status:String(r.status||'open'),legacyPayload:r}))}
function stockOpening(d){if(Array.isArray(d.stockBalances))return d.stockBalances.map((r,i)=>({id:String(r.id||id('stock',r.locationId,r.productId,i)),productId:String(r.productId||''),locationId:String(r.locationId||r.unitId||''),qty:String(r.qty??r.quantity??r.balance??0),avgCost:String(r.avgCost??r.cost??0),legacyPayload:r})).filter(r=>r.productId&&r.locationId);const totals=new Map();for(const m of (d.stockMovements||[])){const key=`${m.locationId||m.unitId||''}|${m.productId||''}`;if(!m.productId)continue;const qty=dval(m,'signedQty')||((['out','saida','use','consumption'].includes(low(m.type)))?`-${dval(m,'qty','quantity')}`:dval(m,'qty','quantity'));totals.set(key,add(totals.get(key)||dec(0),qty));}return [...totals].map(([key,v])=>{const [locationId,productId]=key.split('|');return {id:id('stock',locationId,productId),productId,locationId,qty:String(Number(v.coeff)/10**v.scale),avgCost:'0',legacyPayload:null}})}
function openTips(d){return (d.tipMovements||[]).filter(t=>!t.paidAt&&!['paid','pago','repassado'].includes(low(t.status))).map(t=>({id:id('tip',t.id),kind:'TIP',professionalId:String(t.professionalId||t.proId||''),unitId:t.unitId?String(t.unitId):null,amount:money(dval(t,'amount','value')),sourceId:String(t.id||''),legacyPayload:t})).filter(x=>x.professionalId&&cmp(x.amount,0)!==0)}
function professionalOpeningFromV97(d){const snap=d.professionalObligationSnapshot;if(!snap||!Array.isArray(snap.rows))return [];return snap.rows.flatMap((r,i)=>{const amount=money(r.netDue??r.amountDue??r.balance??r.amount??0);return cmp(amount,0)===0?[]:[{id:id('professional',r.professionalId||r.proId,i),kind:'COMMISSION',professionalId:String(r.professionalId||r.proId||''),unitId:r.unitId?String(r.unitId):null,amount,sourceId:String(r.sourceId||''),legacyPayload:r}]}).filter(x=>x.professionalId)}
function commissionNeedsParity(d){return ['commissionEvents','commissionSettlements','commissionPayments','professionalCommissionAdjustments','remunerationRules'].some(k=>Array.isArray(d[k])&&d[k].length>0)}
function unitMetrics(rows){const out={};for(const unitId of new Set(rows.flatMap(r=>r.unitId?[String(r.unitId)]:[]))){const f=rows.filter(r=>String(r.unitId||'')===unitId);out[unitId]=f;}return out}
export function projectCutoverState(env,{cutoffDate,professionalThroughDate=''}={}){
  const validation=validateExport(env);if(!validation.ok)throw new Error(`Export inválido: ${validation.errors.join('; ')}`);if(env.sourceKind!=='CANONICAL_RECONCILED')throw new Error('Cutover exige snapshot CANONICAL_RECONCILED');if(!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDate||'')))throw new Error('cutoffDate obrigatório em YYYY-MM-DD');
  const d=normalizeCutoverUnitIds(structuredClone(env.data||{})),blockers=[];
  d.bookings=(d.bookings||[]).filter(b=>String(b.date||'')>=cutoffDate&&!TERMINAL_BOOKING.has(low(b.status)));
  d.waitlistRequests=(d.waitlistRequests||[]).filter(w=>ACTIVE_WAITLIST.has(low(w.status))||w.active===true);
  const requestIds=new Set(d.waitlistRequests.map(w=>String(w.id)));d.waitlistOpportunities=(d.waitlistOpportunities||[]).filter(o=>requestIds.has(String(o.requestId||''))&&!['closed','cancelado','used','converted'].includes(low(o.status)));
  d.openingCommands=(d.clientCommands||[]).filter(c=>!['closed','fechada','finalizada','paid','pago','cancelado'].includes(low(c.status))).map(commandOpening);
  d.openingClientCredits=clientCreditBalances(d);
  d.openingClientPackages=packageBalances(d);
  d.openingReceivables=receivableBalances(d);
  d.openingStockBalances=stockOpening(d);
  const parity=professionalOpeningFromV97(d),tips=openTips(d);d.openingProfessionalPayables=[...parity,...tips];
  if(commissionNeedsParity(d)&&!d.professionalObligationSnapshot)blockers.push('COMMISSION_OPENING_REQUIRES_PARITY_ENGINE');
  if(d.professionalObligationSnapshot?.uncertain===true)blockers.push('COMMISSION_OPENING_PARITY_UNCERTAIN');
  d.fiscalDocuments=(d.fiscalDocuments||[]).filter(f=>!TERMINAL_FISCAL.has(low(f.status)));
  const bookingsBy=unitMetrics(d.bookings),waitBy=unitMetrics(d.waitlistRequests),cmdBy=unitMetrics(d.openingCommands),recBy=unitMetrics(d.openingReceivables),payBy=unitMetrics(d.openingProfessionalPayables),fiscBy=unitMetrics(d.fiscalDocuments);
  const unitIds=new Set([...(d.units||[]).map(u=>String(u.id)),...Object.keys(bookingsBy),...Object.keys(waitBy),...Object.keys(cmdBy),...Object.keys(recBy),...Object.keys(payBy),...Object.keys(fiscBy)]);
  const byUnit={};for(const unitId of unitIds){const cs=cmdBy[unitId]||[],rs=recBy[unitId]||[],ps=payBy[unitId]||[];byUnit[unitId]={futureBookings:(bookingsBy[unitId]||[]).length,activeWaitlist:(waitBy[unitId]||[]).length,openCommands:cs.length,openCommandBalanceTotal:sumDecimal(cs,'remainingAmount'),receivables:rs.length,receivableTotal:sumDecimal(rs,'balance'),professionalPayables:ps.length,professionalPayableTotal:sumDecimal(ps,'amount'),pendingFiscal:(fiscBy[unitId]||[]).length};}
  const stockByLocation={};for(const [loc,rows] of Object.entries(group(d.openingStockBalances,'locationId')))stockByLocation[loc]=Object.fromEntries(rows.map(r=>[String(r.productId),{qty:String(r.qty),avgCost:String(r.avgCost)}]));
  const network={futureBookings:d.bookings.length,activeWaitlist:d.waitlistRequests.length,openCommands:d.openingCommands.length,openCommandBalanceTotal:sumDecimal(d.openingCommands,'remainingAmount'),creditClients:d.openingClientCredits.length,creditTotal:sumDecimal(d.openingClientCredits,'amount'),activePackages:d.openingClientPackages.length,receivables:d.openingReceivables.length,receivableTotal:sumDecimal(d.openingReceivables,'balance'),stockRows:d.openingStockBalances.length,professionalPayables:d.openingProfessionalPayables.length,professionalPayableTotal:sumDecimal(d.openingProfessionalPayables,'amount'),pendingFiscal:d.fiscalDocuments.length};
  d.cutoverManifest={version:1,cutoffDate,timezone:'America/Sao_Paulo',professionalThroughDate:professionalThroughDate||null,professionalBalanceSource:d.professionalObligationSnapshot?'V97_V61_PROFESSIONAL_OBLIGATIONS':null,historicalDataMigrated:false,historyMinimum:'UNDECIDED',blockers,verification:{network,byUnit,stockByLocation}};
  const out={...env,data:d,dataHash:sha256DataHash(d)};return out;
}
function parse(argv){const o={};for(let i=0;i<argv.length;i++){if(argv[i]==='--input')o.input=argv[++i];else if(argv[i]==='--out')o.out=argv[++i];else if(argv[i]==='--cutoff')o.cutoffDate=argv[++i];else if(argv[i]==='--professional-through')o.professionalThroughDate=argv[++i];}return o}
if(process.argv[1]===fileURLToPath(import.meta.url)){const a=parse(process.argv.slice(2));if(!a.input||!a.out||!a.cutoffDate){console.error('Uso: node tools/project-cutover-state.mjs --input canonical.json --out cutover.json --cutoff YYYY-MM-DD');process.exit(2)}const env=JSON.parse(fs.readFileSync(a.input,'utf8'));const out=projectCutoverState(env,a);fs.writeFileSync(a.out,JSON.stringify(out,null,2));console.log(JSON.stringify({ok:true,out:a.out,blockers:out.data.cutoverManifest.blockers}));}
