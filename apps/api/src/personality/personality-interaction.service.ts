import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
// import { PersonalityInteractionType } from 'db';

export enum PersonalityInteractionType {
  JOKE_RATING = 'JOKE_RATING',
  PERSONALITY_FEEDBACK = 'PERSONALITY_FEEDBACK',
  HUMOR_PREFERENCE = 'HUMOR_PREFERENCE',
  SARCASM_FEEDBACK = 'SARCASM_FEEDBACK',
  PERSONALITY_ADJUSTMENT = 'PERSONALITY_ADJUSTMENT',
}

export interface PersonalityInteractionData {
  userId: string;
  sessionId?: string;
  type: PersonalityInteractionType;
  content: string;
  metadata?: any;
}

export interface PersonalityInteractionResponse {
  id: string;
  userId: string;
  sessionId: string | null;
  type: PersonalityInteractionType;
  content: string;
  metadata: any;
  createdAt: Date;
}

export interface InteractionStats {
  totalInteractions: number;
  interactionsByType: Record<PersonalityInteractionType, number>;
  recentInteractions: number;
  averageRating: number;
}

@Injectable()
export class PersonalityInteractionService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Create a new personality interaction
   */
  async createInteraction(data: PersonalityInteractionData): Promise<PersonalityInteractionResponse> {
    // Validate input
    this.validateInteractionData(data);

    const interaction = await this.databaseService.personalityInteraction.create({
      data: {
        userId: data.userId,
        sessionId: data.sessionId || null,
        type: data.type,
        content: data.content,
        metadata: data.metadata || null,
      },
    });

    return {
      id: interaction.id,
      userId: interaction.userId,
      sessionId: interaction.sessionId,
      type: interaction.type,
      content: interaction.content,
      metadata: interaction.metadata,
      createdAt: interaction.createdAt,
    };
  }

  /**
   * Get personality interactions for a user
   */
  async getUserInteractions(
    userId: string,
    options?: {
      type?: PersonalityInteractionType;
      sessionId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<PersonalityInteractionResponse[]> {
    const interactions = await this.databaseService.personalityInteraction.findMany({
      where: {
        userId,
        ...(options?.type && { type: options.type }),
        ...(options?.sessionId && { sessionId: options.sessionId }),
      },
      orderBy: { createdAt: 'desc' },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });

    return interactions.map(interaction => ({
      id: interaction.id,
      userId: interaction.userId,
      sessionId: interaction.sessionId,
      type: interaction.type,
      content: interaction.content,
      metadata: interaction.metadata,
      createdAt: interaction.createdAt,
    }));
  }

  /**
   * Get interactions by type for a user
   */
  async getInteractionsByType(
    userId: string,
    type: PersonalityInteractionType,
    limit: number = 10
  ): Promise<PersonalityInteractionResponse[]> {
    return this.getUserInteractions(userId, { type, limit });
  }

  /**
   * Get recent interactions for a user
   */
  async getRecentInteractions(
    userId: string,
    limit: number = 20
  ): Promise<PersonalityInteractionResponse[]> {
    return this.getUserInteractions(userId, { limit });
  }

  /**
   * Track joke rating
   */
  async trackJokeRating(
    userId: string,
    joke: string,
    rating: number,
    sessionId?: string
  ): Promise<PersonalityInteractionResponse> {
    return this.createInteraction({
      userId,
      sessionId,
      type: PersonalityInteractionType.JOKE_RATING,
      content: joke,
      metadata: {
        rating,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Track personality feedback
   */
  async trackPersonalityFeedback(
    userId: string,
    feedback: string,
    rating?: number,
    sessionId?: string
  ): Promise<PersonalityInteractionResponse> {
    return this.createInteraction({
      userId,
      sessionId,
      type: PersonalityInteractionType.PERSONALITY_FEEDBACK,
      content: feedback,
      metadata: {
        rating,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Track humor preference
   */
  async trackHumorPreference(
    userId: string,
    preference: string,
    sessionId?: string
  ): Promise<PersonalityInteractionResponse> {
    return this.createInteraction({
      userId,
      sessionId,
      type: PersonalityInteractionType.HUMOR_PREFERENCE,
      content: preference,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Track sarcasm feedback
   */
  async trackSarcasmFeedback(
    userId: string,
    feedback: string,
    level: number,
    sessionId?: string
  ): Promise<PersonalityInteractionResponse> {
    return this.createInteraction({
      userId,
      sessionId,
      type: PersonalityInteractionType.SARCASM_FEEDBACK,
      content: feedback,
      metadata: {
        level,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Track personality adjustment
   */
  async trackPersonalityAdjustment(
    userId: string,
    adjustment: string,
    reason?: string,
    sessionId?: string
  ): Promise<PersonalityInteractionResponse> {
    return this.createInteraction({
      userId,
      sessionId,
      type: PersonalityInteractionType.PERSONALITY_ADJUSTMENT,
      content: adjustment,
      metadata: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Get user's joke ratings
   */
  async getJokeRatings(userId: string, limit: number = 50): Promise<Array<{
    joke: string;
    rating: number;
    timestamp: Date;
  }>> {
    const interactions = await this.getInteractionsByType(
      userId,
      PersonalityInteractionType.JOKE_RATING,
      limit
    );

    return interactions.map(interaction => ({
      joke: interaction.content,
      rating: interaction.metadata?.rating || 0,
      timestamp: interaction.createdAt,
    }));
  }

  /**
   * Get user's personality feedback
   */
  async getPersonalityFeedback(userId: string, limit: number = 50): Promise<Array<{
    feedback: string;
    rating?: number;
    timestamp: Date;
  }>> {
    const interactions = await this.getInteractionsByType(
      userId,
      PersonalityInteractionType.PERSONALITY_FEEDBACK,
      limit
    );

    return interactions.map(interaction => ({
      feedback: interaction.content,
      rating: interaction.metadata?.rating,
      timestamp: interaction.createdAt,
    }));
  }

  /**
   * Get user's humor preferences
   */
  async getHumorPreferences(userId: string, limit: number = 50): Promise<Array<{
    preference: string;
    timestamp: Date;
  }>> {
    const interactions = await this.getInteractionsByType(
      userId,
      PersonalityInteractionType.HUMOR_PREFERENCE,
      limit
    );

    return interactions.map(interaction => ({
      preference: interaction.content,
      timestamp: interaction.createdAt,
    }));
  }

  /**
   * Get user's sarcasm feedback
   */
  async getSarcasmFeedback(userId: string, limit: number = 50): Promise<Array<{
    feedback: string;
    level: number;
    timestamp: Date;
  }>> {
    const interactions = await this.getInteractionsByType(
      userId,
      PersonalityInteractionType.SARCASM_FEEDBACK,
      limit
    );

    return interactions.map(interaction => ({
      feedback: interaction.content,
      level: interaction.metadata?.level || 0,
      timestamp: interaction.createdAt,
    }));
  }

  /**
   * Get interaction statistics for a user
   */
  async getInteractionStats(userId: string): Promise<InteractionStats> {
    const [totalInteractions, interactionsByType, recentInteractions, jokeRatings] = await Promise.all([
      this.databaseService.personalityInteraction.count({
        where: { userId },
      }),
      this.getInteractionsByTypeCount(userId),
      this.databaseService.personalityInteraction.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      this.getJokeRatings(userId, 1000),
    ]);

    // Calculate average rating from joke ratings
    const averageRating = jokeRatings.length > 0
      ? jokeRatings.reduce((sum, rating) => sum + rating.rating, 0) / jokeRatings.length
      : 0;

    return {
      totalInteractions,
      interactionsByType,
      recentInteractions,
      averageRating,
    };
  }

  /**
   * Get interaction count by type for a user
   */
  private async getInteractionsByTypeCount(userId: string): Promise<Record<string, number>> {
    const types = Object.values(PersonalityInteractionType);
    const counts: Record<string, number> = {};

    for (const type of types) {
      counts[type] = await this.databaseService.personalityInteraction.count({
        where: { userId, type },
      });
    }

    return counts;
  }

  /**
   * Clean up old interactions (data retention)
   */
  async cleanupOldInteractions(userId: string, daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.databaseService.personalityInteraction.deleteMany({
      where: {
        userId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Update an interaction
   */
  async updateInteraction(
    interactionId: string,
    userId: string,
    data: {
      content?: string;
      metadata?: any;
    }
  ): Promise<PersonalityInteractionResponse> {
    // Verify the interaction belongs to the user
    const existingInteraction = await this.databaseService.personalityInteraction.findFirst({
      where: {
        id: interactionId,
        userId,
      },
    });

    if (!existingInteraction) {
      throw new NotFoundException('Personality interaction not found or access denied');
    }

    const updatedInteraction = await this.databaseService.personalityInteraction.update({
      where: { id: interactionId },
      data,
    });

    return {
      id: updatedInteraction.id,
      userId: updatedInteraction.userId,
      sessionId: updatedInteraction.sessionId,
      type: updatedInteraction.type,
      content: updatedInteraction.content,
      metadata: updatedInteraction.metadata,
      createdAt: updatedInteraction.createdAt,
    };
  }

  /**
   * Delete an interaction
   */
  async deleteInteraction(interactionId: string, userId: string): Promise<void> {
    // Verify the interaction belongs to the user
    const existingInteraction = await this.databaseService.personalityInteraction.findFirst({
      where: {
        id: interactionId,
        userId,
      },
    });

    if (!existingInteraction) {
      throw new NotFoundException('Personality interaction not found or access denied');
    }

    await this.databaseService.personalityInteraction.delete({
      where: { id: interactionId },
    });
  }

  /**
   * Validate interaction data
   */
  private validateInteractionData(data: PersonalityInteractionData): void {
    if (!data.userId || typeof data.userId !== 'string') {
      throw new BadRequestException('Valid userId is required');
    }

    if (!data.type || !Object.values(PersonalityInteractionType).includes(data.type)) {
      throw new BadRequestException('Valid interaction type is required');
    }

    if (!data.content || typeof data.content !== 'string') {
      throw new BadRequestException('Content is required and must be a string');
    }

    if (data.content.length > 10000) {
      throw new BadRequestException('Content is too long (max 10000 characters)');
    }

    if (data.sessionId && typeof data.sessionId !== 'string') {
      throw new BadRequestException('Session ID must be a string if provided');
    }
  }
}
