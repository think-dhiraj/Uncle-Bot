import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@ApiTags('Authentication')
@Controller('oauth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  async googleAuth(@Req() req: Request) {
    // This will redirect to Google OAuth
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const token = this.authService.generateJwtToken(user);
    
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    
    // Redirect to frontend with token
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user' })
  async getProfile(@Req() req: Request) {
    return req.user;
  }

  @Get('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Logout and revoke tokens' })
  async logout(@Req() req: Request) {
    const user = req.user as any;
    await this.authService.revokeTokens(user.id);
    
    return { message: 'Logged out successfully' };
  }
}
