import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {MessagingDispatchService} from '../dist/src/messaging/messaging-dispatch.service.js';
import {FakeMessagingProvider} from './helpers/fake-messaging-provider.mjs';

const prisma=new PrismaClient();let checks=0;
const ok=(value,message)=>{checks++;assert.ok(value,message)},eq=(actual,expected,message)=>{checks++;assert.equal(actual,expected,message)};
const secret='wa2-test-webhook-secret-should-never-leak',knownPhone='+5531999112233',clientId='wa2-client-known',sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function startServer(port,enabled){
  let stdout='',stderr='',exit=null,error=null;
  const child=spawn(process.execPath,['dist/src/main.js'],{cwd:new URL('../',import.meta.url),env:{
    ...process.env,PORT:String(port),EVOLUTION_WEBHOOK_ENABLED:enabled?'true':'false',EVOLUTION_WEBHOOK_SECRET:secret,
    EVOLUTION_INSTANCE_CENTRAL:'wa2-central-instance',EVOLUTION_INSTANCE_BIG_CENTRO:'wa2-big-centro-instance',
    EVOLUTION_INSTANCE_SHOPPING_CONTAGEM:'wa2-shopping-instance',WHATSAPP_AUTOMATION_ENABLED:'false',OPERATIONAL_WRITES_ENABLED:'false',
  },stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{stdout+=String(d)});child.stderr.on('data',d=>{stderr+=String(d)});child.on('error',e=>{error=e});child.on('exit',(code,signal)=>{exit={code,signal}});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<80;i++){if(error)throw error;if(exit)throw Error('backend exited before health '+JSON.stringify({exit,stdout,stderr}));try{if((await fetch(base+'/api/v1/health')).ok)return {child,base,logs:()=>stdout+stderr}}catch{}await sleep(250)}
  throw Error('backend start timeout '+stderr);
}
async function stopServer(server){if(server.child.exitCode===null&&server.child.signalCode===null){server.child.kill('SIGTERM');await Promise.race([once(server.child,'exit'),sleep(3000)]).catch(()=>{})}}
const postWebhook=(base,body,providedSecret=secret)=>fetch(base+'/api/v1/integrations/evolution/webhook',{method:'POST',headers:{'content-type':'application/json','x-evolution-webhook-secret':providedSecret},body:JSON.stringify(body)});
function inboundPayload(id,message,remoteJid=knownPhone.replace(/\D/g,'')+'@s.whatsapp.net'){return {event:'messages.upsert',instance:'wa2-big-centro-instance',data:{key:{id,remoteJid,fromMe:false},messageTimestamp:1791240000,message}}}
const statusPayload=(id,status)=>({event:'messages.update',instance:'wa2-big-centro-instance',data:{key:{id},update:{status}}});

