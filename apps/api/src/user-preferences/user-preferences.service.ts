import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { User } from 'db';

export interface UserPreferencesData {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  timezone?: string;
}

export interface UserPreferencesResponse {
  id: string;
  userId: string;
  theme: string;
  language: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserPreferencesService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<UserPreferencesResponse | null> {
    const preferences = await this.databaseService.getUserPreferences(userId);
    
    if (!preferences) {
      return null;
    }

    return {
      id: preferences.id,
      userId: preferences.userId,
      theme: preferences.theme,
      language: preferences.language,
      timezone: preferences.timezone,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  /**
   * Create user preferences with default values
   */
  async createPreferences(userId: string, data?: UserPreferencesData): Promise<UserPreferencesResponse> {
    // Check if user exists
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if preferences already exist
    const existingPreferences = await this.databaseService.getUserPreferences(userId);
    if (existingPreferences) {
      throw new BadRequestException('User preferences already exist');
    }

    const preferences = await this.databaseService.createUserPreferences({
      userId,
      theme: data?.theme || 'system',
      language: data?.language || 'en',
      timezone: data?.timezone || 'UTC',
    });

    return {
      id: preferences.id,
      userId: preferences.userId,
      theme: preferences.theme,
      language: preferences.language,
      timezone: preferences.timezone,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, data: UserPreferencesData): Promise<UserPreferencesResponse> {
    // Validate input data
    this.validatePreferencesData(data);

    const preferences = await this.databaseService.updateUserPreferences(userId, data);

    return {
      id: preferences.id,
      userId: preferences.userId,
      theme: preferences.theme,
      language: preferences.language,
      timezone: preferences.timezone,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  /**
   * Delete user preferences
   */
  async deletePreferences(userId: string): Promise<void> {
    await this.databaseService.deleteUserPreferences(userId);
  }

  /**
   * Get or create user preferences (upsert)
   */
  async getOrCreatePreferences(userId: string, data?: UserPreferencesData): Promise<UserPreferencesResponse> {
    let preferences = await this.getPreferences(userId);
    
    if (!preferences) {
      preferences = await this.createPreferences(userId, data);
    }

    return preferences;
  }

  /**
   * Update specific preference field
   */
  async updateTheme(userId: string, theme: 'light' | 'dark' | 'system'): Promise<UserPreferencesResponse> {
    return this.updatePreferences(userId, { theme });
  }

  async updateLanguage(userId: string, language: string): Promise<UserPreferencesResponse> {
    return this.updatePreferences(userId, { language });
  }

  async updateTimezone(userId: string, timezone: string): Promise<UserPreferencesResponse> {
    return this.updatePreferences(userId, { timezone });
  }

  /**
   * Get user with preferences
   */
  async getUserWithPreferences(userId: string): Promise<User & { preferences: UserPreferencesResponse | null }> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const preferences = await this.getPreferences(userId);

    return {
      ...user,
      preferences,
    };
  }

  /**
   * Validate preferences data
   */
  private validatePreferencesData(data: UserPreferencesData): void {
    if (data.theme && !['light', 'dark', 'system'].includes(data.theme)) {
      throw new BadRequestException('Invalid theme. Must be light, dark, or system');
    }

    if (data.language && typeof data.language !== 'string') {
      throw new BadRequestException('Language must be a string');
    }

    if (data.timezone && typeof data.timezone !== 'string') {
      throw new BadRequestException('Timezone must be a string');
    }
  }

  /**
   * Get available themes
   */
  getAvailableThemes(): string[] {
    return ['light', 'dark', 'system'];
  }

  /**
   * Get available languages
   */
  getAvailableLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh', name: 'Chinese' },
    ];
  }

  /**
   * Get available timezones
   */
  getAvailableTimezones(): string[] {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Pacific/Auckland',
    ];
  }

  /**
   * Reset preferences to defaults
   */
  async resetToDefaults(userId: string): Promise<UserPreferencesResponse> {
    return this.updatePreferences(userId, {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
    });
  }
}
