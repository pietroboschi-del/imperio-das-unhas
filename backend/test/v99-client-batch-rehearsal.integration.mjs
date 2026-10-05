import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();
let tests=0;
const ok=(v,m)=>{tests++;assert.ok(v,m)};
const eq=(a,b,m)=>{tests++;assert.deepEqual(a,b,m)};
const base='http://127.0.0.1:'+(process.env.PORT||3100);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const H=n=>'sha256:'+String(n).padStart(64,'0');
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];

async function waitHealth(){
  for(let i=0;i<60;i++){
    try{const r=await fetch(base+'/api/v1/health');if(r.ok)return}catch{}
    await sleep(500);
  }
  throw new Error('backend não iniciou');
}

function rehearsalPayload(){
  return {
    mode:'CLIENTS_ONLY',
    batchId:'BATCH_1_REHEARSAL',
    phase:'REHEARSAL',
    files:[
      {
        unitId:'centro',
        exportedAt:'2026-10-01T11:30:00-03:00',
        fileName:'centro_clientes_rehearsal.xlsx',
        fileHash:H(101),
        rows:[
          {sourceRow:2,id:'centro-ana',nome:'Ana Silva',telefone:'(31) 99999-0000',email:'ana.legado@example.com',cpf:'111.222.333-44'},
          {sourceRow:3,id:'centro-joao',nome:'João A',telefone:'(31) 98888-0000'}
        ]
      },
      {
        unitId:'big',
        exportedAt:'2026-10-01T11:35:00-03:00',
        fileName:'big_clientes_rehearsal.xlsx',
        fileHash:H(102),
        rows:[
          {sourceRow:2,id:'big-ana',nome:'Ana Silva',telefone:'31999990000',cpf:'11122233344'},
          {sourceRow:3,id:'big-maria',nome:'Maria B',telefone:'31988880000'}
        ]
      },
      {
        unitId:'shopping-contagem',
        exportedAt:'2026-10-01T11:40:00-03:00',
        fileName:'shopping_clientes_rehearsal.xlsx',
        fileHash:H(103),
        rows:[
          {sourceRow:2,id:'shopping-clara',nome:'Clara Souza',telefone:'31977770000',email:'clara@example.com',registrationUnitId:'shopping-contagem'}
        ]
      }
    ]
  };
}

