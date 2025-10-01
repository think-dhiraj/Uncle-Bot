import { calendar_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string; responseStatus?: string }[];
  location?: string;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface CalendarSyncResult {
  events: calendar_v3.Schema$Event[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

export class CalendarClient {
  private calendar: calendar_v3.Calendar;

  constructor(private auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Set up Calendar push notifications
   * Cite: Calendar push notifications - https://developers.google.com/calendar/api/guides/push
   */
  async watch(calendarId: string, webhookUrl: string, channelId: string): Promise<{
    id: string;
    resourceId: string;
    expiration: string;
  }> {
    const response = await this.calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      },
    });

    return {
      id: response.data.id!,
      resourceId: response.data.resourceId!,
      expiration: response.data.expiration!,
    };
  }

  /**
   * Get free/busy information for scheduling
   * Cite: Calendar freebusy API - https://developers.google.com/calendar/api/v3/reference/freebusy/query
   */
  async freeBusy(
    calendars: string[],
    timeMin: string,
    timeMax: string
  ): Promise<Record<string, FreeBusySlot[]>> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendars.map(id => ({ id })),
      },
    });

    const result: Record<string, FreeBusySlot[]> = {};
    
    for (const [calendarId, busyData] of Object.entries(response.data.calendars || {})) {
      result[calendarId] = (busyData.busy || []).map(slot => ({
        start: slot.start!,
        end: slot.end!,
      }));
    }

    return result;
  }

  /**
   * Create a calendar event
   */
  async createEvent(calendarId: string, event: CalendarEvent): Promise<calendar_v3.Schema$Event> {
    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        attendees: event.attendees,
        location: event.location,
      },
    });

    return response.data;
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    calendarId: string,
    eventId: string,
    event: Partial<CalendarEvent>
  ): Promise<calendar_v3.Schema$Event> {
    const response = await this.calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });

    return response.data;
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  /**
   * Sync calendar events using sync tokens for incremental updates
   * Cite: Calendar sync - https://developers.google.com/calendar/api/guides/sync
   */
  async syncWithToken(
    calendarId: string,
    syncToken?: string,
    pageToken?: string
  ): Promise<CalendarSyncResult> {
    try {
      const response = await this.calendar.events.list({
        calendarId,
        syncToken,
        pageToken,
        maxResults: 250,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return {
        events: response.data.items || [],
        nextSyncToken: response.data.nextSyncToken,
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error: any) {
      // Handle 410 Gone - sync token expired, need full resync
      if (error.code === 410) {
        throw new Error('SYNC_TOKEN_EXPIRED');
      }
      throw error;
    }
  }

  /**
   * Get initial sync token for a calendar
   */
  async getInitialSyncToken(calendarId: string): Promise<string> {
    const response = await this.calendar.events.list({
      calendarId,
      maxResults: 1,
      singleEvents: true,
    });

    return response.data.nextSyncToken!;
  }

  /**
   * List all calendars for the user
   */
  async listCalendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const response = await this.calendar.calendarList.list();
    return response.data.items || [];
  }

  /**
   * Get events in a date range
   */
  async getEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string,
    maxResults: number = 250
  ): Promise<calendar_v3.Schema$Event[]> {
    const response = await this.calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  }

  /**
   * Find available time slots for scheduling
   */
  async findAvailableSlots(
    calendars: string[],
    duration: number, // in minutes
    timeMin: string,
    timeMax: string,
    workingHours: { start: string; end: string } = { start: '09:00', end: '17:00' }
  ): Promise<{ start: string; end: string }[]> {
    const busyTimes = await this.freeBusy(calendars, timeMin, timeMax);
    
    // Combine all busy slots
    const allBusySlots: FreeBusySlot[] = [];
    for (const slots of Object.values(busyTimes)) {
      allBusySlots.push(...slots);
    }

    // Sort busy slots by start time
    allBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Find available slots
    const availableSlots: { start: string; end: string }[] = [];
    const startTime = new Date(timeMin);
    const endTime = new Date(timeMax);
    const durationMs = duration * 60 * 1000;

    let currentTime = startTime;

    for (const busySlot of allBusySlots) {
      const busyStart = new Date(busySlot.start);
      
      // Check if there's a gap before this busy slot
      if (currentTime < busyStart) {
        const availableEnd = new Date(Math.min(busyStart.getTime(), endTime.getTime()));
        const availableDuration = availableEnd.getTime() - currentTime.getTime();
        
        if (availableDuration >= durationMs) {
          // Check if within working hours
          const slotStart = new Date(currentTime);
          const slotEnd = new Date(currentTime.getTime() + durationMs);
          
          if (this.isWithinWorkingHours(slotStart, slotEnd, workingHours)) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }
        }
      }

      currentTime = new Date(Math.max(currentTime.getTime(), new Date(busySlot.end).getTime()));
    }

    // Check for availability after the last busy slot
    if (currentTime < endTime) {
      const availableDuration = endTime.getTime() - currentTime.getTime();
      if (availableDuration >= durationMs) {
        const slotStart = new Date(currentTime);
        const slotEnd = new Date(currentTime.getTime() + durationMs);
        
        if (this.isWithinWorkingHours(slotStart, slotEnd, workingHours)) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }
      }
    }

    return availableSlots.slice(0, 10); // Return top 10 slots
  }

  private isWithinWorkingHours(
    start: Date,
    end: Date,
    workingHours: { start: string; end: string }
  ): boolean {
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const workStart = this.parseTime(workingHours.start);
    const workEnd = this.parseTime(workingHours.end);

    return startHour >= workStart && endHour <= workEnd;
  }

  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  }

  /**
   * Stop watching for push notifications
   */
  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    await this.calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    });
  }
}
