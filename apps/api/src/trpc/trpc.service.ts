import { Injectable } from '@nestjs/common';
import { initTRPC, TRPCError } from '@trpc/server';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

export interface Context {
  user?: any;
  req?: any;
  res?: any;
}

@Injectable()
export class TrpcService {
  trpc = initTRPC.context<Context>().create();
  
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  get db() {
    return this.databaseService;
  }

  // Middleware for authentication
  isAuthed = this.trpc.middleware(async ({ next, ctx }) => {
    const authHeader = ctx.req?.headers?.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const token = authHeader.substring(7);
    
    try {
      // Validate JWT token (simplified - in real app use passport strategy)
      const payload = this.jwtService.verify(token);
      const user = await this.authService.validateJwtPayload(payload);
      
      return next({
        ctx: {
          ...ctx,
          user,
        },
      });
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      });
    }
  });

  // Base procedures
  publicProcedure = this.trpc.procedure;
  protectedProcedure = this.trpc.procedure.use(this.isAuthed);

  // Common schemas
  schemas = {
    pagination: z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }),
    
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    
    emailFilter: z.object({
      unread: z.boolean().optional(),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
      from: z.string().optional(),
      subject: z.string().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }),

    automationType: z.enum([
      'FOLLOW_UP_REMINDER',
      'DAILY_DIGEST',
      'OUT_OF_OFFICE',
      'SMART_REPLY',
      'CALENDAR_SCHEDULING',
    ]),

    taskStatus: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  };

  // Helper functions
  helpers = {
    formatError: (error: any) => {
      console.error('tRPC Error:', error);
      
      if (error.code === 'P2002') {
        return new TRPCError({
          code: 'CONFLICT',
          message: 'Resource already exists',
        });
      }

      if (error.code === 'P2025') {
        return new TRPCError({
          code: 'NOT_FOUND',
          message: 'Resource not found',
        });
      }

      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
    },

    getPaginationParams: (page: number, limit: number) => ({
      skip: (page - 1) * limit,
      take: limit,
    }),
  };
}
