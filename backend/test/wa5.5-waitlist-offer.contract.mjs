import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)};
const materializer=readFileSync(new URL('../src/messaging/waitlist-automation-materialization.service.ts',import.meta.url),'utf8');
const matcher=readFileSync(new URL('../src/core/waitlist-opportunity.service.ts',import.meta.url),'utf8');

ok(materializer.includes("automationType:'WAITLIST_OFFER'"),'WA5.5 cria automação lógica de oferta');
ok(materializer.includes("sourceType:'WAITLIST_OFFER_CANDIDATE'")&&materializer.includes('sourceId:opportunity.id'),'source aponta para oportunidade real');
ok(materializer.includes('unitId:opportunity.unitId')&&materializer.includes('bookingId:null'),'unitId da oportunidade é autoridade e booking permanece nulo');
ok(materializer.includes("idempotencyKey:'wa5:waitlist-offer:'+opportunity.id")&&materializer.includes("logicalKey:'waitlist-opportunity:'+opportunity.id"),'idempotência é determinística por oportunidade');
ok(materializer.includes('scheduledAt:opportunity.createdAt'),'instante lógico é persistido e determinístico');
ok(materializer.includes('serviceIds')&&materializer.includes('items'),'multi-serviço é preservado no contexto');
ok(materializer.includes('automaticAcceptance:false')&&materializer.includes('automaticBooking:false'),'não aceita nem agenda automaticamente');
ok(matcher.includes("action:'waitlist.offer_candidate_ready'")&&matcher.includes('materializeOfferCandidate(id)'),'integra no mesmo ponto real do WA4');
ok(!/MessagingOutbox|queueMessage|MessagingDispatch|provider\.send|Evolution/.test(materializer),'WA5.5 não conecta outbound');

console.log(JSON.stringify({ok:true,checks,feature:'wa5_5_waitlist_offer_contract'}));
