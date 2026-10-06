import { CanActivate, ExecutionContext, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { evolutionWebhookEnabled } from './evolution-config';

const digest=(value:string)=>createHash('sha256').update(value).digest();

@Injectable()
export class EvolutionWebhookGuard implements CanActivate {
  canActivate(ctx:ExecutionContext){
    if(!evolutionWebhookEnabled())throw new NotFoundException('Integration unavailable');
    const configured=String(process.env.EVOLUTION_WEBHOOK_SECRET||'').trim();
    if(!configured)throw new ServiceUnavailableException('Webhook authentication is not configured');
    const req=ctx.switchToHttp().getRequest<{headers:Record<string,string|string[]|undefined>}>();
    const raw=req.headers['x-evolution-webhook-secret'],provided=String(Array.isArray(raw)?raw[0]||'':raw||'');
    if(!provided||!timingSafeEqual(digest(configured),digest(provided)))throw new UnauthorizedException('Webhook authentication failed');
    return true;
  }
}
