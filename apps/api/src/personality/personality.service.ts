import { Injectable } from '@nestjs/common';
import { PersonalityMemoryService } from './personality-memory.service';
import { PersonalityVectorService } from './personality-vector.service';
import { PersonalityInteractionService } from './personality-interaction.service';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';
import { PersonalityMemoryType, PersonalityInteractionType } from 'db';

export interface PersonalityContext {
  userId: string;
  sessionId?: string;
  conversationHistory: string[];
  userPreferences: any;
  personalityMemories: any[];
  recentInteractions: any[];
  humorLevel: 'low' | 'medium' | 'high';
  sarcasmLevel: 'low' | 'medium' | 'high';
  jokeFrequency: 'never' | 'occasional' | 'frequent';
}

export interface PersonalityPrompt {
  systemPrompt: string;
  personalityContext: PersonalityContext;
  shouldInjectJoke: boolean;
  tone: 'friendly' | 'sarcastic' | 'humorous' | 'professional';
}

export interface PersonalitySettings {
  humorLevel: 'low' | 'medium' | 'high';
  sarcasmLevel: 'low' | 'medium' | 'high';
  jokeFrequency: 'never' | 'occasional' | 'frequent';
  personalityMode: 'friendly' | 'professional' | 'witty' | 'sarcastic';
}

@Injectable()
export class PersonalityService {
  constructor(
    private personalityMemoryService: PersonalityMemoryService,
    private personalityVectorService: PersonalityVectorService,
    private personalityInteractionService: PersonalityInteractionService,
    private userPreferencesService: UserPreferencesService,
  ) {}

  /**
   * Build personality context for a user
   */
  async buildPersonalityContext(
    userId: string,
    sessionId?: string
  ): Promise<PersonalityContext> {
    // Get user preferences
    const userPreferences = await this.userPreferencesService.getPreferences(userId);
    const personalitySettings = (userPreferences as any)?.personalitySettings as PersonalitySettings || this.getDefaultPersonalitySettings();

    // Get recent personality memories
    const personalityMemories = await this.personalityMemoryService.getRecentMemories(userId, 10);

    // Get recent interactions
    const recentInteractions = await this.personalityInteractionService.getRecentInteractions(userId, 10);

    // Get conversation history if sessionId is provided
    const conversationHistory = sessionId ? await this.getConversationHistory(userId, sessionId) : [];

    return {
      userId,
      sessionId,
      conversationHistory,
      userPreferences: personalitySettings,
      personalityMemories,
      recentInteractions,
      humorLevel: personalitySettings.humorLevel,
      sarcasmLevel: personalitySettings.sarcasmLevel,
      jokeFrequency: personalitySettings.jokeFrequency,
    };
  }

  /**
   * Generate enhanced system prompt with personality
   */
  async generatePersonalityPrompt(
    userId: string,
    userMessage: string,
    sessionId?: string
  ): Promise<PersonalityPrompt> {
    const personalityContext = await this.buildPersonalityContext(userId, sessionId);
    
    // Determine if we should inject a joke
    const shouldInjectJoke = this.shouldInjectJoke(personalityContext, userMessage);
    
    // Determine tone based on context
    const tone = this.determineTone(personalityContext, userMessage);
    
    // Build the system prompt
    const systemPrompt = this.buildSystemPrompt(personalityContext, tone, shouldInjectJoke);

    return {
      systemPrompt,
      personalityContext,
      shouldInjectJoke,
      tone,
    };
  }

  /**
   * Track user interaction with personality
   */
  async trackPersonalityInteraction(
    userId: string,
    type: PersonalityInteractionType,
    content: string,
    metadata?: any,
    sessionId?: string
  ): Promise<void> {
    await this.personalityInteractionService.createInteraction({
      userId,
      sessionId,
      type,
      content,
      metadata,
    });
  }

