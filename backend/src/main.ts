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

async function bootstrap(){
  const app=await NestFactory.create(AppModule,{cors:false});
  const canonicalUnits=await ensureCanonicalUnits(app.get(PrismaService));
  console.log('canonical units reconciled '+JSON.stringify(canonicalUnits));
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
