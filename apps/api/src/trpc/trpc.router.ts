import { Injectable } from '@nestjs/common';
import { TrpcService } from './trpc.service';
import { EmailService } from './routers/email.service';
import { CalendarService } from './routers/calendar.service';
import { AutomationService } from './routers/automation.service';
import { ChatService } from '../chat/chat.service';
import { UserApiKeyService } from '../user-api-key/user-api-key.service';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';
import { PersonalityService } from '../personality/personality.service';
import { PersonalitySettingsService } from '../personality/personality-settings.service';
import { SmartContextService } from '../memory/smart-context.service';
import { MemoryCompressionService } from '../memory/memory-compression.service';
import { MemoryAnalyticsService } from '../memory/memory-analytics.service';
import { z } from 'zod';

@Injectable()
export class TrpcRouter {
  constructor(
    private readonly trpc: TrpcService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly automationService: AutomationService,
    private readonly chatService: ChatService,
    private readonly userApiKeyService: UserApiKeyService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly personalityService: PersonalityService,
    private readonly personalitySettingsService: PersonalitySettingsService,
    private readonly smartContextService: SmartContextService,
    private readonly memoryCompressionService: MemoryCompressionService,
    private readonly memoryAnalyticsService: MemoryAnalyticsService,
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

      // API Key management
      setApiKey: this.trpc.protectedProcedure
        .input(z.object({
          apiKey: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
          await this.userApiKeyService.storeApiKey(ctx.user.id, input.apiKey);
          return { success: true, message: 'API key stored successfully' };
        }),

      testApiKey: this.trpc.protectedProcedure
        .input(z.object({
          apiKey: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userApiKeyService.validateApiKey(input.apiKey);
        }),

      getApiKeyStatus: this.trpc.protectedProcedure
        .query(async ({ ctx }) => {
          return await this.userApiKeyService.getApiKeyStatus(ctx.user.id);
        }),

      removeApiKey: this.trpc.protectedProcedure
        .mutation(async ({ ctx }) => {
          await this.userApiKeyService.removeApiKey(ctx.user.id);
          return { success: true, message: 'API key removed successfully' };
        }),

      // User Preferences management
      getPreferences: this.trpc.protectedProcedure
        .query(async ({ ctx }) => {
          return await this.userPreferencesService.getPreferences(ctx.user.id);
        }),

      createPreferences: this.trpc.protectedProcedure
        .input(z.object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
          language: z.string().optional(),
          timezone: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userPreferencesService.createPreferences(ctx.user.id, input);
        }),

      updatePreferences: this.trpc.protectedProcedure
        .input(z.object({
          theme: z.enum(['light', 'dark', 'system']).optional(),
          language: z.string().optional(),
          timezone: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userPreferencesService.updatePreferences(ctx.user.id, input);
        }),

      updateTheme: this.trpc.protectedProcedure
        .input(z.object({
          theme: z.enum(['light', 'dark', 'system']),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userPreferencesService.updateTheme(ctx.user.id, input.theme);
        }),

      updateLanguage: this.trpc.protectedProcedure
        .input(z.object({
          language: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userPreferencesService.updateLanguage(ctx.user.id, input.language);
        }),

      updateTimezone: this.trpc.protectedProcedure
        .input(z.object({
          timezone: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await this.userPreferencesService.updateTimezone(ctx.user.id, input.timezone);
        }),

      resetPreferences: this.trpc.protectedProcedure
        .mutation(async ({ ctx }) => {
          return await this.userPreferencesService.resetToDefaults(ctx.user.id);
        }),

      getAvailableThemes: this.trpc.protectedProcedure
        .query(async ({ ctx }) => {
          return this.userPreferencesService.getAvailableThemes();
        }),

      getAvailableLanguages: this.trpc.protectedProcedure
        .query(async ({ ctx }) => {
          return this.userPreferencesService.getAvailableLanguages();
        }),

      getAvailableTimezones: this.trpc.protectedProcedure
        .query(async ({ ctx }) => {
          return this.userPreferencesService.getAvailableTimezones();
        }),
    }),

    // Email routes
    email: this.trpc.trpc.router({
      list: this.trpc.protectedProcedure
        .input(z.object({
          ...this.trpc.schemas.pagination.shape,
          ...this.trpc.schemas.emailFilter.shape,
        }))
        .query(({ ctx, input }) => 
          this.emailService.listEmails(ctx.user.id, input)
        ),

      get: this.trpc.protectedProcedure
        .input(z.object({ threadId: z.string() }))
        .query(({ ctx, input }) => 
          this.emailService.getThread(ctx.user.id, input.threadId)
        ),

      markAsRead: this.trpc.protectedProcedure
        .input(z.object({ threadId: z.string() }))
        .mutation(({ ctx, input }) => 
          this.emailService.markAsRead(ctx.user.id, input.threadId)
        ),

      summarize: this.trpc.protectedProcedure
        .input(z.object({ 
          threadIds: z.array(z.string()).max(10),
          generateReplies: z.boolean().default(false),
        }))
        .mutation(({ ctx, input }) => 
          this.emailService.summarizeEmails(ctx.user.id, input.threadIds, input.generateReplies)
        ),

      createDraft: this.trpc.protectedProcedure
        .input(z.object({
          to: z.array(z.string().email()),
          cc: z.array(z.string().email()).optional(),
          bcc: z.array(z.string().email()).optional(),
          subject: z.string(),
          body: z.string(),
          threadId: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.emailService.createDraft(ctx.user.id, input)
        ),

      sendDraft: this.trpc.protectedProcedure
        .input(z.object({ draftId: z.string() }))
        .mutation(({ ctx, input }) => 
          this.emailService.sendDraft(ctx.user.id, input.draftId)
        ),

      classify: this.trpc.protectedProcedure
        .input(z.object({ threadId: z.string() }))
        .mutation(({ ctx, input }) => 
          this.emailService.classifyEmail(ctx.user.id, input.threadId)
        ),
    }),

    // Calendar routes
    calendar: this.trpc.trpc.router({
      events: this.trpc.protectedProcedure
        .input(z.object({
          start: z.string().datetime(),
          end: z.string().datetime(),
          calendarId: z.string().default('primary'),
        }))
        .query(({ ctx, input }) => 
          this.calendarService.getEvents(ctx.user.id, input)
        ),

      freeBusy: this.trpc.protectedProcedure
        .input(z.object({
          attendees: z.array(z.string().email()),
          start: z.string().datetime(),
          end: z.string().datetime(),
        }))
        .query(({ ctx, input }) => 
          this.calendarService.getFreeBusy(ctx.user.id, input)
        ),

      findSlots: this.trpc.protectedProcedure
        .input(z.object({
          attendees: z.array(z.string().email()),
          duration: z.number().min(15).max(480), // 15 minutes to 8 hours
          start: z.string().datetime(),
          end: z.string().datetime(),
          workingHours: z.object({
            start: z.string().regex(/^\d{2}:\d{2}$/),
            end: z.string().regex(/^\d{2}:\d{2}$/),
          }).optional(),
        }))
        .query(({ ctx, input }) => 
          this.calendarService.findAvailableSlots(ctx.user.id, input)
        ),

      createEvent: this.trpc.protectedProcedure
        .input(z.object({
          summary: z.string(),
          description: z.string().optional(),
          start: z.object({
            dateTime: z.string().datetime(),
            timeZone: z.string().optional(),
          }),
          end: z.object({
            dateTime: z.string().datetime(),
            timeZone: z.string().optional(),
          }),
          attendees: z.array(z.object({
            email: z.string().email(),
          })).optional(),
          location: z.string().optional(),
          calendarId: z.string().default('primary'),
        }))
        .mutation(({ ctx, input }) => 
          this.calendarService.createEvent(ctx.user.id, input)
        ),
    }),

    // Automation routes
    automation: this.trpc.trpc.router({
      list: this.trpc.protectedProcedure
        .input(this.trpc.schemas.pagination)
        .query(({ ctx, input }) => 
          this.automationService.listAutomations(ctx.user.id, input)
        ),

      create: this.trpc.protectedProcedure
        .input(z.object({
          name: z.string(),
          description: z.string().optional(),
          type: this.trpc.schemas.automationType,
          config: z.record(z.any()),
          threadId: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.automationService.createAutomation(ctx.user.id, input)
        ),

      update: this.trpc.protectedProcedure
        .input(z.object({
          id: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          config: z.record(z.any()).optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.automationService.updateAutomation(ctx.user.id, input)
        ),

      delete: this.trpc.protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => 
          this.automationService.deleteAutomation(ctx.user.id, input.id)
        ),
    }),

    // Task routes
    task: this.trpc.trpc.router({
      list: this.trpc.protectedProcedure
        .input(z.object({
          ...this.trpc.schemas.pagination.shape,
          status: this.trpc.schemas.taskStatus.optional(),
          priority: this.trpc.schemas.priority.optional(),
        }))
        .query(({ ctx, input }) => 
          this.automationService.listTasks(ctx.user.id, input)
        ),

      update: this.trpc.protectedProcedure
        .input(z.object({
          id: z.string(),
          status: this.trpc.schemas.taskStatus.optional(),
          priority: this.trpc.schemas.priority.optional(),
          dueDate: z.string().datetime().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.automationService.updateTask(ctx.user.id, input)
        ),

      complete: this.trpc.protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => 
          this.automationService.completeTask(ctx.user.id, input.id)
        ),
    }),

    // Notification routes
    notification: this.trpc.trpc.router({
      list: this.trpc.protectedProcedure
        .input(z.object({
          ...this.trpc.schemas.pagination.shape,
          unread: z.boolean().optional(),
        }))
        .query(({ ctx, input }) => 
          this.automationService.listNotifications(ctx.user.id, input)
        ),

      markAsRead: this.trpc.protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => 
          this.automationService.markNotificationAsRead(ctx.user.id, input.id)
        ),

      markAllAsRead: this.trpc.protectedProcedure
        .mutation(({ ctx }) => 
          this.automationService.markAllNotificationsAsRead(ctx.user.id)
        ),
    }),

    // Chat routes
    chat: this.trpc.trpc.router({
      send: this.trpc.protectedProcedure
        .input(z.object({
          message: z.string().min(1).max(2000),
          sessionId: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.chatService.sendMessage(ctx.user.id, input.message, input.sessionId)
        ),

      sessions: this.trpc.protectedProcedure
        .query(({ ctx }) => 
          this.chatService.getChatSessions(ctx.user.id)
        ),

      getSession: this.trpc.protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }) => 
          this.chatService.getChatSession(ctx.user.id, input.sessionId)
        ),

      // Enhanced session management
      updateSessionTitle: this.trpc.protectedProcedure
        .input(z.object({
          sessionId: z.string(),
          title: z.string().min(1).max(100),
        }))
        .mutation(({ ctx, input }) => 
          this.chatService.updateChatSessionTitle(ctx.user.id, input.sessionId, input.title)
        ),

      deactivateSession: this.trpc.protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(({ ctx, input }) => 
          this.chatService.deactivateChatSession(ctx.user.id, input.sessionId)
        ),

      deleteSession: this.trpc.protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(({ ctx, input }) => 
          this.chatService.deleteChatSession(ctx.user.id, input.sessionId)
        ),

      getActiveSession: this.trpc.protectedProcedure
        .query(({ ctx }) => 
          this.chatService.getActiveChatSession(ctx.user.id)
        ),

      getSessionMessageCount: this.trpc.protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }) => 
          this.chatService.getChatSessionMessageCount(ctx.user.id, input.sessionId)
        ),
    }),

    // Personality routes
    personality: this.trpc.trpc.router({
      // Get personality analytics
      getAnalytics: this.trpc.protectedProcedure
        .query(({ ctx }) => 
          this.personalityService.getPersonalityAnalytics(ctx.user.id)
        ),

      // Update personality settings
      updatePersonalitySettings: this.trpc.protectedProcedure
        .input(z.object({
          humorLevel: z.enum(['low', 'medium', 'high']).optional(),
          sarcasmLevel: z.enum(['low', 'medium', 'high']).optional(),
          jokeFrequency: z.enum(['never', 'occasional', 'frequent']).optional(),
          personalityMode: z.enum(['friendly', 'professional', 'witty', 'sarcastic']).optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.personalityService.updatePersonalitySettings(ctx.user.id, input)
        ),

      // Track personality feedback
      trackFeedback: this.trpc.protectedProcedure
        .input(z.object({
          feedback: z.string().min(1).max(1000),
          sessionId: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.personalityService.trackUserReaction(ctx.user.id, input.feedback, undefined, input.sessionId)
        ),

      // Track joke rating
      trackJokeRating: this.trpc.protectedProcedure
        .input(z.object({
          joke: z.string().min(1).max(1000),
          rating: z.number().min(1).max(5),
          sessionId: z.string().optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.personalityService.trackPersonalityInteraction(
            ctx.user.id,
            'JOKE_RATING' as any,
            input.joke,
            { rating: input.rating, timestamp: new Date().toISOString() },
            input.sessionId
          )
        ),

      // Get contextual joke
      getContextualJoke: this.trpc.protectedProcedure
        .input(z.object({
          context: z.string().min(1).max(500),
          sessionId: z.string().optional(),
        }))
        .query(({ ctx, input }) => 
          this.personalityService.getContextualJoke(ctx.user.id, input.context, input.sessionId)
        ),

      // Personality Settings Management
      getSettings: this.trpc.protectedProcedure
        .query(({ ctx }) => 
          this.personalitySettingsService.getPersonalitySettings(ctx.user.id)
        ),

      updateSettings: this.trpc.protectedProcedure
        .input(z.object({
          humorLevel: z.enum(['none', 'low', 'medium', 'high', 'maximum']).optional(),
          sarcasmLevel: z.enum(['none', 'low', 'medium', 'high']).optional(),
          jokeFrequency: z.enum(['never', 'rare', 'occasional', 'frequent', 'always']).optional(),
          personalityMode: z.enum(['professional', 'friendly', 'witty', 'sarcastic', 'hilarious']).optional(),
          emojiUsage: z.enum(['none', 'minimal', 'moderate', 'frequent']).optional(),
          dadJokeLevel: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
        }))
        .mutation(({ ctx, input }) => 
          this.personalitySettingsService.updatePersonalitySettings(ctx.user.id, input)
        ),

      resetSettings: this.trpc.protectedProcedure
        .mutation(({ ctx }) => 
          this.personalitySettingsService.resetPersonalitySettings(ctx.user.id)
        ),

      getPresets: this.trpc.protectedProcedure
        .query(() => 
          this.personalitySettingsService.getPersonalityPresets()
        ),

      applyPreset: this.trpc.protectedProcedure
        .input(z.object({
          presetName: z.enum(['professional', 'friendly', 'witty', 'sarcastic', 'hilarious']),
        }))
        .mutation(({ ctx, input }) => 
          this.personalitySettingsService.applyPersonalityPreset(ctx.user.id, input.presetName)
        ),

           getPersonalityAnalytics: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.personalitySettingsService.getPersonalityAnalytics(ctx.user.id)
             ),
         }),

         // Memory Management routes
         memory: this.trpc.trpc.router({
           // Get memory insights
           getInsights: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.memoryAnalyticsService.getMemoryInsights(ctx.user.id)
             ),

           // Get memory optimization recommendations
           getOptimization: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.memoryAnalyticsService.getMemoryOptimization(ctx.user.id)
             ),

           // Compress session messages
           compressSession: this.trpc.protectedProcedure
             .input(z.object({ sessionId: z.string() }))
             .mutation(({ ctx, input }) => 
               this.memoryCompressionService.compressSessionMessages(input.sessionId)
             ),

           // Compress user's old memories
           compressUserMemories: this.trpc.protectedProcedure
             .mutation(({ ctx }) => 
               this.memoryCompressionService.compressUserMemories(ctx.user.id)
             ),

           // Get compression statistics
           getCompressionStats: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.memoryCompressionService.getCompressionStats(ctx.user.id)
             ),

           // Get memory trends
           getTrends: this.trpc.protectedProcedure
             .input(z.object({ days: z.number().min(1).max(90).default(30) }))
             .query(({ ctx, input }) => 
               this.memoryAnalyticsService.getMemoryTrends(ctx.user.id, input.days)
             ),

           // Optimize memory settings
           optimizeSettings: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.memoryAnalyticsService.optimizeMemorySettings(ctx.user.id)
             ),

           // Get context statistics
           getContextStats: this.trpc.protectedProcedure
             .query(({ ctx }) => 
               this.smartContextService.getContextStats(ctx.user.id)
             ),
         }),
  });

}

export type AppRouter = typeof TrpcRouter.prototype.appRouter;
