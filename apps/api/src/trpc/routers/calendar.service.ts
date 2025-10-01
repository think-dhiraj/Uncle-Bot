import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from '../../auth/auth.service';
import { GeminiFunctionHandlerService } from '../../gemini/gemini-function-handler.service';
// Temporarily commented out due to build issues
// import { 
//   GeminiClient, 
//   SCHEMA_CONFIGS,
//   SlotCandidatesResult 
// } from '@ai-assistant/gemini';

@Injectable()
export class CalendarService {
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private geminiHandler: GeminiFunctionHandlerService,
  ) {}

  async getEvents(userId: string, params: any) {
    try {
      const result = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'calendar_freebusy',
        args: {
          participants: [await this.getUserEmail(userId)],
          durationMin: 60, // Default duration for listing
          windowStart: params.start,
          windowEnd: params.end,
        },
      });

      // Log the request
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'calendar.get_events',
          metadata: {
            calendarId: params.calendarId,
            start: params.start,
            end: params.end,
          },
        },
      });

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch calendar events',
      });
    }
  }

  async getFreeBusy(userId: string, params: any) {
    try {
      const result = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'calendar_freebusy',
        args: {
          participants: params.attendees,
          durationMin: 30, // Default meeting duration
          windowStart: params.start,
          windowEnd: params.end,
        },
      });

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get free/busy information',
      });
    }
  }

  async findAvailableSlots(userId: string, params: any) {
    try {
      // Get raw free/busy data
      const freeBusyResult = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'calendar_freebusy',
        args: {
          participants: params.attendees,
          durationMin: params.duration,
          windowStart: params.start,
          windowEnd: params.end,
          workingHours: params.workingHours,
          maxCandidates: 10,
        },
      });

      // Use AI to analyze and rank the slots intelligently
      const geminiClient = new GeminiClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT!,
        location: process.env.GEMINI_LOCATION || 'us-central1',
        modelName: (process.env.GEMINI_MODEL as any) || 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        defaultTemperature: 0.2, // Low temperature for consistent scheduling logic
        defaultMaxTokens: 2048,
      });

      const analysisPrompt = `Analyze these available time slots and rank them by quality:

Participants: ${params.attendees.join(', ')}
Duration needed: ${params.duration} minutes
Search window: ${params.start} to ${params.end}
Working hours: ${params.workingHours ? `${params.workingHours.start}-${params.workingHours.end}` : '9:00-17:00'}

Available slots: ${JSON.stringify(freeBusyResult.availableSlots || [])}

Rank the slots considering:
1. Time of day preferences (mid-morning/early afternoon best)
2. Avoiding lunch hours (12-13)
3. Buffer time between meetings
4. Timezone considerations for participants

Provide ranked candidates with scores and reasoning.`;

      const analysisResponse = await geminiClient.callGemini({
        messages: [
          {
            role: 'user',
            parts: [{ text: analysisPrompt }],
          },
        ],
        ...SCHEMA_CONFIGS.SLOT_CANDIDATES,
        temperature: 0.2,
      });

      let structuredResult: SlotCandidatesResult | null = null;
      if (analysisResponse.text) {
        try {
          structuredResult = JSON.parse(analysisResponse.text);
        } catch (e) {
          console.error('Failed to parse slot analysis:', e);
        }
      }

      // Log the scheduling request
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'calendar.find_slots',
          metadata: {
            attendees: params.attendees,
            duration: params.duration,
            slotsFound: structuredResult?.candidates?.length || freeBusyResult.availableSlots?.length || 0,
          },
        },
      });

      return {
        availableSlots: structuredResult?.candidates || freeBusyResult.availableSlots || [],
        participants: params.attendees,
        duration: params.duration,
        searchWindow: {
          start: params.start,
          end: params.end,
        },
        aiAnalysis: structuredResult ? {
          notes: structuredResult.notes,
          totalCandidates: structuredResult.candidates.length,
        } : undefined,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to find available slots',
      });
    }
  }

  async createEvent(userId: string, eventData: any) {
    try {
      const result = await this.geminiHandler.handleFunctionCall(userId, {
        name: 'calendar_create_event',
        args: {
          title: eventData.summary,
          description: eventData.description,
          start: eventData.start.dateTime,
          end: eventData.end.dateTime,
          attendees: eventData.attendees,
          location: eventData.location,
        },
      });

      // Create a task to follow up on this meeting if needed
      if (eventData.attendees && eventData.attendees.length > 0) {
        await this.databaseService.task.create({
          data: {
            userId,
            type: 'CALENDAR_EVENT',
            title: `Follow up on: ${eventData.summary}`,
            description: `Meeting scheduled for ${eventData.start.dateTime}`,
            priority: 'P2',
            dueDate: new Date(new Date(eventData.start.dateTime).getTime() + 24 * 60 * 60 * 1000), // Next day
            data: {
              eventId: result.eventId,
              originalEvent: eventData,
            },
          },
        });
      }

      return result;
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create calendar event',
      });
    }
  }

  private async getUserEmail(userId: string): Promise<string> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return user.email;
  }
}
