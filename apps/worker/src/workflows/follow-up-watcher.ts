import { 
  defineSignal, 
  defineQuery, 
  setHandler, 
  condition, 
  sleep,
  proxyActivities,
  workflowInfo,
  log,
} from '@temporalio/workflow';

import type * as activities from '../activities';

const { 
  checkThreadForReply,
  createFollowUpTask,
  sendFollowUpNotification,
  cancelFollowUp,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export interface FollowUpWatcherInput {
  threadId: string;
  userId: string;
  waitDays: number;
  message?: string;
}

export interface FollowUpWatcherState {
  threadId: string;
  userId: string;
  waitDays: number;
  message?: string;
  isActive: boolean;
  hasReply: boolean;
  followUpSent: boolean;
  cancelRequested: boolean;
}

// Signals
export const cancelFollowUpSignal = defineSignal<[]>('cancelFollowUp');
export const replyReceivedSignal = defineSignal<[]>('replyReceived');

// Queries
export const getStateQuery = defineQuery<FollowUpWatcherState>('getState');

/**
 * Follow-up watcher workflow
 * Waits for a specified number of days, then checks if there's been a reply.
 * If no reply, creates a follow-up task and sends a notification.
 */
export async function followUpWatcher(input: FollowUpWatcherInput): Promise<void> {
  const { threadId, userId, waitDays, message } = input;
  
  const state: FollowUpWatcherState = {
    threadId,
    userId,
    waitDays,
    message,
    isActive: true,
    hasReply: false,
    followUpSent: false,
    cancelRequested: false,
  };

  log.info('Follow-up watcher started', { 
    workflowId: workflowInfo().workflowId,
    threadId, 
    userId, 
    waitDays 
  });

  // Set up signal handlers
  setHandler(cancelFollowUpSignal, () => {
    log.info('Cancel signal received', { threadId });
    state.cancelRequested = true;
    state.isActive = false;
  });

  setHandler(replyReceivedSignal, () => {
    log.info('Reply received signal', { threadId });
    state.hasReply = true;
    state.isActive = false;
  });

  setHandler(getStateQuery, () => state);

  try {
    // Wait for the specified number of days or until cancelled/reply received
    const waitMilliseconds = waitDays * 24 * 60 * 60 * 1000;
    
    await condition(
      () => state.cancelRequested || state.hasReply,
      waitMilliseconds
    );

    if (state.cancelRequested) {
      log.info('Follow-up cancelled', { threadId });
      await cancelFollowUp(threadId, userId);
      return;
    }

    if (state.hasReply) {
      log.info('Reply received, no follow-up needed', { threadId });
      return;
    }

    // Time elapsed without reply or cancellation
    log.info('Wait period elapsed, checking for replies', { threadId, waitDays });
    
    // Double-check if there's been a reply (in case signal was missed)
    const hasReply = await checkThreadForReply(threadId, userId);
    
    if (hasReply) {
      log.info('Reply found during final check', { threadId });
      state.hasReply = true;
      return;
    }

    // No reply found, create follow-up task
    log.info('No reply found, creating follow-up task', { threadId });
    
    await createFollowUpTask(threadId, userId, message);
    await sendFollowUpNotification(threadId, userId, waitDays);
    
    state.followUpSent = true;
    state.isActive = false;

    log.info('Follow-up task created and notification sent', { threadId });

  } catch (error) {
    log.error('Follow-up watcher failed', { 
      threadId, 
      userId, 
      error: error.message 
    });
    throw error;
  }
}
