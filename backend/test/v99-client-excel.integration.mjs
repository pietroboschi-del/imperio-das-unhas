import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();
let tests=0;
const ok=(v,m)=>{tests++;assert.ok(v,m)};
const eq=(a,b,m)=>{tests++;assert.deepEqual(a,b,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
const fixture=name=>new URL('./fixtures/'+name,import.meta.url);
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');

async function waitHealth(){
  for(let i=0;i<60;i++){
    try{const r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}
    await sleep(500);
  }
  throw new Error('backend não iniciou');
}

async function main(){
  await prisma.migrationEntity.deleteMany();
  await prisma.migrationEnvelope.deleteMany();
  await prisma.clientUnitLink.deleteMany();
  await prisma.client.deleteMany();
  await prisma.session.deleteMany();

  await prisma.client.create({
    data:{
      id:'central-ana-xlsx',
      name:'Ana Silva',
      phone:'+5531999990000',
      email:'ana.central@example.com',
      legacyPayload:{clientsOnly:{cpf:'11122233344',sources:[{unitId:'centro',sourceId:'C1'}]}}
    }
  });

  const server=spawn(process.execPath,['dist/src/main.js'],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,CLIENT_BATCH_COMMIT_ENABLED:'false',MIGRATION_IMPORT_ENABLED:'true',OPERATIONAL_WRITES_ENABLED:'false'},
    stdio:['ignore','pipe','pipe']
  });
  let serverOut='';
  server.stdout?.on('data',d=>serverOut+=d.toString());
  server.stderr?.on('data',d=>serverOut+=d.toString());

  try{
    try{await waitHealth()}catch(e){throw new Error(e.message+'\n'+serverOut)}
    let r=await fetch(base+'/api/v1/auth/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})
    });
    ok(r.ok,'owner login');
    const cookie=cookieOf(r),auth=await r.json();

    const names=['centro_clientes_rehearsal.xlsx','big_clientes_rehearsal.xlsx','shopping_clientes_rehearsal.xlsx'];
    const units=['centro','big','shopping-contagem'];
    const buffers=names.map(n=>fs.readFileSync(fixture(n)));
    const manifest={
      batchId:'BATCH_XLSX_REHEARSAL',
      phase:'REHEARSAL',
      files:units.map((unitId,i)=>({
        unitId,
        exportedAt:['2026-10-01T11:30:00-03:00','2026-10-01T11:35:00-03:00','2026-10-01T11:40:00-03:00'][i],
        sourceUpdatedAtReliable:false
      }))
    };
    const form=new FormData();
    form.set('manifest',JSON.stringify(manifest));
    for(let i=0;i<buffers.length;i++)form.append('files',new Blob([buffers[i]],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),names[i]);

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/excel/dry-run',{
      method:'POST',
      headers:{'x-csrf-token':auth.csrfToken,'cookie':cookie},
      body:form
    });
    if(!r.ok)throw new Error('Excel dry-run falhou HTTP '+r.status+': '+await r.text());
    const body=await r.json();
    ok(body.ok===true&&body.mode==='dry-run','xlsx dry-run executado');
    ok(body.commitEnabled===false,'commit segue bloqueado');
    ok(body.realClientRowsMutated===false,'nenhuma mutação central');
    eq(body.excel.length,3,'três arquivos inspecionados');
    eq(body.excel.map(x=>x.rowCount),[2,2,1],'linhas lidas dos três xlsx');
    eq(body.excel.map(x=>x.sheetName),['Clientes','Clientes','Clientes'],'primeira planilha selecionada');

    for(let i=0;i<3;i++){
      eq(body.excel[i].fileHash,hash(buffers[i]),'hash bruto SHA-256 arquivo '+(i+1));
      ok(body.excel[i].headers.includes('Nome'),'cabeçalho Nome detectado');
      ok(body.excel[i].mappedHeaders.some(x=>x.sourceHeader==='Código'&&x.canonicalKey==='sourceId'),'Código mapeado');
      ok(body.excel[i].mappedHeaders.some(x=>x.sourceHeader==='Data Alteração'&&x.canonicalKey==='sourceUpdatedAt'),'data de alteração mapeada');
      ok(body.excel[i].unmappedHeaders.includes('Unidade'),'Unidade genérica não vira registrationUnitId');
      ok(!body.excel[i].mappedHeaders.some(x=>x.sourceHeader==='Unidade'&&x.canonicalKey==='registrationUnitId'),'sem inferência de unidade de cadastro');
    }

    eq(body.report.batchId,'BATCH_XLSX_REHEARSAL','batch xlsx correto');
    eq(body.report.crossUnit.multiUnitClusters,1,'Ana reconciliada entre Centro e Big a partir de xlsx');
    const ana=body.report.plans.find(p=>p.targetClientId==='central-ana-xlsx');
    ok(ana,'Ana central encontrada');
    eq(ana.action,'REVIEW_REQUIRED','e-mail divergente exige review');
    ok(ana.conflicts.some(c=>c.type==='CENTRAL_FIELD_CONFLICT'&&c.field==='email'),'conflito de e-mail reportado');
    ok(ana.sourceRows.some(s=>s.sourceRow===2&&s.fileName==='centro_clientes_rehearsal.xlsx'),'linha e arquivo de origem preservados');

    const centroEnv=await prisma.migrationEnvelope.findFirst({where:{instanceId:'clients:centro',reconciliationId:'BATCH_XLSX_REHEARSAL'}});
    ok(centroEnv?.dataHash===hash(buffers[0]),'hash bruto persistido no staging');
    const centroRows=await prisma.migrationEntity.findMany({where:{envelopeId:centroEnv.id},orderBy:{sourceId:'asc'}});
    ok(centroRows.some(x=>x.sourceId==='C1'),'identificador de origem vindo do Excel');
    const raw=centroRows.find(x=>x.sourceId==='C1').payload.raw;
    ok(raw.Unidade==='Centro de Contagem','coluna não mapeada preservada no raw');
    ok(raw.registrationUnitId===undefined,'raw não inventa registrationUnitId');
    eq(await prisma.client.count(),1,'nenhum cliente real criado');
    eq(await prisma.clientUnitLink.count(),0,'nenhum vínculo real criado');

    // Regressão real do Avec: XML com atributos em aspas simples e sem referências de célula.
    const legacyBuffer=fs.readFileSync(fixture('avec_single_quote_synthetic.xlsx'));
    const legacyHash=hash(legacyBuffer);
    const stale=await prisma.migrationEnvelope.create({
      data:{
        instanceId:'clients:centro',
        revision:99,
        schemaVersion:1,
        contractVersion:1,
        dataHash:legacyHash,
        canonicalDataHash:'sha256:'+'0'.repeat(64),
        sourceKind:'CLIENTS_ONLY_BATCH',
        reconciliationId:'BATCH_LEGACY_REPARSE',
        sourceGeneratedAt:new Date('2026-10-01T14:40:00-03:00'),
        status:'VALIDATED',
        summary:{
          mode:'CLIENTS_ONLY',
          batchId:'BATCH_LEGACY_REPARSE',
          phase:'REHEARSAL',
          unitId:'centro',
          exportedAt:'2026-10-01T14:40:00-03:00',
          fileName:'avec_single_quote_synthetic.xlsx',
          fileHash:legacyHash,
          rowCount:1
        }
      }
    });
    await prisma.migrationEntity.create({
      data:{
        envelopeId:stale.id,
        sourceCollection:'clients',
        sourceId:'row:2',
        unitId:'centro',
        payloadHash:'sha256:'+'1'.repeat(64),
        payload:{
          source:{batchId:'BATCH_LEGACY_REPARSE',phase:'REHEARSAL',unitId:'centro',exportedAt:'2026-10-01T14:40:00.000Z',fileName:'avec_single_quote_synthetic.xlsx',fileHash:legacyHash,sourceRow:2,sourceId:null,sourceUpdatedAtReliable:false},
          name:null,nameKey:null,phone:null,email:null,cpf:null,registrationUnitId:null,registrationUnitProven:false,sourceUpdatedAt:null,
          legacyProfile:{birthDate:null,phoneFixed:null,gender:null,referralSource:null,postalCode:null,addressLine:null,addressNumber:null,state:null,city:null,addressComplement:null,neighborhood:null,profession:null,sourceCreatedAt:null,notes:null,rg:null},
          fingerprint:'sha256:'+'2'.repeat(64),
          raw:{sourceRow:2,'33297858':33297858,'31984444949':31984444949,'0':0}
        }
      }
    });

    const legacyManifest={batchId:'BATCH_LEGACY_REPARSE',phase:'REHEARSAL',files:[{unitId:'centro',exportedAt:'2026-10-01T14:40:00-03:00',sourceUpdatedAtReliable:false}]};
    const legacyForm=new FormData();
    legacyForm.set('manifest',JSON.stringify(legacyManifest));
    legacyForm.append('files',new Blob([legacyBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'avec_single_quote_synthetic.xlsx');
    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/excel/dry-run',{
      method:'POST',headers:{'x-csrf-token':auth.csrfToken,'cookie':cookie},body:legacyForm
    });
    if(!r.ok)throw new Error('Legacy reparse falhou HTTP '+r.status+': '+await r.text());
    const legacyBody=await r.json();
    eq(legacyBody.excel[0].rowCount,1,'layout legado lê exatamente a linha de dados');
    eq(legacyBody.excel[0].headers[0],'Cliente','header inlineStr em aspas simples reconhecido');
    eq(legacyBody.excel[0].unmappedHeaders,[],'valores da primeira cliente não viram cabeçalhos');
    eq(legacyBody.report.summary.creates,1,'cliente válido deixa de cair em missing name');
    eq(legacyBody.report.summary.reviewRequired,0,'reparse não exige review por nome ausente');
    const staleAfter=await prisma.migrationEnvelope.findUnique({where:{id:stale.id}});
    eq(staleAfter.status,'REJECTED','snapshot produzido por parser antigo é preservado e rejeitado');
    ok(staleAfter.errorSummary?.reason==='PARSER_VERSION_SUPERSEDED','motivo da rejeição auditável');
    const reparsed=await prisma.migrationEnvelope.findFirst({where:{instanceId:'clients:centro',reconciliationId:'BATCH_LEGACY_REPARSE',status:'VALIDATED'},orderBy:{revision:'desc'}});
    ok(reparsed&&reparsed.id!==stale.id,'nova revisão válida criada');
    ok(typeof reparsed.summary?.parserVersion==='string','nova revisão registra versão do parser');
    const reparsedRows=await prisma.migrationEntity.findMany({where:{envelopeId:reparsed.id}});
    eq(reparsedRows.length,1,'staging novo contém uma linha');
    eq(reparsedRows[0].sourceId,'33297858','Código real volta a ser sourceId');
    eq(reparsedRows[0].payload.name,'CLIENTE TESTE','nome real volta a ser reconhecido');

    const legacyFormAgain=new FormData();
    legacyFormAgain.set('manifest',JSON.stringify(legacyManifest));
    legacyFormAgain.append('files',new Blob([legacyBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'avec_single_quote_synthetic.xlsx');
    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/excel/dry-run',{
      method:'POST',headers:{'x-csrf-token':auth.csrfToken,'cookie':cookie},body:legacyFormAgain
    });
    const legacyAgain=await r.json();
    ok(r.ok&&legacyAgain.staged[0].reused===true,'reprocessamento com parser atual é idempotente');
    eq(await prisma.migrationEnvelope.count({where:{instanceId:'clients:centro',reconciliationId:'BATCH_LEGACY_REPARSE',status:'VALIDATED'}}),1,'sem terceira revisão duplicada');

    const bad=new FormData();
    bad.set('manifest',JSON.stringify({batchId:'BATCH_BAD_XLS',phase:'REHEARSAL',files:[{unitId:'centro',exportedAt:'2026-10-01T12:00:00-03:00'}]}));
    bad.append('files',new Blob([Buffer.from('arquivo-antigo')]),'clientes.xls');
    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/excel/dry-run',{
      method:'POST',headers:{'x-csrf-token':auth.csrfToken,'cookie':cookie},body:bad
    });
    eq(r.status,400,'.xls legado rejeitado');

    console.log(JSON.stringify({
      ok:true,
      tests,
      feature:'clients_only_excel_xlsx',
      batchId:body.report.batchId,
      reportHash:body.report.reportHash,
      summary:body.report.summary
    }));
  }finally{
    server.kill('SIGTERM');
    await prisma.$disconnect();
  }
}

main().catch(async e=>{
  console.error(e.stack||e);
  await prisma.$disconnect().catch(()=>{});
  process.exit(1);
});
