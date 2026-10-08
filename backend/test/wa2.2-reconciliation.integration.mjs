import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {ensureCanonicalUnits} from '../dist/src/core/canonical-units.js';
import {MessagingFoundationService} from '../dist/src/messaging/messaging-foundation.service.js';
import {MessagingDispatchService} from '../dist/src/messaging/messaging-dispatch.service.js';
import {MessagingReconciliationService} from '../dist/src/messaging/messaging-reconciliation.service.js';
import {FakeMessagingProvider} from './helpers/fake-messaging-provider.mjs';

const db=new PrismaClient();
const old=process.env.WHATSAPP_AUTOMATION_ENABLED;
let checks=0;
const eq=(a,b,msg)=>{checks++;assert.equal(a,b,msg)};
const ok=(v,msg)=>{checks++;assert.ok(v,msg)};
async function queued(foundation,suffix){
  return foundation.queueMessage({channelId:'BIG_CENTRO',unitId:'big',idempotencyKey:'wa2.2:'+suffix,
    messageType:'WA2_2_TEST',trigger:'WA2_2_TEST',payload:{number:'5531999990000',text:'wa2.2 test'}});
}
try{
 await db.$connect();await ensureCanonicalUnits(db);
 await db.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}});
 await db.messagingOutbox.deleteMany();await db.messagingChannel.updateMany({data:{enabled:false}});
 await db.messagingChannel.update({where:{id:'BIG_CENTRO'},data:{enabled:true}});
 process.env.WHATSAPP_AUTOMATION_ENABLED='true';
 const foundation=new MessagingFoundationService(db);
 const reconcile=new MessagingReconciliationService(db);
 const fake=new FakeMessagingProvider();
 const dispatch=new MessagingDispatchService(db,fake);
 fake.failureCertainty='DELIVERY_UNKNOWN';fake.failuresRemaining=1;
 const ambiguous=await queued(foundation,'ambiguous');
 eq((await dispatch.processOne(ambiguous.id)).outcome,'RECONCILIATION_REQUIRED','unknown provider result quarantined');
 let row=await db.messagingOutbox.findUniqueOrThrow({where:{id:ambiguous.id}});
 eq(row.status,'RECONCILIATION_REQUIRED','unknown status persisted');
 eq(row.nextAttemptAt,null,'unknown no retry schedule');
 eq(row.attempts,1,'attempt count preserved');
 eq((await dispatch.processOne(ambiguous.id)).outcome,'SKIPPED','direct dispatch cannot bypass');
 await dispatch.processPending(10);
 eq(fake.calls.length,1,'pending dispatch never resends unknown');
 ok(await db.auditEvent.count({where:{entityId:ambiguous.id,action:'communication.reconciliation_required'}})===1,'uncertainty audited');
 await reconcile.reconcile(ambiguous.id,'CONFIRM_NOT_SENT','wa2-test-operator');
 row=await db.messagingOutbox.findUniqueOrThrow({where:{id:ambiguous.id}});
 eq(row.status,'FAILED','explicit proof of no send permits retry');
 ok(row.nextAttemptAt instanceof Date,'controlled retry has due date');
 fake.failureCertainty='DEFINITE_FAILURE';
 eq((await dispatch.processOne(ambiguous.id)).outcome,'SENT','exactly one controlled retry');
 eq(fake.calls.length,2,'controlled retry sends once');
 await assert.rejects(reconcile.reconcile(ambiguous.id,'CONFIRM_NOT_SENT','wa2-test-operator'),/not awaiting reconciliation/i);checks++;
 const second=await queued(foundation,'confirmed-sent');
 fake.failureCertainty='DELIVERY_UNKNOWN';fake.failuresRemaining=1;
 eq((await dispatch.processOne(second.id)).outcome,'RECONCILIATION_REQUIRED','second unknown');
 await reconcile.reconcile(second.id,'CONFIRM_SENT','wa2-test-operator','external-confirmed-id');
 row=await db.messagingOutbox.findUniqueOrThrow({where:{id:second.id}});
 eq(row.status,'SENT','confirmed sent is terminal');eq(row.providerMessageId,'external-confirmed-id','external id persisted');
 await dispatch.processPending(10);
 eq(fake.calls.length,3,'confirmed sent not resent');
 const definite=await queued(foundation,'definite-terminal');
 fake.failureCertainty='DEFINITE_FAILURE';fake.failureRetryable=false;fake.failuresRemaining=1;
 eq((await dispatch.processOne(definite.id)).outcome,'FAILED','definite nonretryable failure');
 row=await db.messagingOutbox.findUniqueOrThrow({where:{id:definite.id}});
 eq(row.nextAttemptAt,null,'definite terminal failure not scheduled');
 eq((await dispatch.processOne(definite.id)).outcome,'SKIPPED','terminal failure does not bypass');
 const concurrent=await queued(foundation,'concurrent');
 fake.delayMs=125;
 const before=fake.calls.length;
 await Promise.all([dispatch.processOne(concurrent.id),dispatch.processOne(concurrent.id)]);
 eq(fake.calls.length,before+1,'concurrent workers call provider only once');
 const stale=await queued(foundation,'stale');
 await db.messagingOutbox.update({where:{id:stale.id},data:{status:'SENDING',attempts:1,lastAttemptAt:new Date(Date.now()-600000)}});
 const recovered=await dispatch.recoverStaleSending(20);
 ok(recovered.ids.includes(stale.id),'stale quarantined');
 row=await db.messagingOutbox.findUniqueOrThrow({where:{id:stale.id}});
 eq(row.status,'RECONCILIATION_REQUIRED','stale uncertainty persisted');eq(row.nextAttemptAt,null,'stale has no retry');
 console.log(JSON.stringify({ok:true,checks,feature:'wa2_2_reconciliation',externalCalls:false}));
}finally{
 process.env.WHATSAPP_AUTOMATION_ENABLED=old;
 await db.auditEvent.deleteMany({where:{entityType:'MessagingOutbox'}}).catch(()=>{});
 await db.messagingOutbox.deleteMany().catch(()=>{});
 await db.messagingChannel.updateMany({data:{enabled:false}}).catch(()=>{});
 await db.$disconnect();
}
