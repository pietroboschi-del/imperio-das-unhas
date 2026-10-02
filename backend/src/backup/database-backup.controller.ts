import { Controller, Get, InternalServerErrorException, Req, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { NetworkAdmin } from '../common/network-admin.decorator';
import type { ImperioRequest } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

function safeDatabaseConfig(raw:string){
  let url:URL;
  try{url=new URL(raw)}catch{throw new InternalServerErrorException('DATABASE_URL inválida')}
  const user=decodeURIComponent(url.username||'');
  const password=decodeURIComponent(url.password||'');
  const database=decodeURIComponent((url.pathname||'').replace(/^\//,''));
  if(!url.hostname||!user||!database)throw new InternalServerErrorException('DATABASE_URL incompleta');
  return {host:url.hostname,port:url.port||'5432',user,password,database,sslmode:url.searchParams.get('sslmode')||''};
}

@Controller('api/v1/admin/database-backup')
@NetworkAdmin()
export class DatabaseBackupController {
  constructor(private readonly prisma:PrismaService){}

  @Get()
  async download(@Req() req:ImperioRequest,@Res() res:Response){
    const raw=String(process.env.DATABASE_URL||'');
    if(!raw)throw new InternalServerErrorException('DATABASE_URL ausente');
    const db=safeDatabaseConfig(raw);
    const generatedAt=new Date();
    const stamp=generatedAt.toISOString().replace(/[:.]/g,'-');
    const filename='imperio-postgres-'+stamp+'.dump';
    const args=[
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--host',db.host,
      '--port',db.port,
      '--username',db.user,
      '--dbname',db.database,
    ];
    const env:{[key:string]:string|undefined}={...process.env,PGPASSWORD:db.password,PGCONNECT_TIMEOUT:'15'};
    if(db.sslmode)env.PGSSLMODE=db.sslmode;

    await new Promise<void>((resolve,reject)=>{
      let started=false,finished=false,bytes=0,stderr='';
      const child=spawn('pg_dump',args,{env,stdio:['ignore','pipe','pipe']});
      const fail=(message:string)=>{
        if(finished)return;finished=true;
        try{child.kill('SIGTERM')}catch{}
        if(!res.headersSent)reject(new InternalServerErrorException(message));
        else{try{res.destroy(new Error(message))}catch{}resolve()}
      };
      child.stderr.on('data',(chunk:Buffer)=>{if(stderr.length<4096)stderr+=(chunk.toString('utf8').slice(0,4096-stderr.length))});
      child.on('error',()=>fail('pg_dump indisponível no backend'));
      child.stdout.on('data',(chunk:Buffer)=>{
        if(finished)return;
        if(!started){
          started=true;
          res.status(200);
          res.setHeader('Content-Type','application/octet-stream');
          res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');
          res.setHeader('Cache-Control','no-store, max-age=0');
          res.setHeader('Pragma','no-cache');
          res.setHeader('X-Backup-Format','pg_dump-custom');
          res.setHeader('X-Backup-Generated-At',generatedAt.toISOString());
        }
        bytes+=chunk.length;
        if(!res.write(chunk))child.stdout.pause();
      });
      res.on('drain',()=>child.stdout.resume());
      res.on('close',()=>{if(!finished&&!res.writableEnded){finished=true;try{child.kill('SIGTERM')}catch{}}});
      child.on('close',async code=>{
        if(finished)return;
        if(code!==0||!started){
          const detail=stderr.trim().replace(/postgres(?:ql)?:\/\/[^\s]+/gi,'[connection-redacted]').slice(0,500);
          fail('Falha ao gerar backup lógico'+(detail?': '+detail:''));
          return;
        }
        finished=true;
        if(!res.writableEnded)res.end();
        try{
          await this.prisma.auditEvent.create({data:{
            id:'audit:database-backup:'+randomUUID(),
            userId:req.principal?.userId||null,
            action:'DATABASE_LOGICAL_BACKUP_DOWNLOADED',
            entityType:'DatabaseBackup',
            entityId:filename,
            occurredAt:new Date(),
            legacyPayload:{filename,bytes,format:'pg_dump-custom',generatedAt:generatedAt.toISOString()} as Prisma.InputJsonValue,
          }});
        }catch{}
        resolve();
      });
    });
  }
}
