import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PersonalityService } from '../personality/personality.service';

export interface ContextResult {
  recentContext: string;
  relevantHistory: string;
  tokenUsage: number;
  compressionRatio: number;
  memoryInsights: {
    totalMessages: number;
    summarizedMessages: number;
    averageImportance: number;
    topicDistribution: Record<string, number>;
  };
}

export interface TokenBudget {
  total: number;
  systemPrompt: number;
  recentContext: number;
  relevantHistory: number;
  personality: number;
}

@Injectable()
export class SmartContextService {
  private readonly DEFAULT_TOKEN_BUDGET = 4000;
  private readonly SYSTEM_PROMPT_RESERVE = 800;
  private readonly PERSONALITY_RESERVE = 400;
  private readonly RECENT_CONTEXT_RATIO = 0.6;
  private readonly RELEVANT_HISTORY_RATIO = 0.2;

  constructor(
    private databaseService: DatabaseService,
    private personalityService: PersonalityService,
  ) {}

  /**
   * Build optimized context for a conversation
   */
  async buildContext(
    userId: string,
    sessionId: string,
    currentMessage: string,
    tokenBudget?: number
  ): Promise<ContextResult> {
    const budget = this.calculateTokenBudget(tokenBudget);
    
    // 1. Get recent messages with smart selection
    const recentContext = await this.getRecentContext(sessionId, budget.recentContext);
    
    // 2. Find relevant historical context using semantic search
    const relevantHistory = await this.findRelevantHistory(
      userId,
      currentMessage,
      budget.relevantHistory
    );
    
    // 3. Calculate actual token usage
    const tokenUsage = this.calculateTokenCount(
      recentContext + relevantHistory
    );
    
    // 4. Get memory insights
    const memoryInsights = await this.getMemoryInsights(userId, sessionId);
    
    return {
      recentContext,
      relevantHistory,
      tokenUsage,
      compressionRatio: this.calculateCompressionRatio(memoryInsights),
      memoryInsights,
    };
  }

