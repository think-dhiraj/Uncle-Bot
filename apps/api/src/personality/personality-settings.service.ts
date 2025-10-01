import { Injectable } from '@nestjs/common';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';
import { PersonalityService } from './personality.service';

export interface PersonalitySettings {
  humorLevel: 'none' | 'low' | 'medium' | 'high' | 'maximum';
  sarcasmLevel: 'none' | 'low' | 'medium' | 'high';
  jokeFrequency: 'never' | 'rare' | 'occasional' | 'frequent' | 'always';
  personalityMode: 'professional' | 'friendly' | 'witty' | 'sarcastic' | 'hilarious';
  emojiUsage: 'none' | 'minimal' | 'moderate' | 'frequent';
  dadJokeLevel: 'none' | 'light' | 'medium' | 'heavy';
}

export interface PersonalitySettingsResponse {
  settings: PersonalitySettings;
  isDefault: boolean;
  lastUpdated: Date;
}

@Injectable()
export class PersonalitySettingsService {
  constructor(
    private userPreferencesService: UserPreferencesService,
    private personalityService: PersonalityService,
  ) {}

  /**
   * Get user's personality settings
   */
  async getPersonalitySettings(userId: string): Promise<PersonalitySettingsResponse> {
    const userPreferences = await this.userPreferencesService.getPreferences(userId);
    const personalitySettings = (userPreferences as any)?.personalitySettings as PersonalitySettings;
    
    const defaultSettings = this.getDefaultPersonalitySettings();
    const settings = personalitySettings || defaultSettings;
    
    return {
      settings,
      isDefault: !personalitySettings,
      lastUpdated: userPreferences?.updatedAt || new Date(),
    };
  }

  /**
   * Update user's personality settings
   */
  async updatePersonalitySettings(
    userId: string,
    updates: Partial<PersonalitySettings>
  ): Promise<PersonalitySettingsResponse> {
    // Get current settings
    const currentSettings = await this.getPersonalitySettings(userId);
    
    // Merge with updates
    const newSettings: PersonalitySettings = {
      ...currentSettings.settings,
      ...updates,
    };

    // Validate settings
    this.validatePersonalitySettings(newSettings);

    // Update user preferences
    await this.userPreferencesService.updatePreferences(userId, {
      personalitySettings: newSettings,
    } as any);

    // Track the personality adjustment
    await this.personalityService.trackPersonalityAdjustment(
      userId,
      `Updated personality settings: ${JSON.stringify(updates)}`,
      'User preference change'
    );

    return {
      settings: newSettings,
      isDefault: false,
      lastUpdated: new Date(),
    };
  }

