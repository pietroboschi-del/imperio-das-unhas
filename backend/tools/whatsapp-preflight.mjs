// Read-only WA1–WA5 activation preflight. Never prints secret values.
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const present=name=>Boolean(String(process.env[name]||'').trim());
const enabled=name=>String(process.env[name]||'false').trim().toLowerCase()==='true';
const item=(name,status,detail)=>({name,status,detail});
const requirements=[];
const requiredMigrations=['20261005_wa1_messaging_foundation','20261006_wa2_evolution_inbound',
 '20261006_wa4_management_tasks','20261006_wa5_1_messaging_automation',
 '20261008_wa2_outbox_reconciliation_required'];
for(const name of requiredMigrations)requirements.push(item('migration:'+name,existsSync(resolve(root,'prisma/migrations',name,'migration.sql'))?'READY':'MISSING CONFIG','Local migration artifact only; does not prove live deployment'));
for(const name of ['WHATSAPP_AUTOMATION_ENABLED','WHATSAPP_AGENT_API_ENABLED','EVOLUTION_WEBHOOK_ENABLED']){
 requirements.push(item('flag:'+name,enabled(name)?'OWNER ACTION REQUIRED':'READY',enabled(name)?'Flag ON; activation requires separate approval':'OFF; safe default'));
}
requirements.push(item('provider_url',present('EVOLUTION_API_BASE_URL')?'READY':'PROVIDER REQUIRED','Only presence checked; no external request'));
requirements.push(item('provider_api_key',present('EVOLUTION_API_KEY')?'READY':'SECRET REQUIRED','Value never displayed'));
for(const name of ['EVOLUTION_INSTANCE_CENTRAL','EVOLUTION_INSTANCE_BIG_CENTRO','EVOLUTION_INSTANCE_SHOPPING_CONTAGEM'])
 requirements.push(item('instance:'+name,present(name)?'READY':'PROVIDER REQUIRED','Per-channel provider mapping'));
requirements.push(item('webhook_secret',present('EVOLUTION_WEBHOOK_SECRET')?'READY':'SECRET REQUIRED','Never displayed'));
requirements.push(item('real_number_connection','OWNER ACTION REQUIRED','Requires authorized future operator/provider verification'));
const packageJson=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
for(const script of ['test:wa1','test:wa2','test:wa2.1','test:wa2.2','test:wa4-e2e','test:wa5.8']){
 requirements.push(item('job:'+script,packageJson.scripts?.[script]?'READY':'MISSING CONFIG','Script defined locally; runtime scheduling not proven'));
}
const staleRaw=Number(process.env.MESSAGING_SENDING_STALE_MS||300000);
const staleMs=Number.isFinite(staleRaw)&&staleRaw>=1000?Math.min(86400000,Math.trunc(staleRaw)):300000;
const endpoints=['POST /api/v1/integrations/evolution/webhook',
 'GET /api/v1/admin/messaging/outbox/reconciliation',
 'POST /api/v1/admin/messaging/outbox/:id/reconcile'];
let outbox={status:'NOT APPLICABLE',reason:'No database configured; no writes attempted'};
if(present('DATABASE_URL')){
 const prisma=new PrismaClient();
 try{
   const [statuses,stale]=await Promise.all([
     prisma.messagingOutbox.groupBy({by:['status'],_count:{_all:true}}),
     prisma.messagingOutbox.count({where:{status:'SENDING',lastAttemptAt:{lt:new Date(Date.now()-staleMs)}}}),
   ]);
   outbox={status:'READY',counts:Object.fromEntries(statuses.map(s=>[s.status,s._count._all])),
     reconciliationRequired:statuses.find(x=>x.status==='RECONCILIATION_REQUIRED')?._count._all||0,
     staleSending:stale};
 }catch{
   outbox={status:'MISSING CONFIG',reason:'Outbox could not be read; verify schema/migration and DB connectivity'};
 }finally{await prisma.$disconnect()}
}
const result={name:'whatsapp:preflight',mode:'READ_ONLY',providerRequests:0,dbMutations:0,
 requirements,staleThresholdMs:staleMs,webhookExpected:'POST /api/v1/integrations/evolution/webhook',
 endpoints,outbox,activationPerformed:false};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
