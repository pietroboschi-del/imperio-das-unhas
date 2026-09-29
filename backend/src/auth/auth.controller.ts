import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { CredentialTokenPurpose } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Authenticated } from '../common/authenticated.decorator';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { Public } from '../common/public.decorator';
import type { ImperioRequest } from '../common/request-context';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
}
class CredentialDto {
  @IsString() token!: string;
  @IsString() @MinLength(12) newPassword!: string;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: ImperioRequest, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.login(dto.username.trim(), dto.password, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.cookie('imperio_session', out.sessionToken, {
      httpOnly: true,
      secure: String(process.env.COOKIE_SECURE || 'true') === 'true',
      sameSite: 'lax',
      expires: out.expiresAt,
      path: '/',
    });
    return { user: out.principal, csrfToken: out.csrfToken, expiresAt: out.expiresAt.toISOString() };
  }

  @Authenticated()
  @Get('csrf')
  async csrf(@Req() req: ImperioRequest){return {csrfToken:await this.auth.rotateCsrf(req.principal!.sessionId)};}

  @Authenticated()
  @Post('logout')
  async logout(@Req() req: ImperioRequest, @Res({ passthrough: true }) res: Response) {
    if (req.principal?.sessionId) await this.auth.revoke(req.principal.sessionId);
    res.clearCookie('imperio_session', { path: '/' });
    return { ok: true };
  }

  @Authenticated()
  @Get('me')
  me(@Req() req: ImperioRequest) { return { user: req.principal }; }

  @NetworkAdmin()
  @Post('users/:id/activation-token')
  issueActivation(@Req() req:ImperioRequest,@Param('id') userId:string){return this.auth.issueCredentialToken(userId,CredentialTokenPurpose.ACTIVATE,req.principal!.userId);}

  @NetworkAdmin()
  @Post('users/:id/reset-token')
  issueReset(@Req() req:ImperioRequest,@Param('id') userId:string){return this.auth.issueCredentialToken(userId,CredentialTokenPurpose.RESET,req.principal!.userId);}

  @Public()
  @Post('activate')
  activate(@Body() dto:CredentialDto){return this.auth.consumeCredentialToken(dto.token,dto.newPassword,CredentialTokenPurpose.ACTIVATE);}

  @Public()
  @Post('reset')
  reset(@Body() dto:CredentialDto){return this.auth.consumeCredentialToken(dto.token,dto.newPassword,CredentialTokenPurpose.RESET);}
}