const oldAutomation=process.env.WHATSAPP_AUTOMATION_ENABLED;
try{
  await prisma.$connect();await ensureCanonicalUnits(prisma);
  await prisma.auditEvent.deleteMany({where:{OR:[{entityType:'MessagingInbound'},{entityType:'MessagingOutbox'}]}});await prisma.messagingInbound.deleteMany();await prisma.messagingOutbox.deleteMany();
  await prisma.clientUnitLink.deleteMany({where:{clientId}});await prisma.client.deleteMany({where:{id:clientId}});
  await prisma.client.create({data:{id:clientId,name:'Cliente WA2',phone:knownPhone,active:true,legacyPayload:{source:'wa2_test'}}});
  const foundation=new MessagingFoundationService(prisma);

  await prisma.messagingChannel.updateMany({data:{enabled:false}});
  const offMessage=await foundation.queueMessage({channelId:'BIG_CENTRO',unitId:'big',idempotencyKey:'wa2-global-off',messageType:'TEST',trigger:'WA2_TEST',payload:{number:'5531999990001',text:'teste'}});
  await prisma.messagingChannel.update({where:{id:'BIG_CENTRO'},data:{enabled:true}});
  process.env.WHATSAPP_AUTOMATION_ENABLED='false';
  let fake=new FakeMessagingProvider(),dispatch=new MessagingDispatchService(prisma,fake),result=await dispatch.processOne(offMessage.id);
  eq(result.outcome,'SKIPPED','global OFF bloqueia dispatch');eq(fake.calls.length,0,'global OFF chama provider zero vezes');

  process.env.WHATSAPP_AUTOMATION_ENABLED='true';await prisma.messagingChannel.update({where:{id:'BIG_CENTRO'},data:{enabled:false}});
  result=await dispatch.processOne(offMessage.id);eq(result.outcome,'SKIPPED','canal OFF bloqueia dispatch');eq(fake.calls.length,0,'canal OFF chama provider zero vezes');

  await prisma.messagingChannel.update({where:{id:'BIG_CENTRO'},data:{enabled:true}});
  result=await dispatch.processOne(offMessage.id);eq(result.outcome,'SENT','global ON + canal ON envia');
  let sent=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:offMessage.id}});
  eq(sent.status,'SENT','PENDING -> SENDING -> SENT');eq(sent.attempts,1,'sucesso incrementa attempts');ok(sent.lastAttemptAt instanceof Date,'sucesso grava lastAttemptAt');ok(sent.sentAt instanceof Date,'sucesso grava sentAt');ok(Boolean(sent.providerMessageId),'sucesso grava providerMessageId');
  eq(await prisma.auditEvent.count({where:{action:'communication.sent',entityId:sent.id}}),1,'sucesso audita communication.sent');

  const failedMessage=await foundation.queueMessage({channelId:'BIG_CENTRO',unitId:'centro',idempotencyKey:'wa2-failure',messageType:'TEST',trigger:'WA2_TEST',payload:{number:'5531999990002',text:'falha'}});
  fake=new FakeMessagingProvider();fake.failuresRemaining=1;dispatch=new MessagingDispatchService(prisma,fake);result=await dispatch.processOne(failedMessage.id);
  eq(result.outcome,'FAILED','falha do provider vira FAILED');
  const failed=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:failedMessage.id}});
  eq(failed.status,'FAILED','SENDING -> FAILED');eq(failed.attempts,1,'falha incrementa attempts');ok(failed.lastAttemptAt instanceof Date,'falha grava lastAttemptAt');ok(failed.nextAttemptAt instanceof Date&&failed.nextAttemptAt>failed.lastAttemptAt,'falha agenda retry');ok(!String(failed.lastError).includes(fake.errorDetail),'lastError sanitizado');
  eq(await prisma.auditEvent.count({where:{action:'communication.failed',entityId:failed.id}}),1,'falha audita communication.failed');

  const concurrentMessage=await foundation.queueMessage({channelId:'BIG_CENTRO',unitId:'big',idempotencyKey:'wa2-concurrency',messageType:'TEST',trigger:'WA2_TEST',payload:{number:'5531999990003',text:'concorrencia'}});
  fake=new FakeMessagingProvider();fake.delayMs=150;dispatch=new MessagingDispatchService(prisma,fake);
  const concurrent=await Promise.all([dispatch.processOne(concurrentMessage.id),dispatch.processOne(concurrentMessage.id)]);
  eq(fake.calls.length,1,'duas tentativas paralelas fazem uma chamada real');eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:concurrentMessage.id}})).status,'SENT','concorrência deixa SENT');ok(concurrent.some(x=>x.outcome==='SENT')&&concurrent.some(x=>x.outcome==='SKIPPED'),'um claim vence');

  process.env.WHATSAPP_AUTOMATION_ENABLED='false';await prisma.messagingChannel.updateMany({data:{enabled:false}});
  const disabled=await startServer(3112,false);
  try{const response=await postWebhook(disabled.base,inboundPayload('wa2-disabled',{conversation:'oi'}));eq(response.status,404,'webhook disabled rejeitado');ok(!(await response.text()).includes(secret),'resposta disabled sem secret')}finally{await stopServer(disabled)}
  ok(!disabled.logs().includes(secret),'logs disabled sem secret');

  const enabled=await startServer(3113,true);
  try{
    let response=await postWebhook(enabled.base,inboundPayload('wa2-invalid-secret',{conversation:'oi'}),'segredo-invalido');eq(response.status,401,'secret inválido rejeitado');ok(!(await response.text()).includes(secret),'erro auth sem secret');

    response=await postWebhook(enabled.base,inboundPayload('wa2-text',{conversation:'Olá pelo WhatsApp'}));eq(response.status,201,'secret válido aceita inbound');
    const textResponse=await response.json();ok(textResponse.accepted&&!textResponse.replayed,'primeiro inbound persistido');
    const textRow=await prisma.messagingInbound.findUniqueOrThrow({where:{id:textResponse.inboundId}});
    eq(textRow.messageType,'TEXT','TEXT persistido');eq(textRow.textBody,'Olá pelo WhatsApp','texto persistido');eq(textRow.channelId,'BIG_CENTRO','resolve BIG_CENTRO');eq(textRow.unitId,null,'BIG_CENTRO não inventa unidade');eq(textRow.clientId,clientId,'cliente única associada');
    eq(await prisma.auditEvent.count({where:{action:'communication.received',entityId:textRow.id}}),1,'communication.received audit');

    response=await postWebhook(enabled.base,inboundPayload('wa2-text',{conversation:'Olá pelo WhatsApp'}));eq(response.status,201,'replay idêntico aceito');
    const replay=await response.json();ok(replay.replayed&&replay.inboundId===textRow.id,'replay retorna mesma linha');eq(await prisma.messagingInbound.count({where:{providerMessageId:'wa2-text'}}),1,'uma linha inbound');eq(await prisma.auditEvent.count({where:{action:'communication.received',entityId:textRow.id}}),1,'sem audit duplicado');

    response=await postWebhook(enabled.base,inboundPayload('wa2-text',{conversation:'conteúdo conflitante'}));eq(response.status,409,'replay conflitante rejeitado');eq((await prisma.messagingInbound.findUniqueOrThrow({where:{id:textRow.id}})).textBody,'Olá pelo WhatsApp','não sobrescreve');eq(await prisma.auditEvent.count({where:{action:'communication.inbound_replay_conflict',entityId:textRow.id}}),1,'conflito auditado');

    response=await postWebhook(enabled.base,inboundPayload('wa2-image',{imageMessage:{mimetype:'image/jpeg',fileLength:'1234',url:'https://media.invalid/private?token=do-not-store',caption:'não processar'}}));eq(response.status,201,'imagem aceita');
    const imageRow=await prisma.messagingInbound.findFirstOrThrow({where:{providerMessageId:'wa2-image'}}),imageMeta=imageRow.mediaMetadata||{};
    eq(imageRow.messageType,'IMAGE','IMAGE persistida');eq(imageRow.textBody,null,'imagem sem OCR');eq(imageMeta.mimeType,'image/jpeg','metadata imagem');ok(!JSON.stringify(imageMeta).includes('media.invalid'),'URL de mídia não persistida');

    response=await postWebhook(enabled.base,inboundPayload('wa2-document',{documentMessage:{mimetype:'application/pdf',fileName:'comprovante.pdf',fileLength:'4321',url:'https://media.invalid/doc?secret=x'}}));eq(response.status,201,'PDF aceito');
    const docRow=await prisma.messagingInbound.findFirstOrThrow({where:{providerMessageId:'wa2-document'}});
    eq(docRow.messageType,'DOCUMENT','DOCUMENT persistido');eq(docRow.textBody,null,'PDF não interpretado');eq((docRow.mediaMetadata||{}).fileName,'comprovante.pdf','metadata documento');ok(!JSON.stringify(docRow.mediaMetadata).includes('media.invalid'),'URL documento não persistida');

    const statusTarget=await prisma.messagingOutbox.findUniqueOrThrow({where:{id:concurrentMessage.id}});
    response=await postWebhook(enabled.base,statusPayload(statusTarget.providerMessageId,'DELIVERY_ACK'));eq(response.status,201,'delivery aceito');eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:statusTarget.id}})).status,'DELIVERED','SENT -> DELIVERED');eq(await prisma.auditEvent.count({where:{action:'communication.delivered',entityId:statusTarget.id}}),1,'delivery audit único');
    response=await postWebhook(enabled.base,statusPayload(statusTarget.providerMessageId,'READ'));eq(response.status,201,'read aceito');eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:statusTarget.id}})).status,'READ','DELIVERED -> READ');eq(await prisma.auditEvent.count({where:{action:'communication.read',entityId:statusTarget.id}}),1,'read audit único');
    response=await postWebhook(enabled.base,statusPayload(statusTarget.providerMessageId,'DELIVERY_ACK'));eq(response.status,201,'delivery repetido aceito');eq((await prisma.messagingOutbox.findUniqueOrThrow({where:{id:statusTarget.id}})).status,'READ','não regride READ');eq(await prisma.auditEvent.count({where:{action:'communication.delivered',entityId:statusTarget.id}}),1,'sem audit delivery duplicado');
    response=await postWebhook(enabled.base,statusPayload(statusTarget.providerMessageId,'READ'));eq(response.status,201,'READ repetido aceito');eq(await prisma.auditEvent.count({where:{action:'communication.read',entityId:statusTarget.id}}),1,'sem audit read duplicado');

    const allAudit=JSON.stringify(await prisma.auditEvent.findMany({where:{OR:[{entityType:'MessagingInbound'},{entityType:'MessagingOutbox'}]}}));
    ok(!allAudit.includes(secret)&&!allAudit.includes('segredo-invalido')&&!allAudit.includes('TEST_PROVIDER_SECRET_MUST_NOT_LEAK'),'AuditEvent não contém secrets');
  }finally{await stopServer(enabled)}
  ok(!enabled.logs().includes(secret)&&!enabled.logs().includes('segredo-invalido'),'logs não vazam secrets');
  console.log(JSON.stringify({ok:true,checks,feature:'wa2_evolution_provider_inbound_webhook',outboundExternalCalls:false,webhookUnitInference:false}));
}finally{
  process.env.WHATSAPP_AUTOMATION_ENABLED=oldAutomation;
  await prisma.auditEvent.deleteMany({where:{OR:[{entityType:'MessagingInbound'},{entityType:'MessagingOutbox'}]}}).catch(()=>{});await prisma.messagingInbound.deleteMany().catch(()=>{});await prisma.messagingOutbox.deleteMany().catch(()=>{});
  await prisma.clientUnitLink.deleteMany({where:{clientId}}).catch(()=>{});await prisma.client.deleteMany({where:{id:clientId}}).catch(()=>{});await prisma.messagingChannel.updateMany({data:{enabled:false}}).catch(()=>{});await prisma.$disconnect();
}
