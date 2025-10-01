import { prisma } from 'db';
import { OAuth2Client } from 'google-auth-library';
import { GmailClient } from '@ai-assistant/google';

export interface GmailSyncResult {
  threadsProcessed: number;
  messagesProcessed: number;
  newEmailCount: number;
  syncDurationMs: number;
}

export interface GmailSyncMetadata {
  pubsubMessageId: string;
  publishTime: string;
  deliveryAttempt: number;
}

/**
 * Perform Gmail incremental sync using History API
 */
export async function performGmailIncrementalSync(
  userId: string,
  emailAddress: string,
  newHistoryId: string,
  lastHistoryId?: string
): Promise<GmailSyncResult> {
  const startTime = Date.now();
  let threadsProcessed = 0;
  let messagesProcessed = 0;
  let newEmailCount = 0;

  try {
    // Get user's OAuth tokens
    const tokens = await getDecryptedTokens(userId);
    
    // Create Gmail client
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    
    const gmailClient = new GmailClient(oauth2Client);

    if (!lastHistoryId) {
      // No previous history ID, perform limited full sync
      console.log(`[GmailSync] No previous historyId, performing limited full sync for ${emailAddress}`);
      
      // Get recent threads (last 7 days for initial sync)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const query = `after:${sevenDaysAgo.getFullYear()}/${(sevenDaysAgo.getMonth() + 1).toString().padStart(2, '0')}/${sevenDaysAgo.getDate().toString().padStart(2, '0')}`;
      
      const threadsResult = await gmailClient.listThreads({
        query,
        maxResults: 50, // Limit for initial sync
        labelIds: ['INBOX'],
      });

      for (const thread of threadsResult.threads) {
        await syncThread(userId, thread);
        threadsProcessed++;
        messagesProcessed += thread.messages.length;
      }

      newEmailCount = threadsResult.threads.length;
    } else {
      try {
        // Perform incremental sync using history API
        const historyItems = await gmailClient.historySince(lastHistoryId);
        
        console.log(`[GmailSync] Found ${historyItems.length} history items for ${emailAddress}`);
        
        // Process history items
        for (const historyItem of historyItems) {
          const result = await processHistoryItem(userId, gmailClient, historyItem);
          threadsProcessed += result.threadsProcessed;
          messagesProcessed += result.messagesProcessed;
          newEmailCount += result.newEmailCount;
        }

      } catch (error: any) {
        if (error.message === 'HISTORY_ID_TOO_OLD') {
          // History ID is too old, perform limited full resync
          console.log(`[GmailSync] History ID too old for ${emailAddress}, performing limited resync`);
          
          const threadsResult = await gmailClient.listThreads({
            maxResults: 25, // Smaller batch for resync
            labelIds: ['INBOX'],
          });

          for (const thread of threadsResult.threads) {
            await syncThread(userId, thread);
            threadsProcessed++;
            messagesProcessed += thread.messages.length;
          }

          newEmailCount = threadsResult.threads.length;
        } else {
          throw error;
        }
      }
    }

    const syncDurationMs = Date.now() - startTime;

    return {
      threadsProcessed,
      messagesProcessed,
      newEmailCount,
      syncDurationMs,
    };

  } catch (error) {
    console.error(`[GmailSync] Incremental sync failed for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Process a single history item from Gmail History API
 */
async function processHistoryItem(
  userId: string,
  gmailClient: GmailClient,
  historyItem: any
): Promise<{ threadsProcessed: number; messagesProcessed: number; newEmailCount: number }> {
  let threadsProcessed = 0;
  let messagesProcessed = 0;
  let newEmailCount = 0;

  // Process messages added
  if (historyItem.messagesAdded) {
    const threadIds = new Set<string>();
    
    for (const messageAdded of historyItem.messagesAdded) {
      const message = messageAdded.message;
      if (message && message.threadId) {
        threadIds.add(message.threadId);
        newEmailCount++;
      }
    }

    // Sync unique threads
    for (const threadId of threadIds) {
      try {
        const thread = await gmailClient.getThread(threadId);
        await syncThread(userId, thread);
        threadsProcessed++;
        messagesProcessed += thread.messages.length;
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
        // Remove message from database
        await prisma.message.deleteMany({
          where: {
            gmailId: message.id,
          },
        });
        console.log(`[GmailSync] Deleted message ${message.id}`);
      }
    }
  }

  // Process label changes (read/unread, etc.)
  if (historyItem.labelsAdded || historyItem.labelsRemoved) {
    // For now, just log label changes
    // In a full implementation, you'd update thread/message labels
    console.log(`[GmailSync] Label changes detected in history ${historyItem.id}`);
  }

  return { threadsProcessed, messagesProcessed, newEmailCount };
}

/**
 * Sync a single thread with the database
 */
async function syncThread(userId: string, gmailThread: any): Promise<void> {
  try {
    // Check if thread already exists
    const existingThread = await prisma.thread.findUnique({
      where: { gmailId: gmailThread.id },
    });

    const latestMessage = gmailThread.messages[gmailThread.messages.length - 1];
    const firstMessage = gmailThread.messages[0];
    
    // Extract subject from first message headers
    const headers = firstMessage.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';

    if (existingThread) {
      // Update existing thread
      await prisma.thread.update({
        where: { id: existingThread.id },
        data: {
          historyId: gmailThread.historyId,
          lastMessage: new Date(parseInt(latestMessage.internalDate)),
          snippet: gmailThread.snippet || existingThread.snippet,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new thread
      await prisma.thread.create({
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
      await syncMessage(gmailThread.id, message);
    }

  } catch (error) {
    console.error(`[GmailSync] Failed to sync thread ${gmailThread.id}:`, error);
    throw error;
  }
}

/**
 * Sync a single message with the database
 */
async function syncMessage(threadGmailId: string, gmailMessage: any): Promise<void> {
  try {
    // Find the thread in our database
    const thread = await prisma.thread.findUnique({
      where: { gmailId: threadGmailId },
    });

    if (!thread) {
      console.warn(`[GmailSync] Thread not found for message ${gmailMessage.id}`);
      return;
    }

    // Check if message already exists
    const existingMessage = await prisma.message.findUnique({
      where: { gmailId: gmailMessage.id },
    });

    if (existingMessage) {
      return; // Message already synced
    }

    // Extract message data
    const headers = gmailMessage.payload?.headers || [];
    const getHeader = (name: string) => 
      headers.find(h => h.name === name)?.value || '';

    const body = extractMessageBody(gmailMessage.payload);
    const bodyHtml = extractMessageBodyHtml(gmailMessage.payload);

    // Create message
    await prisma.message.create({
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
    throw error;
  }
}

/**
 * Log Gmail sync start
 */
export async function logGmailSyncStart(
  userId: string,
  emailAddress: string,
  newHistoryId: string,
  metadata: GmailSyncMetadata
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'gmail.sync_started',
      metadata: {
        emailAddress,
        newHistoryId,
        ...metadata,
        startedAt: new Date().toISOString(),
      },
    },
  });
}

/**
 * Log Gmail sync completion
 */
export async function logGmailSyncComplete(
  userId: string,
  emailAddress: string,
  newHistoryId: string,
  result: GmailSyncResult
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'gmail.sync_completed',
      metadata: {
        emailAddress,
        newHistoryId,
        ...result,
        completedAt: new Date().toISOString(),
      },
    },
  });

  // Create notification if new emails were found
  if (result.newEmailCount > 0) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'EMAIL_RECEIVED',
        title: 'New emails received',
        message: `You have ${result.newEmailCount} new email${result.newEmailCount > 1 ? 's' : ''}`,
        data: {
          count: result.newEmailCount,
          source: 'gmail_sync',
          syncDurationMs: result.syncDurationMs,
        },
      },
    });
  }
}

/**
 * Handle Gmail sync error
 */
export async function handleGmailSyncError(
  userId: string,
  emailAddress: string,
  newHistoryId: string,
  errorMessage: string,
  metadata: GmailSyncMetadata
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'gmail.sync_error',
      metadata: {
        emailAddress,
        newHistoryId,
        error: errorMessage,
        ...metadata,
        errorAt: new Date().toISOString(),
      },
    },
  });

  // Create error notification for critical failures
  if (metadata.deliveryAttempt >= 3) {
    await prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM_ALERT',
        title: 'Gmail sync failed',
        message: `Failed to sync emails after ${metadata.deliveryAttempt} attempts`,
        data: {
          error: errorMessage,
          emailAddress,
          deliveryAttempt: metadata.deliveryAttempt,
        },
      },
    });
  }
}

// Helper functions
function extractMessageBody(payload: any): string {
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

function extractMessageBodyHtml(payload: any): string | null {
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString();
      }
    }
  }

  return null;
}

async function getDecryptedTokens(userId: string) {
  // This would typically use the KMS service to decrypt tokens
  // For now, we'll simulate the token retrieval
  const tokenRecord = await prisma.oAuthToken.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'google',
      },
    },
  });

  if (!tokenRecord) {
    throw new Error('OAuth tokens not found');
  }

  // In production, decrypt the tokens using KMS
  // For now, assume they're already decrypted (this is a simplified version)
  return {
    accessToken: tokenRecord.accessToken, // Would be decrypted
    refreshToken: tokenRecord.refreshToken, // Would be decrypted
  };
}