  /**
   * Get recent conversation context within token budget
   */
  private async getRecentContext(sessionId: string, tokenBudget: number): Promise<string> {
    // Get recent messages ordered by importance and recency
    const messages = await this.databaseService.conversationMessage.findMany({
      where: { sessionId },
      orderBy: [
        { importance: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 50, // Get more than needed for selection
    });

    // Select messages within token budget
    const selectedMessages = this.selectMessagesWithinBudget(messages, tokenBudget);
    
    return this.formatMessages(selectedMessages);
  }

  /**
   * Find relevant historical context using semantic search
   */
  private async findRelevantHistory(
    userId: string,
    currentMessage: string,
    tokenBudget: number
  ): Promise<string> {
    // For now, use simple keyword matching
    // TODO: Implement proper semantic search with embeddings
    const relevantMessages = await this.databaseService.conversationMessage.findMany({
      where: {
        session: { userId },
        content: {
          contains: this.extractKeywords(currentMessage),
          mode: 'insensitive'
        },
        isSummarized: false, // Prefer full messages over summaries
      },
      orderBy: [
        { importance: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 20,
    });

    const selectedMessages = this.selectMessagesWithinBudget(relevantMessages, tokenBudget);
    return this.formatMessages(selectedMessages);
  }

  /**
   * Select messages within token budget using smart algorithms
   */
  private selectMessagesWithinBudget(
    messages: any[],
    tokenBudget: number
  ): any[] {
    const selected: any[] = [];
    let currentTokens = 0;

    // Sort by importance score (if available) and recency
    const sortedMessages = messages.sort((a, b) => {
      const importanceA = a.importance || 0.5;
      const importanceB = b.importance || 0.5;
      
      if (Math.abs(importanceA - importanceB) < 0.1) {
        // If importance is similar, prefer more recent
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      
      return importanceB - importanceA;
    });

    for (const message of sortedMessages) {
      const messageTokens = message.tokenCount || this.estimateTokenCount(message.content);
      
      if (currentTokens + messageTokens <= tokenBudget) {
        selected.push(message);
        currentTokens += messageTokens;
      } else {
        // Try to fit a shorter version if possible
        const remainingTokens = tokenBudget - currentTokens;
        if (remainingTokens > 100 && message.content.length > 50) {
          // Add truncated version
          const truncatedMessage = {
            ...message,
            content: this.truncateMessage(message.content, remainingTokens)
          };
          selected.push(truncatedMessage);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Calculate importance score for a message
   */
  async calculateMessageImportance(message: any): Promise<number> {
    let score = 0.5; // Base score

    // Role-based scoring
    if (message.role === 'USER') {
      score += 0.2; // User messages are more important
    } else if (message.role === 'ASSISTANT') {
      score += 0.1; // Assistant responses are moderately important
    }

    // Content-based scoring
    const content = message.content.toLowerCase();
    
    // Questions are important
    if (content.includes('?') || content.includes('how') || content.includes('what')) {
      score += 0.2;
    }
    
    // Long messages might contain important information
    if (message.content.length > 200) {
      score += 0.1;
    }
    
    // Short acknowledgments are less important
    if (content.length < 50 && (
      content.includes('ok') || 
      content.includes('thanks') || 
      content.includes('got it')
    )) {
      score -= 0.2;
    }

    // Sentiment-based scoring (if available)
    if (message.sentiment !== null) {
      const sentiment = Math.abs(message.sentiment);
      score += sentiment * 0.1; // Strong emotions are more important
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Update message importance scores for a session
   */
  async updateMessageImportance(sessionId: string): Promise<void> {
    // Get all messages in the session
    const messages = await this.databaseService.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });

    // Update importance and token count for each message
    for (const message of messages) {
      const importance = await this.calculateMessageImportance(message);
      const tokenCount = this.estimateTokenCount(message.content);
      
      await this.databaseService.conversationMessage.update({
        where: { id: message.id },
        data: { 
          importance,
          tokenCount
        }
      });
    }
  }

  /**
   * Calculate token budget allocation
   */
  private calculateTokenBudget(totalBudget?: number): TokenBudget {
    const budget = totalBudget || this.DEFAULT_TOKEN_BUDGET;
    
    return {
      total: budget,
      systemPrompt: this.SYSTEM_PROMPT_RESERVE,
      personality: this.PERSONALITY_RESERVE,
      recentContext: Math.floor((budget - this.SYSTEM_PROMPT_RESERVE - this.PERSONALITY_RESERVE) * this.RECENT_CONTEXT_RATIO),
      relevantHistory: Math.floor((budget - this.SYSTEM_PROMPT_RESERVE - this.PERSONALITY_RESERVE) * this.RELEVANT_HISTORY_RATIO),
    };
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate actual token count
   */
  private calculateTokenCount(text: string): number {
    return this.estimateTokenCount(text);
  }

  /**
   * Format messages for context
   */
  private formatMessages(messages: any[]): string {
    return messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Extract keywords from message for search
   */
  private extractKeywords(message: string): string {
    // Simple keyword extraction
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5); // Take top 5 keywords
    
    return words.join(' ');
  }

  /**
   * Truncate message to fit token budget
   */
  private truncateMessage(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4; // Rough conversion
    if (content.length <= maxChars) {
      return content;
    }
    
    return content.substring(0, maxChars - 3) + '...';
  }

  /**
   * Get memory insights for analytics
   */
  private async getMemoryInsights(userId: string, sessionId: string) {
    const totalMessages = await this.databaseService.conversationMessage.count({
      where: { session: { userId } }
    });
    
    const summarizedMessages = await this.databaseService.conversationMessage.count({
      where: { 
        session: { userId },
        isSummarized: true
      }
    });
    
    const avgImportance = await this.databaseService.conversationMessage.aggregate({
      where: { session: { userId } },
      _avg: { importance: true }
    });
    
    const topicStats = await this.databaseService.conversationMessage.groupBy({
      by: ['topics'],
      where: { session: { userId } },
      _count: { id: true }
    });
    
    const topicDistribution = topicStats.reduce((acc, stat) => {
      const topics = stat.topics || [];
      topics.forEach(topic => {
        acc[topic] = (acc[topic] || 0) + stat._count.id;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      totalMessages,
      summarizedMessages,
      averageImportance: avgImportance._avg.importance || 0,
      topicDistribution,
    };
  }

  /**
   * Calculate compression ratio
   */
  private calculateCompressionRatio(insights: any): number {
    if (insights.totalMessages === 0) return 0;
    return insights.summarizedMessages / insights.totalMessages;
  }

  /**
   * Get context statistics for monitoring
   */
  async getContextStats(userId: string): Promise<{
    averageTokenUsage: number;
    compressionRatio: number;
    memoryEfficiency: number;
    contextQuality: number;
  }> {
    // This would be implemented with actual usage tracking
    return {
      averageTokenUsage: 0,
      compressionRatio: 0,
      memoryEfficiency: 0,
      contextQuality: 0,
    };
  }
}
