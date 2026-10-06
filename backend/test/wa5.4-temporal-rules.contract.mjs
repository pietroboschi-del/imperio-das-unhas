import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let n=0;
const ok=(v,m)=>{n++;assert.ok(v,m)};
const source=readFileSync(new URL('../src/messaging/booking-automation-materialization.service.ts',import.meta.url),'utf8');

ok(source.includes("const DAY_MS=24*HOUR_MS"),'regra de 24 horas é explícita');
ok(source.includes("scheduledAt:now")&&source.includes("automationType:'BOOKING_CONFIRMATION'"),'confirmação é imediata');
ok(source.includes("automationType:'SIGNAL_REQUEST'")&&source.includes("financialDecision:'DEFERRED_TO_WA6'"),'pedido de sinal é lógico e sem decisão financeira');
ok(source.includes("signalReminderAt.getTime()<visitStartAt.getTime()"),'signal reminder só existe antes do atendimento');
ok(source.includes("leadMs>=DAY_MS")&&source.includes("leadMs>2*HOUR_MS"),'appointment reminder implementa faixas 24h/2h');
ok(source.includes("appointmentReminderAt.getTime()>=now.getTime()"),'nenhum appointment reminder é criado no passado');
ok(source.includes("businessTimezone:unit.timezone")&&source.includes("timeZone:unit.timezone"),'timezone canônico da unidade é usado');
ok(source.includes("cancelWhenSignalConfirmed:true"),'signal reminder fica identificável para futura invalidação WA6');
ok(!/MessagingOutbox|queueMessage|MessagingDispatch|provider\.send|Evolution/.test(source),'WA5.4 não conecta outbound');

console.log(JSON.stringify({ok:true,tests:n,feature:'wa5_4_temporal_rules_contract'}));
