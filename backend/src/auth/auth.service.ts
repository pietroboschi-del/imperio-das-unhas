import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { CredentialTokenPurpose, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from './crypto';
import { normalizePermissions } from './permission-policy';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private loginKeys(username:string, ip?:string) {
    const normalized=username.trim().toLowerCase();
    const ipPart=String(ip||'unknown');
    return {ip:sha256(`ip:${ipPart}`),userIp:sha256(`user-ip:${normalized}|${ipPart}`)};
  }

  private async assertLoginAllowed(username:string,ip?:string){
    const now=new Date(),keys=this.loginKeys(username,ip);
    const rows=await this.prisma.loginRateLimit.findMany({where:{keyHash:{in:[keys.ip,keys.userIp]}}});
    if(rows.some(x=>x.blockedUntil&&x.blockedUntil>now)) throw new HttpException('Muitas tentativas. Tente novamente mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async registerLoginFailure(username:string,ip?:string){
    const max=Math.max(3,Number(process.env.LOGIN_RATE_LIMIT_MAX||5));
    const ipMax=Math.max(max*5,Number(process.env.LOGIN_RATE_LIMIT_IP_MAX||max*10));
    const windowMs=Math.max(60_000,Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS||900_000));
    const blockMs=Math.max(60_000,Number(process.env.LOGIN_RATE_LIMIT_BLOCK_MS||900_000));
    const now=new Date(),keys=this.loginKeys(username,ip);
    for(const [scope,keyHash] of Object.entries(keys)){
      const current=await this.prisma.loginRateLimit.findUnique({where:{keyHash}});
      const expired=!current||now.getTime()-current.windowStartedAt.getTime()>windowMs;
      const attempts=expired?1:(current.failedAttempts+1),threshold=scope==='ip'?ipMax:max;
      const blockedUntil=attempts>=threshold?new Date(now.getTime()+blockMs):null;
      await this.prisma.loginRateLimit.upsert({
        where:{keyHash},
        create:{keyHash,failedAttempts:attempts,windowStartedAt:now,blockedUntil},
        update:{failedAttempts:attempts,windowStartedAt:expired?now:current!.windowStartedAt,blockedUntil},
      });
    }
  }

  private async clearLoginFailures(username:string,ip?:string){
    const keys=this.loginKeys(username,ip);
    // Um login válido limpa apenas o contador daquela conta. O contador agregado do IP
    // permanece na janela para impedir que um atacante o zere usando outra conta válida.
    await this.prisma.loginRateLimit.deleteMany({where:{keyHash:keys.userIp}});
  }

  async login(username: string, password: string, meta: { ip?: string; userAgent?: string }) {
    await this.assertLoginAllowed(username,meta.ip);
    const user = await this.prisma.user.findUnique({ where: { username }, include: { unitAccesses: { where: { active: true } } } });
    const valid=!!user?.active&&!!user.passwordHash&&await argon2.verify(user.passwordHash,password).catch(()=>false);
    if(!valid){await this.registerLoginFailure(username,meta.ip);throw new UnauthorizedException('Credenciais invÃ¡lidas');}
    if(user.passwordResetRequired) throw new ForbiddenException('RedefiniÃ§Ã£o de senha obrigatÃ³ria');
    await this.clearLoginFailures(username,meta.ip);
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
        systemRole:user.systemRole,
        networkAdmin: user.networkAdmin,
        unitIds: user.unitAccesses.map(x => x.unitId),
        permissions: normalizePermissions(user.permissions),
        unitAccesses:user.unitAccesses.map(x=>({unitId:x.unitId,role:x.role,permissions:normalizePermissions(x.permissions)})),
        sessionId: session.id,
      },
    };
  }

  async rotateCsrf(sessionId:string){
    const csrfToken=randomToken(32);
    await this.prisma.session.update({where:{id:sessionId},data:{csrfHash:sha256(csrfToken)}});
    return csrfToken;
  }

  async issueCredentialToken(userId:string,purpose:CredentialTokenPurpose,createdByUserId:string){
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{id:true,active:true,username:true}});
    if(!user?.active) throw new UnauthorizedException('UsuÃ¡rio indisponÃ­vel');
    const token=randomToken(48);
    const ttlMs=purpose===CredentialTokenPurpose.ACTIVATE
      ? Math.max(15*60_000,Number(process.env.ACTIVATION_TOKEN_TTL_MS||86_400_000))
      : Math.max(5*60_000,Number(process.env.RESET_TOKEN_TTL_MS||1_800_000));
    const expiresAt=new Date(Date.now()+ttlMs);
    await this.prisma.$transaction(async tx=>{
      await tx.userCredentialToken.updateMany({where:{userId,purpose,usedAt:null,invalidatedAt:null},data:{invalidatedAt:new Date()}});
      await tx.userCredentialToken.create({data:{userId,purpose,tokenHash:sha256(token),expiresAt,createdByUserId}});
    });
    return {token,expiresAt,username:user.username,purpose};
  }

  async consumeCredentialToken(token:string,newPassword:string,purpose:CredentialTokenPurpose){
    if(newPassword.length<12) throw new ForbiddenException('A nova senha deve ter no mÃ­nimo 12 caracteres');
    const tokenHash=sha256(String(token||''));
    const row=await this.prisma.userCredentialToken.findUnique({where:{tokenHash},include:{user:true}});
    const now=new Date();
    if(!row||row.purpose!==purpose||row.usedAt||row.invalidatedAt||row.expiresAt<=now||!row.user.active){
      throw new UnauthorizedException('Token invÃ¡lido ou expirado');
    }
    const passwordHash=await argon2.hash(newPassword,{type:argon2.argon2id});
    await this.prisma.$transaction(async tx=>{
      await tx.user.update({where:{id:row.userId},data:{passwordHash,passwordResetRequired:false,version:{increment:1}}});
      await tx.userCredentialToken.update({where:{id:row.id},data:{usedAt:now}});
      await tx.userCredentialToken.updateMany({where:{userId:row.userId,id:{not:row.id},usedAt:null,invalidatedAt:null},data:{invalidatedAt:now}});
      await tx.session.updateMany({where:{userId:row.userId,status:'ACTIVE'},data:{status:'REVOKED',revokedAt:now}});
    });
    return {ok:true};
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  }
}

