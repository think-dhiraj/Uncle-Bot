import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from '../../auth/auth.service';
import { GeminiFunctionHandlerService } from '../../gemini/gemini-function-handler.service';
// Temporarily commented out due to build issues
// import { GmailClient } from '@ai-assistant/google';
// import { 
//   GeminiClient, 
//   FUNCTION_DECLARATIONS,
//   SCHEMA_CONFIGS,
//   PriorityClassifierResult,
//   DraftReplyPlanResult 
// } from '@ai-assistant/gemini';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class EmailService {
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private geminiHandler: GeminiFunctionHandlerService,
  ) {}

  async listEmails(userId: string, filters: any) {
    try {
      const whereClause: any = { userId };
      
      if (filters.unread !== undefined) {
        whereClause.unread = filters.unread;
      }
      
      if (filters.priority) {
        whereClause.priority = filters.priority;
      }

      if (filters.dateFrom || filters.dateTo) {
        whereClause.lastMessage = {};
        if (filters.dateFrom) {
          whereClause.lastMessage.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          whereClause.lastMessage.lte = new Date(filters.dateTo);
        }
      }

      const threads = await this.databaseService.thread.findMany({
        where: whereClause,
        include: {
          messages: {
            take: 1,
            orderBy: { date: 'desc' },
          },
        },
        orderBy: { lastMessage: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      });

      const total = await this.databaseService.thread.count({ where: whereClause });

      return {
        threads,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit),
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch emails',
      });
    }
  }

  async getThread(userId: string, threadId: string) {
    try {
      const thread = await this.databaseService.thread.findFirst({
        where: { id: threadId, userId },
        include: {
          messages: {
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Thread not found',
        });
      }

      return thread;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch thread',
      });
    }
  }

  async markAsRead(userId: string, threadId: string) {
    try {
      const thread = await this.databaseService.thread.findFirst({
        where: { id: threadId, userId },
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Thread not found',
        });
      }

      await this.databaseService.thread.update({
        where: { id: threadId },
        data: { unread: false },
      });

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to mark as read',
      });
    }
  }

  async summarizeEmails(userId: string, threadIds: string[], generateReplies: boolean) {
    try {
      // Get the threads from database
      const threads = await this.databaseService.thread.findMany({
        where: {
          id: { in: threadIds },
          userId,
        },
        include: {
          messages: {
            orderBy: { date: 'desc' },
            take: 3, // Latest 3 messages per thread
          },
        },
      });

      if (threads.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No threads found',
        });
      }

      // Initialize Gemini client
      const geminiClient = new GeminiClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT!,
        location: process.env.GEMINI_LOCATION || 'us-central1',
        modelName: (process.env.GEMINI_MODEL as any) || 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        defaultTemperature: 0.3,
        defaultMaxTokens: 4096,
      });

      // Prepare email data for summarization
      const emailData = threads.map(thread => ({
        subject: thread.subject,
        snippet: thread.snippet,
        priority: thread.priority,
        messages: thread.messages.map(msg => ({
          from: msg.from,
          date: msg.date,
          body: msg.body.substring(0, 1000), // Truncate for context
        })),
      }));

      const prompt = `Please summarize these ${threads.length} email threads:

${emailData.map((email, i) => `
Thread ${i + 1}:
Subject: ${email.subject}
Priority: ${email.priority}
Recent messages: ${email.messages.length}
${email.messages.map(msg => `- From: ${msg.from} (${msg.date}): ${msg.body.substring(0, 200)}...`).join('\n')}
`).join('\n')}

Provide:
1. A concise summary of each thread
2. Overall priority assessment
3. Key action items
${generateReplies ? '4. Suggested draft replies for each thread that needs a response' : ''}`;

      const response = await geminiClient.callGemini({
        messages: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        temperature: 0.3,
      });

      // If generateReplies is true, also create structured draft plans
      let draftPlans: DraftReplyPlanResult[] = [];
      if (generateReplies && threads.length > 0) {
        for (const thread of threads.slice(0, 3)) { // Limit to 3 drafts
          const draftPrompt = `Create a draft reply plan for this email thread:

Subject: ${thread.subject}
Latest message from: ${thread.messages[0]?.from}
Content: ${thread.messages[0]?.body?.substring(0, 500)}

Generate a professional, helpful reply that addresses the main points.`;

          const draftResponse = await geminiClient.callGemini({
            messages: [
              {
                role: 'user',
                parts: [{ text: draftPrompt }],
              },
            ],
            ...SCHEMA_CONFIGS.DRAFT_REPLY_PLAN,
            temperature: 0.4,
          });

          if (draftResponse.text) {
            try {
              const draftPlan: DraftReplyPlanResult = JSON.parse(draftResponse.text);
              draftPlan.threadId = thread.id;
              draftPlans.push(draftPlan);
            } catch (e) {
              console.error('Failed to parse draft plan:', e);
            }
          }
        }
      }

      // Log the summarization
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'email.summarize',
          metadata: {
            threadIds,
            generateReplies,
            threadCount: threads.length,
          },
        },
      });

      return {
        summary: response.text,
        threads: threads.map(t => ({
          id: t.id,
          subject: t.subject,
          priority: t.priority,
          messageCount: t.messages.length,
        })),
        generateReplies,
        draftPlans: draftPlans.length > 0 ? draftPlans : undefined,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to summarize emails',
      });
    }
  }

  async createDraft(userId: string, draftData: any) {
    try {
      const result = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'gmail_create_draft',
        args: draftData,
      });

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create draft',
      });
    }
  }

  async sendDraft(userId: string, draftId: string) {
    try {
      const result = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'gmail_send_draft',
        args: { draftId },
      });

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to send draft',
      });
    }
  }

  async classifyEmail(userId: string, threadId: string) {
    try {
      const thread = await this.databaseService.thread.findFirst({
        where: { id: threadId, userId },
        include: {
          messages: {
            orderBy: { date: 'desc' },
            take: 1,
          },
        },
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Thread not found',
        });
      }

      const latestMessage = thread.messages[0];
      if (!latestMessage) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No messages in thread',
        });
      }

      // Initialize Gemini client with classification schema
      const geminiClient = new GeminiClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT!,
        location: process.env.GEMINI_LOCATION || 'us-central1',
        modelName: (process.env.GEMINI_MODEL as any) || 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        defaultTemperature: 0.1, // Low temperature for consistent classification
        defaultMaxTokens: 512, // Small output for classification
      });

      const response = await geminiClient.callGemini({
        messages: [
          {
            role: 'user',
            parts: [
              {
                text: `Classify this email and suggest actions:

Subject: ${thread.subject}
From: ${latestMessage.from}
Date: ${latestMessage.date}
Body: ${latestMessage.body.substring(0, 1000)}

Analyze the priority level, intent, and suggest appropriate next actions.`,
              },
            ],
          },
        ],
        ...SCHEMA_CONFIGS.PRIORITY_CLASSIFIER,
        temperature: 0.1,
      });

      const classification: PriorityClassifierResult = JSON.parse(response.text || '{}');

      // Update thread with classification
      await this.databaseService.thread.update({
        where: { id: threadId },
        data: { priority: classification.priority },
      });

      // Log classification
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'email.classify',
          resource: threadId,
          metadata: classification,
        },
      });

      return classification;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to classify email',
      });
    }
  }
}
