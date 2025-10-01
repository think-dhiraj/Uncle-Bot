import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from './webhooks.service';
// Temporarily commented out due to build issues
// import { CalendarClient } from '@ai-assistant/google';

interface CalendarPushNotification {
  channelId: string;
  resourceId: string;
  resourceState: string;
  resourceUri?: string;
  messageNumber?: number;
}

@Injectable()
export class CalendarWebhookService {
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private webhooksService: WebhooksService,
  ) {}

  /**
   * Enqueue incremental sync for calendar updates
   * This method provides the same interface as expected by the controller
   */
  async enqueueIncrementalSync(data: CalendarPushNotification): Promise<void> {
    // For now, we handle synchronously, but this could be moved to a queue
    await this.handleCalendarPushNotification(data);
  }

  async handleCalendarPushNotification(data: CalendarPushNotification): Promise<void> {
    const { channelId, resourceId, resourceState, resourceUri, messageNumber } = data;

    // The resource state can be 'sync', 'exists', or 'not_exists'
    if (resourceState === 'sync') {
      // Initial sync notification, ignore
      return;
    }

    try {
      // Find user by channel ID (we'd need to store this mapping)
      const user = await this.findUserByChannelId(channelId);
      
      if (!user) {
        console.warn(`User not found for channel ID: ${channelId}`);
        return;
      }

      // Log webhook event
      await this.webhooksService.logWebhookEvent('calendar', user.id, data);

      // Get user's OAuth tokens
      const tokens = await this.authService.getDecryptedTokens(user.id);
      
      // Create OAuth2 client
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });

      // Create Calendar client
      const calendarClient = new CalendarClient(oauth2Client);

      // Extract calendar ID from resource URI
      const calendarId = this.extractCalendarId(resourceUri);

      if (resourceState === 'exists') {
        // Calendar has been updated, perform incremental sync
        await this.performIncrementalSync(user.id, calendarClient, calendarId);
      } else if (resourceState === 'not_exists') {
        // Calendar or events have been deleted
        await this.handleCalendarDeletion(user.id, calendarId);
      }

    } catch (error) {
      console.error('Calendar webhook processing failed:', error);
      
      if (error.message === 'SYNC_TOKEN_EXPIRED') {
        // Sync token expired, perform full resync
        const user = await this.findUserByChannelId(channelId);
        if (user) {
          const tokens = await this.authService.getDecryptedTokens(user.id);
          const oauth2Client = new OAuth2Client();
          oauth2Client.setCredentials({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          const calendarClient = new CalendarClient(oauth2Client);
          const calendarId = this.extractCalendarId(resourceUri);
          await this.performFullSync(user.id, calendarClient, calendarId);
        }
      }
    }
  }

  private async findUserByChannelId(channelId: string): Promise<any> {
    // In a real implementation, we'd store the channel ID mapping
    // For now, we'll need to implement a way to track which user owns which channel
    // This could be stored in a separate table or as part of user metadata
    
    // TODO: Implement proper channel ID to user mapping
    // For now, return null to indicate we need to implement this
    return null;
  }

  private extractCalendarId(resourceUri: string): string {
    // Extract calendar ID from URI like:
    // https://www.googleapis.com/calendar/v3/calendars/primary/events
    const match = resourceUri.match(/calendars\/([^\/]+)/);
    return match ? decodeURIComponent(match[1]) : 'primary';
  }

  private async performIncrementalSync(
    userId: string,
    calendarClient: CalendarClient,
    calendarId: string,
  ): Promise<void> {
    try {
      // Get the last sync token for this calendar
      const lastSyncToken = await this.getLastSyncToken(userId, calendarId);

      const syncResult = await calendarClient.syncWithToken(calendarId, lastSyncToken);

      // Process updated events
      for (const event of syncResult.events) {
        await this.processCalendarEvent(userId, calendarId, event);
      }

      // Update sync token
      if (syncResult.nextSyncToken) {
        await this.updateSyncToken(userId, calendarId, syncResult.nextSyncToken);
      }

      // Create notification for calendar changes
      if (syncResult.events.length > 0) {
        await this.webhooksService.createNotification(
          userId,
          'CALENDAR_REMINDER',
          'Calendar updated',
          `${syncResult.events.length} calendar event${syncResult.events.length > 1 ? 's' : ''} updated`,
          { 
            calendarId,
            eventCount: syncResult.events.length 
          }
        );
      }

    } catch (error) {
      console.error('Calendar incremental sync failed:', error);
      throw error;
    }
  }

  private async performFullSync(
    userId: string,
    calendarClient: CalendarClient,
    calendarId: string,
  ): Promise<void> {
    try {
      // Get initial sync token
      const syncToken = await calendarClient.getInitialSyncToken(calendarId);
      await this.updateSyncToken(userId, calendarId, syncToken);

      // Get recent events for initial sync
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const events = await calendarClient.getEvents(
        calendarId,
        oneMonthAgo.toISOString(),
        oneMonthLater.toISOString()
      );

      for (const event of events) {
        await this.processCalendarEvent(userId, calendarId, event);
      }

    } catch (error) {
      console.error('Calendar full sync failed:', error);
      throw error;
    }
  }

  private async processCalendarEvent(
    userId: string,
    calendarId: string,
    event: any,
  ): Promise<void> {
    // This would process a calendar event update
    // For now, just log it
    console.log(`Processing calendar event for user ${userId}:`, {
      calendarId,
      eventId: event.id,
      summary: event.summary,
      status: event.status,
    });

    // In a full implementation, you might:
    // 1. Store the event in the database
    // 2. Check for conflicts with other events
    // 3. Send reminders or notifications
    // 4. Update related automations or tasks
  }

  private async handleCalendarDeletion(
    userId: string,
    calendarId: string,
  ): Promise<void> {
    console.log(`Handling calendar deletion for user ${userId}, calendar ${calendarId}`);
    
    // In a full implementation, you might:
    // 1. Remove stored events for this calendar
    // 2. Cancel related automations
    // 3. Notify the user about the deletion
  }

  private async getLastSyncToken(userId: string, calendarId: string): Promise<string | undefined> {
    // This would retrieve the last sync token for the user's calendar
    // For now, return undefined to trigger full sync
    
    // TODO: Implement sync token storage
    // This could be stored in a separate table or as part of user metadata
    return undefined;
  }

  private async updateSyncToken(
    userId: string,
    calendarId: string,
    syncToken: string,
  ): Promise<void> {
    // This would store the sync token for future incremental syncs
    console.log(`Updating sync token for user ${userId}, calendar ${calendarId}:`, syncToken);
    
    // TODO: Implement sync token storage
    // This could be stored in a separate table or as part of user metadata
  }
}
