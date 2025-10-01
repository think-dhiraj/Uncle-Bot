import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface MemoryInsights {
  totalMessages: number;
  totalSessions: number;
  averageSessionLength: number;
  compressionRatio: number;
  memoryEfficiency: number;
  topicDistribution: Record<string, number>;
  importanceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  accessPatterns: {
    recentContext: number;
    semanticSearch: number;
    crossSession: number;
  };
  userPreferences: {
    preferredTopics: string[];
    conversationStyle: string;
    memoryUsage: 'light' | 'moderate' | 'heavy';
  };
}

export interface MemoryOptimization {
  recommendedCompression: boolean;
  suggestedTokenBudget: number;
  optimizationSuggestions: string[];
  performanceScore: number;
}

@Injectable()
export class MemoryAnalyticsService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Get comprehensive memory insights for a user
   */
  async getMemoryInsights(userId: string): Promise<MemoryInsights> {
    const [
      totalMessages,
      totalSessions,
      averageSessionLength,
      compressionStats,
      topicStats,
      importanceStats,
      accessPatterns,
      userPreferences
    ] = await Promise.all([
      this.getTotalMessages(userId),
      this.getTotalSessions(userId),
      this.getAverageSessionLength(userId),
      this.getCompressionStats(userId),
      this.getTopicDistribution(userId),
      this.getImportanceDistribution(userId),
      this.getAccessPatterns(userId),
      this.getUserPreferences(userId)
    ]);

    const compressionRatio = compressionStats.compressedMessages / Math.max(totalMessages, 1);
    const memoryEfficiency = this.calculateMemoryEfficiency(compressionStats);

    return {
      totalMessages,
      totalSessions,
      averageSessionLength,
      compressionRatio,
      memoryEfficiency,
      topicDistribution: topicStats,
      importanceDistribution: importanceStats,
      accessPatterns,
      userPreferences
    };
  }

  /**
   * Get memory optimization recommendations
   */
  async getMemoryOptimization(userId: string): Promise<MemoryOptimization> {
    const insights = await this.getMemoryInsights(userId);
    
    const recommendations: string[] = [];
    let recommendedCompression = false;
    let suggestedTokenBudget = 4000;
    let performanceScore = 0;

    // Analyze compression needs
    if (insights.compressionRatio < 0.3 && insights.totalMessages > 100) {
      recommendations.push('Consider enabling memory compression for better performance');
      recommendedCompression = true;
    }

    // Analyze token budget
    if (insights.memoryEfficiency < 0.7) {
      recommendations.push('Optimize token usage by adjusting context window size');
      suggestedTokenBudget = Math.max(2000, suggestedTokenBudget * 0.8);
    }

    // Analyze topic distribution
    const topTopics = Object.entries(insights.topicDistribution)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    if (topTopics.length > 0) {
      recommendations.push(`Focus on top topics: ${topTopics.map(([topic]) => topic).join(', ')}`);
    }

    // Calculate performance score
    performanceScore = this.calculatePerformanceScore(insights);

    return {
      recommendedCompression,
      suggestedTokenBudget,
      optimizationSuggestions: recommendations,
      performanceScore
    };
  }

  /**
   * Get total messages for user
   */
  private async getTotalMessages(userId: string): Promise<number> {
    return this.databaseService.conversationMessage.count({
      where: { session: { userId } }
    });
  }

  /**
   * Get total sessions for user
   */
  private async getTotalSessions(userId: string): Promise<number> {
    return this.databaseService.chatSession.count({
      where: { userId }
    });
  }

  /**
   * Get average session length
   */
  private async getAverageSessionLength(userId: string): Promise<number> {
    const sessions = await this.databaseService.chatSession.findMany({
      where: { userId },
      include: { _count: { select: { messages: true } } }
    });

    if (sessions.length === 0) return 0;

    const totalMessages = sessions.reduce((sum, session) => 
      sum + session._count.messages, 0
    );

    return totalMessages / sessions.length;
  }

  /**
   * Get compression statistics
   */
  private async getCompressionStats(userId: string): Promise<{
    totalMessages: number;
    compressedMessages: number;
    summaries: number;
  }> {
    const totalMessages = await this.databaseService.conversationMessage.count({
      where: { session: { userId } }
    });

    const compressedMessages = await this.databaseService.conversationMessage.count({
      where: { 
        session: { userId },
        isSummarized: true
      }
    });

    const summaries = await this.databaseService.memorySummary.count({
      where: { userId }
    });

    return {
      totalMessages,
      compressedMessages,
      summaries
    };
  }

  /**
   * Get topic distribution
   */
  private async getTopicDistribution(userId: string): Promise<Record<string, number>> {
    const messages = await this.databaseService.conversationMessage.findMany({
      where: { session: { userId } },
      select: { topics: true }
    });

    const topicMap = new Map<string, number>();
    
    messages.forEach(msg => {
      if (msg.topics) {
        msg.topics.forEach(topic => {
          topicMap.set(topic, (topicMap.get(topic) || 0) + 1);
        });
      }
    });

    return Object.fromEntries(topicMap);
  }

  /**
   * Get importance distribution
   */
  private async getImportanceDistribution(userId: string): Promise<{
    high: number;
    medium: number;
    low: number;
  }> {
    const messages = await this.databaseService.conversationMessage.findMany({
      where: { session: { userId } },
      select: { importance: true }
    });

    let high = 0, medium = 0, low = 0;

    messages.forEach(msg => {
      const importance = msg.importance || 0.5;
      if (importance >= 0.7) high++;
      else if (importance >= 0.4) medium++;
      else low++;
    });

    return { high, medium, low };
  }

  /**
   * Get access patterns
   */
  private async getAccessPatterns(userId: string): Promise<{
    recentContext: number;
    semanticSearch: number;
    crossSession: number;
  }> {
    const accesses = await this.databaseService.memoryAccess.findMany({
      where: { userId },
      select: { accessType: true }
    });

    const patterns = {
      recentContext: 0,
      semanticSearch: 0,
      crossSession: 0
    };

    accesses.forEach(access => {
      switch (access.accessType) {
        case 'CONTEXT_RETRIEVAL':
          patterns.recentContext++;
          break;
        case 'SEMANTIC_SEARCH':
          patterns.semanticSearch++;
          break;
        case 'CROSS_SESSION_LEARNING':
          patterns.crossSession++;
          break;
      }
    });

    return patterns;
  }

  /**
   * Get user preferences from memory usage
   */
  private async getUserPreferences(userId: string): Promise<{
    preferredTopics: string[];
    conversationStyle: string;
    memoryUsage: 'light' | 'moderate' | 'heavy';
  }> {
    const topicStats = await this.getTopicDistribution(userId);
    const totalMessages = await this.getTotalMessages(userId);

    const preferredTopics = Object.entries(topicStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);

    // Determine conversation style based on message patterns
    const avgSessionLength = await this.getAverageSessionLength(userId);
    let conversationStyle = 'brief';
    if (avgSessionLength > 20) conversationStyle = 'detailed';
    else if (avgSessionLength > 10) conversationStyle = 'moderate';

    // Determine memory usage level
    let memoryUsage: 'light' | 'moderate' | 'heavy' = 'light';
    if (totalMessages > 500) memoryUsage = 'heavy';
    else if (totalMessages > 100) memoryUsage = 'moderate';

    return {
      preferredTopics,
      conversationStyle,
      memoryUsage
    };
  }

  /**
   * Calculate memory efficiency score
   */
  private calculateMemoryEfficiency(compressionStats: any): number {
    if (compressionStats.totalMessages === 0) return 1;
    
    const compressionRatio = compressionStats.compressedMessages / compressionStats.totalMessages;
    const summaryRatio = compressionStats.summaries / Math.max(compressionStats.totalMessages / 20, 1);
    
    return Math.min(1, compressionRatio + summaryRatio * 0.5);
  }

  /**
   * Calculate overall performance score
   */
  private calculatePerformanceScore(insights: MemoryInsights): number {
    let score = 0;

    // Compression efficiency (40% weight)
    score += insights.compressionRatio * 0.4;

    // Memory efficiency (30% weight)
    score += insights.memoryEfficiency * 0.3;

    // Topic diversity (20% weight)
    const topicCount = Object.keys(insights.topicDistribution).length;
    const topicDiversity = Math.min(1, topicCount / 10);
    score += topicDiversity * 0.2;

    // Importance distribution (10% weight)
    const totalImportance = insights.importanceDistribution.high + 
                           insights.importanceDistribution.medium + 
                           insights.importanceDistribution.low;
    const highImportanceRatio = totalImportance > 0 
      ? insights.importanceDistribution.high / totalImportance 
      : 0;
    score += highImportanceRatio * 0.1;

    return Math.min(1, score);
  }

  /**
   * Get memory usage trends over time
   */
  async getMemoryTrends(userId: string, days: number = 30): Promise<{
    dailyMessages: Array<{ date: string; count: number }>;
    dailyTokens: Array<{ date: string; tokens: number }>;
    compressionTrend: Array<{ date: string; ratio: number }>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get daily message counts
    const dailyMessages = await this.databaseService.conversationMessage.groupBy({
      by: ['createdAt'],
      where: {
        session: { userId },
        createdAt: { gte: startDate }
      },
      _count: { id: true },
      orderBy: { createdAt: 'asc' }
    });

    // Get daily token usage (estimated)
    const dailyTokens = await this.databaseService.conversationMessage.groupBy({
      by: ['createdAt'],
      where: {
        session: { userId },
        createdAt: { gte: startDate }
      },
      _sum: { tokenCount: true },
      orderBy: { createdAt: 'asc' }
    });

    // Get compression trend
    const compressionTrend = await this.databaseService.memorySummary.groupBy({
      by: ['createdAt'],
      where: {
        userId,
        createdAt: { gte: startDate }
      },
      _count: { id: true },
      orderBy: { createdAt: 'asc' }
    });

    return {
      dailyMessages: dailyMessages.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        count: item._count.id
      })),
      dailyTokens: dailyTokens.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        tokens: item._sum.tokenCount || 0
      })),
      compressionTrend: compressionTrend.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        ratio: item._count.id / Math.max(dailyMessages.find(d => d.createdAt.getTime() === item.createdAt.getTime())?._count.id || 1, 1)
      }))
    };
  }

  /**
   * Optimize memory settings based on usage patterns
   */
  async optimizeMemorySettings(userId: string): Promise<{
    recommendedTokenBudget: number;
    recommendedCompressionThreshold: number;
    recommendedContextWindow: number;
    optimizationScore: number;
  }> {
    const insights = await this.getMemoryInsights(userId);
    const trends = await this.getMemoryTrends(userId, 7);

    // Calculate optimal token budget based on usage patterns
    const avgDailyTokens = trends.dailyTokens.reduce((sum, day) => sum + day.tokens, 0) / trends.dailyTokens.length;
    const recommendedTokenBudget = Math.max(2000, Math.min(8000, avgDailyTokens * 1.2));

    // Calculate optimal compression threshold
    const avgSessionLength = insights.averageSessionLength;
    const recommendedCompressionThreshold = Math.max(10, Math.min(50, avgSessionLength * 0.5));

    // Calculate optimal context window
    const recommendedContextWindow = Math.max(5, Math.min(20, avgSessionLength * 0.3));

    // Calculate optimization score
    const optimizationScore = this.calculateOptimizationScore(insights, trends);

    return {
      recommendedTokenBudget,
      recommendedCompressionThreshold,
      recommendedContextWindow,
      optimizationScore
    };
  }

  /**
   * Calculate optimization score
   */
  private calculateOptimizationScore(insights: MemoryInsights, trends: any): number {
    let score = 0;

    // Memory efficiency (40%)
    score += insights.memoryEfficiency * 0.4;

    // Compression ratio (30%)
    score += insights.compressionRatio * 0.3;

    // Usage consistency (20%)
    const tokenVariance = this.calculateVariance(trends.dailyTokens.map((d: any) => d.tokens));
    const consistencyScore = Math.max(0, 1 - tokenVariance / 1000);
    score += consistencyScore * 0.2;

    // Topic diversity (10%)
    const topicCount = Object.keys(insights.topicDistribution).length;
    const diversityScore = Math.min(1, topicCount / 20);
    score += diversityScore * 0.1;

    return Math.min(1, score);
  }

  /**
   * Calculate variance of a dataset
   */
  private calculateVariance(data: number[]): number {
    if (data.length === 0) return 0;
    
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    
    return variance;
  }
}
