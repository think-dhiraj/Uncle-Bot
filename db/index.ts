import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export * from '@prisma/client';
export type { 
  User, 
  OAuthToken, 
  Thread, 
  Message, 
  Embedding, 
  Automation, 
  Task, 
  Notification, 
  AuditLog,
  Priority,
  AutomationType,
  TaskType,
  TaskStatus,
  NotificationType
} from '@prisma/client';