  /**
   * Track joke usage
   */
  async trackJokeUsage(
    userId: string,
    joke: string,
    context?: string,
    sessionId?: string
  ): Promise<void> {
    await this.personalityMemoryService.trackJokeUsage(userId, joke, context);
    
    // Also track as interaction
    await this.trackPersonalityInteraction(
      userId,
      PersonalityInteractionType.JOKE_RATING,
      joke,
      { context, timestamp: new Date().toISOString() },
      sessionId
    );
  }

  /**
   * Track user reaction to personality
   */
  async trackUserReaction(
    userId: string,
    reaction: string,
    context?: string,
    sessionId?: string
  ): Promise<void> {
    await this.personalityMemoryService.trackUserReaction(userId, reaction, context);
    
    // Also track as interaction
    await this.trackPersonalityInteraction(
      userId,
      PersonalityInteractionType.PERSONALITY_FEEDBACK,
      reaction,
      { context, timestamp: new Date().toISOString() },
      sessionId
    );
  }

  /**
   * Get personality analytics for a user
   */
  async getPersonalityAnalytics(userId: string): Promise<{
    memoryStats: any;
    interactionStats: any;
    vectorStats: any;
    personalitySettings: PersonalitySettings;
  }> {
    const [memoryStats, interactionStats, vectorStats, userPreferences] = await Promise.all([
      this.personalityMemoryService.getMemoryStats(userId),
      this.personalityInteractionService.getInteractionStats(userId),
      this.personalityVectorService.getVectorStats(userId),
      this.userPreferencesService.getPreferences(userId),
    ]);

    const personalitySettings = (userPreferences as any)?.personalitySettings as PersonalitySettings || this.getDefaultPersonalitySettings();

    return {
      memoryStats,
      interactionStats,
      vectorStats,
      personalitySettings,
    };
  }

  /**
   * Update personality settings
   */
  async updatePersonalitySettings(
    userId: string,
    settings: Partial<PersonalitySettings>
  ): Promise<void> {
    const currentPreferences = await this.userPreferencesService.getPreferences(userId);
    const currentPersonalitySettings = (currentPreferences as any)?.personalitySettings as PersonalitySettings || this.getDefaultPersonalitySettings();
    
    const updatedSettings = {
      ...currentPersonalitySettings,
      ...settings,
    };

    await this.userPreferencesService.updatePreferences(userId, {
      personalitySettings: updatedSettings,
    } as any);

    // Track the personality adjustment
    await this.personalityMemoryService.trackPersonalityAdjustment(
      userId,
      `Updated personality settings: ${JSON.stringify(settings)}`,
      'User preference change'
    );
  }

  /**
   * Get contextual joke for the conversation
   */
  async getContextualJoke(
    userId: string,
    context: string,
    sessionId?: string
  ): Promise<string | null> {
    // Get user's joke history to avoid repetition
    const jokeHistory = await this.personalityMemoryService.getJokeHistory(userId, 20);
    
    // Get contextual jokes based on the conversation context
    const contextualJokes = this.getJokesByContext(context);
    
    // Filter out recently used jokes
    const availableJokes = contextualJokes.filter(joke => !jokeHistory.includes(joke));
    
    if (availableJokes.length === 0) {
      return null;
    }

    // Select a random joke
    const selectedJoke = availableJokes[Math.floor(Math.random() * availableJokes.length)];
    
    // Track the joke usage
    await this.trackJokeUsage(userId, selectedJoke, context, sessionId);
    
    return selectedJoke;
  }

  /**
   * Build system prompt with personality
   */
  private buildSystemPrompt(
    context: PersonalityContext,
    tone: string,
    shouldInjectJoke: boolean
  ): string {
    const basePrompt = `You are a helpful AI assistant with a distinct personality:

PERSONALITY TRAITS:
- Funny and witty, with a dry sense of humor
- Occasionally sarcastic but always kind
- Loves dad jokes and puns
- Light-hearted roasting is okay, but never mean
- Always helpful and supportive
- Uses emojis sparingly but effectively

COMMUNICATION STYLE:
- Start responses with personality-appropriate greetings
- Include relevant dad jokes when the context fits
- Use light sarcasm for obvious questions or mistakes
- Be encouraging and supportive
- End with helpful next steps

CURRENT CONTEXT:
- User's humor level: ${context.humorLevel}
- User's sarcasm level: ${context.sarcasmLevel}
- Joke frequency: ${context.jokeFrequency}
- Recent interactions: ${context.recentInteractions.length} interactions
- Personality memories: ${context.personalityMemories.length} memories

Remember: Be funny, be helpful, be kind. Never be mean or offensive.`;

    if (shouldInjectJoke) {
      return basePrompt + '\n\nIMPORTANT: Include a relevant dad joke or pun in your response when appropriate.';
    }

    return basePrompt;
  }

