import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { UserApiKeyService } from '../user-api-key/user-api-key.service';
// Temporarily commented out due to build issues
// import { GmailClient } from '@ai-assistant/google';
// import { GeminiClient, SCHEMA_CONFIGS, PriorityClassifierResult } from '@ai-assistant/gemini';
import { Client as TemporalClient } from '@temporalio/client';

@Injectable()
export class GmailSyncService {
  private temporal: TemporalClient;
  private geminiClient: GeminiClient;

  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private userApiKeyService: UserApiKeyService,
  ) {
    // Initialize Temporal client for background sync tasks
    this.temporal = new TemporalClient({
      connection: {
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      },
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    });

    // Note: Gemini client will be initialized per-user in methods that need it
    // This allows us to use user-specific API keys instead of company keys
  }

  /**
   * Get a user-specific Gemini client for AI operations
   */
  private async getUserGeminiClient(userId: string): Promise<GeminiClient> {
    const userApiKey = await this.userApiKeyService.getApiKey(userId);
    if (!userApiKey) {
      throw new Error(`No Gemini API key found for user ${userId}. Please set your API key in settings.`);
    }

    return new GeminiClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GEMINI_LOCATION || 'us-central1',
      modelName: (process.env.GEMINI_MODEL as any) || 'gemini-2.5-pro',
      companyApiKey: userApiKey, // Use user's API key instead of company key
      customEndpoint: process.env.COMPANY_GEMINI_ENDPOINT,
      defaultTemperature: 0.1, // Lower temperature for classification
      defaultMaxTokens: 1024, // Smaller tokens for classification tasks
    });
  }

  async enqueueIncrementalSync(
    userEmail: string,
    historyId: string,
    meta?: Record<string, any>
  ) {
    try {
      // 1) Find user and get current sync state
      const user = await this.databaseService.user.findUnique({
        where: { email: userEmail },
      });

      if (!user) {
        console.warn(`[GmailSync] User not found for email: ${userEmail}`);
        return;
      }

      const lastSeenHistoryId = await this.getLatestSeenHistoryId(user.id);
      
      // Only proceed if this historyId is newer
      if (lastSeenHistoryId && this.compareHistoryIds(historyId, lastSeenHistoryId) <= 0) {
        console.log(`[GmailSync] Already processed historyId ${historyId} for ${userEmail}`);
        return;
      }

      // 2) Start a Temporal workflow for background processing
      const workflowId = `gmail-sync-${user.id}-${Date.now()}`;
      
      await this.temporal.workflow.start('gmailIncrementalSync', {
        args: [{
          userId: user.id,
          userEmail,
          newHistoryId: historyId,
          lastHistoryId: lastSeenHistoryId,
          metadata: meta || {},
        }],
        taskQueue: 'ai-assistant',
        workflowId,
      });

      // 3) Persist the new historyId immediately to avoid duplicate processing
      await this.updateLatestSeenHistoryId(user.id, historyId);

      console.log(`[GmailSync] Enqueued sync for ${userEmail}, workflow: ${workflowId}`);
    } catch (error) {
      console.error(`[GmailSync] Failed to enqueue sync for ${userEmail}:`, error);
      throw error;
    }
  }

  /**
   * Core sync logic called by Temporal workflow
   */
  async performIncrementalSync(
    userId: string,
    userEmail: string,
    newHistoryId: string,
    lastHistoryId?: string
  ): Promise<void> {
    try {
      // Get Gmail client for user
      const gmailClient = await this.getGmailClientForUser(userId);

      if (!lastHistoryId) {
        // No baseline - do a full resync to establish initial state
        console.log(`[GmailSync] No baseline historyId, performing full resync for ${userEmail}`);
        await this.performFullResync(userId, gmailClient, newHistoryId);
      } else {
        try {
          // Call users.history.list since last stored historyId
          const historyItems = await gmailClient.historySince(lastHistoryId);
          
          console.log(`[GmailSync] Processing ${historyItems.length} history items for ${userEmail}`);
          
          // Process each message delta
          const processedThreads = new Set<string>();
          for (const historyItem of historyItems) {
            const newThreadIds = await this.processHistoryDelta(userId, gmailClient, historyItem);
            newThreadIds.forEach(id => processedThreads.add(id));
          }

          // Emit notifications for P0/P1 emails after triage
          if (processedThreads.size > 0) {
            await this.triageAndNotify(userId, Array.from(processedThreads));
          }

        } catch (error: any) {
          if (error.message === 'HISTORY_ID_TOO_OLD') {
            // History ID too old or gaps detected - do full resync
            console.log(`[GmailSync] History ID too old for ${userEmail}, performing full resync`);
            await this.performFullResync(userId, gmailClient, newHistoryId);
          } else {
            throw error;
          }
        }
      }

      console.log(`[GmailSync] Completed sync for ${userEmail}`);
    } catch (error) {
      console.error(`[GmailSync] Sync failed for user ${userId}:`, error);
      await this.logSyncError(userId, userEmail, error.message);
      throw error;
    }
  }

  // Helper Methods

  private async getGmailClientForUser(userId: string): Promise<GmailClient> {
    const tokens = await this.authService.getDecryptedTokens(userId);
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    return new GmailClient(oauth2Client);
  }

  private async getLatestSeenHistoryId(userId: string): Promise<string | null> {
    // Get from latest thread or sync log
    const latestThread = await this.databaseService.thread.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { historyId: true },
    });
    return latestThread?.historyId || null;
  }

  private async updateLatestSeenHistoryId(userId: string, historyId: string): Promise<void> {
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'gmail.history_id_updated',
        metadata: { historyId, updatedAt: new Date().toISOString() },
      },
    });
  }

  private compareHistoryIds(historyId1: string, historyId2: string): number {
    // Gmail history IDs are sequential integers as strings
    return parseInt(historyId1) - parseInt(historyId2);
  }

  private async performFullResync(userId: string, gmailClient: GmailClient, baselineHistoryId: string): Promise<void> {
    // List recent threads (last 7 days to keep it manageable)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const query = `after:${sevenDaysAgo.getFullYear()}/${(sevenDaysAgo.getMonth() + 1).toString().padStart(2, '0')}/${sevenDaysAgo.getDate().toString().padStart(2, '0')}`;
    
    const threadsResult = await gmailClient.listThreads({
      query,
      maxResults: 50, // Limit to avoid overwhelming
      labelIds: ['INBOX'],
    });

    const processedThreadIds: string[] = [];
    for (const thread of threadsResult.threads) {
      await this.syncThread(userId, thread);
      processedThreadIds.push(thread.id);
    }

    // Store new baseline historyId
    await this.updateLatestSeenHistoryId(userId, baselineHistoryId);

    // Triage new threads
    if (processedThreadIds.length > 0) {
      await this.triageAndNotify(userId, processedThreadIds);
    }

    console.log(`[GmailSync] Full resync completed: ${processedThreadIds.length} threads`);
  }

  private async processHistoryDelta(
    userId: string,
    gmailClient: GmailClient,
    historyItem: any
  ): Promise<string[]> {
    const affectedThreadIds: string[] = [];

    // Process messages added
    if (historyItem.messagesAdded) {
      const threadIds = new Set<string>();
      
      for (const messageAdded of historyItem.messagesAdded) {
        const message = messageAdded.message;
        if (message?.threadId) {
          threadIds.add(message.threadId);
        }
      }

      // Update affected threads
      for (const threadId of threadIds) {
        try {
          const thread = await gmailClient.getThread(threadId);
          await this.syncThread(userId, thread);
          affectedThreadIds.push(threadId);
        } catch (error) {
          console.error(`[GmailSync] Failed to sync thread ${threadId}:`, error);
        }
      }
    }

    // Process messages deleted
    if (historyItem.messagesDeleted) {
      for (const messageDeleted of historyItem.messagesDeleted) {
        const message = messageDeleted.message;
        if (message) {
          await this.databaseService.message.deleteMany({
            where: { gmailId: message.id },
          });
        }
      }
    }

    return affectedThreadIds;
  }

  private async triageAndNotify(userId: string, threadIds: string[]): Promise<void> {
    // Get threads with latest messages for classification
    const threads = await this.databaseService.thread.findMany({
      where: {
        userId,
        gmailId: { in: threadIds },
      },
      include: {
        messages: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    const highPriorityThreads: string[] = [];

    for (const thread of threads) {
      if (thread.messages.length === 0) continue;

      const latestMessage = thread.messages[0];
      
      try {
        // Use Gemini to classify email priority and intent
        const classificationResponse = await this.geminiClient.callGemini({
          messages: [
            {
              role: 'user',
              parts: [{
                text: `Classify this email:
Subject: ${thread.subject}
From: ${latestMessage.from}
Body: ${latestMessage.body.substring(0, 800)}

Analyze priority and intent.`
              }],
            },
          ],
          ...SCHEMA_CONFIGS.PRIORITY_CLASSIFIER,
          temperature: 0.1,
        });

        const classification: PriorityClassifierResult = JSON.parse(classificationResponse.text || '{}');

        // Update thread with classification
        await this.databaseService.thread.update({
          where: { id: thread.id },
          data: { priority: classification.priority },
        });

        // Track high-priority emails
        if (classification.priority === 'P0' || classification.priority === 'P1') {
          highPriorityThreads.push(thread.id);
        }

      } catch (error) {
        console.error(`[GmailSync] Classification failed for thread ${thread.id}:`, error);
      }
    }

    // Emit notifications for P0/P1 emails
    if (highPriorityThreads.length > 0) {
      await this.databaseService.notification.create({
        data: {
          userId,
          type: 'EMAIL_RECEIVED',
          title: 'High priority emails received',
          message: `You have ${highPriorityThreads.length} high priority email${highPriorityThreads.length > 1 ? 's' : ''}`,
          data: {
            count: highPriorityThreads.length,
            threadIds: highPriorityThreads,
            priority: 'high',
          },
        },
      });
    }
  }

  private async logSyncError(userId: string, userEmail: string, error: string): Promise<void> {
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'gmail.sync_error',
        metadata: {
          userEmail,
          error,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Sync a single thread with the database
   */
  private async syncThread(userId: string, gmailThread: any): Promise<void> {
    try {
      // Check if thread already exists
      const existingThread = await this.databaseService.thread.findUnique({
        where: { gmailId: gmailThread.id },
      });

      const latestMessage = gmailThread.messages[gmailThread.messages.length - 1];
      const firstMessage = gmailThread.messages[0];
      
      // Extract subject from first message headers
      const headers = firstMessage.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';

      if (existingThread) {
        // Update existing thread
        await this.databaseService.thread.update({
          where: { id: existingThread.id },
          data: {
            historyId: gmailThread.historyId,
            lastMessage: new Date(parseInt(latestMessage.internalDate)),
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new thread
        await this.databaseService.thread.create({
          data: {
            userId,
            gmailId: gmailThread.id,
            subject,
            snippet: gmailThread.snippet || '',
            historyId: gmailThread.historyId,
            lastMessage: new Date(parseInt(latestMessage.internalDate)),
          },
        });
      }

      // Sync all messages in the thread
      for (const message of gmailThread.messages) {
        await this.syncMessage(gmailThread.id, message);
      }

    } catch (error) {
      console.error(`[GmailSync] Failed to sync thread ${gmailThread.id}:`, error);
    }
  }

  /**
   * Sync a single message with the database
   */
  private async syncMessage(threadGmailId: string, gmailMessage: any): Promise<void> {
    try {
      // Find the thread in our database
      const thread = await this.databaseService.thread.findUnique({
        where: { gmailId: threadGmailId },
      });

      if (!thread) {
        console.warn(`[GmailSync] Thread not found for message ${gmailMessage.id}`);
        return;
      }

      // Check if message already exists
      const existingMessage = await this.databaseService.message.findUnique({
        where: { gmailId: gmailMessage.id },
      });

      if (existingMessage) {
        return; // Message already synced
      }

      // Extract message data
      const headers = gmailMessage.payload?.headers || [];
      const getHeader = (name: string) => 
        headers.find(h => h.name === name)?.value || '';

      const body = this.extractMessageBody(gmailMessage.payload);
      const bodyHtml = this.extractMessageBodyHtml(gmailMessage.payload);

      // Create message
      await this.databaseService.message.create({
        data: {
          threadId: thread.id,
          gmailId: gmailMessage.id,
          from: getHeader('From'),
          to: getHeader('To').split(',').map(s => s.trim()).filter(Boolean),
          cc: getHeader('Cc').split(',').map(s => s.trim()).filter(Boolean),
          bcc: getHeader('Bcc').split(',').map(s => s.trim()).filter(Boolean),
          subject: getHeader('Subject'),
          body: body || '',
          bodyHtml: bodyHtml,
          date: new Date(parseInt(gmailMessage.internalDate)),
          inReplyTo: getHeader('In-Reply-To') || null,
        },
      });

    } catch (error) {
      console.error(`[GmailSync] Failed to sync message ${gmailMessage.id}:`, error);
    }
  }

  /**
   * Extract plain text body from Gmail message payload
   */
  private extractMessageBody(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString();
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }

    return '';
  }

  /**
   * Extract HTML body from Gmail message payload
   */
  private extractMessageBodyHtml(payload: any): string | null {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }

    return null;
  }

  /**
   * Get sync state for a user
   */
  private async getUserSyncState(userId: string): Promise<UserSyncState | null> {
    // In a production system, you'd have a dedicated sync_state table
    // For now, we'll use the latest thread's historyId and audit logs
    
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const latestThread = await this.databaseService.thread.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { historyId: true, updatedAt: true },
    });

    const lastSyncLog = await this.databaseService.auditLog.findFirst({
      where: {
        userId,
        action: 'gmail.sync_completed',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestThread) return null;

    return {
      userId,
      email: user.email,
      lastHistoryId: latestThread.historyId || '',
      lastSyncAt: lastSyncLog?.createdAt || latestThread.updatedAt,
    };
  }

  /**
   * Update sync state for a user
   */
  private async updateUserSyncState(
    userId: string,
    emailAddress: string,
    historyId: string
  ): Promise<void> {
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: 'gmail.sync_completed',
        metadata: {
          emailAddress,
          historyId,
          syncedAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Setup Gmail watch for a user (called during OAuth flow)
   */
  async setupGmailWatch(userId: string): Promise<void> {
    try {
      const user = await this.databaseService.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const tokens = await this.authService.getDecryptedTokens(userId);
      
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      
      const gmailClient = new GmailClient(oauth2Client);

      // Set up watch with Pub/Sub topic
      const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-push`;
      
      const watchResult = await gmailClient.watch(topicName, ['INBOX']);

      // Log the watch setup
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'gmail.watch_setup',
          metadata: {
            historyId: watchResult.historyId,
            expiration: watchResult.expiration,
            topicName,
          },
        },
      });

      console.log(`[GmailSync] Gmail watch setup for ${user.email}, expires: ${watchResult.expiration}`);

    } catch (error) {
      console.error(`[GmailSync] Failed to setup Gmail watch for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Renew Gmail watch for all users (called by cron job)
   */
  async renewAllGmailWatches(): Promise<void> {
    console.log('[GmailSync] Renewing Gmail watches for all users');

    const users = await this.databaseService.user.findMany({
      include: {
        oauthTokens: {
          where: { provider: 'google' },
        },
      },
    });

    for (const user of users) {
      if (user.oauthTokens.length > 0) {
        try {
          await this.setupGmailWatch(user.id);
        } catch (error) {
          console.error(`[GmailSync] Failed to renew watch for ${user.email}:`, error);
        }
      }
    }

    console.log(`[GmailSync] Completed watch renewal for ${users.length} users`);
  }
}
