import { Injectable, OnModuleInit } from '@nestjs/common';
import { prisma } from 'db';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private client: PrismaClient = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async enableShutdownHooks(app: any) {
    // Note: $on is not available in all Prisma versions
    // this.client.$on('beforeExit', async () => {
    //   await app.close();
    // });
  }

  // Expose Prisma client methods
  get user() { return this.client.user; }
  get userPreferences() { return this.client.userPreferences; }
  get chatSession() { return this.client.chatSession; }
  get conversationMessage() { return this.client.conversationMessage; }
  get oAuthToken() { return this.client.oAuthToken; }
  get thread() { return this.client.thread; }
  get message() { return this.client.message; }
  get auditLog() { return this.client.auditLog; }
  get automation() { return this.client.automation; }
  get task() { return this.client.task; }
  get notification() { return this.client.notification; }
  get embedding() { return this.client.embedding; }
  get calendarWatchChannel() { return this.client.calendarWatchChannel; }
  get event() { return this.client.event; }
  get personalityMemory() { return this.client.personalityMemory; }
  get personalityVector() { return this.client.personalityVector; }
  get personalityInteraction() { return this.client.personalityInteraction; }
  
  // Enhanced memory system
  get memorySummary() { return this.client.memorySummary; }
  get memoryAccess() { return this.client.memoryAccess; }

  // UserPreferences CRUD methods
  async createUserPreferences(data: {
    userId: string;
    theme?: string;
    language?: string;
    timezone?: string;
  }) {
    return this.client.userPreferences.create({
      data: {
        userId: data.userId,
        theme: data.theme || 'system',
        language: data.language || 'en',
        timezone: data.timezone || 'UTC',
      },
    });
  }

  async getUserPreferences(userId: string) {
    return this.client.userPreferences.findUnique({
      where: { userId },
    });
  }

  async updateUserPreferences(userId: string, data: {
    theme?: string;
    language?: string;
    timezone?: string;
  }) {
    return this.client.userPreferences.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        theme: data.theme || 'system',
        language: data.language || 'en',
        timezone: data.timezone || 'UTC',
      },
    });
  }

  async deleteUserPreferences(userId: string) {
    return this.client.userPreferences.delete({
      where: { userId },
    });
  }

  async getUserPreferencesWithUser(userId: string) {
    return this.client.userPreferences.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });
  }

  // ChatSession CRUD methods
  async createChatSession(data: {
    userId: string;
    title?: string;
    isActive?: boolean;
  }) {
    return this.client.chatSession.create({
      data: {
        userId: data.userId,
        title: data.title || null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getChatSession(sessionId: string) {
    return this.client.chatSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getUserChatSessions(userId: string, options?: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    return this.client.chatSession.findMany({
      where: {
        userId,
        ...(options?.isActive !== undefined && { isActive: options.isActive }),
      },
      orderBy: { createdAt: 'desc' },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });
  }

  async updateChatSession(sessionId: string, data: {
    title?: string;
    isActive?: boolean;
  }) {
    return this.client.chatSession.update({
      where: { id: sessionId },
      data,
    });
  }

  async deleteChatSession(sessionId: string) {
    return this.client.chatSession.delete({
      where: { id: sessionId },
    });
  }

  async getChatSessionWithMessages(sessionId: string) {
    return this.client.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async getUserActiveChatSession(userId: string) {
    return this.client.chatSession.findFirst({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateAllUserChatSessions(userId: string) {
    return this.client.chatSession.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  // ConversationMessage CRUD methods
  async createConversationMessage(data: {
    sessionId: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'FUNCTION_CALL' | 'FUNCTION_RESULT';
    content: string;
    metadata?: any;
  }) {
    return this.client.conversationMessage.create({
      data: {
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        metadata: data.metadata || null,
      },
    });
  }

  async getConversationMessage(messageId: string) {
    return this.client.conversationMessage.findUnique({
      where: { id: messageId },
    });
  }

  async getSessionMessages(sessionId: string, options?: {
    limit?: number;
    offset?: number;
    role?: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'FUNCTION_CALL' | 'FUNCTION_RESULT';
  }) {
    return this.client.conversationMessage.findMany({
      where: {
        sessionId,
        ...(options?.role && { role: options.role }),
      },
      orderBy: { createdAt: 'asc' },
      ...(options?.limit && { take: options.limit }),
      ...(options?.offset && { skip: options.offset }),
    });
  }

  async updateConversationMessage(messageId: string, data: {
    content?: string;
    metadata?: any;
  }) {
    return this.client.conversationMessage.update({
      where: { id: messageId },
      data,
    });
  }

  async deleteConversationMessage(messageId: string) {
    return this.client.conversationMessage.delete({
      where: { id: messageId },
    });
  }

  async deleteSessionMessages(sessionId: string) {
    return this.client.conversationMessage.deleteMany({
      where: { sessionId },
    });
  }

  async getSessionMessagesWithSession(sessionId: string) {
    return this.client.conversationMessage.findMany({
      where: { sessionId },
      include: {
        session: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRecentSessionMessages(sessionId: string, limit: number = 10) {
    return this.client.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getSessionMessageCount(sessionId: string) {
    return this.client.conversationMessage.count({
      where: { sessionId },
    });
  }

  async getUserMessagesByRole(userId: string, role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'FUNCTION_CALL' | 'FUNCTION_RESULT') {
    return this.client.conversationMessage.findMany({
      where: {
        session: {
          userId,
        },
        role,
      },
      include: {
        session: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
