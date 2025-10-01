import { Controller, Post, Get, Delete, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserApiKeyService } from './user-api-key.service';

export interface StoreApiKeyDto {
  apiKey: string;
}

export interface UpdateApiKeyDto {
  apiKey: string;
}

@Controller('user-api-key')
@UseGuards(JwtAuthGuard)
export class UserApiKeyController {
  constructor(private readonly userApiKeyService: UserApiKeyService) {}

  @Post()
  async storeApiKey(@Request() req, @Body() storeApiKeyDto: StoreApiKeyDto) {
    const userId = req.user.id;
    await this.userApiKeyService.storeApiKey(userId, storeApiKeyDto.apiKey);
    return { message: 'API key stored successfully' };
  }

  @Get('status')
  async getApiKeyStatus(@Request() req) {
    const userId = req.user.id;
    return await this.userApiKeyService.getApiKeyStatus(userId);
  }

  @Get('user-status')
  async getUserWithApiKeyStatus(@Request() req) {
    const userId = req.user.id;
    return await this.userApiKeyService.getUserWithApiKeyStatus(userId);
  }

  @Put()
  async updateApiKey(@Request() req, @Body() updateApiKeyDto: UpdateApiKeyDto) {
    const userId = req.user.id;
    await this.userApiKeyService.updateApiKey(userId, updateApiKeyDto.apiKey);
    return { message: 'API key updated successfully' };
  }

  @Delete()
  async removeApiKey(@Request() req) {
    const userId = req.user.id;
    await this.userApiKeyService.removeApiKey(userId);
    return { message: 'API key removed successfully' };
  }

  @Post('validate')
  async validateApiKey(@Body() validateApiKeyDto: { apiKey: string }) {
    return await this.userApiKeyService.validateApiKey(validateApiKeyDto.apiKey);
  }
}
