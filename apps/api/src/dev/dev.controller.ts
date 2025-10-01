import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { DevUserService } from './dev-user.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('dev')
export class DevController {
  constructor(private devUserService: DevUserService) {}

  @Post('ensure-user')
  async ensureDevUser() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Dev endpoints only available in development');
    }

    await this.devUserService.ensureDevUserExists();
    return { 
      success: true, 
      message: 'Dev user ensured successfully',
      session: this.devUserService.getDevUserSession()
    };
  }

  @Get('user-info')
  @UseGuards(AuthGuard('jwt'))
  async getDevUserInfo() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Dev endpoints only available in development');
    }

    return await this.devUserService.getDevUserInfo();
  }

  @Get('session')
  async getDevSession() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Dev endpoints only available in development');
    }

    return this.devUserService.getDevUserSession();
  }
}
