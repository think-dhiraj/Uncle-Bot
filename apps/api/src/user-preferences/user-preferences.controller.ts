import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserPreferencesService } from './user-preferences.service';

export interface CreatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  timezone?: string;
}

export interface UpdatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  timezone?: string;
}

@Controller('user-preferences')
@UseGuards(JwtAuthGuard)
export class UserPreferencesController {
  constructor(private readonly userPreferencesService: UserPreferencesService) {}

  @Get()
  async getPreferences(@Request() req) {
    const userId = req.user.id;
    return await this.userPreferencesService.getPreferences(userId);
  }

  @Post()
  async createPreferences(@Request() req, @Body() createPreferencesDto: CreatePreferencesDto) {
    const userId = req.user.id;
    return await this.userPreferencesService.createPreferences(userId, createPreferencesDto);
  }

  @Put()
  async updatePreferences(@Request() req, @Body() updatePreferencesDto: UpdatePreferencesDto) {
    const userId = req.user.id;
    return await this.userPreferencesService.updatePreferences(userId, updatePreferencesDto);
  }

  @Delete()
  async deletePreferences(@Request() req) {
    const userId = req.user.id;
    await this.userPreferencesService.deletePreferences(userId);
    return { message: 'Preferences deleted successfully' };
  }

  @Get('user-with-preferences')
  async getUserWithPreferences(@Request() req) {
    const userId = req.user.id;
    return await this.userPreferencesService.getUserWithPreferences(userId);
  }

  @Put('theme')
  async updateTheme(@Request() req, @Body() body: { theme: 'light' | 'dark' | 'system' }) {
    const userId = req.user.id;
    return await this.userPreferencesService.updateTheme(userId, body.theme);
  }

  @Put('language')
  async updateLanguage(@Request() req, @Body() body: { language: string }) {
    const userId = req.user.id;
    return await this.userPreferencesService.updateLanguage(userId, body.language);
  }

  @Put('timezone')
  async updateTimezone(@Request() req, @Body() body: { timezone: string }) {
    const userId = req.user.id;
    return await this.userPreferencesService.updateTimezone(userId, body.timezone);
  }

  @Post('reset')
  async resetToDefaults(@Request() req) {
    const userId = req.user.id;
    return await this.userPreferencesService.resetToDefaults(userId);
  }

  @Get('available-themes')
  async getAvailableThemes() {
    return this.userPreferencesService.getAvailableThemes();
  }

  @Get('available-languages')
  async getAvailableLanguages() {
    return this.userPreferencesService.getAvailableLanguages();
  }

  @Get('available-timezones')
  async getAvailableTimezones() {
    return this.userPreferencesService.getAvailableTimezones();
  }
}
