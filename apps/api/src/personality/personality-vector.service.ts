import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface PersonalityVectorData {
  userId: string;
  content: string;
  metadata: any;
}

export interface PersonalityVectorResponse {
  id: string;
  userId: string;
  content: string;
  metadata: any;
  createdAt: Date;
}

export interface SimilaritySearchResult {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
  createdAt: Date;
}

@Injectable()
export class PersonalityVectorService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Create a new personality vector
   */
  async createVector(data: PersonalityVectorData): Promise<PersonalityVectorResponse> {
    // Validate input
    this.validateVectorData(data);

    const vector = await this.databaseService.personalityVector.create({
      data: {
        userId: data.userId,
        content: data.content,
        metadata: data.metadata,
      },
    });

    return {
      id: vector.id,
      userId: vector.userId,
      content: vector.content,
      metadata: vector.metadata,
      createdAt: vector.createdAt,
    };
  }

  /**
   * Get personality vectors for a user
   */
  async getUserVectors(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<PersonalityVectorResponse[]> {
    const vectors = await this.databaseService.personalityVector.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });

    return vectors.map(vector => ({
      id: vector.id,
      userId: vector.userId,
      content: vector.content,
      metadata: vector.metadata,
      createdAt: vector.createdAt,
    }));
  }

  /**
   * Get recent vectors for a user
   */
  async getRecentVectors(
    userId: string,
    limit: number = 20
  ): Promise<PersonalityVectorResponse[]> {
    return this.getUserVectors(userId, { limit });
  }

  /**
   * Update a personality vector
   */
  async updateVector(
    vectorId: string,
    userId: string,
    data: {
      content?: string;
      metadata?: any;
    }
  ): Promise<PersonalityVectorResponse> {
    // Verify the vector belongs to the user
    const existingVector = await this.databaseService.personalityVector.findFirst({
      where: {
        id: vectorId,
        userId,
      },
    });

    if (!existingVector) {
      throw new NotFoundException('Personality vector not found or access denied');
    }

    const updatedVector = await this.databaseService.personalityVector.update({
      where: { id: vectorId },
      data,
    });

    return {
      id: updatedVector.id,
      userId: updatedVector.userId,
      content: updatedVector.content,
      metadata: updatedVector.metadata,
      createdAt: updatedVector.createdAt,
    };
  }

  /**
   * Delete a personality vector
   */
  async deleteVector(vectorId: string, userId: string): Promise<void> {
    // Verify the vector belongs to the user
    const existingVector = await this.databaseService.personalityVector.findFirst({
      where: {
        id: vectorId,
        userId,
      },
    });

    if (!existingVector) {
      throw new NotFoundException('Personality vector not found or access denied');
    }

    await this.databaseService.personalityVector.delete({
      where: { id: vectorId },
    });
  }

  /**
   * Store personality context as a vector
   */
  async storePersonalityContext(
    userId: string,
    context: string,
    metadata: any = {}
  ): Promise<PersonalityVectorResponse> {
    return this.createVector({
      userId,
      content: context,
      metadata: {
        ...metadata,
        type: 'personality_context',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Store conversation context as a vector
   */
  async storeConversationContext(
    userId: string,
    conversation: string,
    sessionId?: string
  ): Promise<PersonalityVectorResponse> {
    return this.createVector({
      userId,
      content: conversation,
      metadata: {
        type: 'conversation_context',
        sessionId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Store user preference context as a vector
   */
  async storePreferenceContext(
    userId: string,
    preferences: any
  ): Promise<PersonalityVectorResponse> {
    return this.createVector({
      userId,
      content: JSON.stringify(preferences),
      metadata: {
        type: 'user_preferences',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Find similar personality contexts
   * Note: This will be enhanced when pgvector is enabled
   */
  async findSimilarContexts(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<SimilaritySearchResult[]> {
    // For now, we'll do a simple text search
    // This will be replaced with vector similarity search when pgvector is enabled
    const vectors = await this.databaseService.personalityVector.findMany({
      where: {
        userId,
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return vectors.map(vector => ({
      id: vector.id,
      content: vector.content,
      metadata: vector.metadata,
      similarity: this.calculateSimpleSimilarity(query, vector.content),
      createdAt: vector.createdAt,
    }));
  }

  /**
   * Get personality context for a user
   */
  async getPersonalityContext(userId: string, limit: number = 10): Promise<PersonalityVectorResponse[]> {
    return this.getUserVectors(userId, { limit });
  }

  /**
   * Clean up old vectors (data retention)
   */
  async cleanupOldVectors(userId: string, daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.databaseService.personalityVector.deleteMany({
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
   * Get vector statistics for a user
   */
  async getVectorStats(userId: string): Promise<{
    totalVectors: number;
    recentVectors: number;
    contextTypes: Record<string, number>;
  }> {
    const [totalVectors, recentVectors, allVectors] = await Promise.all([
      this.databaseService.personalityVector.count({
        where: { userId },
      }),
      this.databaseService.personalityVector.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      this.getUserVectors(userId, { limit: 1000 }),
    ]);

    // Count context types
    const contextTypes: Record<string, number> = {};
    allVectors.forEach(vector => {
      const type = vector.metadata?.type || 'unknown';
      contextTypes[type] = (contextTypes[type] || 0) + 1;
    });

    return {
      totalVectors,
      recentVectors,
      contextTypes,
    };
  }

  /**
   * Calculate simple similarity between two strings
   * This is a placeholder for when pgvector is enabled
   */
  private calculateSimpleSimilarity(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    const commonWords = queryWords.filter(word => contentWords.includes(word));
    return commonWords.length / Math.max(queryWords.length, contentWords.length);
  }

  /**
   * Validate vector data
   */
  private validateVectorData(data: PersonalityVectorData): void {
    if (!data.userId || typeof data.userId !== 'string') {
      throw new BadRequestException('Valid userId is required');
    }

    if (!data.content || typeof data.content !== 'string') {
      throw new BadRequestException('Content is required and must be a string');
    }

    if (data.content.length > 10000) {
      throw new BadRequestException('Content is too long (max 10000 characters)');
    }

    if (!data.metadata || typeof data.metadata !== 'object') {
      throw new BadRequestException('Metadata is required and must be an object');
    }
  }
}
