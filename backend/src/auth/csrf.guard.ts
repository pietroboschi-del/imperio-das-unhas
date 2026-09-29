import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import type { ImperioRequest } from '../common/request-context';
import { sha256 } from './crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<ImperioRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return true;
    if (!req.principal?.sessionId) throw new ForbiddenException('Sessão não resolvida');
    const csrf = String(req.headers['x-csrf-token'] || '');
    const session = await this.prisma.session.findUnique({ where: { id: req.principal.sessionId }, select: { csrfHash: true } });
    if (!csrf || !session || sha256(csrf) !== session.csrfHash) throw new ForbiddenException('CSRF inválido');
    return true;
  }
}