async function main(){
  await prisma.migrationEntity.deleteMany();
  await prisma.migrationEnvelope.deleteMany();
  await prisma.clientUnitLink.deleteMany();
  await prisma.client.deleteMany();
  await prisma.session.deleteMany();

  await prisma.client.create({
    data:{
      id:'central-ana',
      name:'Ana Silva',
      phone:'+5531999990000',
      email:'ana.central@example.com',
      legacyPayload:{clientsOnly:{cpf:'11122233344',sources:[{unitId:'centro',sourceId:'centro-ana'}]}}
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
    try{await waitHealth()}catch(e){throw new Error(`${e.message}\n${serverOut}`)}

    let r=await fetch(base+'/api/v1/auth/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})
    });
    ok(r.ok,'owner login');
    const cookie=cookieOf(r);
    const auth=await r.json();
    const headers={'content-type':'application/json','x-csrf-token':auth.csrfToken,'cookie':cookie};

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{
      method:'POST',headers,body:JSON.stringify(rehearsalPayload())
    });
    if(!r.ok)throw new Error(`dry-run falhou HTTP ${r.status}: ${await r.text()}`);
    const first=await r.json();

    ok(first.ok===true&&first.mode==='dry-run','dry-run executado');
    ok(first.realClientRowsMutated===false,'dry-run declara ausência de mutação central');
    ok(first.commitEnabled===false,'commit gate permanece fechado');
    eq(first.staged.length,3,'três snapshots por unidade');
    ok(first.staged.every(x=>x.reused===false),'primeiro processamento cria staging');

    const report=first.report;
    eq(report.batchId,'BATCH_1_REHEARSAL','batch correto');
    eq(report.phase,'REHEARSAL','fase correta');
    eq(report.files.map(x=>x.unitId).sort(),['big','centro','shopping-contagem'],'três unidades no relatório');
    ok(report.files.every(x=>x.comparedToBatchId===null),'primeiro rehearsal não possui snapshot anterior');
    eq(report.files.find(x=>x.unitId==='centro').snapshotDiff.new,2,'Centro: duas linhas novas');
    eq(report.files.find(x=>x.unitId==='big').snapshotDiff.new,2,'Big: duas linhas novas');
    eq(report.files.find(x=>x.unitId==='shopping-contagem').snapshotDiff.new,1,'Shopping: uma linha nova');
    eq(report.crossUnit.multiUnitClusters,1,'Ana reconciliada entre Centro e Big');

    const ana=report.plans.find(p=>p.targetClientId==='central-ana');
    ok(ana,'cliente central localizado');
    eq(ana.action,'REVIEW_REQUIRED','conflito central exige revisão');
    ok(ana.conflicts.some(c=>c.type==='CENTRAL_FIELD_CONFLICT'&&c.field==='email'),'e-mail divergente registrado como conflito');
    eq(ana.unitLinksToAdd.sort(),['big','centro'],'vínculos de unidades propostos sem commit');

    const family=report.plans.filter(p=>p.source.phone==='+5531988880000');
    eq(family.length,2,'telefone familiar mantém pessoas separadas');
    ok(family.every(p=>p.action==='CREATE'),'telefone familiar com nomes claramente diferentes permanece separado sem review');

    const clara=report.plans.find(p=>p.source.name==='Clara Souza');
    ok(clara,'Clara presente');
    eq(clara.source.registrationUnitId,null,'unidade do arquivo não vira registrationUnit sem prova');
    ok(clara.action==='CREATE','cliente inequívoco fica planejado para criação, sem efetivar');

    eq(await prisma.client.count(),1,'nenhum cliente real criado no dry-run');
    eq(await prisma.clientUnitLink.count(),0,'nenhum vínculo real criado no dry-run');
    eq(await prisma.migrationEnvelope.count({where:{sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:'BATCH_1_REHEARSAL'}}),3,'staging auditável persistido');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/BATCH_1_REHEARSAL/report',{headers:{cookie}});
    ok(r.ok,'relatório recuperável');
    const fetched=(await r.json()).report;
    eq(fetched.reportHash,report.reportHash,'relatório recuperado tem mesmo hash');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{
      method:'POST',headers,body:JSON.stringify(rehearsalPayload())
    });
    ok(r.ok,'reprocessamento aceito');
    const second=await r.json();
    ok(second.staged.every(x=>x.reused===true),'mesmos arquivos reutilizam staging');
    eq(second.report.reportHash,report.reportHash,'reprocessamento é idempotente');

    const incrementalBatch='BATCH_INCREMENTAL_SAME_WAVE';
    const incrementalCentro={mode:'CLIENTS_ONLY',batchId:incrementalBatch,phase:'REHEARSAL',files:[{
      unitId:'centro',exportedAt:'2026-10-05T08:00:00-03:00',fileName:'incremental-centro.xlsx',fileHash:H(130),rows:[
        {sourceRow:2,id:'inc-centro-lia',nome:'Lia Martins',celular:'31944443333',cpf:'741.852.963-10'}
      ]
    }]};
    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers,body:JSON.stringify(incrementalCentro)});
    ok(r.ok,'primeira unidade da mesma onda entra no staging');
    const incrementalFirst=await r.json();
    eq(incrementalFirst.report.files.map(x=>x.unitId),['centro'],'primeiro dry-run contém somente Centro');

    const incrementalBig={mode:'CLIENTS_ONLY',batchId:incrementalBatch,phase:'REHEARSAL',files:[{
      unitId:'big',exportedAt:'2026-10-05T08:05:00-03:00',fileName:'incremental-big.xlsx',fileHash:H(131),rows:[
        {sourceRow:2,id:'inc-big-lia',nome:'Lia Martins',celular:'31944443333',cpf:'74185296310'}
      ]
    }]};
    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/dry-run',{method:'POST',headers,body:JSON.stringify(incrementalBig)});
    ok(r.ok,'segunda unidade da mesma onda entra no mesmo batch ainda pendente');
    const incrementalSecond=await r.json();
    eq(incrementalSecond.staged.length,1,'resposta de staging identifica apenas o arquivo enviado nesta chamada');
    eq(incrementalSecond.report.files.map(x=>x.unitId).sort(),['big','centro'],'segundo dry-run recalcula relatório sobre Centro + Big persistidos');
    eq(incrementalSecond.report.crossUnit.multiUnitClusters,1,'reconciliação cruza as duas unidades staged em chamadas separadas');
    const lia=incrementalSecond.report.plans.find(p=>p.source.cpf==='74185296310');
    ok(lia&&lia.sourceRows.length===2,'plano consolida as duas linhas da mesma pessoa no batch completo');
    eq(await prisma.migrationEnvelope.count({where:{sourceKind:'CLIENTS_ONLY_BATCH',reconciliationId:incrementalBatch}}),2,'batch pendente mantém um envelope por unidade');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/BATCH_1_REHEARSAL/finalize-staging',{
      method:'POST',headers,body:JSON.stringify({approvalReportHash:report.reportHash})
    });
    if(!r.ok)throw new Error(`finalize staging falhou HTTP ${r.status}: ${await r.text()}`);
    const finalized=await r.json();
    ok(finalized.ok===true&&finalized.mode==='finalize-staging','transição formal do staging executada');
    eq(finalized.phase,'FINAL','batch passa formalmente para FINAL');
    ok(finalized.realClientRowsMutated===false,'finalização do staging não altera clientes reais');
    ok(finalized.finalReportHash!==report.reportHash,'fase FINAL produz novo reportHash');
    eq(await prisma.client.count(),1,'nenhum cliente real criado ao finalizar staging');
    eq(await prisma.clientUnitLink.count(),0,'nenhum vínculo real criado ao finalizar staging');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/BATCH_1_REHEARSAL/report',{headers:{cookie}});
    ok(r.ok,'relatório FINAL recuperável');
    const finalReport=(await r.json()).report;
    eq(finalReport.phase,'FINAL','relatório persistido está FINAL');
    eq(finalReport.reportHash,finalized.finalReportHash,'hash FINAL é estável na leitura');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/BATCH_1_REHEARSAL/finalize-staging',{
      method:'POST',headers,body:JSON.stringify({approvalReportHash:report.reportHash})
    });
    ok(r.ok,'repetição da finalização é idempotente');
    const repeated=await r.json();
    ok(repeated.duplicate===true,'repetição não refaz a transição');
    eq(repeated.finalReportHash,finalized.finalReportHash,'repetição preserva hash FINAL');

    r=await fetch(base+'/api/v1/migrations/v94/clients/batches/commit',{
      method:'POST',headers,body:JSON.stringify({batchId:'BATCH_1_REHEARSAL',approvalReportHash:finalized.finalReportHash})
    });
    eq(r.status,403,'commit continua bloqueado com gate fechado');

    eq(await prisma.client.count(),1,'cliente central preservado após tentativa de commit');
    eq(await prisma.clientUnitLink.count(),0,'nenhum vínculo criado com commit bloqueado');

    console.log(JSON.stringify({
      ok:true,
      tests,
      feature:'clients_only_batch_1_rehearsal',
      batchId:report.batchId,
      reportHash:report.reportHash,
      summary:report.summary,
      multiUnitClusters:report.crossUnit.multiUnitClusters
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
