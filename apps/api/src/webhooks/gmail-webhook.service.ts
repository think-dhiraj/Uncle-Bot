import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from './webhooks.service';
// Temporarily commented out due to build issues
// import { GmailClient } from '@ai-assistant/google';

interface GmailPushNotification {
  emailAddress: string;
  historyId: string;
}

@Injectable()
export class GmailWebhookService {
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private webhooksService: WebhooksService,
  ) {}

  async handleGmailPushNotification(data: GmailPushNotification): Promise<void> {
    const { emailAddress, historyId } = data;

    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: emailAddress },
    });

    if (!user) {
      console.warn(`User not found for email: ${emailAddress}`);
      return;
    }

    try {
      // Log webhook event
      await this.webhooksService.logWebhookEvent('gmail', user.id, data);

      // Get user's OAuth tokens
      const tokens = await this.authService.getDecryptedTokens(user.id);
      
      // Create OAuth2 client
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });

      // Create Gmail client
      const gmailClient = new GmailClient(oauth2Client);

      // Get the last known history ID for this user
      const lastHistoryId = await this.getLastHistoryId(user.id);

      if (lastHistoryId && lastHistoryId !== historyId) {
        // Perform incremental sync
        await this.performIncrementalSync(user.id, gmailClient, lastHistoryId);
      } else {
        // First time or full sync needed
        await this.performFullSync(user.id, gmailClient);
      }

      // Update the last known history ID
      await this.updateLastHistoryId(user.id, historyId);

    } catch (error) {
      console.error(`Gmail webhook processing failed for user ${user.id}:`, error);
      
      if (error.message === 'HISTORY_ID_TOO_OLD') {
        // History ID is too old, perform full resync
        const tokens = await this.authService.getDecryptedTokens(user.id);
        const oauth2Client = new OAuth2Client();
        oauth2Client.setCredentials({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });
        const gmailClient = new GmailClient(oauth2Client);
        await this.performFullSync(user.id, gmailClient);
        await this.updateLastHistoryId(user.id, historyId);
      }
    }
  }

  private async getLastHistoryId(userId: string): Promise<string | null> {
    // This could be stored in user profile or a separate sync state table
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { id: true }, // We'd need to add historyId field to User model
    });

    // For now, get the latest thread's historyId
    const latestThread = await this.databaseService.thread.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { historyId: true },
    });

    return latestThread?.historyId || null;
  }

  private async updateLastHistoryId(userId: string, historyId: string): Promise<void> {
    // This would typically update a sync state record
    // For now, we'll just log it
    console.log(`Updated history ID for user ${userId}: ${historyId}`);
  }

  private async performIncrementalSync(
    userId: string,
    gmailClient: GmailClient,
    lastHistoryId: string,
  ): Promise<void> {
    try {
      const historyItems = await gmailClient.historySince(lastHistoryId);
      
      for (const historyItem of historyItems) {
        if (historyItem.messagesAdded) {
          // Process new messages
          for (const messageAdded of historyItem.messagesAdded) {
            await this.processNewMessage(userId, messageAdded.message);
          }
        }

        if (historyItem.messagesDeleted) {
          // Process deleted messages
          for (const messageDeleted of historyItem.messagesDeleted) {
            await this.processDeletedMessage(userId, messageDeleted.message);
          }
        }

        if (historyItem.labelsAdded || historyItem.labelsRemoved) {
          // Process label changes
          await this.processLabelChanges(userId, historyItem);
        }
      }

      // Create notification for new emails
      if (historyItems.some(item => item.messagesAdded?.length > 0)) {
        const newMessageCount = historyItems.reduce(
          (count, item) => count + (item.messagesAdded?.length || 0),
          0
        );

        await this.webhooksService.createNotification(
          userId,
          'EMAIL_RECEIVED',
          'New emails received',
          `You have ${newMessageCount} new email${newMessageCount > 1 ? 's' : ''}`,
          { count: newMessageCount }
        );
      }

    } catch (error) {
      console.error('Incremental sync failed:', error);
      throw error;
    }
  }

  private async performFullSync(userId: string, gmailClient: GmailClient): Promise<void> {
    // This would be a more comprehensive sync operation
    // For now, just sync recent threads
    const threadsResult = await gmailClient.listThreads({
      maxResults: 50,
      labelIds: ['INBOX'],
    });

    for (const thread of threadsResult.threads) {
      await this.syncThread(userId, thread);
    }
  }

  private async syncThread(userId: string, gmailThread: any): Promise<void> {
    // Check if thread already exists
    const existingThread = await this.databaseService.thread.findUnique({
      where: { gmailId: gmailThread.id },
    });

    if (existingThread) {
      // Update existing thread
      await this.databaseService.thread.update({
        where: { id: existingThread.id },
        data: {
          historyId: gmailThread.historyId,
          lastMessage: new Date(parseInt(gmailThread.messages[gmailThread.messages.length - 1].internalDate)),
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new thread
      await this.databaseService.thread.create({
        data: {
          userId,
          gmailId: gmailThread.id,
          subject: gmailThread.messages[0].payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject',
          snippet: gmailThread.snippet,
          historyId: gmailThread.historyId,
          lastMessage: new Date(parseInt(gmailThread.messages[gmailThread.messages.length - 1].internalDate)),
        },
      });
    }

    // Process messages in thread
    for (const message of gmailThread.messages) {
      await this.syncMessage(gmailThread.id, message);
    }
  }

  private async syncMessage(threadId: string, gmailMessage: any): Promise<void> {
    const thread = await this.databaseService.thread.findUnique({
      where: { gmailId: threadId },
    });

    if (!thread) return;

    // Check if message already exists
    const existingMessage = await this.databaseService.message.findUnique({
      where: { gmailId: gmailMessage.id },
    });

    if (existingMessage) return;

    // Extract message data
    const headers = gmailMessage.payload.headers;
    const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';

    await this.databaseService.message.create({
      data: {
        threadId: thread.id,
        gmailId: gmailMessage.id,
        from: getHeader('From'),
        to: getHeader('To').split(',').map(s => s.trim()),
        cc: getHeader('Cc').split(',').map(s => s.trim()).filter(Boolean),
        bcc: getHeader('Bcc').split(',').map(s => s.trim()).filter(Boolean),
        subject: getHeader('Subject'),
        body: this.extractMessageBody(gmailMessage.payload),
        bodyHtml: this.extractMessageBodyHtml(gmailMessage.payload),
        date: new Date(parseInt(gmailMessage.internalDate)),
        inReplyTo: getHeader('In-Reply-To'),
      },
    });
  }

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

  private async processNewMessage(userId: string, message: any): Promise<void> {
    // This would process a newly added message
    console.log(`Processing new message for user ${userId}:`, message?.id);
  }

  private async processDeletedMessage(userId: string, message: any): Promise<void> {
    // This would handle message deletion
    console.log(`Processing deleted message for user ${userId}:`, message?.id);
  }

  private async processLabelChanges(userId: string, historyItem: any): Promise<void> {
    // This would handle label changes (read/unread, etc.)
    console.log(`Processing label changes for user ${userId}:`, historyItem.id);
  }
}
