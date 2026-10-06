import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)};
const bridge=readFileSync(new URL('../src/messaging/messaging-automation-outbox.service.ts',import.meta.url),'utf8');
const foundation=readFileSync(new URL('../src/messaging/messaging-foundation.service.ts',import.meta.url),'utf8');
const dispatch=readFileSync(new URL('../src/messaging/messaging-dispatch.service.ts',import.meta.url),'utf8');

ok(bridge.includes('scheduledAt:{lte:now}')&&bridge.includes('MessagingAutomationStatus.READY'),'somente automações vencidas ficam READY');
ok(bridge.includes("status===MessagingAutomationStatus.CANCELLED")&&bridge.includes("status:MessagingAutomationStatus.READY")&&bridge.includes("data:{status:MessagingAutomationStatus.ENQUEUED"),'claim READY->ENQUEUED protege cancelamento concorrente');
ok(bridge.includes("outboxKey='wa5:automation-outbox:'+row.id"),'Outbox usa chave determinística da automação');
ok(bridge.includes('this.foundation.queueMessage')&&!/provider\.send|EvolutionMessagingProvider/.test(bridge),'bridge usa somente foundation, nunca provider direto');
ok(bridge.includes('unitId:row.unitId')&&bridge.includes('clientId:row.clientId')&&bridge.includes('bookingId:row.bookingId'),'contexto é preservado');
ok(bridge.includes('sourceType:row.sourceType')&&bridge.includes('sourceId:row.sourceId')&&bridge.includes('automationId:row.id'),'trace é preservado');
ok(bridge.includes('channelForUnit(row.unitId)'),'roteamento usa mapa canônico por unidade');
ok(bridge.includes("status===MessagingAutomationStatus.ENQUEUED")&&bridge.includes("findUnique({where:{idempotencyKey:outboxKey}}"),'recovery de claim sem Outbox é idempotente');
ok(foundation.includes("status:'PENDING'")&&foundation.includes('idempotencyKey'), 'infraestrutura WA1 existente é reutilizada');
ok(dispatch.includes("if(!whatsappAutomationEnabled())return {outcome:'SKIPPED'"),'flag global OFF bloqueia provider');

console.log(JSON.stringify({ok:true,checks,feature:'wa5_7_automation_outbox_contract'}));
