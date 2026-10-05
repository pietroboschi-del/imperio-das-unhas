import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ensureCanonicalUnits } from './core/canonical-units';
import { ClientBatchService } from './migration/client-batch.service';
import { operationalWriteStatus } from './common/operational-write-gate';
import { ensureCanonicalUnitPublicProfiles } from './core/unit-public-profile';

async function bootstrap(){
  const app=await NestFactory.create(AppModule,{cors:false});
  const canonicalUnits=await ensureCanonicalUnits(app.get(PrismaService));
  console.log('canonical units reconciled '+JSON.stringify(canonicalUnits));
  const publicProfiles=await ensureCanonicalUnitPublicProfiles(app.get(PrismaService));
  console.log('canonical unit public profiles reconciled '+JSON.stringify(publicProfiles));
  console.log('operational write gate '+JSON.stringify({
    global:operationalWriteStatus(),
    centro:operationalWriteStatus('centro'),
    big:operationalWriteStatus('big'),
    shoppingContagem:operationalWriteStatus('shopping-contagem'),
    migrationImportEnabled:String(process.env.MIGRATION_IMPORT_ENABLED||'false')==='true',
    clientBatchCommitEnabled:String(process.env.CLIENT_BATCH_COMMIT_ENABLED||'false')==='true',
    schemaMigrationEnabled:String(process.env.SCHEMA_MIGRATION_ENABLED||'false')==='true',
    clientBatchFinalizeEnabled:String(process.env.CLIENT_BATCH_FINALIZE_ENABLED||'false')==='true',
  }));
  if(String(process.env.CENTRO_GO_LIVE_DIAGNOSTIC_ENABLED||'false')==='true'){
    const prisma=app.get(PrismaService);
    const [centroUnit,activeServices,activeProfessionalLinks,activeUserAccesses,networkAdmins]=await Promise.all([
      prisma.unit.count({where:{id:'centro',active:true}}),
      prisma.service.count({where:{active:true}}),
      prisma.professionalUnit.count({where:{unitId:'centro',active:true,professional:{active:true}}}),
      prisma.userUnitAccess.count({where:{unitId:'centro',active:true,user:{active:true}}}),
      prisma.user.count({where:{active:true,networkAdmin:true}}),
    ]);
    let clientBatch:{phase:string|null;reportHash:string|null;reviewRequired:number|null}|null=null;
    try{
      const result=await app.get(ClientBatchService).report('BATCH_1_REHEARSAL');
      clientBatch={phase:result.report.phase,reportHash:result.report.reportHash,reviewRequired:result.report.summary.reviewRequired};
    }catch{}
    const centroGate=operationalWriteStatus('centro'),bigGate=operationalWriteStatus('big'),shoppingGate=operationalWriteStatus('shopping-contagem');
    console.log('centro go-live diagnostic '+JSON.stringify({
      databaseReachable:true,
      centroUnitActive:centroUnit===1,
      activeServices,
      activeProfessionalLinks,
      activeUserAccesses,
      networkAdmins,
      clientBatch,
      operationalGate:{
        centro:centroGate.unitEnabled,
        big:bigGate.unitEnabled,
        shoppingContagem:shoppingGate.unitEnabled,
      },
      migrationGatesClosed:
        String(process.env.MIGRATION_IMPORT_ENABLED||'false')!=='true'&&
        String(process.env.CLIENT_BATCH_COMMIT_ENABLED||'false')!=='true'&&
        String(process.env.SCHEMA_MIGRATION_ENABLED||'false')!=='true'&&
        String(process.env.CLIENT_BATCH_FINALIZE_ENABLED||'false')!=='true',
      operationalPrerequisitesPresent:
        centroUnit===1&&activeServices>0&&activeProfessionalLinks>0&&activeUserAccesses>0&&networkAdmins>0,
    }));
  }
  const finalizeEnabled=String(process.env.CLIENT_BATCH_FINALIZE_ENABLED||'false')==='true';
  if(finalizeEnabled){
    if(String(process.env.MIGRATION_IMPORT_ENABLED||'false')==='true'||String(process.env.CLIENT_BATCH_COMMIT_ENABLED||'false')==='true')throw new Error('CLIENT_BATCH_FINALIZE_ENABLED exige gates de import/commit fechados');
    const finalizeBatchId=String(process.env.CLIENT_BATCH_FINALIZE_BATCH_ID||'').trim();
    const finalizeApprovalHash=String(process.env.CLIENT_BATCH_FINALIZE_APPROVAL_HASH||'').trim();
    const finalized=await app.get(ClientBatchService).finalizeStaging(finalizeBatchId,{approvalReportHash:finalizeApprovalHash});
    console.log('client batch staging finalized '+JSON.stringify(finalized));
  }
  const reportBatchId=String(process.env.CLIENT_BATCH_REPORT_ON_START||'').trim();
  if(reportBatchId){
    const result=await app.get(ClientBatchService).report(reportBatchId);
    const report=result.report;
    console.log('client batch report audit '+JSON.stringify({
      batchId:report.batchId,
      phase:report.phase,
      reportHash:report.reportHash,
      files:report.files.map(f=>({unitId:f.unitId,exportedAt:f.exportedAt,fileName:f.fileName,fileHash:f.fileHash,rows:f.rows,comparedToBatchId:f.comparedToBatchId,snapshotDiff:f.snapshotDiff})),
      crossUnit:report.crossUnit,
      summary:report.summary,
      conflictsByType:report.conflicts.reduce((acc:any,c:any)=>{const k=String(c.type||'UNKNOWN');acc[k]=(acc[k]||0)+1;return acc;},{}),
      realClientRowsMutated:false,
    }));
  }
  app.use(helmet({contentSecurityPolicy:false}));
  const bodyLimit=String(process.env.JSON_BODY_LIMIT||'20mb');
  app.use(json({limit:bodyLimit}));
  app.use(urlencoded({extended:true,limit:bodyLimit}));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  const origins=String(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  app.enableCors({origin:origins.length?origins:false,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','X-Unit-Id','X-Imperio-Instance-Id','X-Imperio-Revision','X-Imperio-Data-Hash','Idempotency-Key','If-Match']});

  if(String(process.env.OPENAPI_ENABLED||'false')==='true'){
    const config=new DocumentBuilder()
      .setTitle('Império das Unhas API')
      .setDescription('Contrato de homologação V98b. Autorização server-side e escopo por unidade.')
      .setVersion('0.98.1')
      .addCookieAuth('imperio_session',{type:'apiKey',in:'cookie',name:'imperio_session'})
      .addApiKey({type:'apiKey',in:'header',name:'X-CSRF-Token'},'csrf')
      .addApiKey({type:'apiKey',in:'header',name:'X-Unit-Id'},'unit')
      .build();
    const document=SwaggerModule.createDocument(app,config);
    SwaggerModule.setup('api/docs',app,document,{jsonDocumentUrl:'api/openapi.json'});
  }

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT||3000),'0.0.0.0');
}
void bootstrap();
