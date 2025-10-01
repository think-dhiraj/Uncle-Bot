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
  setupOutOfOfficeAutoReply,
  disableOutOfOfficeAutoReply,
  createOooCalendarEvent,
  deleteOooCalendarEvent,
  sendOooStartNotification,
  sendOooEndNotification,
  processIncomingEmailsDuringOoo,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export interface OooWindowInput {
  userId: string;
  startDate: string; // ISO string
  endDate: string;   // ISO string
  message: string;
  autoReplyEnabled?: boolean;
  calendarEventEnabled?: boolean;
}

export interface OooWindowState {
  userId: string;
  startDate: string;
  endDate: string;
  message: string;
  autoReplyEnabled: boolean;
  calendarEventEnabled: boolean;
  isActive: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  cancelRequested: boolean;
  calendarEventId?: string;
}

// Signals
export const cancelOooSignal = defineSignal<[]>('cancelOoo');
export const updateOooMessageSignal = defineSignal<[string]>('updateOooMessage');

// Queries
export const getOooStateQuery = defineQuery<OooWindowState>('getOooState');

/**
 * Out of Office window workflow
 * Manages auto-replies and calendar blocking for a specified time period
 */
export async function oooWindow(input: OooWindowInput): Promise<void> {
  const { 
    userId, 
    startDate, 
    endDate, 
    message,
    autoReplyEnabled = true,
    calendarEventEnabled = true,
  } = input;
  
  const state: OooWindowState = {
    userId,
    startDate,
    endDate,
    message,
    autoReplyEnabled,
    calendarEventEnabled,
    isActive: true,
    hasStarted: false,
    hasEnded: false,
    cancelRequested: false,
  };

  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const now = Date.now();

  log.info('Out of office workflow started', { 
    workflowId: workflowInfo().workflowId,
    userId,
    startDate,
    endDate,
    autoReplyEnabled,
    calendarEventEnabled,
  });

  // Validate dates
  if (startTime >= endTime) {
    throw new Error('Start date must be before end date');
  }

  if (endTime <= now) {
    throw new Error('End date must be in the future');
  }

  // Set up signal handlers
  setHandler(cancelOooSignal, () => {
    log.info('OOO cancel signal received', { userId });
    state.cancelRequested = true;
    state.isActive = false;
  });

  setHandler(updateOooMessageSignal, (newMessage: string) => {
    log.info('OOO message update signal received', { userId, newMessage });
    state.message = newMessage;
  });

  setHandler(getOooStateQuery, () => state);

  try {
    // If start time is in the future, wait until then
    if (startTime > now) {
      log.info('Waiting for OOO start time', { userId, waitUntil: startDate });
      
      await condition(
        () => state.cancelRequested,
        startTime - now
      );

      if (state.cancelRequested) {
        log.info('OOO cancelled before start', { userId });
        return;
      }
    }

    // OOO period has started
    log.info('Starting OOO period', { userId, startDate, endDate });
    state.hasStarted = true;

    // Set up auto-reply if enabled
    if (state.autoReplyEnabled) {
      await setupOutOfOfficeAutoReply(userId, state.message, endDate);
      log.info('Auto-reply enabled', { userId });
    }

    // Create calendar event if enabled
    if (state.calendarEventEnabled) {
      const eventId = await createOooCalendarEvent(
        userId, 
        startDate, 
        endDate, 
        state.message
      );
      state.calendarEventId = eventId;
      log.info('Calendar event created', { userId, eventId });
    }

    // Send start notification
    await sendOooStartNotification(userId, startDate, endDate);

    // Wait until end time or cancellation
    const remainingTime = endTime - Math.max(now, startTime);
    
    await condition(
      () => state.cancelRequested,
      remainingTime
    );

    if (state.cancelRequested) {
      log.info('OOO cancelled during active period', { userId });
    } else {
      log.info('OOO period ended naturally', { userId });
      state.hasEnded = true;
    }

    // Clean up OOO settings
    if (state.autoReplyEnabled) {
      await disableOutOfOfficeAutoReply(userId);
      log.info('Auto-reply disabled', { userId });
    }

    if (state.calendarEventEnabled && state.calendarEventId) {
      await deleteOooCalendarEvent(userId, state.calendarEventId);
      log.info('Calendar event deleted', { userId, eventId: state.calendarEventId });
    }

    // Send end notification
    if (state.hasEnded) {
      await sendOooEndNotification(userId, endDate);
    }

    // Process any emails that came in during OOO
    if (state.hasStarted && !state.cancelRequested) {
      await processIncomingEmailsDuringOoo(userId, startDate, endDate);
      log.info('Processed emails from OOO period', { userId });
    }

    state.isActive = false;

    log.info('Out of office workflow completed', { 
      userId,
      cancelled: state.cancelRequested,
      naturalEnd: state.hasEnded,
    });

  } catch (error) {
    log.error('Out of office workflow failed', { 
      userId, 
      error: error.message 
    });

    // Attempt cleanup on error
    try {
      if (state.autoReplyEnabled) {
        await disableOutOfOfficeAutoReply(userId);
      }
      if (state.calendarEventEnabled && state.calendarEventId) {
        await deleteOooCalendarEvent(userId, state.calendarEventId);
      }
    } catch (cleanupError) {
      log.error('Cleanup failed after workflow error', { 
        userId, 
        cleanupError: cleanupError.message 
      });
    }

    throw error;
  }
}
