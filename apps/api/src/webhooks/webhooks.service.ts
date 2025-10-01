import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WebhooksService {
  constructor(private databaseService: DatabaseService) {}

  async logWebhookEvent(
    type: 'gmail' | 'calendar',
    userId: string,
    data: any,
  ): Promise<void> {
    await this.databaseService.auditLog.create({
      data: {
        userId,
        action: `webhook.${type}`,
        metadata: data,
      },
    });
  }

  async createNotification(
    userId: string,
    type: 'EMAIL_RECEIVED' | 'CALENDAR_REMINDER' | 'SYSTEM_ALERT',
    title: string,
    message: string,
    data?: any,
  ): Promise<void> {
    await this.databaseService.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data,
      },
    });
  }
}
