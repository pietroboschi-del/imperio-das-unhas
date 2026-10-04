import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assertClientBatchSet,normalizeBatchSet,normalizeEmail,probableSameName,reconcileClientBatch} from '../src/migration/client-batch.logic.ts';
let tests=0;const ok=(v,m)=>{tests++;assert.ok(v,m)};const eq=(a,b,m)=>{tests++;assert.deepEqual(a,b,m)};
const H=n=>'sha256:'+String(n).padStart(64,'0');
const input={mode:'CLIENTS_ONLY',batchId:'BATCH_2_PRE_CUTOVER',phase:'PRE_CUTOVER',files:[
 {unitId:'centro',exportedAt:'2026-10-01T10:00:00-03:00',fileName:'centro.xlsx',fileHash:H(1),rows:[
   {id:'c1',nome:'Ana Silva',telefone:'31999990000',email:'ANA@EXAMPLE.COM',cpf:'111.222.333-44',sourceRow:2},
   {id:'c2',nome:'Joao A',telefone:'31988880000',sourceRow:3}
 ]},
 {unitId:'big',exportedAt:'2026-10-01T10:05:00-03:00',fileName:'big.xlsx',fileHash:H(2),rows:[
   {id:'b1',nome:'Ana Silva',telefone:'31999990000',cpf:'11122233344',sourceRow:2},
   {id:'b2',nome:'Maria B',telefone:'31988880000',sourceRow:3}
 ]},
 {unitId:'shopping-contagem',exportedAt:'2026-10-01T10:10:00-03:00',fileName:'shopping.xlsx',fileHash:H(3),rows:[]}
]};
const prevCentro={batchId:'BATCH_1_REHEARSAL',rows:normalizeBatchSet({mode:'CLIENTS_ONLY',batchId:'BATCH_1_REHEARSAL',phase:'REHEARSAL',files:[{unitId:'centro',exportedAt:'2026-09-25T10:00:00-03:00',fileName:'centro-old.xlsx',fileHash:H(4),rows:[{id:'c1',nome:'Ana Silva',telefone:'31999990000',email:'old@example.com',cpf:'11122233344',sourceRow:2},{id:'gone',nome:'Sumiu',telefone:'31977770000',sourceRow:3}]}]})};
const central=[{id:'db-ana',name:'Ana Silva',phone:'+5531999990000',email:'central@example.com',registrationUnitId:null,updatedAt:'2026-10-01T12:00:00.000Z',legacyPayload:{clientsOnly:{cpf:'11122233344',sources:[{unitId:'centro',sourceId:'c1'}]}},unitIds:['centro']}];
const report=reconcileClientBatch(input,{centro:prevCentro},central);
eq(report.crossUnit.multiUnitClusters,1,'mesma pessoa em Centro+Big deve virar cluster de rede');
const ana=report.plans.find(p=>p.source.cpf==='11122233344');ok(ana,'cluster Ana existe');eq(ana.targetClientId,'db-ana','CPF/proveniência encontra cliente central');eq(ana.unitLinksToAdd,['big'],'adiciona apenas vínculo ausente');eq(ana.action,'REVIEW_REQUIRED','valor central não vazio diferente exige revisão');ok(ana.conflicts.some(c=>c.field==='email'&&c.type==='CENTRAL_FIELD_CONFLICT'),'conflito central registrado');
const centroDiff=report.files.find(f=>f.unitId==='centro').snapshotDiff;eq(centroDiff.changed,1,'snapshot alterado detectado');eq(centroDiff.missingFromNewSnapshot,1,'ausente é diferença, não exclusão');
const shared=report.plans.filter(p=>p.source.phone==='+5531988880000');eq(shared.length,2,'telefone familiar não funde nomes diferentes');ok(shared.every(p=>p.action==='CREATE'),'telefone compartilhado com nomes claramente diferentes não bloqueia criação separada');
ok(report.invariants.missingRowsNeverDeleteCentralClients,'invariante no-delete');ok(report.invariants.registrationUnitNeverInferredFromFileUnit,'unidade do arquivo não vira registrationUnit');
const again=reconcileClientBatch(input,{centro:prevCentro},central);eq(again.reportHash,report.reportHash,'dry-run determinístico/idempotente');
const shuffledInput=structuredClone(input);
shuffledInput.files.reverse();
for(const f of shuffledInput.files)f.rows.reverse();
const shuffledPrev={centro:{batchId:prevCentro.batchId,rows:[...prevCentro.rows].reverse()}};
const shuffled=reconcileClientBatch(shuffledInput,shuffledPrev,[...central].reverse());
eq(shuffled.reportHash,report.reportHash,'reportHash independe da ordem de arquivos, linhas, snapshots e clientes centrais');
eq(shuffled.plans,report.plans,'planos canônicos permanecem idênticos após embaralhar a entrada');
ok(report.reportHash.startsWith('sha256:'),'relatório possui hash de aprovação');

