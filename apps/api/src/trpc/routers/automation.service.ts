import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { DatabaseService } from '../../database/database.service';
import { GeminiFunctionHandlerService } from '../../gemini/gemini-function-handler.service';

@Injectable()
export class AutomationService {
  constructor(
    private databaseService: DatabaseService,
    private geminiHandler: GeminiFunctionHandlerService,
  ) {}

  async listAutomations(userId: string, pagination: any) {
    try {
      const automations = await this.databaseService.automation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          tasks: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      const total = await this.databaseService.automation.count({
        where: { userId },
      });

      return {
        automations,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch automations',
      });
    }
  }

  async createAutomation(userId: string, automationData: any) {
    try {
      // Create the automation record
      const automation = await this.databaseService.automation.create({
        data: {
          userId,
          name: automationData.name,
          description: automationData.description,
          type: automationData.type,
          config: automationData.config,
          threadId: automationData.threadId,
        },
      });

      // Start the corresponding workflow if it's a workflow-based automation
      if (this.isWorkflowAutomation(automationData.type)) {
        const workflowName = this.getWorkflowName(automationData.type);
        
        const result = await this.geminiHandler.handleFunctionCall(userId, {
          name: 'start_automation',
          args: {
            name: workflowName,
            params: {
              ...automationData.config,
              automationId: automation.id,
              threadId: automationData.threadId,
            },
          },
        });

        // Update automation with workflow ID
        await this.databaseService.automation.update({
          where: { id: automation.id },
          data: {
            config: {
              ...automationData.config,
              workflowId: result.workflowId,
            },
          },
        });
      }

      return automation;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create automation',
      });
    }
  }

  async updateAutomation(userId: string, updateData: any) {
    try {
      const automation = await this.databaseService.automation.findFirst({
        where: {
          id: updateData.id,
          userId,
        },
      });

      if (!automation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Automation not found',
        });
      }

      const updatedAutomation = await this.databaseService.automation.update({
        where: { id: updateData.id },
        data: {
          name: updateData.name ?? automation.name,
          description: updateData.description ?? automation.description,
          config: updateData.config ?? automation.config,
          isActive: updateData.isActive ?? automation.isActive,
        },
      });

      return updatedAutomation;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update automation',
      });
    }
  }

  async deleteAutomation(userId: string, automationId: string) {
    try {
      const automation = await this.databaseService.automation.findFirst({
        where: {
          id: automationId,
          userId,
        },
      });

      if (!automation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Automation not found',
        });
      }

      // Stop the workflow if it exists
      const config = automation.config as any;
      if (config.workflowId) {
        await this.geminiHandler.handleFunctionCall(userId, {
          name: 'stop_automation',
          args: { automationId: config.workflowId },
        });
      }

      // Delete the automation
      await this.databaseService.automation.delete({
        where: { id: automationId },
      });

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete automation',
      });
    }
  }

  async listTasks(userId: string, filters: any) {
    try {
      const whereClause: any = { userId };

      if (filters.status) {
        whereClause.status = filters.status;
      }

      if (filters.priority) {
        whereClause.priority = filters.priority;
      }

      const tasks = await this.databaseService.task.findMany({
        where: whereClause,
        orderBy: [
          { priority: 'asc' }, // P0 first
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          automation: {
            select: {
              name: true,
              type: true,
            },
          },
        },
      });

      const total = await this.databaseService.task.count({ where: whereClause });

      return {
        tasks,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit),
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch tasks',
      });
    }
  }

  async updateTask(userId: string, updateData: any) {
    try {
      const task = await this.databaseService.task.findFirst({
        where: {
          id: updateData.id,
          userId,
        },
      });

      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Task not found',
        });
      }

      const updatedTask = await this.databaseService.task.update({
        where: { id: updateData.id },
        data: {
          status: updateData.status ?? task.status,
          priority: updateData.priority ?? task.priority,
          dueDate: updateData.dueDate ? new Date(updateData.dueDate) : task.dueDate,
          completedAt: updateData.status === 'COMPLETED' ? new Date() : task.completedAt,
        },
      });

      return updatedTask;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update task',
      });
    }
  }

  async completeTask(userId: string, taskId: string) {
    try {
      const task = await this.databaseService.task.findFirst({
        where: {
          id: taskId,
          userId,
        },
      });

      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Task not found',
        });
      }

      const completedTask = await this.databaseService.task.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Log task completion
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'task.completed',
          resource: taskId,
          metadata: {
            title: task.title,
            type: task.type,
            priority: task.priority,
          },
        },
      });

      return completedTask;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to complete task',
      });
    }
  }

  async listNotifications(userId: string, filters: any) {
    try {
      const whereClause: any = { userId };

      if (filters.unread !== undefined) {
        whereClause.read = !filters.unread;
      }

      const notifications = await this.databaseService.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      });

      const total = await this.databaseService.notification.count({ where: whereClause });

      return {
        notifications,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit),
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch notifications',
      });
    }
  }

  async markNotificationAsRead(userId: string, notificationId: string) {
    try {
      const notification = await this.databaseService.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      const updatedNotification = await this.databaseService.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      return updatedNotification;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to mark notification as read',
      });
    }
  }

  async markAllNotificationsAsRead(userId: string) {
    try {
      const result = await this.databaseService.notification.updateMany({
        where: {
          userId,
          read: false,
        },
        data: { read: true },
      });

      return { updatedCount: result.count };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to mark all notifications as read',
      });
    }
  }

  private isWorkflowAutomation(type: string): boolean {
    return ['FOLLOW_UP_REMINDER', 'DAILY_DIGEST', 'OUT_OF_OFFICE'].includes(type);
  }

  private getWorkflowName(type: string): string {
    const workflowMap = {
      'FOLLOW_UP_REMINDER': 'follow_up_on_thread',
      'DAILY_DIGEST': 'daily_digest',
      'OUT_OF_OFFICE': 'ooo_window',
      'SMART_REPLY': 'watch_gmail_inbox',
      'CALENDAR_SCHEDULING': 'watch_calendar_changes',
    };

    return workflowMap[type as keyof typeof workflowMap] || 'follow_up_on_thread';
  }
}
