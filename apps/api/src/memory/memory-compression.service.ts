import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PersonalityService } from '../personality/personality.service';

export interface CompressionResult {
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  summary: string;
  keyPoints: string[];
  topics: string[];
  importance: number;
}

export interface MemorySummary {
  id: string;
  userId: string;
  sessionId?: string;
  type: 'CONVERSATION_SUMMARY' | 'TOPIC_SUMMARY' | 'USER_PREFERENCE' | 'DECISION_POINT' | 'LEARNED_FACT' | 'CONTEXT_BRIDGE';
  content: string;
  keyPoints: any;
  importance: number;
  topics: string[];
}

@Injectable()
export class MemoryCompressionService {
  private readonly COMPRESSION_THRESHOLD_DAYS = 7;
  private readonly COMPRESSION_THRESHOLD_MESSAGES = 20;
  private readonly MIN_IMPORTANCE_FOR_COMPRESSION = 0.3;

  constructor(
    private databaseService: DatabaseService,
    private personalityService: PersonalityService,
  ) {}

  /**
   * Compress old messages in a session
   */
  async compressSessionMessages(sessionId: string): Promise<CompressionResult | null> {
    const session = await this.databaseService.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: true }
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Find messages eligible for compression
    const oldMessages = this.getEligibleMessagesForCompression(session.messages);
    
    if (oldMessages.length < this.COMPRESSION_THRESHOLD_MESSAGES) {
      return null; // Not enough messages to compress
    }

    // Generate compression
    const compression = await this.generateCompression(oldMessages);
    
    // Store memory summary
    const summary = await this.databaseService.memorySummary.create({
      data: {
        userId: session.userId,
        sessionId: session.id,
        type: 'CONVERSATION_SUMMARY',
        content: compression.summary,
        keyPoints: compression.keyPoints,
        importance: compression.importance,
        topics: compression.topics,
      }
    });

    // Mark messages as summarized
    await this.databaseService.conversationMessage.updateMany({
      where: { 
        id: { in: oldMessages.map(m => m.id) }
      },
      data: { 
        isSummarized: true,
        summary: compression.summary
      }
    });

    // Track memory access
    await this.databaseService.memoryAccess.create({
      data: {
        userId: session.userId,
        accessType: 'MEMORY_COMPRESSION',
        relevance: compression.importance,
      }
    });

