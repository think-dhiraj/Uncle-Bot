import { 
  proxyActivities,
  workflowInfo,
  log,
} from '@temporalio/workflow';

import type * as activities from '../activities';

const { 
  performGmailIncrementalSync,
  logGmailSyncStart,
  logGmailSyncComplete,
  handleGmailSyncError,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '30 seconds',
});

export interface GmailIncrementalSyncInput {
  userId: string;
  emailAddress: string;
  newHistoryId: string;
  lastHistoryId?: string;
  metadata: {
    pubsubMessageId: string;
    publishTime: string;
    deliveryAttempt: number;
  };
}

/**
 * Gmail incremental sync workflow
 * Triggered by Gmail Pub/Sub push notifications
 * Performs incremental sync using Gmail History API
 */
export async function gmailIncrementalSync(input: GmailIncrementalSyncInput): Promise<void> {
  const { userId, emailAddress, newHistoryId, lastHistoryId, metadata } = input;

  log.info('Gmail incremental sync workflow started', { 
    workflowId: workflowInfo().workflowId,
    userId, 
    emailAddress,
    newHistoryId,
    lastHistoryId,
    deliveryAttempt: metadata.deliveryAttempt,
  });

  try {
    // Log sync start
    await logGmailSyncStart(userId, emailAddress, newHistoryId, metadata);

    // Perform the actual incremental sync
    const syncResult = await performGmailIncrementalSync(
      userId,
      emailAddress,
      newHistoryId,
      lastHistoryId
    );

    // Log successful completion
    await logGmailSyncComplete(userId, emailAddress, newHistoryId, syncResult);

    log.info('Gmail incremental sync completed successfully', { 
      userId,
      emailAddress,
      threadsProcessed: syncResult.threadsProcessed,
      messagesProcessed: syncResult.messagesProcessed,
      newEmailCount: syncResult.newEmailCount,
    });

  } catch (error) {
    log.error('Gmail incremental sync failed', { 
      userId, 
      emailAddress,
      error: error.message,
      deliveryAttempt: metadata.deliveryAttempt,
    });

    // Handle the error (log, retry logic, etc.)
    await handleGmailSyncError(userId, emailAddress, newHistoryId, error.message, metadata);

    // Re-throw to mark workflow as failed
    throw error;
  }
}
