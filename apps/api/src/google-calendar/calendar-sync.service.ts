import { Injectable, Logger } from '@nestjs/common';
// Temporarily commented out due to build issues
// import { calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
// import { CalendarClient } from '@ai-assistant/google';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from '../webhooks/webhooks.service';

type CalendarPushMeta = {
  channelId: string;
  resourceId: string;
  resourceState?: string; // exists | sync | not_exists
  messageNumber?: number;
};

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async enqueueIncrementalSync(meta: CalendarPushMeta) {
    this.logger.log(`Received calendar push notification`, meta);

    const channel = await this.database.calendarWatchChannel.findUnique({
      where: { channelId: meta.channelId },
    });

    if (!channel) {
      this.logger.warn(`Watch channel not found for channelId: ${meta.channelId}. Ignoring.`);
      return;
    }

    const { userId, calendarId } = channel;

    try {
      const tokens = await this.authService.getDecryptedTokens(userId);
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      const calendarClient = new CalendarClient(oauth2Client);

      if (meta.resourceState === 'sync' || !channel.syncToken) {
        this.logger.log(`Performing initial or fallback full sync for channel ${meta.channelId}.`);
        await this.performFullSync(userId, calendarId, calendarClient, channel.id);
        return;
      }

      await this.performIncrementalSync(userId, calendarId, channel.syncToken, calendarClient, channel.id);

    } catch (error) {
      this.logger.error(`Error during calendar sync for user ${userId}: ${error.message}`, error.stack);

      if (error.message === 'SYNC_TOKEN_EXPIRED' || error.code === 410) {
        this.logger.warn(`Sync token expired for ${userId} on calendar ${calendarId}. Performing full resync.`);
        try {
          const tokens = await this.authService.getDecryptedTokens(userId);
          const oauth2Client = new OAuth2Client();
          oauth2Client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
          const calendarClient = new CalendarClient(oauth2Client);
          await this.performFullSync(userId, calendarId, calendarClient, channel.id);
        } catch (resyncError) {
          this.logger.error(`Failed to perform full resync for user ${userId}: ${resyncError.message}`, resyncError.stack);
        }
      }
    }
  }

  private async performIncrementalSync(
    userId: string,
    calendarId: string,
    syncToken: string,
    calendarClient: CalendarClient,
    channelRecordId: string
  ) {
    this.logger.log(`Performing incremental sync for ${userId} on calendar ${calendarId}`);
    const syncResult = await calendarClient.syncWithToken(calendarId, syncToken);
    
    this.logger.log(`Incremental sync completed. Found ${syncResult.events.length} changed events.`);

    for (const event of syncResult.events) {
      await this.upsertEvent(userId, calendarId, event);
    }

    if (syncResult.nextSyncToken) {
      await this.updateSyncToken(channelRecordId, syncResult.nextSyncToken);
    }
  }

  private async performFullSync(
    userId: string,
    calendarId: string,
    calendarClient: CalendarClient,
    channelRecordId: string
  ) {
    this.logger.log(`Performing full sync for ${userId} on calendar ${calendarId}`);
    
    // A full sync is a list call without a sync token. The first page will have a nextSyncToken.
    const syncResult = await calendarClient.syncWithToken(calendarId, undefined);

    this.logger.log(`Full sync received ${syncResult.events.length} initial events.`);

    for (const event of syncResult.events) {
      await this.upsertEvent(userId, calendarId, event);
    }

    if (syncResult.nextSyncToken) {
      await this.updateSyncToken(channelRecordId, syncResult.nextSyncToken);
    } else {
      this.logger.error(`Full sync for ${userId} on calendar ${calendarId} did not return a new sync token.`);
    }
  }

  private async upsertEvent(
    userId: string,
    calendarId: string,
    event: calendar_v3.Schema$Event,
  ) {
    if (event.status === 'cancelled') {
      await this.database.event.deleteMany({ where: { googleId: event.id } });
      this.logger.log(`Deleted cancelled event ${event.id} for user ${userId}`);
      return;
    }

    // Skip events without a clear start or end time
    const start = event.start?.dateTime || event.start?.date;
    const end = event.end?.dateTime || event.end?.date;
    if (!start || !end) {
      this.logger.log(`Skipping event ${event.id} due to missing start/end time.`);
      return;
    }

    const data = {
      userId,
      calendarId,
      googleId: event.id,
      summary: event.summary || 'No Title',
      description: event.description,
      start: new Date(start),
      end: new Date(end),
      location: event.location,
      status: event.status,
      recurringId: event.recurringEventId,
    };

    const upsertedEvent = await this.database.event.upsert({
      where: { googleId: event.id },
      create: data,
      update: data,
    });
    
    this.logger.log(`Upserted event ${upsertedEvent.id} for user ${userId}`);
  }

  private async updateSyncToken(channelRecordId: string, syncToken: string) {
    await this.database.calendarWatchChannel.update({
      where: { id: channelRecordId },
      data: { syncToken },
    });
    this.logger.log(`Updated sync token for channel record ${channelRecordId}`);
  }
}