    return compression;
  }

  /**
   * Get messages eligible for compression
   */
  private getEligibleMessagesForCompression(messages: any[]): any[] {
    const cutoffDate = new Date(Date.now() - this.COMPRESSION_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    
    return messages
      .filter(msg => {
        const isOld = new Date(msg.createdAt) < cutoffDate;
        const hasImportance = (msg.importance || 0) >= this.MIN_IMPORTANCE_FOR_COMPRESSION;
        const notSummarized = !msg.isSummarized;
        
        return isOld && hasImportance && notSummarized;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Generate compression for a set of messages
   */
  private async generateCompression(messages: any[]): Promise<CompressionResult> {
    const originalTokenCount = messages.reduce((sum, msg) => 
      sum + (msg.tokenCount || this.estimateTokenCount(msg.content)), 0
    );

    // Extract key information
    const topics = this.extractTopics(messages);
    const keyPoints = this.extractKeyPoints(messages);
    const summary = this.generateSummary(messages, topics, keyPoints);
    
    const compressedTokenCount = this.estimateTokenCount(summary);
    const compressionRatio = 1 - (compressedTokenCount / originalTokenCount);
    const importance = this.calculateOverallImportance(messages);

    return {
      originalTokenCount,
      compressedTokenCount,
      compressionRatio,
      summary,
      keyPoints,
      topics,
      importance,
    };
  }

  /**
   * Extract topics from messages
   */
  private extractTopics(messages: any[]): string[] {
    const topicMap = new Map<string, number>();
    
    messages.forEach(msg => {
      const words = msg.content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word: string) => word.length > 4);
      
      words.forEach((word: string) => {
        topicMap.set(word, (topicMap.get(word) || 0) + 1);
      });
    });

    return Array.from(topicMap.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  /**
   * Extract key points from messages
   */
  private extractKeyPoints(messages: any[]): string[] {
    const keyPoints: string[] = [];
    
    // Look for questions and answers
    messages.forEach(msg => {
      if (msg.role === 'USER' && msg.content.includes('?')) {
        keyPoints.push(`Question: ${msg.content.substring(0, 100)}...`);
      }
      
      if (msg.role === 'ASSISTANT' && msg.content.length > 100) {
        // Extract first sentence as key point
        const firstSentence = msg.content.split('.')[0];
        if (firstSentence.length > 20) {
          keyPoints.push(`Answer: ${firstSentence}`);
        }
      }
    });

    return keyPoints.slice(0, 5); // Limit to top 5 key points
  }

  /**
   * Generate summary from messages
   */
  private generateSummary(messages: any[], topics: string[], keyPoints: string[]): string {
    const userMessages = messages.filter(m => m.role === 'USER');
    const assistantMessages = messages.filter(m => m.role === 'ASSISTANT');
    
    const summary = `
Conversation Summary:
- Duration: ${this.getConversationDuration(messages)}
- Topics discussed: ${topics.slice(0, 5).join(', ')}
- User questions: ${userMessages.length}
- Assistant responses: ${assistantMessages.length}

Key Points:
${keyPoints.map(point => `- ${point}`).join('\n')}

Main topics: ${topics.slice(0, 3).join(', ')}
    `.trim();

    return summary;
  }

  /**
   * Calculate overall importance of messages
   */
  private calculateOverallImportance(messages: any[]): number {
    if (messages.length === 0) return 0;
    
    const totalImportance = messages.reduce((sum, msg) => 
      sum + (msg.importance || 0.5), 0
    );
    
    return totalImportance / messages.length;
  }

  /**
   * Get conversation duration
   */
  private getConversationDuration(messages: any[]): string {
    if (messages.length < 2) return 'Single message';
    
    const first = new Date(messages[0].createdAt);
    const last = new Date(messages[messages.length - 1].createdAt);
    const diffMs = last.getTime() - first.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutes`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  /**
   * Estimate token count
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Compress user's old memories across all sessions
   */
  async compressUserMemories(userId: string): Promise<{
    sessionsCompressed: number;
    totalCompressionRatio: number;
    memorySavings: number;
  }> {
    const sessions = await this.databaseService.chatSession.findMany({
      where: { 
        userId,
        isActive: false // Only compress inactive sessions
      }
    });

    let sessionsCompressed = 0;
    let totalOriginalTokens = 0;
    let totalCompressedTokens = 0;

    for (const session of sessions) {
      const result = await this.compressSessionMessages(session.id);
      if (result) {
        sessionsCompressed++;
        totalOriginalTokens += result.originalTokenCount;
        totalCompressedTokens += result.compressedTokenCount;
      }
    }

    const totalCompressionRatio = totalOriginalTokens > 0 
      ? 1 - (totalCompressedTokens / totalOriginalTokens)
      : 0;

    const memorySavings = totalOriginalTokens - totalCompressedTokens;

    return {
      sessionsCompressed,
      totalCompressionRatio,
      memorySavings,
    };
  }

  /**
   * Get compression statistics for a user
   */
  async getCompressionStats(userId: string): Promise<{
    totalMessages: number;
    compressedMessages: number;
    compressionRatio: number;
    memorySummaries: number;
    averageSummaryLength: number;
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

    const memorySummaries = await this.databaseService.memorySummary.count({
      where: { userId }
    });

    const avgSummaryLength = await this.databaseService.memorySummary.aggregate({
      where: { userId },
      _avg: { importance: true }
    });

    return {
      totalMessages,
      compressedMessages,
      compressionRatio: totalMessages > 0 ? compressedMessages / totalMessages : 0,
      memorySummaries,
      averageSummaryLength: avgSummaryLength._avg.importance || 0,
    };
  }

  /**
   * Restore compressed memory to full detail
   */
  async restoreCompressedMemory(messageId: string): Promise<boolean> {
    const message = await this.databaseService.conversationMessage.findUnique({
      where: { id: messageId }
    });

    if (!message || !message.isSummarized) {
      return false;
    }

    // Find the original memory summary
    const summary = await this.databaseService.memorySummary.findFirst({
      where: {
        sessionId: message.sessionId,
        type: 'CONVERSATION_SUMMARY'
      }
    });

    if (summary) {
      // Restore the original content (this would need to be stored separately)
      // For now, we'll mark it as not summarized
      await this.databaseService.conversationMessage.update({
        where: { id: messageId },
        data: { 
          isSummarized: false,
          summary: null
        }
      });

      return true;
    }

    return false;
  }
}
