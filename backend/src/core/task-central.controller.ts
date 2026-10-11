import { Body, ConflictException, Controller, ForbiddenException, Headers, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import type { ImperioRequest } from '../common/request-context';

// A4: manual tasks only. Automated WA4 tasks retain their existing lifecycle.
@Controller('api/v1/tasks')
export class TaskCentralController {
 constructor(private readonly prisma:PrismaService){}
 private hash(s:string){return createHash('sha256').update(s).digest('hex')}
 private key(unit:string,key?:string){
  const clean=typeof key==='string'?key.trim():'';
  if(!clean||clean.length>200)throw new ConflictException('Idempotency-Key obrigatória');
  return 'taskop_'+this.hash(unit+'|'+clean).slice(0,48);
 }
 private str(value:unknown,max:number,required=false){
  if(value!=null&&typeof value!=='string')throw new ConflictException('Campo inválido');
  const v=String(value||'').trim();
  if(v.length>max||(required&&!v))throw new ConflictException('Campo obrigatório/inválido');
  return v;
 }
 private date(value:unknown){
  if(value==null||value==='')return null;
  const s=this.str(value,10,true),d=new Date(s+'T00:00:00.000Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==s)throw new ConflictException('Prazo inválido');
  return d;
 }
 private payload(req:ImperioRequest,b:any){
  if(!b||typeof b!=='object'||Array.isArray(b))throw new ConflictException('Dados inválidos');
  if(b.unitId&&b.unitId!==req.unitId)throw new ForbiddenException('Unidade divergente');
  const priority=this.str(b.priority||'normal',30),category=this.str(b.category||'general',40);
  if(!['low','normal','high','critical'].includes(priority)||!['general','finance','clients','stock','professionals','partnership','operations'].includes(category))throw new ConflictException('Classificação inválida');
  return {title:this.str(b.title,160,true),dueDate:this.date(b.dueDate),priority,category,note:this.str(b.note,2000),assignedUserId:this.str(b.assignedUserId||req.principal!.userId,128,true)};
 }
 private expected(v:any){const d=new Date(v);if(typeof v!=='string'||!v||!Number.isFinite(d.valueOf()))throw new ConflictException('Versão obrigatória');return d.getTime()}
 private async lock(tx:Prisma.TransactionClient,scope:string,id:string){
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',scope,id);
 }
 private async assignee(tx:Prisma.TransactionClient,id:string,unit:string){
  const u=await tx.user.findUnique({where:{id},include:{unitAccesses:{where:{unitId:unit,active:true}}}});
  if(!u||!u.active||(!u.networkAdmin&&!u.unitAccesses.length))throw new ConflictException('Responsável sem acesso à unidade');
 }
 private snapshot(x:any){return {title:x.title,unitId:x.unitId,assignedUserId:x.assignedUserId,status:x.status,note:x.note,updatedAt:x.updatedAt}}
 private async audit(tx:Prisma.TransactionClient,req:ImperioRequest,id:string,hash:string,action:string,taskId:string,before:any,after:any){
  await tx.auditEvent.create({data:{id,userId:req.principal!.userId,unitId:req.unitId!,action,entityType:'ManagementTask',entityId:taskId,occurredAt:new Date(),legacyPayload:{source:'A4_TASK_01',requestHash:hash,before,after}}});
 }
 private async replay(tx:Prisma.TransactionClient,id:string,hash:string){
  const event=await tx.auditEvent.findUnique({where:{id}});
  if(!event)return null;
  if((event.legacyPayload as any)?.requestHash!==hash)throw new ConflictException('Chave repetida com conteúdo diferente');
  const task=await tx.managementTask.findUnique({where:{id:String(event.entityId||'')}});
  if(!task)throw new ConflictException('Tarefa não encontrada para repetição');
  return task;
 }
 private async current(tx:Prisma.TransactionClient,req:ImperioRequest,id:string){
  const t=await tx.managementTask.findFirst({where:{id,unitId:req.unitId!}});
  if(!t)throw new NotFoundException('Tarefa não localizada na unidade');
  if(t.sourceType!=='MANUAL')throw new ForbiddenException('Tarefa automática protegida');
  return t;
 }
 @Post() @UnitScoped() @RequirePermissions('tasks.manage')
 async create(@Req() req:ImperioRequest,@Body() body:any,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(req.unitId!);
  const data=this.payload(req,body),event=this.key(req.unitId!,key),id='manual_'+event.slice(7);
  const hash=this.hash(JSON.stringify({op:'CREATE',unit:req.unitId!,data:{...data,dueDate:data.dueDate?.toISOString()}}));
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'task-op',event);
   const prior=await this.replay(tx,event,hash);if(prior)return prior;
   await this.assignee(tx,data.assignedUserId,req.unitId!);
   const row=await tx.managementTask.create({data:{id,...data,unitId:req.unitId!,status:'OPEN',sourceType:'MANUAL',sourceId:id,legacyPayload:{origin:'A4_TASK_01',createdBy:req.principal!.userId}}});
   await this.audit(tx,req,event,hash,'task.manual.created',id,null,this.snapshot(row));return row;
  });
 }
 @Patch(':id') @UnitScoped() @RequirePermissions('tasks.manage')
 async edit(@Req() req:ImperioRequest,@Param('id') id:string,@Body() body:any,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(req.unitId!);
  const data=this.payload(req,body),expected=this.expected(body.expectedUpdatedAt),event=this.key(req.unitId!,key);
  const hash=this.hash(JSON.stringify({op:'EDIT',unit:req.unitId!,id,expected,data:{...data,dueDate:data.dueDate?.toISOString()}}));
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'task-op',event);
   const prior=await this.replay(tx,event,hash);if(prior)return prior;
   await this.lock(tx,'task-id',id);
   const current=await this.current(tx,req,id);
   if(current.updatedAt.getTime()!==expected)throw new ConflictException('Conflito: atualize a tarefa antes de editar');
   await this.assignee(tx,data.assignedUserId,req.unitId!);
   const row=await tx.managementTask.update({where:{id},data:{...data,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});
   await this.audit(tx,req,event,hash,'task.manual.updated',id,this.snapshot(current),this.snapshot(row));return row;
  });
 }
 private async changeStatus(req:ImperioRequest,id:string,b:any,key:string|undefined,target:'DONE'|'OPEN'){
  assertOperationalWriteEnabled(req.unitId!);
  const expected=this.expected(b?.expectedUpdatedAt),event=this.key(req.unitId!,key),hash=this.hash(JSON.stringify({op:target,unit:req.unitId!,id,expected}));
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'task-op',event);
   const prior=await this.replay(tx,event,hash);if(prior)return prior;
   await this.lock(tx,'task-id',id);
   const current=await this.current(tx,req,id);
   if(current.updatedAt.getTime()!==expected)throw new ConflictException('Conflito: tarefa modificada em outra sessão');
   if(current.status===target)throw new ConflictException('Tarefa já está neste estado');
   const row=await tx.managementTask.update({where:{id},data:{status:target,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});
   await this.audit(tx,req,event,hash,target==='DONE'?'task.manual.completed':'task.manual.reopened',id,this.snapshot(current),this.snapshot(row));return row;
  });
 }
 @Post(':id/complete') @UnitScoped() @RequirePermissions('tasks.manage')
 complete(@Req() req:ImperioRequest,@Param('id') id:string,@Body() b:any,@Headers('idempotency-key') key?:string){return this.changeStatus(req,id,b,key,'DONE')}
 @Post(':id/reopen') @UnitScoped() @RequirePermissions('tasks.manage')
 reopen(@Req() req:ImperioRequest,@Param('id') id:string,@Body() b:any,@Headers('idempotency-key') key?:string){return this.changeStatus(req,id,b,key,'OPEN')}
}
