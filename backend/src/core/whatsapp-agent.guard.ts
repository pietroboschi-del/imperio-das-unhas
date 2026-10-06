import { CanActivate, ExecutionContext, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { whatsappAgentApiEnabled } from './whatsapp-agent-config';

const digest=(value:string)=>createHash('sha256').update(value).digest();

@Injectable()
export class WhatsappAgentGuard implements CanActivate {
  canActivate(ctx:ExecutionContext){
    if(!whatsappAgentApiEnabled())throw new NotFoundException('Integration unavailable');
    const configured=String(process.env.WHATSAPP_AGENT_API_SECRET||'').trim();
    if(!configured)throw new ServiceUnavailableException('Agent API authentication is not configured');
    const req=ctx.switchToHttp().getRequest<{headers:Record<string,string|string[]|undefined>}>();
    const raw=req.headers['x-whatsapp-agent-secret'];
    const provided=String(Array.isArray(raw)?raw[0]||'':raw||'');
    if(!provided||!timingSafeEqual(digest(configured),digest(provided)))throw new UnauthorizedException('Agent API authentication failed');
    return true;
  }
}
