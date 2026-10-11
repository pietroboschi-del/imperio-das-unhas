import { Body, ConflictException, Controller, ForbiddenException, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitScoped } from '../common/unit-scope.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { assertOperationalWriteEnabled } from '../common/operational-write-gate';
import { evaluateAccess } from '../auth/permission-policy';
import type { ImperioRequest, ImperioPrincipal } from '../common/request-context';

@Controller('api/v1/finance')
export class FinanceCentralController {
 constructor(private readonly prisma:PrismaService){}
 private date(v:unknown):Date {
  const s=String(v||''),d=new Date(s+'T00:00:00.000Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==s)throw new ConflictException('Data financeira inválida');
  return d;
 }
 private money(v:unknown):Prisma.Decimal {
  const n=Number(v);
  if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(n*100))||!new Prisma.Decimal(String(v)).eq(new Prisma.Decimal(Math.round(n*100)).div(100)))throw new ConflictException('Valor monetário inválido');
  return new Prisma.Decimal(Math.round(n*100)).div(100);
 }
 private canonical(v:any):any {
  if(Array.isArray(v))return v.map(x=>this.canonical(x));
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,this.canonical(v[k])]));
  return v;
 }
 private op(unit:string,kind:string,key:unknown,body:any){
  const k=String(key||'').trim();if(!k||k.length>200)throw new ConflictException('Idempotency-Key obrigatória');
  return {id:'fin_'+createHash('sha256').update(unit+'|'+kind+'|'+k).digest('hex').slice(0,40),
   hash:createHash('sha256').update(JSON.stringify(this.canonical(body))).digest('hex')};
 }
 private async lock(tx:Prisma.TransactionClient,scope:string,id:string){
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',scope,id);
 }
 private permission(p:ImperioPrincipal,unitId:string,permission:string){
  if(!evaluateAccess({networkAdmin:p.networkAdmin,globalPermissions:p.permissions,unitAccesses:p.unitAccesses,unitScoped:true,unitId,requiredPermissions:[permission]}).allowed)throw new ForbiddenException('Acesso financeiro negado para a unidade');
 }
 private async account(tx:Prisma.TransactionClient,unit:string,id:string){
  const a=await tx.centralFinanceAccount.findFirst({where:{id,unitId:unit,active:true}});
  if(!a)throw new ConflictException('Conta não registrada nesta unidade no backend');
  return a;
 }
 private async session(tx:Prisma.TransactionClient,unit:string,type:string,id?:string){
  if(type!=='CASH'&&!id)return null;
  if(!id)throw new ConflictException('Caixa aberto é obrigatório');
  await this.lock(tx,unit,'cash-session|'+id);
  const row=await tx.cashSession.findFirst({where:{id,unitId:unit,status:'OPEN'}});
  if(!row)throw new ConflictException('Caixa da unidade não está aberto');
  return row;
 }
 private audit(tx:Prisma.TransactionClient,req:ImperioRequest,action:string,entityType:string,id:string,details:any){
  return tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action,entityType,entityId:id,legacyPayload:details,occurredAt:new Date()}});
 }
 private replay(row:any,hash:string){
  if(row.idempotencyHash!==hash)throw new ConflictException('Idempotency-Key utilizada com dados diferentes');
  return row;
 }

 @Get('accounts') @UnitScoped() @RequirePermissions('finance.read')
 accounts(@Req() req:ImperioRequest){
  return this.prisma.centralFinanceAccount.findMany({where:{unitId:req.unitId!},orderBy:{name:'asc'}});
 }
 @Post('accounts') @UnitScoped() @RequirePermissions('finance.manage')
 async saveAccount(@Req() req:ImperioRequest,@Body() b:any){
  assertOperationalWriteEnabled(req.unitId!);
  const id=String(b?.id||''),name=String(b?.name||'').trim(),type=String(b?.type||'');
  if(!/^[a-zA-Z0-9:_-]{2,128}$/.test(id)||name.length<2||name.length>160||!['CASH','BANK','PROCESSOR','OTHER'].includes(type)||(b.unitId&&b.unitId!==req.unitId))throw new ConflictException('Conta financeira inválida');
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'finance-account',id);
   const prior=await tx.centralFinanceAccount.findUnique({where:{id}});
   if(prior&&prior.unitId!==req.unitId)throw new ForbiddenException('Conta registrada em outra unidade');
   const data={name,type,active:b.active!==false};
   const row=prior?await tx.centralFinanceAccount.update({where:{id},data}):await tx.centralFinanceAccount.create({data:{id,unitId:req.unitId!,...data}});
   await this.audit(tx,req,'finance.account.saved','CentralFinanceAccount',id,{type,active:data.active});
   return row;
  });
 }

 @Get('entries') @UnitScoped() @RequirePermissions('finance.read')
 entries(@Req() req:ImperioRequest,@Query('from') from?:string,@Query('to') to?:string){
  const date=from&&to?{gte:this.date(from),lte:this.date(to)}:undefined;
  return this.prisma.centralFinanceEntry.findMany({where:{unitId:req.unitId!,...(date?{date}:{})},orderBy:[{date:'desc'},{createdAt:'desc'}],take:1500});
 }
 @Post('entries') @UnitScoped() @RequirePermissions('finance.manage')
 async manual(@Req() req:ImperioRequest,@Body() b:any,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(req.unitId!);
  if(!['income','expense'].includes(b?.direction)||!['Previsto','Efetivado'].includes(b?.status))throw new ConflictException('Tipo de lançamento inválido');
  const magnitude=this.money(b.amount),amount=b.direction==='expense'?magnitude.negated():magnitude;
  const date=this.date(b.date),competence=this.date(b.competenceDate||b.date),due=b.dueDate?this.date(b.dueDate):null;
  const accountId=String(b.accountId||''),category=String(b.category||'Outros').slice(0,120),description=String(b.description||'Lançamento manual').slice(0,500);
  const op=this.op(req.unitId!,'MANUAL',key,{direction:b.direction,status:b.status,date:b.date,competenceDate:b.competenceDate||b.date,dueDate:b.dueDate||'',accountId,amount:String(magnitude),category,description,cashSessionId:b.cashSessionId||null});
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'finance-op',op.id);
   const prior=await tx.centralFinanceEntry.findUnique({where:{id:op.id}});if(prior)return this.replay(prior,op.hash);
   const account=await this.account(tx,req.unitId!,accountId);
   const cash=b.status==='Efetivado'?await this.session(tx,req.unitId!,account.type,b.cashSessionId):null;
   const row=await tx.centralFinanceEntry.create({data:{id:op.id,kind:'MANUAL',idempotencyHash:op.hash,unitId:req.unitId!,accountId,date,competenceDate:competence,dueDate:due,amount,status:b.status,cashSessionId:cash?.id||null,category,description,metadata:{direction:b.direction,dreImpact:b.dreImpact!==false,accountType:account.type,accountName:account.name},createdByUserId:req.principal!.userId}});
   await this.audit(tx,req,'finance.manual.created','CentralFinanceEntry',row.id,{amount:String(amount),status:b.status});
   return row;
  });
 }

 @Get('receivables') @UnitScoped() @RequirePermissions('finance.read')
 receivables(@Req() req:ImperioRequest,@Query('clientId') clientId?:string){
  const p=req.principal!,units=p.networkAdmin?undefined:p.unitIds.filter(x=>evaluateAccess({networkAdmin:false,globalPermissions:p.permissions,unitAccesses:p.unitAccesses,unitScoped:true,unitId:x,requiredPermissions:['finance.read']}).allowed);
  return this.prisma.receivableOpening.findMany({where:{...(clientId?{clientId}:{}),...(units?{unitId:{in:units}}:{})},orderBy:[{sourceDate:'asc'},{createdAt:'asc'},{id:'asc'}],take:1500});
 }
 @Post('receivables/settle') @UnitScoped() @RequirePermissions('finance.receivables.settle')
 async settleReceivable(@Req() req:ImperioRequest,@Body() b:any,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(req.unitId!);
  const clientId=String(b.clientId||''),accountId=String(b.accountId||''),amount=this.money(b.amount),date=this.date(b.date),method=String(b.method||'');
  if(!clientId||!accountId||!['CASH','PIX','DEBIT_CARD','CREDIT_CARD','TRANSFER','OTHER'].includes(method))throw new ConflictException('Recebimento mensal inválido');
  const op=this.op(req.unitId!,'MONTHLY_RECEIPT',key,{clientId,accountId,amount:String(amount),date:b.date,method,cashSessionId:b.cashSessionId||null});
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'finance-op',op.id);
   const prior=await tx.centralFinanceEntry.findUnique({where:{id:op.id}});if(prior)return this.replay(prior,op.hash);
   await this.lock(tx,'receivable-client',clientId);
   if(!await tx.client.findUnique({where:{id:clientId}}))throw new ConflictException('Cliente central inexistente');
   const account=await this.account(tx,req.unitId!,accountId);
   const session=await this.session(tx,req.unitId!,account.type,b.cashSessionId);
   const rows=await tx.receivableOpening.findMany({where:{clientId,balance:{gt:0}},orderBy:[{sourceDate:'asc'},{createdAt:'asc'},{id:'asc'}]});
   for(const rv of rows)if(rv.unitId)this.permission(req.principal!,rv.unitId,'finance.receivables.settle');
   const due=rows.reduce((s,x)=>s.plus(x.balance),new Prisma.Decimal(0));
   if(amount.gt(due))throw new ConflictException('Valor excede os recebíveis persistidos');
   let left=amount;const allocations:any[]=[];
   for(const row of rows){if(left.lte(0))break;const paid=Prisma.Decimal.min(left,new Prisma.Decimal(row.balance)),newBalance=new Prisma.Decimal(row.balance).minus(paid);await tx.receivableOpening.update({where:{id:row.id},data:{balance:newBalance,status:newBalance.eq(0)?'PAID':'PARTIAL'}});allocations.push({receivableId:row.id,sourceUnitId:row.unitId,amount:String(paid)});left=left.minus(paid);}
   const entry=await tx.centralFinanceEntry.create({data:{id:op.id,kind:'MONTHLY_RECEIPT',sourceId:op.id,idempotencyHash:op.hash,unitId:req.unitId!,accountId,date,competenceDate:date,amount,status:'Efetivado',cashSessionId:session?.id||null,clientId,description:'Recebimento de Conta Mensal',metadata:{method,accountType:account.type,accountName:account.name,allocations,dreImpact:false},createdByUserId:req.principal!.userId}});
   await this.audit(tx,req,'finance.monthly.received','CentralFinanceEntry',entry.id,{clientId,amount:String(amount),allocations});
   return entry;
  });
 }

 @Get('purchase-payables') @UnitScoped() @RequirePermissions('finance.read')
 async payables(@Req() req:ImperioRequest){
  const p=await this.prisma.stockPurchase.findMany({where:{financeUnitId:req.unitId!},orderBy:{purchaseDate:'desc'},take:1000});
  const paid=await this.prisma.centralFinanceEntry.findMany({where:{kind:'PURCHASE_SETTLEMENT',unitId:req.unitId!,sourceId:{in:p.map(x=>x.id)}},select:{sourceId:true,id:true,date:true,accountId:true}});
  const byId=new Map(paid.map(x=>[x.sourceId,x]));
  return p.map(x=>({...x,financeStatus:byId.has(x.id)?'Pago':'A pagar',settlement:byId.get(x.id)||null}));
 }
 @Post('purchase-payables/:id/settle') @UnitScoped() @RequirePermissions('finance.manage')
 async payPurchase(@Req() req:ImperioRequest,@Param('id') purchaseId:string,@Body() b:any,@Headers('idempotency-key') key?:string){
  assertOperationalWriteEnabled(req.unitId!);
  const accountId=String(b.accountId||''),date=this.date(b.date),op=this.op(req.unitId!,'PURCHASE_SETTLEMENT',key,{purchaseId,accountId,date:b.date,cashSessionId:b.cashSessionId||null});
  return this.prisma.$transaction(async tx=>{
   await this.lock(tx,'purchase-payable',purchaseId);
   const prior=await tx.centralFinanceEntry.findFirst({where:{kind:'PURCHASE_SETTLEMENT',sourceId:purchaseId}});
   if(prior){if(prior.unitId!==req.unitId||prior.id!==op.id||prior.idempotencyHash!==op.hash)throw new ConflictException('Compra já liquidada');return prior;}
   const purchase=await tx.stockPurchase.findUnique({where:{id:purchaseId}});
   if(!purchase||purchase.financeUnitId!==req.unitId)throw new ConflictException('Compra não pertence à unidade financeira');
   const account=await this.account(tx,req.unitId!,accountId),session=await this.session(tx,req.unitId!,account.type,b.cashSessionId);
   const amount=new Prisma.Decimal(purchase.total).negated();
   const entry=await tx.centralFinanceEntry.create({data:{id:op.id,unitId:req.unitId!,kind:'PURCHASE_SETTLEMENT',sourceId:purchaseId,idempotencyHash:op.hash,accountId,date,competenceDate:purchase.purchaseDate,amount,status:'Efetivado',cashSessionId:session?.id||null,category:'Estoque / fornecedor',description:'Baixa de compra de estoque',metadata:{supplier:purchase.supplier,accountType:account.type,accountName:account.name,dreImpact:false,capitalizedInStock:true},createdByUserId:req.principal!.userId}});
   await this.audit(tx,req,'finance.purchase.settled','StockPurchase',purchaseId,{entryId:entry.id,amount:String(amount)});
   return entry;
  });
 }

 @Get('reports/receipt-summary') @UnitScoped() @RequirePermissions('reports.read')
 async report(@Req() req:ImperioRequest,@Query('from') from:string,@Query('to') to:string){
  const start=this.date(from),end=this.date(to);if(start>end)throw new ConflictException('Período inválido');
  const sessions=await this.prisma.cashSession.findMany({where:{unitId:req.unitId!,status:'CLOSED',businessDate:{gte:start,lte:end}},include:{payments:{where:{status:'CONFIRMED'},select:{id:true,commandId:true,method:true,amount:true,legacyPayload:true}}}});
  const receipts:any[]=[];const seen=new Set<string>();
  for(const cash of sessions)for(const p of cash.payments){
   if(seen.has(p.id)||['DIRECT_PROFESSIONAL','BARTER','MONTHLY_RECEIVABLE'].includes(p.method))continue;
   seen.add(p.id);receipts.push({id:p.id,source:'command',unitId:cash.unitId,cashSessionId:cash.id,date:cash.businessDate.toISOString().slice(0,10),method:p.method,accountId:(p.legacyPayload as any)?.accountId||'',amount:p.amount,commandId:p.commandId});
  }
  const extra=await this.prisma.centralFinanceEntry.findMany({where:{unitId:req.unitId!,kind:'MONTHLY_RECEIPT',status:'Efetivado',date:{gte:start,lte:end}}});
  for(const x of extra)if(!seen.has(x.id)){seen.add(x.id);receipts.push({id:x.id,source:'monthly',unitId:x.unitId,cashSessionId:x.cashSessionId,date:x.date.toISOString().slice(0,10),method:(x.metadata as any)?.method||'OTHER',accountId:x.accountId,amount:x.amount});}
  const manualIncome=await this.prisma.centralFinanceEntry.findMany({where:{unitId:req.unitId!,kind:'MANUAL',status:'Efetivado',amount:{gt:0},date:{gte:start,lte:end}}});
  for(const x of manualIncome)if(!seen.has(x.id)){seen.add(x.id);receipts.push({id:x.id,source:'manual',unitId:x.unitId,cashSessionId:x.cashSessionId,date:x.date.toISOString().slice(0,10),method:(x.metadata as any)?.accountType==='CASH'?'CASH':'OTHER',accountId:x.accountId,amount:x.amount});}
  const cash=receipts.reduce((sum,x)=>sum.plus(x.amount),new Prisma.Decimal(0));
  const commands=await this.prisma.openCommand.findMany({where:{unitId:req.unitId!,status:'CLOSED',serviceDate:{gte:start,lte:end}},select:{grossAmount:true,discountAmount:true}});
  const competence=commands.reduce((sum,x)=>sum.plus(new Prisma.Decimal(x.grossAmount).minus(x.discountAmount)),new Prisma.Decimal(0));
  return {unitId:req.unitId!,from,to,cashReceipts:String(cash),competenceRevenue:String(competence),receipts};
 }
}
