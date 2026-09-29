import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import type { ImperioRequest } from '../common/request-context';
import { sha256 } from './crypto';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<ImperioRequest>();
    const token = req.cookies?.imperio_session;
    if (!token) throw new UnauthorizedException('Sessão ausente');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(String(token)) },
      include: { user: { include: { unitAccesses: { where: { active: true } } } } },
    });
    if (!session || session.status !== 'ACTIVE' || session.expiresAt <= new Date() || !session.user.active) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
    req.principal = {
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      networkAdmin: session.user.networkAdmin,
      unitIds: session.user.unitAccesses.map(x => x.unitId),
      permissions: session.user.permissions,
      sessionId: session.id,
    };
    void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    return true;
  }
}
