import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { AUTHENTICATED_KEY } from '../common/authenticated.decorator';
import { NETWORK_ADMIN_KEY } from '../common/network-admin.decorator';
import { PERMISSIONS_KEY } from '../common/permissions.decorator';
import { UNIT_SCOPE_KEY } from '../common/unit-scope.decorator';
import type { ImperioRequest } from '../common/request-context';
import { evaluateAccess } from './permission-policy';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const publicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (publicRoute) return true;

    const req = ctx.switchToHttp().getRequest<ImperioRequest>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedException('Sessão não resolvida');

    const adminOnly = !!this.reflector.getAllAndOverride<boolean>(NETWORK_ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    const unitScoped = !!this.reflector.getAllAndOverride<boolean>(UNIT_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    const authenticated = !!this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, [ctx.getHandler(), ctx.getClass()]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) || [];

    if (!adminOnly && !unitScoped && !authenticated && requiredPermissions.length === 0) {
      throw new ForbiddenException('Endpoint sem política de autorização explícita');
    }

    const unitId=unitScoped?String(req.headers['x-unit-id'] || req.query.unitId || ''):undefined;
    const decision=evaluateAccess({
      networkAdmin:principal.networkAdmin,
      globalPermissions:principal.permissions,
      unitAccesses:principal.unitAccesses,
      adminOnly,unitScoped,unitId,requiredPermissions,
    });
    if(!decision.allowed){
      if(decision.reason==='unit_required')throw new ForbiddenException('Unidade obrigatória');
      if(decision.reason==='unit_denied')throw new ForbiddenException('Usuário sem acesso à unidade');
      if(decision.reason==='network_admin_required')throw new ForbiddenException('Acesso administrativo da rede necessário');
      throw new ForbiddenException('Permissão funcional insuficiente');
    }
    if(unitScoped&&unitId)req.unitId=unitId;
    return true;
  }
}
