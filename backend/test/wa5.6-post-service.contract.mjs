import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m)};
const dto=readFileSync(new URL('../src/core/core-write.dto.ts',import.meta.url),'utf8');
const core=readFileSync(new URL('../src/core/core-write.controller.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../src/messaging/post-service-automation-materialization.service.ts',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../src/core/catalog-config.controller.ts',import.meta.url),'utf8');

ok(dto.includes("'Concluído'"),'estado canônico de conclusão está no contrato de booking');
ok(core.includes("before.status!=='Concluído'&&after?.status==='Concluído'"),'materialização só é acionada na transição real para concluído');
ok(service.includes("booking.status!=='Concluído'"),'serviço recusa estado não concluído');
ok(service.includes("action:'booking.updated'")&&service.includes("legacyPayload:{path:['status'],equals:'Concluído'}"),'instante de conclusão vem do AuditEvent persistido');
ok(service.includes("automationType:'POST_SERVICE'")&&service.includes("automationType:'FEEDBACK_REQUEST'"),'somente pós-atendimento e feedback estão caracterizados');
ok(service.includes("items:{")&&service.includes("service:{select:{id:true,name:true,legacyPayload:true}}"),'BookingItems e serviços reais são relidos');
ok(service.includes("idempotencyKey:'wa5:booking-completed:'")&&service.includes("generation:1"),'replay/concurrency convergem por booking e tipo');
ok(!service.includes("RETURN_REMINDER")&&!service.includes("REACTIVATION"),'retorno e reativação não são inventados sem contrato canônico');
ok(!/returnDays|returnEnabled|reactivationDays|sameProfessionalReturn/.test(catalog),'catálogo atual não tipa regra canônica de retorno/reativação');
ok(!/MessagingOutbox|queueMessage|MessagingDispatch|provider\.send|Evolution/.test(service),'WA5.6 não conecta outbound');

console.log(JSON.stringify({ok:true,checks,feature:'wa5_6_post_service_contract',returnPending:true,reactivationPending:true}));