  /**
   * Determine if we should inject a joke
   */
  private shouldInjectJoke(context: PersonalityContext, userMessage: string): boolean {
    // Don't inject jokes if user has set frequency to 'never'
    if (context.jokeFrequency === 'never') {
      return false;
    }

    // Always inject jokes if frequency is 'frequent'
    if (context.jokeFrequency === 'frequent') {
      return true;
    }

    // For 'occasional', check if the message seems like it could benefit from humor
    const humorKeywords = ['email', 'calendar', 'meeting', 'schedule', 'work', 'busy', 'stress'];
    const hasHumorKeywords = humorKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );

    return hasHumorKeywords;
  }

  /**
   * Determine the tone for the response
   */
  private determineTone(context: PersonalityContext, userMessage: string): 'friendly' | 'sarcastic' | 'humorous' | 'professional' {
    // Check if user is asking something obvious or repetitive
    const obviousQuestions = ['what', 'how', 'when', 'where', 'why'];
    const isObviousQuestion = obviousQuestions.some(word => 
      userMessage.toLowerCase().startsWith(word)
    );

    if (isObviousQuestion && context.sarcasmLevel !== 'low') {
      return 'sarcastic';
    }

    // Check if user seems stressed or needs encouragement
    const stressKeywords = ['help', 'urgent', 'problem', 'issue', 'stuck'];
    const isStressed = stressKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );

    if (isStressed) {
      return 'friendly';
    }

    // Default to humorous if humor level is high
    if (context.humorLevel === 'high') {
      return 'humorous';
    }

    return 'friendly';
  }

  /**
   * Get conversation history for a session
   */
  private async getConversationHistory(userId: string, sessionId: string): Promise<string[]> {
    // This would integrate with the existing chat service
    // For now, return empty array
    return [];
  }

  /**
   * Get jokes by context
   */
  private getJokesByContext(context: string): string[] {
    const contextLower = context.toLowerCase();
    
    if (contextLower.includes('email')) {
      return [
        "Why did the email go to therapy? Because it had too many attachments! 📎",
        "What do you call an email that's been sitting in your inbox for months? A digital fossil! 📧",
        "Why don't emails ever get tired? Because they always have a date! 📅"
      ];
    }
    
    if (contextLower.includes('calendar') || contextLower.includes('meeting')) {
      return [
        "Why don't calendars ever get tired? Because they always have a date! 📅",
        "What's a calendar's favorite type of music? Date-ime music! 🎵",
        "Why did the meeting go to therapy? Because it had too many attendees! 👥"
      ];
    }
    
    if (contextLower.includes('work') || contextLower.includes('busy')) {
      return [
        "Why did the AI break up with the computer? It needed more space! 💻",
        "What do you call a robot that likes to party? A disco-bot! 🤖",
        "Why don't programmers ever get cold? Because they always have their Java! ☕"
      ];
    }
    
    // General jokes
    return [
      "Why did the AI assistant go to therapy? Because it had too many issues to process! 🤖",
      "What do you call an AI that's always late? A procrasti-bot! ⏰",
      "Why don't AIs ever get lonely? Because they always have their data! 📊"
    ];
  }

  /**
   * Get default personality settings
   */
  private getDefaultPersonalitySettings(): PersonalitySettings {
    return {
      humorLevel: 'medium',
      sarcasmLevel: 'medium',
      jokeFrequency: 'occasional',
      personalityMode: 'friendly',
    };
  }
}
