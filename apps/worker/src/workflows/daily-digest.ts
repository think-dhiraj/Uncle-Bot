import { 
  proxyActivities,
  workflowInfo,
  log,
} from '@temporalio/workflow';

import type * as activities from '../activities';

const { 
  getUserEmailSummary,
  getUserCalendarSummary,
  getUserPendingTasks,
  generateDailyDigest,
  sendDailyDigestEmail,
  createDailyDigestNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
});

export interface DailyDigestInput {
  userId: string;
  userEmail: string;
  userName?: string;
  timeZone?: string;
}

export interface DailyDigestData {
  emailSummary: {
    unreadCount: number;
    highPriorityCount: number;
    recentEmails: Array<{
      subject: string;
      from: string;
      snippet: string;
      priority: string;
    }>;
  };
  calendarSummary: {
    todayEvents: Array<{
      summary: string;
      start: string;
      end: string;
      location?: string;
    }>;
    upcomingEvents: Array<{
      summary: string;
      start: string;
      end: string;
      location?: string;
    }>;
  };
  taskSummary: {
    pendingCount: number;
    overdueCount: number;
    dueTodayCount: number;
    tasks: Array<{
      title: string;
      priority: string;
      dueDate?: string;
    }>;
  };
}

/**
 * Daily digest workflow
 * Runs every day at 8:30 AM local time for each user
 * Collects email, calendar, and task summaries and sends a digest
 */
export async function dailyDigest(input: DailyDigestInput): Promise<void> {
  const { userId, userEmail, userName, timeZone = 'UTC' } = input;

  log.info('Daily digest workflow started', { 
    workflowId: workflowInfo().workflowId,
    userId, 
    userEmail,
    timeZone 
  });

  try {
    // Collect data from different sources in parallel
    const [emailSummary, calendarSummary, taskSummary] = await Promise.all([
      getUserEmailSummary(userId),
      getUserCalendarSummary(userId, timeZone),
      getUserPendingTasks(userId),
    ]);

    const digestData: DailyDigestData = {
      emailSummary,
      calendarSummary,
      taskSummary,
    };

    log.info('Collected digest data', {
      userId,
      unreadEmails: emailSummary.unreadCount,
      todayEvents: calendarSummary.todayEvents.length,
      pendingTasks: taskSummary.pendingCount,
    });

    // Generate AI-powered digest content
    const digestContent = await generateDailyDigest(userId, digestData, timeZone);

    // Send digest via email
    await sendDailyDigestEmail(userEmail, userName, digestContent, digestData);

    // Create in-app notification
    await createDailyDigestNotification(userId, digestContent);

    log.info('Daily digest completed successfully', { 
      userId,
      emailSent: true,
      notificationCreated: true,
    });

  } catch (error) {
    log.error('Daily digest workflow failed', { 
      userId, 
      userEmail, 
      error: error.message 
    });
    throw error;
  }
}
