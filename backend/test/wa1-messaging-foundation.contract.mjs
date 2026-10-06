import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let n=0;
const ok=(value,message)=>{n++;assert.ok(value,message)};
const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');

const schema=read('../prisma/schema.prisma');
const migration=read('../prisma/migrations/20261005_wa1_messaging_foundation/migration.sql');
const channels=read('../src/messaging/messaging-channels.ts');
const provider=read('../src/messaging/messaging.provider.ts');
const service=read('../src/messaging/messaging-foundation.service.ts');
const moduleSource=read('../src/messaging/messaging.module.ts');
const app=read('../src/app.module.ts');

ok(schema.includes('enum MessagingOutboxStatus')&&['PENDING','SENDING','SENT','DELIVERED','READ','FAILED','CANCELLED'].every(x=>schema.includes('  '+x)),'WA1 define todos os estados da outbox');
ok(schema.includes('model MessagingChannel')&&schema.includes('enabled   Boolean  @default(false)'),'canais persistidos nascem desligados');
ok(schema.includes('model MessagingOutbox')&&schema.includes('idempotencyKey    String                @unique'),'outbox possui idempotência persistida');
ok(['attempts','lastAttemptAt','nextAttemptAt','providerMessageId','lastError','sentAt','deliveredAt','readAt','cancelledAt'].every(x=>schema.includes(x)),'outbox possui metadados de retry e entrega');
ok(['unitId','clientId','bookingId','commandId'].every(x=>schema.includes('  '+x)),'outbox mantém referências opcionais de contexto');
ok(migration.includes("('CENTRAL','EVOLUTION',false)")&&migration.includes("('BIG_CENTRO','EVOLUTION',false)")&&migration.includes("('SHOPPING_CONTAGEM','EVOLUTION',false)"),'migration cria três canais canônicos desligados');
ok(migration.includes('ON CONFLICT ("id") DO NOTHING')&&!/\bDROP\b|\bRENAME\b/i.test(migration),'migration é aditiva e tolerante a reexecução dos seeds');
ok(channels.includes("big:'BIG_CENTRO'")&&channels.includes("centro:'BIG_CENTRO'")&&channels.includes("'shopping-contagem':'SHOPPING_CONTAGEM'"),'mapeamento unitId -> canal é explícito');
ok(channels.includes("WHATSAPP_AUTOMATION_ENABLED||'false'"),'feature flag global nasce OFF');
ok(provider.includes('export interface MessagingProvider')&&provider.includes('send(message:ProviderOutboundMessage)'), 'provider é uma abstração substituível');
ok(!/\bfetch\s*\(|\baxios\b|https?:\/\//i.test(provider+service),'WA1 não contém chamada externa');
ok(service.includes("action:'communication.queued'")&&service.includes("entityType:'MessagingOutbox'"),'fila gera AuditEvent sem depender de provider');
ok(service.includes('channelId,')&&service.includes('unitId,')&&!service.includes('unitId=channelId'),'unitId e channelId permanecem conceitos independentes');
ok(moduleSource.includes('MessagingFoundationService'),'WA1 foundation service permanece registrado no módulo');
ok(!foundation.includes('@Controller(')&&!foundation.includes('@Post(')&&!foundation.includes('Evolution'),'WA1 foundation não publica endpoint nem acopla Evolution');
ok(app.includes('MessagingModule'),'módulo WA1 está integrado ao backend sem controller externo');

console.log(JSON.stringify({ok:true,tests:n,feature:'wa1_messaging_foundation_contract'}));
