import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { GmailSyncService } from "../gmail/gmail-sync.service";

/**
 * Google Pub/Sub push endpoint for Gmail 'users.watch' notifications.
 * Data shape: { message: { data: base64, messageId, publishTime }, subscription }
 * The base64-encoded 'data' contains JSON: { emailAddress: string, historyId: string }
 * - Store latest historyId per-user (by emailAddress).
 * - Trigger incremental sync via users.history.list from the stored historyId.
 * - If gaps/stale, run a one-time full resync, then resume incremental.
 */
@Controller("/webhooks")
export class GmailWebhookController {
  constructor(private readonly gmailSync: GmailSyncService) {}

  @Post("gmail")
  @HttpCode(200) // Acknowledge ASAP; do the heavy work async
  async handleGmailPush(
    @Body() body: any,
    @Headers() headers: Record<string, string>
  ): Promise<string> {
    try {
      const message = body?.message;
      if (!message?.data) return "no-message";

      const decoded = JSON.parse(
        Buffer.from(message.data, "base64").toString("utf8")
      ) as { emailAddress?: string; historyId?: string };

      const email = decoded.emailAddress;
      const historyId = decoded.historyId;

      if (!email || !historyId) return "missing-fields";

      // Enqueue/dispatch an incremental sync task (Temporal, Bull, etc.)
      // This should: users.history.list since last known historyId for this user.
      await this.gmailSync.enqueueIncrementalSync(email, historyId, {
        pubsubMessageId: message.messageId,
        publishTime: message.publishTime,
        deliveryAttempt: Number(headers["x-goog-delivery-attempt"] || 1)
      });
    } catch (err) {
      // Log the error; Pub/Sub will retry delivery
      console.error("[GmailWebhook] Error parsing Pub/Sub body", err);
      // Still 200 to avoid hot retry loops; rely on your dead-letter/retry policy if needed
    }
    return "ok";
  }
}
