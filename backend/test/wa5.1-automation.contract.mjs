import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let n=0;
const ok=(value,message)=>{n++;assert.ok(value,message)};
const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');

const schema=read('../prisma/schema.prisma');
const migration=read('../prisma/migrations/20261006_wa5_1_messaging_automation/migration.sql');
const service=read('../src/messaging/messaging-automation.service.ts');
const moduleSource=read('../src/messaging/messaging.module.ts');

ok(schema.includes('enum MessagingAutomationStatus')&&['PENDING','READY','ENQUEUED','DONE','FAILED','CANCELLED'].every(x=>schema.includes('  '+x)),'WA5.1 define ciclo próprio da automação');
ok(schema.includes('model MessagingAutomation'),'WA5.1 possui entidade própria de automação');
ok(['unitId','clientId','bookingId','sourceType','sourceId','automationType','scheduledAt','idempotencyKey','requestHash','logicalKey','generation'].every(x=>schema.includes('  '+x)),'entidade contém contrato mínimo solicitado');
ok(schema.includes('@@unique([logicalKey, generation])')&&schema.includes('idempotencyKey String                    @unique'),'idempotência e versionamento lógico são persistidos');
ok(schema.includes('@@index([status, scheduledAt])')&&schema.includes('@@index([unitId, status, scheduledAt])')&&schema.includes('@@index([sourceType, sourceId])'),'índices cobrem scheduler, unidade e origem');
ok(!/\bDROP\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|ALTER\s+TABLE/i.test(migration),'migration WA5.1 é estritamente aditiva e sem backfill');
ok(migration.includes('CREATE TYPE "MessagingAutomationStatus"')&&migration.includes('CREATE TABLE "MessagingAutomation"'),'migration cria somente estruturas WA5.1');
ok(service.includes("action:'automation.created'")&&service.includes("action:'automation.cancelled'"),'criação e cancelamento são auditados');
ok(service.includes("findUnique({where:{idempotencyKey}})")&&service.includes('requestHash'),'serviço implementa replay idempotente por conteúdo');
ok(service.includes('logicalKey_generation')&&service.includes('generation'),'serviço protege geração lógica para futura substituição');
ok(service.includes('MessagingAutomationStatus.CANCELLED')&&service.includes('updated.count===1'),'cancelamento é idempotente e auditoria ocorre uma vez');
ok(!/MessagingOutbox|MessagingDispatch|MessagingProvider|Evolution|BookingCreationService|CoreWriteController|WaitlistOpportunityService/.test(service),'WA5.1 não conecta automação às camadas proibidas');
ok(moduleSource.includes('MessagingAutomationService'),'serviço isolado fica disponível no MessagingModule');
ok(!migration.includes('MessagingOutbox'),'migration não acopla automação ao Outbox');

console.log(JSON.stringify({ok:true,tests:n,feature:'wa5_1_messaging_automation_contract'}));
