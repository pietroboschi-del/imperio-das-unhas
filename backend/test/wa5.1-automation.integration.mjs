import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingAutomationService} from '../dist/src/messaging/messaging-automation.service.js';

const prisma=new PrismaClient();
const prefix='wa51-ci-'+Date.now();
const clientId=prefix+'-client';
const bookingId=prefix+'-booking';

try{
  await prisma.$connect();
  await ensureCanonicalUnits(prisma);
  await prisma.client.create({data:{id:clientId,name:'Cliente WA5.1',phone:'+5531999999999',registrationUnitId:'centro',legacyPayload:{source:'wa5.1-test'}}});
  await prisma.booking.create({data:{
    id:bookingId,unitId:'centro',clientId,serviceDate:new Date('2030-01-10T00:00:00.000Z'),
    startAt:new Date('2030-01-10T13:00:00.000Z'),status:'Agendado',legacyPayload:{source:'wa5.1-test'},
  }});

  const service=new MessagingAutomationService(prisma);
  const base={
    unitId:'centro',clientId,bookingId,sourceType:'BOOKING',sourceId:bookingId,
    automationType:'BOOKING_CONFIRMATION',scheduledAt:new Date('2030-01-09T13:00:00.000Z'),
    idempotencyKey:prefix+':confirmation:g1',logicalKey:'booking:'+bookingId+':confirmation',generation:1,
    payload:{template:'booking-confirmation',snapshotVersion:1},
  };

  const first=await service.create(base);
  assert.equal(first.status,'PENDING');
  assert.equal(first.unitId,'centro');
  assert.equal(first.clientId,clientId);
  assert.equal(first.bookingId,bookingId);
  assert.equal(first.generation,1);

  const replay=await service.create(base);
  assert.equal(replay.id,first.id,'replay idempotente reutiliza a automação');
  assert.equal(await prisma.messagingAutomation.count({where:{idempotencyKey:base.idempotencyKey}}),1);
  assert.equal(await prisma.auditEvent.count({where:{action:'automation.created',entityId:first.id}}),1,'replay não duplica auditoria');

  await assert.rejects(
    ()=>service.create({...base,automationType:'REMINDER'}),
    /Idempotency-Key já utilizada/,
    'mesma chave com outro conteúdo falha',
  );
  await assert.rejects(
    ()=>service.create({...base,idempotencyKey:prefix+':other',scheduledAt:new Date('2030-01-09T14:00:00.000Z')}),
    /logicalKey\/generation já identifica outra automação/,
    'mesma geração lógica não pode representar conteúdo diferente',
  );

  const second=await service.create({...base,idempotencyKey:prefix+':confirmation:g2',generation:2,scheduledAt:new Date('2030-01-09T14:00:00.000Z')});
  assert.notEqual(second.id,first.id);
  assert.equal(second.generation,2,'nova geração permite futura substituição por reagendamento');

  const cancelled=await service.cancel(first.id,'reschedule replacement');
  assert.equal(cancelled.status,'CANCELLED');
  assert.ok(cancelled.cancelledAt);
  const cancelledReplay=await service.cancel(first.id,'reschedule replacement');
  assert.equal(cancelledReplay.id,first.id);
  assert.equal(await prisma.auditEvent.count({where:{action:'automation.cancelled',entityId:first.id}}),1,'cancelamento repetido não duplica auditoria');

  const big=await service.create({
    unitId:'big',sourceType:'TEST',sourceId:prefix,automationType:'REMINDER',
    scheduledAt:new Date('2030-01-09T15:00:00.000Z'),idempotencyKey:prefix+':big',
    logicalKey:'unit:big:'+prefix,generation:1,payload:{sameChannelFuture:true},
  });
  assert.equal(big.unitId,'big');
  assert.notEqual(big.unitId,second.unitId,'unitId permanece parte independente do contexto');

  await assert.rejects(
    ()=>service.create({...base,idempotencyKey:prefix+':wrong-unit',logicalKey:prefix+':wrong-unit',unitId:'big',generation:1}),
    /Agendamento não pertence à unidade/,
    'booking não pode vazar entre unidades',
  );

  console.log(JSON.stringify({ok:true,feature:'wa5_1_messaging_automation',idempotent:true,cancellationIdempotent:true,generationReplacementReady:true,outboxConnected:false}));
}finally{
  await prisma.auditEvent.deleteMany({where:{entityType:'MessagingAutomation'}}).catch(()=>{});
  await prisma.messagingAutomation.deleteMany({where:{OR:[{sourceId:bookingId},{sourceId:prefix},{idempotencyKey:{startsWith:prefix}}]}}).catch(()=>{});
  await prisma.booking.deleteMany({where:{id:bookingId}}).catch(()=>{});
  await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});
  await prisma.$disconnect();
}
