import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { EvolutionWebhookGuard } from './evolution-webhook.guard';
import { EvolutionWebhookParser } from './evolution-webhook.parser';
import { MessagingInboundService } from './messaging-inbound.service';

@Controller('api/v1/integrations/evolution')
export class EvolutionWebhookController {
  constructor(private readonly parser:EvolutionWebhookParser,private readonly inbound:MessagingInboundService){}
  @Post('webhook')
  @Public()
  @UseGuards(EvolutionWebhookGuard)
  async webhook(@Body() payload:unknown){
    const parsed=this.parser.parse(payload);
    if(parsed.kind==='inbound'){
      const result=await this.inbound.receive(parsed.value);
      return {accepted:true,replayed:result.replayed,inboundId:result.row.id};
    }
    if(parsed.kind==='status')return {accepted:true,...await this.inbound.applyStatus(parsed.value)};
    return {accepted:true,ignored:true,reason:parsed.reason};
  }
}
