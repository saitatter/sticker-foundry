import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-refresh-cookie') refreshCookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const auth = await this.authService.register(dto);
    this.setRefreshCookie(response, auth.refreshToken);
    return this.authResponse(auth, refreshCookieHeader);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('x-refresh-cookie') refreshCookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const auth = await this.authService.login(dto);
    this.setRefreshCookie(response, auth.refreshToken);
    return this.authResponse(auth, refreshCookieHeader);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('x-refresh-cookie') refreshCookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const auth = await this.authService.refresh({ refreshToken: dto.refreshToken ?? readCookie(cookieHeader, this.cookieName()) });
    this.setRefreshCookie(response, auth.refreshToken);
    return this.authResponse(auth, refreshCookieHeader);
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout({ refreshToken: dto.refreshToken ?? readCookie(cookieHeader, this.cookieName()) });
    this.clearRefreshCookie(response);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user.sub);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Post('password/reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password/reset/confirm')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: RequestUser) {
    return this.authService.sessions(user.sub);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  revokeAllSessions(@CurrentUser() user: RequestUser) {
    return this.authService.revokeAllSessions(user.sub);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.sub, id);
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    if (!this.cookieEnabled()) return;
    response.cookie(this.cookieName(), refreshToken, this.cookieOptions());
  }

  private authResponse(auth: Awaited<ReturnType<AuthService['login']>>, refreshCookieHeader?: string) {
    if (!this.cookieEnabled() || refreshCookieHeader?.toLowerCase() !== 'true') return auth;
    const { refreshToken: _refreshToken, ...cookieAuth } = auth;
    return cookieAuth;
  }

  private clearRefreshCookie(response: Response) {
    if (!this.cookieEnabled()) return;
    response.clearCookie(this.cookieName(), { path: this.cookiePath() });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.booleanConfig('AUTH_REFRESH_COOKIE_SECURE', this.config.get<string>('NODE_ENV') === 'production'),
      sameSite: this.config.get<string>('AUTH_REFRESH_COOKIE_SAME_SITE', 'lax') as CookieOptions['sameSite'],
      path: this.cookiePath(),
      maxAge: this.configInt('REFRESH_TOKEN_TTL_DAYS', 30) * 24 * 60 * 60 * 1000,
    };
  }

  private cookieEnabled() {
    return this.booleanConfig('AUTH_REFRESH_COOKIE_ENABLED', true);
  }

  private cookieName() {
    return this.config.get<string>('AUTH_REFRESH_COOKIE_NAME', 'stickerfoundry_refresh');
  }

  private cookiePath() {
    return this.config.get<string>('AUTH_REFRESH_COOKIE_PATH', '/api/auth');
  }

  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    return value === undefined ? fallback : value.toLowerCase() === 'true';
  }

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

function readCookie(header: string | undefined, name: string) {
  const entry = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  const value = entry.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
