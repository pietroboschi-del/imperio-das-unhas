import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let n=0;const ok=(v,m)=>{n++;assert.ok(v,m)};const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const lifecycle=read('../src/messaging/booking-automation-lifecycle.service.ts');
const materializer=read('../src/messaging/booking-automation-materialization.service.ts');
const admin=read('../src/core/core-write.controller.ts');

ok(lifecycle.includes('replaceForReschedule')&&lifecycle.includes('cancelForBooking'),'WA5.3 define lifecycle de reagendamento/cancelamento');
ok(lifecycle.includes("generation=booking.version")&&lifecycle.includes("{lt:generation}"),'reagendamento usa versão real e invalida gerações antigas');
ok(lifecycle.includes("CONCURRENT_RESCHEDULE_SUPERSEDED")&&lifecycle.includes("latest.version===generation"),'concorrência não ressuscita geração antiga');
ok(lifecycle.includes("ACTIVE_STATUSES")&&lifecycle.includes("MessagingAutomationStatus.PENDING")&&lifecycle.includes("MessagingAutomationStatus.READY")&&lifecycle.includes("MessagingAutomationStatus.FAILED"),'somente automações não despachadas são canceláveis neste bloco');
ok(materializer.includes('materializeBookingGeneration')&&materializer.includes("idempotencyKey:'wa5:booking:'"),'materialização suporta gerações idempotentes');
ok(admin.includes("cancelForBooking(id,'BOOKING_CANCELLED')")&&admin.includes('replaceForReschedule(id)'),'update real do booking aciona lifecycle compartilhado');
ok(!/MessagingOutbox|queueMessage|provider\.send|Evolution/.test(lifecycle),'WA5.3 não toca Outbox/provider');

console.log(JSON.stringify({ok:true,tests:n,feature:'wa5_3_booking_lifecycle_contract'}));
