import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { NetworkAdmin } from '../common/network-admin.decorator';
import type { ImperioRequest } from '../common/request-context';
import { MessagingReconciliationService, type ReconciliationAction } from './messaging-reconciliation.service';

class ReconcileDto {
  @IsIn(['CONFIRM_SENT','CONFIRM_NOT_SENT','CANCEL']) action!:ReconciliationAction;
  @IsOptional() @IsString() providerMessageId?:string;
}

@Controller('api/v1/admin/messaging/outbox')
@NetworkAdmin()
export class MessagingReconciliationController {
  constructor(private readonly reconciliation:MessagingReconciliationService){}
  @Post(':id/reconcile')
  reconcile(@Param('id') id:string,@Body() body:ReconcileDto,@Req() req:ImperioRequest){
    return this.reconciliation.reconcile(id,body.action,req.principal!.userId,body.providerMessageId);
  }
}
