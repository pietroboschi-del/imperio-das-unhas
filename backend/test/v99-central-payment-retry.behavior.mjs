import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf(' function centralCommandRetryLine('),end=html.indexOf('\n const centralApi=',start),planStart=html.indexOf(' async function centralPaymentRetryPlanV99('),planEnd=html.indexOf('\n const legacyFinalizeCommandV99=',planStart);
assert.ok(start>=0&&end>start&&planStart>=0&&planEnd>planStart,'helpers de retry central devem existir no frontend');
const helperSource=html.slice(start,end)+html.slice(planStart,planEnd);
const helpers=new Function('centralPaymentIdempotencyKey','centralUnitId','centralRemotePaymentMethod','roundMoney',`${helperSource};return {centralCommandRetryStructureMatches,centralPaymentRecordIdV99,centralPaymentRetryPlanV99,centralRunPaymentRetryV99};`)(
 (commandId,paymentId)=>`central_payment:${commandId}:${paymentId}`,
 ()=> 'centro',
 id=>({pm_pix:'PIX',pm_cash:'CASH',pm_direct:'DIRECT_PROFESSIONAL'})[id]||'OTHER',
 n=>Number(Number(n||0).toFixed(2))
);

let checks=0;const ok=(value,message)=>{checks++;assert.ok(value,message)};
const sha=(value)=>createHash('sha256').update(value).digest('hex').slice(0,40);
const serviceLine={id:'line-service',type:'service',serviceId:'s1',professionalId:'p1',qty:1,unitPrice:100,discount:0};
const localBody={grossAmount:100,discountAmount:0,appliedSignalAmount:0,appliedCreditAmount:0,customerFeeAmount:0,amountDue:100,items:[{serviceId:'s1',professionalId:'p1',quantity:1,unitPrice:100,discountAmount:0,commissionPercent:0}],snapshot:{lines:[serviceLine],tipPreview:{professionalId:'',methodId:'',gross:0,deduction:0,net:0}}};
const command={id:'cmd-retry',excessToCredit:false,paymentDraft:[{id:'pay-pix',methodId:'pm_pix',amount:60,processorFee:0},{id:'pay-direct',methodId:'pm_pix',amount:40,processorFee:0}],date:'2026-10-07',unitId:'centro'};
const cash={id:'cash-centro'};const totals={totalDue:100,change:0};

function setup({failBeforeKey='',loseAfterKey='',failRefresh=false,commandValue=command}={}){
 const state={id:commandValue.id,unitId:'centro',status:'OPEN',grossAmount:100,discountAmount:0,appliedSignalAmount:0,appliedCreditAmount:0,customerFeeAmount:0,remainingAmount:100,items:[],payments:[],legacyPayload:{}};
 let syncCalls=0,finalizeCalls=0,refreshCalls=0,projectCalls=0,companyCash=0,companyEffects=0,failBeforeUsed=false,loseAfterUsed=false,failRefreshUsed=false;
 const read=async()=>structuredClone(state);
 const sync=async(_id,body)=>{syncCalls++;if(state.payments.some(p=>p.status==='CONFIRMED'))throw Object.assign(Error('Comanda com pagamento confirmado não pode ser reeditada'),{status:409});state.grossAmount=body.grossAmount;state.discountAmount=body.discountAmount;state.appliedSignalAmount=body.appliedSignalAmount;state.appliedCreditAmount=body.appliedCreditAmount;state.customerFeeAmount=body.customerFeeAmount;state.items=structuredClone(body.items);state.legacyPayload={operationalSnapshot:structuredClone(body.snapshot)};return state};
 const receive=async(_id,body,key)=>{const id='op_'+sha('centro|payment|'+commandValue.id+'|'+key),prior=state.payments.find(p=>p.id===id),canonical=JSON.stringify(body);if(prior){if(prior.requestPayload!==canonical)throw Object.assign(Error('Idempotency-Key já utilizada para outro pagamento nesta comanda'),{status:409});return structuredClone(prior)}if(failBeforeKey===key&&!failBeforeUsed){failBeforeUsed=true;throw Error('falha antes do commit do segundo pagamento')}if(state.status!=='OPEN')throw Object.assign(Error('Comanda não está aberta'),{status:409});if(body.method!=='DIRECT_PROFESSIONAL'&&!body.cashSessionId)throw Error('Caixa aberto da unidade é obrigatório');if(Number(body.amount)>state.remainingAmount)throw Object.assign(Error('Pagamento supera saldo'),{status:409});let row={id,unitId:'centro',status:'CONFIRMED',method:body.method,amount:body.amount,cashSessionId:body.cashSessionId||null,requestPayload:canonical};state.payments.push(row);state.remainingAmount=Number((state.remainingAmount-Number(body.amount)).toFixed(2));if(state.remainingAmount===0)state.status='CLOSED';if(body.method!=='DIRECT_PROFESSIONAL'){companyCash+=Number(body.amount);companyEffects++}if(loseAfterKey===key&&!loseAfterUsed){loseAfterUsed=true;throw Error('resposta HTTP perdida depois do commit')}return structuredClone(row)};
 const plan=remote=>helpers.centralPaymentRetryPlanV99(commandValue,remote,cash,totals);
 const run=()=>helpers.centralRunPaymentRetryV99({commandId:commandValue.id,localBody,plan,read,sync,receive,structureMatches:helpers.centralCommandRetryStructureMatches,finalize:async()=>{finalizeCalls++},refresh:async()=>{refreshCalls++;if(failRefresh&&!failRefreshUsed){failRefreshUsed=true;throw Error('refresh interrompido')}},project:async()=>{projectCalls++}});
 return {state,run,receive,get syncCalls(){return syncCalls},get finalizeCalls(){return finalizeCalls},get refreshCalls(){return refreshCalls},get projectCalls(){return projectCalls},get companyCash(){return companyCash},get companyEffects(){return companyEffects}};
}

