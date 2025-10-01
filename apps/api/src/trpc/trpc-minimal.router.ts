import { Injectable } from '@nestjs/common';
import { TrpcService } from './trpc.service';
import { ChatService } from '../chat/chat.service';
import { z } from 'zod';

@Injectable()
export class TrpcMinimalRouter {
  constructor(
    private readonly trpc: TrpcService,
    private readonly chatService: ChatService,
  ) {}

  appRouter = this.trpc.trpc.router({
    // Health check
    health: this.trpc.publicProcedure
      .query(() => ({ status: 'ok', timestamp: new Date().toISOString() })),

    // User routes
    user: this.trpc.trpc.router({
      me: this.trpc.protectedProcedure
        .query(({ ctx }) => ctx.user),

      updateProfile: this.trpc.protectedProcedure
        .input(z.object({
          name: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return this.trpc.db.user.update({
            where: { id: ctx.user.id },
            data: input,
          });
        }),
    }),

    // Chat routes
    chat: this.trpc.trpc.router({
      send: this.trpc.protectedProcedure
        .input(z.object({
          message: z.string(),
          sessionId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return this.chatService.sendMessage(ctx.user.id, input.message, input.sessionId);
        }),

      sessions: this.trpc.protectedProcedure
        .query(({ ctx }) => this.chatService.getChatSessions(ctx.user.id)),

      getSession: this.trpc.protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }) => 
          this.chatService.getChatSession(ctx.user.id, input.sessionId)
        ),
    }),
  });
}

export type AppRouter = TrpcMinimalRouter['appRouter'];
