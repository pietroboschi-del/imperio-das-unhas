import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap(){
  const app=await NestFactory.create(AppModule,{cors:false});
  app.use(helmet({contentSecurityPolicy:false}));
  const bodyLimit=String(process.env.JSON_BODY_LIMIT||'20mb');
  app.use(json({limit:bodyLimit}));
  app.use(urlencoded({extended:true,limit:bodyLimit}));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  const origins=String(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  app.enableCors({origin:origins.length?origins:false,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','X-Unit-Id','X-Imperio-Instance-Id','X-Imperio-Revision','X-Imperio-Data-Hash','Idempotency-Key','If-Match']});
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT||3000),'0.0.0.0');
}
void bootstrap();