  /**
   * Reset personality settings to defaults
   */
  async resetPersonalitySettings(userId: string): Promise<PersonalitySettingsResponse> {
    const defaultSettings = this.getDefaultPersonalitySettings();
    
    await this.userPreferencesService.updatePreferences(userId, {
      personalitySettings: defaultSettings,
    } as any);

    // Track the reset
    await this.personalityService.trackPersonalityAdjustment(
      userId,
      'Reset personality settings to defaults',
      'User preference reset'
    );

    return {
      settings: defaultSettings,
      isDefault: true,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get personality settings presets
   */
  getPersonalityPresets(): Record<string, PersonalitySettings> {
    return {
      professional: {
        humorLevel: 'none',
        sarcasmLevel: 'none',
        jokeFrequency: 'never',
        personalityMode: 'professional',
        emojiUsage: 'none',
        dadJokeLevel: 'none',
      },
      friendly: {
        humorLevel: 'low',
        sarcasmLevel: 'none',
        jokeFrequency: 'rare',
        personalityMode: 'friendly',
        emojiUsage: 'minimal',
        dadJokeLevel: 'light',
      },
      witty: {
        humorLevel: 'medium',
        sarcasmLevel: 'low',
        jokeFrequency: 'occasional',
        personalityMode: 'witty',
        emojiUsage: 'moderate',
        dadJokeLevel: 'medium',
      },
      sarcastic: {
        humorLevel: 'high',
        sarcasmLevel: 'medium',
        jokeFrequency: 'frequent',
        personalityMode: 'sarcastic',
        emojiUsage: 'moderate',
        dadJokeLevel: 'medium',
      },
      hilarious: {
        humorLevel: 'maximum',
        sarcasmLevel: 'high',
        jokeFrequency: 'always',
        personalityMode: 'hilarious',
        emojiUsage: 'frequent',
        dadJokeLevel: 'heavy',
      },
    };
  }

  /**
   * Apply a personality preset
   */
  async applyPersonalityPreset(
    userId: string,
    presetName: string
  ): Promise<PersonalitySettingsResponse> {
    const presets = this.getPersonalityPresets();
    const preset = presets[presetName];
    
    if (!preset) {
      throw new Error(`Invalid preset: ${presetName}`);
    }

    return this.updatePersonalitySettings(userId, preset);
  }

  /**
   * Get personality settings analytics
   */
  async getPersonalityAnalytics(userId: string): Promise<{
    currentSettings: PersonalitySettings;
    usageStats: any;
    recommendations: string[];
  }> {
    const settings = await this.getPersonalitySettings(userId);
    const analytics = await this.personalityService.getPersonalityAnalytics(userId);
    
    // Generate recommendations based on current settings
    const recommendations = this.generateRecommendations(settings.settings);
    
    return {
      currentSettings: settings.settings,
      usageStats: analytics,
      recommendations,
    };
  }

  /**
   * Get default personality settings
   */
  private getDefaultPersonalitySettings(): PersonalitySettings {
    return {
      humorLevel: 'medium',
      sarcasmLevel: 'low',
      jokeFrequency: 'occasional',
      personalityMode: 'friendly',
      emojiUsage: 'moderate',
      dadJokeLevel: 'medium',
    };
  }

  /**
   * Validate personality settings
   */
  private validatePersonalitySettings(settings: PersonalitySettings): void {
    const validHumorLevels = ['none', 'low', 'medium', 'high', 'maximum'];
    const validSarcasmLevels = ['none', 'low', 'medium', 'high'];
    const validJokeFrequencies = ['never', 'rare', 'occasional', 'frequent', 'always'];
    const validPersonalityModes = ['professional', 'friendly', 'witty', 'sarcastic', 'hilarious'];
    const validEmojiUsage = ['none', 'minimal', 'moderate', 'frequent'];
    const validDadJokeLevels = ['none', 'light', 'medium', 'heavy'];

    if (!validHumorLevels.includes(settings.humorLevel)) {
      throw new Error(`Invalid humor level: ${settings.humorLevel}`);
    }
    if (!validSarcasmLevels.includes(settings.sarcasmLevel)) {
      throw new Error(`Invalid sarcasm level: ${settings.sarcasmLevel}`);
    }
    if (!validJokeFrequencies.includes(settings.jokeFrequency)) {
      throw new Error(`Invalid joke frequency: ${settings.jokeFrequency}`);
    }
    if (!validPersonalityModes.includes(settings.personalityMode)) {
      throw new Error(`Invalid personality mode: ${settings.personalityMode}`);
    }
    if (!validEmojiUsage.includes(settings.emojiUsage)) {
      throw new Error(`Invalid emoji usage: ${settings.emojiUsage}`);
    }
    if (!validDadJokeLevels.includes(settings.dadJokeLevel)) {
      throw new Error(`Invalid dad joke level: ${settings.dadJokeLevel}`);
    }
  }

  /**
   * Generate recommendations based on current settings
   */
  private generateRecommendations(settings: PersonalitySettings): string[] {
    const recommendations: string[] = [];

    if (settings.humorLevel === 'none' && settings.jokeFrequency !== 'never') {
      recommendations.push('Consider setting joke frequency to "never" for a completely serious tone');
    }

    if (settings.humorLevel === 'maximum' && settings.jokeFrequency === 'rare') {
      recommendations.push('For maximum humor, consider increasing joke frequency to "frequent" or "always"');
    }

    if (settings.sarcasmLevel === 'high' && settings.personalityMode === 'professional') {
      recommendations.push('High sarcasm works better with "witty" or "sarcastic" personality modes');
    }

    if (settings.emojiUsage === 'frequent' && settings.personalityMode === 'professional') {
      recommendations.push('Frequent emoji usage works better with "friendly" or "witty" personality modes');
    }

    if (settings.dadJokeLevel === 'heavy' && settings.humorLevel === 'low') {
      recommendations.push('Heavy dad jokes work better with higher humor levels');
    }

    return recommendations;
  }
}
