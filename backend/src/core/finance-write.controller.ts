import { Body, ConflictException, Controller, Headers, NotFoundException, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/permissions.decorator';
import { UnitScoped } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { AddCommandServiceDto, CloseCashDto, CreateCommandDto, OpenCashDto, ReceivePaymentDto, SettleProfessionalDto } from './finance-write.dto';

@Controller('api/v1')
export class FinanceWriteController {
 constructor(private readonly prisma:PrismaService){}
 private enabled(){if(String(process.env.OPERATIONAL_WRITES_ENABLED||'false')!=='true')throw new ServiceUnavailableException('Escrita operacional central ainda não habilitada neste ambiente')}
 private id(scope:string,key?:string){if(!key)return randomUUID();const k=String(key).trim();if(!k||k.length>200)throw new ConflictException('Idempotency-Key inválida');return 'op_'+createHash('sha256').update(scope+'|'+k).digest('hex').slice(0,40)}
 private money(n:number){return new Prisma.Decimal(n.toFixed(2))}

 @Post('cash-sessions')
 @UnitScoped() @RequirePermissions('cash.open')
 async openCash(@Req() req:ImperioRequest,@Body() b:OpenCashDto,@Headers('idempotency-key') key?:string){
  this.enabled();const id=this.id(req.unitId!+'|cash|'+b.businessDate,key);
  return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}), hashtext(${'cash|'+b.businessDate}))`;const prior=await tx.cashSession.findUnique({where:{id}});if(prior)return prior;
   const open=await tx.cashSession.findFirst({where:{unitId:req.unitId!,businessDate:new Date(b.businessDate+'T00:00:00.000Z'),status:'OPEN'}});
   if(open)throw new ConflictException('Já existe caixa aberto para esta unidade e data');
   const row=await tx.cashSession.create({data:{id,unitId:req.unitId!,businessDate:new Date(b.businessDate+'T00:00:00.000Z'),status:'OPEN',openingAmount:this.money(b.openingAmount),openedByUserId:req.principal!.userId}});
   await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'cash.opened',entityType:'CashSession',entityId:id,legacyPayload:{openingAmount:b.openingAmount},occurredAt:new Date()}});return row;});
 }

 @Post('cash-sessions/:id/close')
 @UnitScoped() @RequirePermissions('cash.close')
 async closeCash(@Req() req:ImperioRequest,@Param('id') id:string,@Body() b:CloseCashDto){
  this.enabled();return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}), hashtext(${'cash-close|'+id}))`;const row=await tx.cashSession.findFirst({where:{id,unitId:req.unitId!}});if(!row)throw new NotFoundException('Caixa não encontrado nesta unidade');if(row.status!=='OPEN')throw new ConflictException('Caixa já fechado');
   const updated=await tx.cashSession.update({where:{id},data:{status:'CLOSED',closingAmount:this.money(b.closingAmount),closedAt:new Date(),closedByUserId:req.principal!.userId,version:{increment:1}}});
   await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'cash.closed',entityType:'CashSession',entityId:id,legacyPayload:{closingAmount:b.closingAmount},occurredAt:new Date()}});return updated;});
 }

 @Post('commands')
 @UnitScoped() @RequirePermissions('finance.manage')
 async command(@Req() req:ImperioRequest,@Body() b:CreateCommandDto,@Headers('idempotency-key') key?:string){
  this.enabled();if(b.clientId&&!await this.prisma.client.findFirst({where:{id:b.clientId,active:true}}))throw new NotFoundException('Cliente não encontrado');
  const id=this.id(req.unitId!+'|command',key),gross=this.money(b.grossAmount),discount=this.money(b.discountAmount||0);if(discount.gt(gross))throw new ConflictException('Desconto não pode superar valor bruto');const remaining=gross.minus(discount);
  return this.prisma.$transaction(async tx=>{const prior=await tx.openCommand.findUnique({where:{id}});if(prior)return prior;const row=await tx.openCommand.create({data:{id,unitId:req.unitId!,clientId:b.clientId||null,serviceDate:new Date(b.serviceDate+'T00:00:00.000Z'),status:'OPEN',grossAmount:gross,discountAmount:discount,appliedSignalAmount:0,appliedCreditAmount:0,customerFeeAmount:0,remainingAmount:remaining,legacyPayload:{source:'central_api'}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'command.opened',entityType:'OpenCommand',entityId:id,legacyPayload:{grossAmount:String(gross)},occurredAt:new Date()}});return row;});
 }

 @Post('commands/:id/items')
 @UnitScoped() @RequirePermissions('finance.manage')
 async addService(@Req() req:ImperioRequest,@Param('id') commandId:string,@Body() b:AddCommandServiceDto,@Headers('idempotency-key') key?:string){
  this.enabled();const id=this.id(req.unitId!+'|command-item|'+commandId,key),price=this.money(b.unitPrice),discount=this.money(b.discountAmount||0);if(discount.gt(price))throw new ConflictException('Desconto do serviço não pode superar o preço');
  return this.prisma.$transaction(async tx=>{const prior=await tx.commandServiceItem.findUnique({where:{id}});if(prior)return prior;const cmd=await tx.openCommand.findFirst({where:{id:commandId,unitId:req.unitId!}});if(!cmd)throw new NotFoundException('Comanda não encontrada nesta unidade');if(cmd.status!=='OPEN')throw new ConflictException('Comanda não está aberta');const service=await tx.service.findFirst({where:{id:b.serviceId,active:true}});if(!service)throw new NotFoundException('Serviço não encontrado nesta unidade');const pro=await tx.professionalUnit.findFirst({where:{professionalId:b.professionalId,unitId:req.unitId!,active:true,professional:{active:true}}});if(!pro)throw new NotFoundException('Profissional não vinculada a esta unidade');const net=price.minus(discount),pct=b.commissionPercent==null?null:new Prisma.Decimal(b.commissionPercent.toFixed(4)),fixed=b.commissionFixedAmount==null?null:this.money(b.commissionFixedAmount);if(pct&&pct.gt(100))throw new ConflictException('Comissão percentual inválida');const commission=fixed??(pct?net.mul(pct).div(100).toDecimalPlaces(2):this.money(0));const row=await tx.commandServiceItem.create({data:{id,commandId,unitId:req.unitId!,serviceId:b.serviceId,professionalId:b.professionalId,unitPrice:price,discountAmount:discount,netServiceAmount:net,commissionPercent:pct,commissionFixedAmount:fixed,commissionAmount:commission}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'command.service_attributed',entityType:'CommandServiceItem',entityId:id,legacyPayload:{commandId,serviceId:b.serviceId,professionalId:b.professionalId,commissionAmount:String(commission)},occurredAt:new Date()}});return row;});
 }

 @Post('commands/:id/payments')
 @UnitScoped() @RequirePermissions('finance.manage')
 async payment(@Req() req:ImperioRequest,@Param('id') commandId:string,@Body() b:ReceivePaymentDto,@Headers('idempotency-key') key?:string){
  this.enabled();const id=this.id(req.unitId!+'|payment|'+commandId,key),amount=this.money(b.amount);
  return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}), hashtext(${'command|'+commandId}))`;const prior=await tx.commandPayment.findUnique({where:{id}});if(prior)return prior;const cmd=await tx.openCommand.findFirst({where:{id:commandId,unitId:req.unitId!}});if(!cmd)throw new NotFoundException('Comanda não encontrada nesta unidade');if(cmd.status!=='OPEN')throw new ConflictException('Comanda não está aberta');const cash=await tx.cashSession.findFirst({where:{id:b.cashSessionId,unitId:req.unitId!,status:'OPEN'}});if(!cash)throw new ConflictException('Caixa aberto da unidade é obrigatório');if(amount.gt(cmd.remainingAmount))throw new ConflictException('Pagamento supera saldo da comanda');
   const remaining=new Prisma.Decimal(cmd.remainingAmount).minus(amount);const payment=await tx.commandPayment.create({data:{id,commandId,unitId:req.unitId!,cashSessionId:b.cashSessionId,method:b.method,amount,status:'CONFIRMED',receivedByUserId:req.principal!.userId,legacyPayload:{source:'central_api'}}});await tx.openCommand.update({where:{id:commandId},data:{remainingAmount:remaining,status:remaining.eq(0)?'CLOSED':'OPEN',version:{increment:1}}});if(remaining.eq(0)){const items=await tx.commandServiceItem.findMany({where:{commandId,unitId:req.unitId!}});for(const item of items){if(new Prisma.Decimal(item.commissionAmount).lte(0))continue;const obligationId='obl_'+createHash('sha256').update(item.id+'|COMMISSION').digest('hex').slice(0,40);await tx.professionalObligation.upsert({where:{commandItemId_kind:{commandItemId:item.id,kind:'COMMISSION'}},create:{id:obligationId,professionalId:item.professionalId,unitId:req.unitId!,commandId,commandItemId:item.id,kind:'COMMISSION',competenceDate:cmd.serviceDate,amount:item.commissionAmount,paidAmount:0,status:'OPEN',legacyPayload:{source:'command_close',commissionSnapshot:true}},update:{}});}}await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'command.payment_received',entityType:'OpenCommand',entityId:commandId,legacyPayload:{paymentId:id,method:b.method,amount:String(amount)},occurredAt:new Date()}});return payment;});
 }
 @Post('professional-settlements')
 @UnitScoped() @RequirePermissions('professionals.compensation.manage')
 async settleProfessional(@Req() req:ImperioRequest,@Body() b:SettleProfessionalDto,@Headers('idempotency-key') key?:string){
  this.enabled();const id=this.id(req.unitId!+'|professional-settlement|'+b.professionalId,key),amount=this.money(b.amount);
  return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.unitId!}), hashtext(${'professional-settlement|'+b.professionalId}))`;const prior=await tx.professionalSettlement.findUnique({where:{id}});if(prior)return prior;const pro=await tx.professionalUnit.findFirst({where:{professionalId:b.professionalId,unitId:req.unitId!,active:true,professional:{active:true}}});if(!pro)throw new NotFoundException('Profissional não vinculada a esta unidade');const obligations=await tx.professionalObligation.findMany({where:{professionalId:b.professionalId,unitId:req.unitId!,status:{in:['OPEN','PARTIAL']}},orderBy:[{competenceDate:'asc'},{createdAt:'asc'}]});const due=obligations.reduce((s,o)=>s.plus(new Prisma.Decimal(o.amount).minus(o.paidAmount)),new Prisma.Decimal(0));if(amount.gt(due))throw new ConflictException('Acerto supera saldo devido à profissional');let left=amount;for(const o of obligations){if(left.lte(0))break;const open=new Prisma.Decimal(o.amount).minus(o.paidAmount);const applied=Prisma.Decimal.min(open,left);const paid=new Prisma.Decimal(o.paidAmount).plus(applied);await tx.professionalObligation.update({where:{id:o.id},data:{paidAmount:paid,status:paid.eq(o.amount)?'PAID':'PARTIAL'}});left=left.minus(applied);}const row=await tx.professionalSettlement.create({data:{id,professionalId:b.professionalId,unitId:req.unitId!,amount,paidAt:new Date(),paidByUserId:req.principal!.userId,legacyPayload:{source:'central_api',allocation:'oldest_open_first'}}});await tx.auditEvent.create({data:{id:randomUUID(),userId:req.principal!.userId,unitId:req.unitId!,action:'professional.settled',entityType:'ProfessionalSettlement',entityId:id,legacyPayload:{professionalId:b.professionalId,amount:String(amount)},occurredAt:new Date()}});return row;});
 }

}
