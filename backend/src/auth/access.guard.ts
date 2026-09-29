import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NETWORK_ADMIN_KEY } from '../common/network-admin.decorator';
import { UNIT_SCOPE_KEY } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ImperioRequest>();
    const principal = req.principal;
    if (!principal) return true;
    const adminOnly = this.reflector.getAllAndOverride<boolean>(NETWORK_ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly && !principal.networkAdmin) throw new ForbiddenException('Acesso administrativo da rede necessário');
    const unitScoped = this.reflector.getAllAndOverride<boolean>(UNIT_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (unitScoped) {
      const unitId = String(req.headers['x-unit-id'] || req.query.unitId || '');
      if (!unitId) throw new ForbiddenException('Unidade obrigatória');
      if (!principal.networkAdmin && !principal.unitIds.includes(unitId)) throw new ForbiddenException('Usuário sem acesso à unidade');
      req.unitId = unitId;
    }
    return true;
  }
}
