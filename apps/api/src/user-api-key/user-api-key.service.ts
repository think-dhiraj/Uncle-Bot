import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KmsService } from '../kms/kms.service';
import { User } from 'db';

export interface ApiKeyValidationResult {
  isValid: boolean;
  error?: string;
  keyInfo?: {
    model: string;
    location: string;
    endpoint?: string;
  };
}

@Injectable()
export class UserApiKeyService {
  constructor(
    private databaseService: DatabaseService,
    private kmsService: KmsService,
  ) {}

  /**
   * Store a user's Gemini API key (encrypted)
   */
  async storeApiKey(userId: string, apiKey: string): Promise<void> {
    // Validate the API key format
    const validation = await this.validateApiKey(apiKey);
    if (!validation.isValid) {
      throw new BadRequestException(`Invalid API key: ${validation.error}`);
    }

    // Encrypt the API key before storing
    const encryptedApiKey = await this.kmsService.encrypt(apiKey);

    // Update user with encrypted API key
    await this.databaseService.user.update({
      where: { id: userId },
      data: { geminiApiKey: encryptedApiKey },
    });

    // Log the API key storage
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'user.api_key.stored',
        resource: 'user_api_key',
        metadata: {
          keyLength: apiKey.length,
          validationResult: validation.isValid,
        },
      },
    });
  }

  /**
   * Retrieve and decrypt a user's Gemini API key
   */
  async getApiKey(userId: string): Promise<string | null> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { geminiApiKey: true },
    });

    if (!user || !user.geminiApiKey) {
      return null;
    }

    // Decrypt the API key
    return await this.kmsService.decrypt(user.geminiApiKey);
  }

  /**
   * Check if a user has an API key stored
   */
  async hasApiKey(userId: string): Promise<boolean> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { geminiApiKey: true },
    });

    return !!(user && user.geminiApiKey);
  }

  /**
   * Remove a user's API key
   */
  async removeApiKey(userId: string): Promise<void> {
    await this.databaseService.user.update({
      where: { id: userId },
      data: { geminiApiKey: null },
    });

    // Log the API key removal
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'user.api_key.removed',
        resource: 'user_api_key',
        metadata: {},
      },
    });
  }

  /**
   * Validate a Gemini API key format and test connectivity
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    try {
      // Basic format validation
      if (!apiKey || typeof apiKey !== 'string') {
        return {
          isValid: false,
          error: 'API key is required and must be a string',
        };
      }

      if (apiKey.length < 20) {
        return {
          isValid: false,
          error: 'API key appears to be too short',
        };
      }

      // Test the API key by making a simple request to Gemini
      const testResult = await this.testApiKeyConnectivity(apiKey);
      
      if (!testResult.success) {
        return {
          isValid: false,
          error: testResult.error || 'API key validation failed',
        };
      }

      return {
        isValid: true,
        keyInfo: testResult.keyInfo,
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Test API key connectivity with a simple Gemini request
   */
  private async testApiKeyConnectivity(apiKey: string): Promise<{
    success: boolean;
    error?: string;
    keyInfo?: {
      model: string;
      location: string;
      endpoint?: string;
    };
  }> {
    try {
      // Make a simple test request to Gemini API
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Hello, this is a test message to validate the API key.'
            }]
          }]
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`,
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        keyInfo: {
          model: 'gemini-2.5-pro',
          location: 'us-central1', // Default location
          endpoint: 'https://generativelanguage.googleapis.com',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get user's API key status (without exposing the key)
   */
  async getApiKeyStatus(userId: string): Promise<{
    hasApiKey: boolean;
    isValid: boolean;
    lastValidated?: Date;
  }> {
    const hasApiKey = await this.hasApiKey(userId);
    
    if (!hasApiKey) {
      return {
        hasApiKey: false,
        isValid: false,
      };
    }

    // Test the stored API key
    const apiKey = await this.getApiKey(userId);
    if (!apiKey) {
      return {
        hasApiKey: true,
        isValid: false,
      };
    }

    const validation = await this.validateApiKey(apiKey);
    
    return {
      hasApiKey: true,
      isValid: validation.isValid,
      lastValidated: new Date(),
    };
  }

  /**
   * Update user's API key with validation
   */
  async updateApiKey(userId: string, newApiKey: string): Promise<void> {
    // Validate the new API key
    const validation = await this.validateApiKey(newApiKey);
    if (!validation.isValid) {
      throw new BadRequestException(`Invalid API key: ${validation.error}`);
    }

    // Store the new API key
    await this.storeApiKey(userId, newApiKey);

    // Log the API key update
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'user.api_key.updated',
        resource: 'user_api_key',
        metadata: {
          keyLength: newApiKey.length,
          validationResult: validation.isValid,
        },
      },
    });
  }

  /**
   * Get user with API key status
   */
  async getUserWithApiKeyStatus(userId: string): Promise<User & {
    apiKeyStatus: {
      hasApiKey: boolean;
      isValid: boolean;
      lastValidated?: Date;
    };
  }> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const apiKeyStatus = await this.getApiKeyStatus(userId);

    return {
      ...user,
      apiKeyStatus,
    };
  }
}
