import { Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { CalendarSyncService } from "../google-calendar/calendar-sync.service";

/**
 * Google Calendar 'events.watch' webhook.
 * Important headers:
 *  - X-Goog-Channel-ID: your UUID for this watch channel
 *  - X-Goog-Resource-ID: opaque ID representing the watched resource
 *  - X-Goog-Resource-State: "exists" | "sync" | "not_exists"
 *  - X-Goog-Message-Number: increasing counter
 *  - X-Goog-Channel-Expiration: RFC3339 timestamp
 * Optionally:
 *  - X-Goog-Channel-Token: your secret token for validation (set it when creating the watch)
 *
 * On receive:
 *  - Validate token (if set)
 *  - Look up the channel by X-Goog-Channel-ID (map to user/calendarId/syncToken)
 *  - If state === "sync" -> initial handshake; do nothing or run a full sync
 *  - If state === "exists" -> run incremental sync using stored syncToken; if 410 GONE, full resync then continue
 *  - Respond 200 immediately; do heavy work async
 */
@Controller("/webhooks")
export class CalendarWebhookController {
  constructor(private readonly calSync: CalendarSyncService) {}

  @Post("calendar")
  @HttpCode(200)
  async handleCalendarPush(
    @Req() req: Request,
    @Headers() headers: Record<string, string>
  ): Promise<string> {
    try {
      const channelId = headers["x-goog-channel-id"];
      const resourceId = headers["x-goog-resource-id"];
      const resourceState = headers["x-goog-resource-state"]; // exists | sync | not_exists
      const channelToken = headers["x-goog-channel-token"];
      const messageNumber = headers["x-goog-message-number"];

      if (!channelId || !resourceId) return "missing-ids";

      // Optional: verify your shared secret token to ensure the request is authentic to your watch
      if (process.env.CAL_CHANNEL_TOKEN && channelToken !== process.env.CAL_CHANNEL_TOKEN) {
        console.warn("[CalendarWebhook] Invalid channel token");
        return "invalid-token";
      }

      await this.calSync.enqueueIncrementalSync({
        channelId,
        resourceId,
        resourceState,
        messageNumber: Number(messageNumber || 0)
      });
    } catch (err) {
      console.error("[CalendarWebhook] Error handling push", err);
    }
    return "ok";
  }
}
