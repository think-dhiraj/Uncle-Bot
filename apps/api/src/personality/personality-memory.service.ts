import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PersonalityMemoryType } from 'db';

export interface PersonalityMemoryData {
  userId: string;
  type: PersonalityMemoryType;
  content: string;
  metadata?: any;
}

export interface PersonalityMemoryResponse {
  id: string;
  userId: string;
  type: PersonalityMemoryType;
  content: string;
  metadata: any;
  createdAt: Date;
}

@Injectable()
export class PersonalityMemoryService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Create a new personality memory
   */
  async createMemory(data: PersonalityMemoryData): Promise<PersonalityMemoryResponse> {
    // Validate input
    this.validateMemoryData(data);

    const memory = await this.databaseService.personalityMemory.create({
      data: {
        userId: data.userId,
        type: data.type,
        content: data.content,
        metadata: data.metadata || null,
      },
    });

    return {
      id: memory.id,
      userId: memory.userId,
      type: memory.type,
      content: memory.content,
      metadata: memory.metadata,
      createdAt: memory.createdAt,
    };
  }

  /**
   * Get personality memories for a user
   */
  async getUserMemories(
    userId: string,
    options?: {
      type?: PersonalityMemoryType;
      limit?: number;
      offset?: number;
    }
  ): Promise<PersonalityMemoryResponse[]> {
    const memories = await this.databaseService.personalityMemory.findMany({
      where: {
        userId,
        ...(options?.type && { type: options.type }),
      },
      orderBy: { createdAt: 'desc' },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });

    return memories.map(memory => ({
      id: memory.id,
      userId: memory.userId,
      type: memory.type,
      content: memory.content,
      metadata: memory.metadata,
      createdAt: memory.createdAt,
    }));
  }

  /**
   * Get memories by type for a user
   */
  async getMemoriesByType(
    userId: string,
    type: PersonalityMemoryType,
    limit: number = 10
  ): Promise<PersonalityMemoryResponse[]> {
    return this.getUserMemories(userId, { type, limit });
  }

  /**
   * Get recent memories for a user
   */
  async getRecentMemories(
    userId: string,
    limit: number = 20
  ): Promise<PersonalityMemoryResponse[]> {
    return this.getUserMemories(userId, { limit });
  }

  /**
   * Update a personality memory
   */
  async updateMemory(
    memoryId: string,
    userId: string,
    data: {
      content?: string;
      metadata?: any;
    }
  ): Promise<PersonalityMemoryResponse> {
    // Verify the memory belongs to the user
    const existingMemory = await this.databaseService.personalityMemory.findFirst({
      where: {
        id: memoryId,
        userId,
      },
    });

    if (!existingMemory) {
      throw new NotFoundException('Personality memory not found or access denied');
    }

    const updatedMemory = await this.databaseService.personalityMemory.update({
      where: { id: memoryId },
      data,
    });

    return {
      id: updatedMemory.id,
      userId: updatedMemory.userId,
      type: updatedMemory.type,
      content: updatedMemory.content,
      metadata: updatedMemory.metadata,
      createdAt: updatedMemory.createdAt,
    };
  }

  /**
   * Delete a personality memory
   */
  async deleteMemory(memoryId: string, userId: string): Promise<void> {
    // Verify the memory belongs to the user
    const existingMemory = await this.databaseService.personalityMemory.findFirst({
      where: {
        id: memoryId,
        userId,
      },
    });

    if (!existingMemory) {
      throw new NotFoundException('Personality memory not found or access denied');
    }

    await this.databaseService.personalityMemory.delete({
      where: { id: memoryId },
    });
  }

  /**
   * Get user's joke history
   */
  async getJokeHistory(userId: string, limit: number = 50): Promise<string[]> {
    const memories = await this.getMemoriesByType(userId, PersonalityMemoryType.JOKE_USED, limit);
    return memories.map(memory => memory.content);
  }

  /**
   * Track a joke usage
   */
  async trackJokeUsage(userId: string, joke: string, context?: string): Promise<void> {
    await this.createMemory({
      userId,
      type: PersonalityMemoryType.JOKE_USED,
      content: joke,
      metadata: {
        context,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Track user reaction to personality
   */
  async trackUserReaction(
    userId: string,
    reaction: string,
    context?: string
  ): Promise<void> {
    await this.createMemory({
      userId,
      type: PersonalityMemoryType.USER_REACTION,
      content: reaction,
      metadata: {
        context,
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
    reason?: string
  ): Promise<void> {
    await this.createMemory({
      userId,
      type: PersonalityMemoryType.PERSONALITY_ADJUSTMENT,
      content: adjustment,
      metadata: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Get user's humor preferences
   */
  async getHumorPreferences(userId: string): Promise<any> {
    const memories = await this.getMemoriesByType(userId, PersonalityMemoryType.HUMOR_PREFERENCE);
    return memories.map(memory => memory.metadata);
  }

  /**
   * Track humor preference
   */
  async trackHumorPreference(
    userId: string,
    preference: any
  ): Promise<void> {
    await this.createMemory({
      userId,
      type: PersonalityMemoryType.HUMOR_PREFERENCE,
      content: JSON.stringify(preference),
      metadata: {
        preference,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Clean up old memories (data retention)
   */
  async cleanupOldMemories(userId: string, daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.databaseService.personalityMemory.deleteMany({
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
   * Get memory statistics for a user
   */
  async getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    memoriesByType: Record<PersonalityMemoryType, number>;
    recentActivity: number;
  }> {
    const [totalMemories, memoriesByType, recentActivity] = await Promise.all([
      this.databaseService.personalityMemory.count({
        where: { userId },
      }),
      this.getMemoriesByTypeCount(userId),
      this.databaseService.personalityMemory.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    return {
      totalMemories,
      memoriesByType,
      recentActivity,
    };
  }

  /**
   * Get memory count by type for a user
   */
  private async getMemoriesByTypeCount(userId: string): Promise<Record<string, number>> {
    const types = Object.values(PersonalityMemoryType);
    const counts: Record<string, number> = {};

    for (const type of types) {
      counts[type] = await this.databaseService.personalityMemory.count({
        where: { userId, type },
      });
    }

    return counts;
  }

  /**
   * Validate memory data
   */
  private validateMemoryData(data: PersonalityMemoryData): void {
    if (!data.userId || typeof data.userId !== 'string') {
      throw new BadRequestException('Valid userId is required');
    }

    if (!data.type || !Object.values(PersonalityMemoryType).includes(data.type)) {
      throw new BadRequestException('Valid memory type is required');
    }

    if (!data.content || typeof data.content !== 'string') {
      throw new BadRequestException('Content is required and must be a string');
    }

    if (data.content.length > 10000) {
      throw new BadRequestException('Content is too long (max 10000 characters)');
    }
  }
}