// Two normal payment lines are synced once, committed once each, and closed.
const normal=setup();await normal.run();
ok(normal.syncCalls===1&&normal.state.status==='CLOSED','dois pagamentos normais sincronizam antes e fecham a comanda');
ok(normal.state.payments.length===2&&normal.companyEffects===2&&normal.companyCash===100,'duas linhas geram exatamente dois pagamentos e dois efeitos financeiros');

// Payment 1 commits and payment 2 fails before commit. Retry must read and replay
// payment 1 idempotently, avoid the guarded snapshot sync, and create payment 2.
const partial=setup({failBeforeKey:'central_payment:cmd-retry:pay-direct'});
await assert.rejects(partial.run(),/falha antes do commit/);ok(partial.state.payments.length===1&&partial.state.status==='OPEN','falha da segunda linha preserva somente o primeiro pagamento confirmado');
const firstId=partial.state.payments[0].id;await partial.run();
ok(partial.state.status==='CLOSED'&&partial.state.payments.length===2,'retry parcial conclui a comanda');
ok(partial.state.payments.filter(p=>p.id===firstId).length===1&&partial.companyEffects===2,'retry não duplica o primeiro pagamento nem seu efeito');
ok(partial.syncCalls===1&&partial.finalizeCalls===1,'retry com pagamento confirmado não chama novamente syncCommand');

// Server commit succeeds but the response is lost: deterministic key and body
// let the retry obtain the same payment row without a second financial effect.
const lost=setup({loseAfterKey:'central_payment:cmd-retry:pay-pix'});
await assert.rejects(lost.run(),/resposta HTTP perdida/);const lostId=lost.state.payments[0].id;
await lost.run();ok(lost.state.payments.length===2&&lost.state.payments.filter(p=>p.id===lostId).length===1,'resposta perdida reaproveita a mesma Payment');
ok(lost.companyEffects===2&&lost.finalizeCalls===1,'resposta perdida não duplica efeitos e finaliza uma vez');

// Same idempotency key with a changed payload must conflict without mutation.
const changed=setup();await changed.run();const before=changed.state.payments.length,prior=changed.state.payments[0];
const changedKey='central_payment:cmd-retry:pay-pix',changedBody={...JSON.parse(prior.requestPayload),amount:59};
await assert.rejects(changed.receive(command.id,changedBody,changedKey),/Idempotency-Key já utilizada/);
ok(changed.state.payments.length===before&&changed.state.payments[0].id===prior.id,'payload alterado não muda pagamentos existentes');

// A closed equivalent command converges by readback and refresh, without a
// second local finalization. If refresh had failed after close, this is the retry.
const closed=setup({failRefresh:true});await assert.rejects(closed.run(),/refresh interrompido/);await closed.run();
ok(closed.syncCalls===1&&closed.finalizeCalls===1&&closed.refreshCalls===2,'retry de comanda fechada atualiza projeções sem reexecutar finalização local');

// A changed structural line after any central payment is an explicit conflict:
// no sync, payment, overwrite, or local finalization may occur.
const divergent=setup({failBeforeKey:'central_payment:cmd-retry:pay-direct'});await assert.rejects(divergent.run(),/falha antes do commit/);
const divergentBody=structuredClone(localBody);divergentBody.snapshot.lines[0].unitPrice=90;
const beforeDivergence=JSON.stringify(divergent.state);await assert.rejects(helpers.centralRunPaymentRetryV99({commandId:command.id,localBody:divergentBody,plan:remote=>helpers.centralPaymentRetryPlanV99(command,remote,cash,totals),read:async()=>structuredClone(divergent.state),sync:async()=>{throw Error('sync não pode sobrescrever')},receive:async()=>{throw Error('pagamento não deve ser enviado')},structureMatches:helpers.centralCommandRetryStructureMatches,finalize:async()=>{throw Error('não finaliza divergência')},refresh:async()=>{},project:async()=>{}}),/diverge da estrutura central/);
ok(JSON.stringify(divergent.state)===beforeDivergence&&divergent.syncCalls===1,'divergência não sobrescreve o snapshot central nem cria efeito');

// DIRECT_PROFESSIONAL remains outside company cash and idempotent replay keeps
// the same key/payload for an already confirmed line.
const directCommand={...command,paymentDraft:[command.paymentDraft[0],{...command.paymentDraft[1],methodId:'pm_direct'}]};
const direct=setup({commandValue:directCommand});const directPlan=await helpers.centralPaymentRetryPlanV99(directCommand,{payments:[]},cash,totals);
ok(directPlan[1].body.method==='DIRECT_PROFESSIONAL'&&!directPlan[1].body.cashSessionId,'DIRECT_PROFESSIONAL é enviado sem caixa da empresa');
await direct.run();const directRow=direct.state.payments.find(p=>p.method==='DIRECT_PROFESSIONAL');
ok(directRow?.cashSessionId===null&&direct.companyCash===60&&direct.companyEffects===1,'pagamento direto não entra no caixa ou nos efeitos financeiros da empresa');

console.log(JSON.stringify({ok:true,checks,feature:'central_payment_retry_behavior'}));
