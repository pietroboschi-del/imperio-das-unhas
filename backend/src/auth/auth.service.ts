import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from './crypto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(username: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { username }, include: { unitAccesses: { where: { active: true } } } });
    if (!user?.active || !user.passwordHash) throw new UnauthorizedException('Credenciais inválidas');
    if (user.passwordResetRequired) throw new ForbiddenException('Redefinição de senha obrigatória');
    if (!(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Credenciais inválidas');
    const sessionToken = randomToken(48);
    const csrfToken = randomToken(32);
    const ttlHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 12));
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(sessionToken),
        csrfHash: sha256(csrfToken),
        expiresAt,
        ipHash: meta.ip ? sha256(meta.ip) : null,
        userAgent: meta.userAgent?.slice(0, 500) || null,
      },
    });
    return {
      sessionToken,
      csrfToken,
      expiresAt,
      principal: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        networkAdmin: user.networkAdmin,
        unitIds: user.unitAccesses.map(x => x.unitId),
        permissions: user.permissions,
        sessionId: session.id,
      },
    };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
}
