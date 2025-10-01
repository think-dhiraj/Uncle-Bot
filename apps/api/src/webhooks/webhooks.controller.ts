import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GmailWebhookService } from './gmail-webhook.service';
import { CalendarWebhookService } from './calendar-webhook.service';

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
    attributes: Record<string, string>;
  };
  subscription: string;
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private gmailWebhookService: GmailWebhookService,
    private calendarWebhookService: CalendarWebhookService,
  ) {}

  @Post('gmail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Gmail push notifications from Pub/Sub' })
  async handleGmailWebhook(
    @Body() pubsubMessage: PubSubMessage,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      // Decode the Pub/Sub message
      const data = JSON.parse(
        Buffer.from(pubsubMessage.message.data, 'base64').toString()
      );

      await this.gmailWebhookService.handleGmailPushNotification(data);
      
      return { status: 'ok' };
    } catch (error) {
      console.error('Gmail webhook error:', error);
      return { status: 'error', message: error.message };
    }
  }

  @Post('calendar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Calendar push notifications' })
  async handleCalendarWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      // Calendar webhook sends different format than Pub/Sub
      const channelId = headers['x-goog-channel-id'];
      const resourceId = headers['x-goog-resource-id'];
      const resourceState = headers['x-goog-resource-state'];
      const resourceUri = headers['x-goog-resource-uri'];

      await this.calendarWebhookService.handleCalendarPushNotification({
        channelId,
        resourceId,
        resourceState,
        resourceUri,
      });

      return { status: 'ok' };
    } catch (error) {
      console.error('Calendar webhook error:', error);
      return { status: 'error', message: error.message };
    }
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test webhook endpoint' })
  async testWebhook(@Body() body: any) {
    console.log('Test webhook received:', body);
    return { status: 'ok', received: body };
  }
}
