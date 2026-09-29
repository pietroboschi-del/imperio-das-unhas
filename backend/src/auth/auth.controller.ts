import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../common/public.decorator';
import type { ImperioRequest } from '../common/request-context';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
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

  @Post('logout')
  async logout(@Req() req: ImperioRequest, @Res({ passthrough: true }) res: Response) {
    if (req.principal?.sessionId) await this.auth.revoke(req.principal.sessionId);
    res.clearCookie('imperio_session', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: ImperioRequest) { return { user: req.principal }; }
}
