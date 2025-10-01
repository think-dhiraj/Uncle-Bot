import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserApiKeyService } from '../user-api-key/user-api-key.service';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';

@Injectable()
export class DevUserService {
  private readonly DEV_USER_ID = 'dev-user-123';
  private readonly DEV_USER_EMAIL = 'dev@unclebot.local';
  private readonly DEV_USER_NAME = 'Dev User';
  private readonly DEV_API_KEY = 'dev-api-key-placeholder'; // In real dev, this would be a valid test key

  constructor(
    private databaseService: DatabaseService,
    private userApiKeyService: UserApiKeyService,
    private userPreferencesService: UserPreferencesService,
  ) {}

  /**
   * Ensure dev user exists in database with all required data
   */
  async ensureDevUserExists(): Promise<void> {
    try {
      // Check if dev user already exists
      const existingUser = await this.databaseService.user.findUnique({
        where: { id: this.DEV_USER_ID }
      });

      if (!existingUser) {
        // Create dev user
        await this.databaseService.user.create({
          data: {
            id: this.DEV_USER_ID,
            email: this.DEV_USER_EMAIL,
            name: this.DEV_USER_NAME,
            image: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
          }
        });

        console.log('✅ Dev user created successfully');
      }

      // Ensure dev user has API key
      await this.ensureDevUserApiKey();

      // Ensure dev user has preferences
      await this.ensureDevUserPreferences();

    } catch (error) {
      console.error('❌ Error ensuring dev user exists:', error);
      throw error;
    }
  }

  /**
   * Ensure dev user has a valid API key
   */
  private async ensureDevUserApiKey(): Promise<void> {
    try {
      const hasApiKey = await this.userApiKeyService.getApiKeyStatus(this.DEV_USER_ID);
      
      if (!hasApiKey.hasApiKey) {
        // Set a dev API key (in real development, this would be a valid test key)
        await this.userApiKeyService.createApiKey(
          this.DEV_USER_ID,
          this.DEV_API_KEY,
          'Dev API Key for testing'
        );
        
        console.log('✅ Dev user API key set successfully');
      }
    } catch (error) {
      console.error('❌ Error setting dev user API key:', error);
      // Don't throw here as API key might not be critical for basic functionality
    }
  }

  /**
   * Ensure dev user has preferences
   */
  private async ensureDevUserPreferences(): Promise<void> {
    try {
      const preferences = await this.userPreferencesService.getPreferences(this.DEV_USER_ID);
      
      if (!preferences) {
        await this.userPreferencesService.createPreferences(this.DEV_USER_ID, {
          theme: 'system',
          language: 'en',
          timezone: 'UTC',
        });
        
        console.log('✅ Dev user preferences created successfully');
      }
    } catch (error) {
      console.error('❌ Error setting dev user preferences:', error);
      // Don't throw here as preferences are not critical
    }
  }

  /**
   * Get dev user session data
   */
  getDevUserSession() {
    return {
      user: {
        id: this.DEV_USER_ID,
        name: this.DEV_USER_NAME,
        email: this.DEV_USER_EMAIL,
        image: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
      },
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };
  }

  /**
   * Check if a user ID is the dev user
   */
  isDevUser(userId: string): boolean {
    return userId === this.DEV_USER_ID;
  }

  /**
   * Get dev user info for debugging
   */
  async getDevUserInfo() {
    const user = await this.databaseService.user.findUnique({
      where: { id: this.DEV_USER_ID },
      include: {
        preferences: true,
        chatSessions: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const apiKeyStatus = await this.userApiKeyService.getApiKeyStatus(this.DEV_USER_ID);

    return {
      user,
      apiKeyStatus,
      isDevUser: true
    };
  }
}
