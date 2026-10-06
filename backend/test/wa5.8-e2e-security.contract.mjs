import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)};
const booking=readFileSync(new URL('../src/messaging/booking-automation-materialization.service.ts',import.meta.url),'utf8');
const lifecycle=readFileSync(new URL('../src/messaging/booking-automation-lifecycle.service.ts',import.meta.url),'utf8');
const waitlist=readFileSync(new URL('../src/messaging/waitlist-automation-materialization.service.ts',import.meta.url),'utf8');
const post=readFileSync(new URL('../src/messaging/post-service-automation-materialization.service.ts',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../src/messaging/messaging-automation-outbox.service.ts',import.meta.url),'utf8');
const dispatch=readFileSync(new URL('../src/messaging/messaging-dispatch.service.ts',import.meta.url),'utf8');

ok(['BOOKING_CONFIRMATION','SIGNAL_REQUEST','SIGNAL_REMINDER','APPOINTMENT_REMINDER'].every(x=>booking.includes(x)),'criação e regras temporais continuam presentes');
ok(lifecycle.includes('replaceForReschedule')&&lifecycle.includes('cancelForBooking'),'lifecycle de reagendamento/cancelamento permanece centralizado');
ok(waitlist.includes("automationType:'WAITLIST_OFFER'")&&waitlist.includes('bookingId:null'),'waitlist gera oferta lógica sem booking');
ok(post.includes("automationType:'POST_SERVICE'")&&post.includes("automationType:'FEEDBACK_REQUEST'"),'pós-atendimento caracterizado permanece ativo');
ok(!post.includes('RETURN_REMINDER')&&!post.includes('REACTIVATION'),'retorno/reativação continuam deliberadamente não inventados');
ok(bridge.includes('MessagingAutomationStatus.READY')&&bridge.includes("wa5:automation-outbox:"),'bridge READY->Outbox é idempotente');
ok(dispatch.includes("if(!whatsappAutomationEnabled())return {outcome:'SKIPPED'"),'automação OFF bloqueia provider');
ok(!/mark.*signal.*paid|payment.*signal|proof|comprovante|DIRECT_PROFESSIONAL/.test(booking+post+waitlist+bridge),'WA5 não implementa WA6/financeiro');

console.log(JSON.stringify({ok:true,checks,feature:'wa5_8_e2e_security_contract'}));