const rogueUnit=structuredClone(input);
rogueUnit.batchId='BATCH_INVALID_UNIT';
rogueUnit.files=[{...rogueUnit.files[0],unitId:'unidade-fantasma'}];
let rogueError='';
try{assertClientBatchSet(rogueUnit)}catch(e){rogueError=String(e?.message||e)}
ok(rogueError.includes('unitId não canônico'),'CLIENTS_ONLY rejeita unidade fora das três canônicas antes do staging');

const similarInput={mode:'CLIENTS_ONLY',batchId:'BATCH_WEAK_NAME_REVIEW',phase:'REHEARSAL',files:[{unitId:'centro',exportedAt:'2026-10-01T11:00:00-03:00',fileName:'similar.xlsx',fileHash:H(50),rows:[
  {id:'s1',nome:'Aline Pontello',celular:'31984869296',sourceRow:2},
  {id:'s2',nome:'Aline Pontelo',celular:'31984869296',sourceRow:3}
]}]};
const similar=reconcileClientBatch(similarInput,{},[]);
eq(similar.crossUnit.clusters,2,'nomes parecidos com contato compartilhado não são fundidos automaticamente');
ok(similar.plans.every(p=>p.action==='REVIEW_REQUIRED'),'nomes parecidos com mesmo telefone permanecem em revisão');
ok(similar.conflicts.every(c=>c.type==='AMBIGUOUS_WEAK_MATCH'&&c.field==='phone'&&c.sourceValue==='+5531984869296'),'review informa telefone que causou ambiguidade');
ok(probableSameName('TATIANE FERNANA FERREIRA','TATIANE FERNANDA FERREIRA'),'erro pequeno de grafia é candidato fraco');
ok(!probableSameName('ADRIANA ANDRADE FARIA','ELIANE DE ANDRADE FARIA'),'nomes claramente distintos em telefone familiar não viram candidato');
eq(normalizeEmail('on'),null,'texto sem formato de e-mail é ignorado para deduplicação');
eq(normalizeEmail('ANA@EXAMPLE.COM'),'ana@example.com','e-mail válido continua normalizado');
const service=fs.readFileSync(new URL('../src/migration/client-batch.service.ts',import.meta.url),'utf8');ok(service.includes("CLIENT_BATCH_COMMIT_ENABLED"),'commit tem gate dedicado');ok(service.includes("MIGRATION_IMPORT_ENABLED"),'commit também respeita gate global');ok(service.includes("TransactionIsolationLevel.Serializable"),'commit usa transação serializable');ok(!service.includes('client.deleteMany')&&!service.includes('clientUnitLink.deleteMany'),'CLIENTS_ONLY não apaga clientes/vínculos');ok(service.includes("phase!=='FINAL'"),'somente FINAL pode promover');ok(service.includes('approvalReportHash'),'commit exige hash do relatório aprovado');ok(service.includes('sourceRow')&&service.includes('fileHash')&&service.includes('fileName')&&service.includes('exportedAt'),'proveniência de arquivo/linha persistida');ok(service.includes('pendingOnly')&&service.includes("status!==ImportStatus.IMPORTED"),'FINAL escalonado ignora unidades já promovidas na onda seguinte');
console.log(JSON.stringify({ok:true,tests,feature:'clients_only_versioned_batches'}));
