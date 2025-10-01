import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { GmailWebhookController } from './gmail.controller';
import { CalendarWebhookController } from './calendar.controller';
import { WebhooksService } from './webhooks.service';
import { GmailWebhookService } from './gmail-webhook.service';
import { CalendarWebhookService } from './calendar-webhook.service';
import { GmailModule } from '../gmail/gmail.module';
import { CalendarSyncService } from '../google-calendar/calendar-sync.service';

@Module({
  imports: [GmailModule],
  controllers: [WebhooksController, GmailWebhookController, CalendarWebhookController],
  providers: [
    WebhooksService,
    GmailWebhookService,
    CalendarWebhookService,
    CalendarSyncService,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
