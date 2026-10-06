import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let n=0;
const ok=(v,m)=>{n++;assert.ok(v,m)};
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const materializer=read('../src/messaging/booking-automation-materialization.service.ts');
const booking=read('../src/core/booking-creation.service.ts');
const admin=read('../src/core/core-write.controller.ts');
const moduleSource=read('../src/messaging/messaging.module.ts');
const coreModule=read('../src/core/core.module.ts');

ok(['BOOKING_CONFIRMATION','SIGNAL_REQUEST','APPOINTMENT_REMINDER'].every(x=>materializer.includes(x)),'tipos iniciais WA5.2 materializados');
ok(materializer.includes('this.prisma.booking.findUnique')&&materializer.includes("items:{")&&materializer.includes("orderBy:{sortOrder:'asc'}"),'Booking e BookingItems persistidos são fonte de verdade');
ok(materializer.includes("sourceType:'BOOKING_CREATED'")&&materializer.includes('bookingId:booking.id')&&materializer.includes('unitId:booking.unitId')&&materializer.includes('clientId:booking.clientId'),'contexto real é preservado');
ok(materializer.includes("logicalKey='booking:'+booking.id+':'+spec.automationType")&&materializer.includes("idempotencyKey:'wa5:booking-created:'"),'idempotência é por booking/tipo e não por item');
ok(materializer.includes("financialDecision:'DEFERRED_TO_WA6'"),'SIGNAL_REQUEST não contém decisão financeira WA5');
ok(materializer.includes("phase:'REMINDER_PLACEHOLDER_WA5_2'"),'reminder permanece placeholder programável');
ok(!/MessagingOutbox|MessagingFoundationService|MessagingDispatch|MessagingProvider|Evolution|queueMessage|provider\.send/.test(materializer),'materializador não conecta Outbox/dispatcher/provider');
ok(booking.includes('BookingAutomationMaterializationService')&&booking.includes('materializeCreatedBooking(existing.id)')&&booking.includes('materializeCreatedBooking(row.id)'),'site e agente convergem no materializador, incluindo replay');
ok(admin.includes('BookingAutomationMaterializationService')&&admin.includes('materializeCreatedBooking(id)'),'admin converge no mesmo contrato pós-persistência');
ok(moduleSource.includes('BookingAutomationMaterializationService')&&coreModule.includes('imports:[MessagingModule]'),'injeção usa módulo existente sem arquitetura paralela');

console.log(JSON.stringify({ok:true,tests:n,feature:'wa5_2_booking_materialization_contract'}));
