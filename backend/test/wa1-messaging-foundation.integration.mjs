import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {
  CANONICAL_MESSAGING_CHANNEL_IDS,
  channelForUnit,
  whatsappAutomationEnabled,
} from '../dist/src/messaging/messaging-channels.js';

const prisma=new PrismaClient();
const originalFlag=process.env.WHATSAPP_AUTOMATION_ENABLED;
const prefix='wa1-ci-'+Date.now();

try{
  await prisma.$connect();
  await ensureCanonicalUnits(prisma);
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}});
  await prisma.messagingOutbox.deleteMany();

  delete process.env.WHATSAPP_AUTOMATION_ENABLED;
  assert.equal(whatsappAutomationEnabled(),false,'feature flag global deve ser OFF por padrão');

  const channels=await prisma.messagingChannel.findMany({orderBy:{id:'asc'}});
  assert.deepEqual(channels.map(x=>x.id).sort(),[...CANONICAL_MESSAGING_CHANNEL_IDS].sort(),'três canais canônicos persistidos');
  assert.ok(channels.every(x=>x.enabled===false),'todos os canais nascem OFF');
  assert.equal(channelForUnit('big'),'BIG_CENTRO');
  assert.equal(channelForUnit('centro'),'BIG_CENTRO');
  assert.equal(channelForUnit('shopping-contagem'),'SHOPPING_CONTAGEM');
  assert.equal(channelForUnit('unknown'),null);

  const messaging=new MessagingFoundationService(prisma);
  const bigInput={
    channelId:'BIG_CENTRO',
    unitId:'big',
    idempotencyKey:prefix+':big',
    messageType:'BOOKING_CONFIRMATION',
    trigger:'WA1_TEST',
    payload:{text:'mensagem de teste sem envio externo'},
  };
  const big=await messaging.queueMessage(bigInput);
  const centro=await messaging.queueMessage({
    ...bigInput,
    unitId:'centro',
    idempotencyKey:prefix+':centro',
  });

  assert.equal(big.channelId,'BIG_CENTRO');
  assert.equal(centro.channelId,'BIG_CENTRO');
  assert.equal(big.unitId,'big');
  assert.equal(centro.unitId,'centro');
  assert.notEqual(big.unitId,centro.unitId,'o mesmo canal não pode apagar o contexto da unidade');
  assert.equal(big.status,'PENDING');
  assert.equal(big.attempts,0);
  assert.equal(big.lastAttemptAt,null);
  assert.equal(big.providerMessageId,null);
  assert.equal(big.lastError,null);
  assert.equal(big.sentAt,null);
  assert.equal(big.deliveredAt,null);
  assert.equal(big.readAt,null);
  assert.equal(big.cancelledAt,null);

  const retry=await messaging.queueMessage(bigInput);
  assert.equal(retry.id,big.id,'mesma Idempotency-Key e mesmo conteúdo reutilizam a mensagem');
  assert.equal(await prisma.messagingOutbox.count({where:{idempotencyKey:bigInput.idempotencyKey}}),1,'idempotência impede duplicidade');
  assert.equal(await prisma.auditEvent.count({where:{action:'communication.queued',entityType:'MessagingOutbox',entityId:big.id}}),1,'retry idempotente não duplica auditoria');
  await assert.rejects(
    ()=>messaging.queueMessage({...bigInput,messageType:'REMINDER'}),
    /Idempotency-Key já utilizada/,
    'reuso da chave com outro conteúdo deve falhar',
  );

  const runtime=await messaging.runtimeStatus();
  assert.equal(runtime.automationEnabled,false);
  assert.ok(runtime.channels.every(x=>x.enabled===false));
  assert.equal(await messaging.canDispatch('BIG_CENTRO'),false,'global OFF impede dispatch');

  process.env.WHATSAPP_AUTOMATION_ENABLED='true';
  assert.equal(whatsappAutomationEnabled(),true);
  assert.equal(await messaging.canDispatch('BIG_CENTRO'),false,'canal OFF continua impedindo dispatch mesmo com flag global ON');

  assert.deepEqual(messaging.canonicalChannelIds().sort(),[...CANONICAL_MESSAGING_CHANNEL_IDS].sort());
  console.log(JSON.stringify({
    ok:true,
    feature:'wa1_messaging_foundation',
    channels:channels.map(x=>({id:x.id,enabled:x.enabled})),
    routes:runtime.unitRoutes,
    unitContextIndependentFromChannel:true,
    externalCalls:false,
  }));
}finally{
  process.env.WHATSAPP_AUTOMATION_ENABLED=originalFlag;
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}}).catch(()=>{});
  await prisma.messagingOutbox.deleteMany().catch(()=>{});
  await prisma.$disconnect();
}
