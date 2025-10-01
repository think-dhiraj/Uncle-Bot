// Function Declarations for Gemini (Vertex AI / Gemini API)
// Use these in your model config: { tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] }

import { SchemaType } from '@google-cloud/vertexai';

export const FUNCTION_DECLARATIONS = [
  {
    name: "gmail_list_recent",
    description: "List recent Gmail threads/messages for the current user, optionally filtered by label or since a historyId.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        labelIds: {
          type: SchemaType.ARRAY,
          description: "Gmail label IDs to filter (e.g., ['UNREAD']). Optional.",
          items: { type: SchemaType.STRING }
        },
        maxResults: {
          type: SchemaType.INTEGER,
          description: "Max items to return (default 25).",
          minimum: 1,
          maximum: 100
        },
        sinceHistoryId: {
          type: SchemaType.STRING,
          description: "If provided, only return changes since this Gmail historyId."
        }
      }
    }
  },
  {
    name: "gmail_summarize_thread",
    description: "Fetch a Gmail thread and return a concise summary + key metadata.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        threadId: { type: SchemaType.STRING, description: "Gmail thread ID." },
        includeQuotedText: {
          type: SchemaType.BOOLEAN,
          description: "If true, include quoted text in model context when summarizing.",
          default: false
        }
      },
      required: ["threadId"]
    }
  },
  {
    name: "gmail_create_draft",
    description: "Create a Gmail draft (for human approval). Returns draftId.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        threadId: { type: SchemaType.STRING, description: "Optional Gmail thread ID to reply within." },
        to: {
          type: SchemaType.ARRAY,
          description: "List of primary recipients.",
          items: { type: SchemaType.STRING, format: "email" }
        },
        cc: {
          type: SchemaType.ARRAY,
          description: "List of CC recipients.",
          items: { type: SchemaType.STRING, format: "email" }
        },
        bcc: {
          type: SchemaType.ARRAY,
          description: "List of BCC recipients.",
          items: { type: SchemaType.STRING, format: "email" }
        },
        subject: { type: SchemaType.STRING },
        body: {
          type: SchemaType.STRING,
          description: "Email body in HTML or plain text. Prefer HTML if you need formatting."
        },
        referencesMessageId: {
          type: SchemaType.STRING,
          description: "Optional RFC822 Message-Id you're replying to (for better threading)."
        }
      },
      required: ["subject", "body"]
    }
  },
  {
    name: "gmail_send_draft",
    description: "Send a previously created Gmail draft (requires user approval in-app).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        draftId: { type: SchemaType.STRING, description: "Draft ID to send." }
      },
      required: ["draftId"]
    }
  },
  {
    name: "calendar_freebusy",
    description: "Query free/busy for multiple participants over a time window.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        participants: {
          type: SchemaType.ARRAY,
          description: "Email addresses of calendars to check.",
          items: { type: SchemaType.STRING, format: "email" }
        },
        durationMin: {
          type: SchemaType.INTEGER,
          description: "Desired meeting duration in minutes.",
          minimum: 5
        },
        windowStart: {
          type: SchemaType.STRING,
          format: "date-time",
          description: "ISO8601 start of the search window."
        },
        windowEnd: {
          type: SchemaType.STRING,
          format: "date-time",
          description: "ISO8601 end of the search window."
        },
        workingHours: {
          type: SchemaType.OBJECT,
          description: "Optional working-hours hint for each participant.",
          properties: {
            timezone: { type: SchemaType.STRING, description: "IANA tz, e.g., 'America/New_York'." },
            startHour: { type: SchemaType.INTEGER, minimum: 0, maximum: 23 },
            endHour: { type: SchemaType.INTEGER, minimum: 1, maximum: 24 }
          }
        },
        slotGranularityMin: {
          type: SchemaType.INTEGER,
          description: "Round candidate start times to this many minutes (e.g., 15).",
          default: 15
        },
        maxCandidates: {
          type: SchemaType.INTEGER,
          description: "Maximum candidate slots to return.",
          default: 10,
          minimum: 1,
          maximum: 50
        }
      },
      required: ["participants", "durationMin", "windowStart", "windowEnd"]
    }
  },
  {
    name: "calendar_create_event",
    description: "Create a calendar event and invite attendees.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
        start: { type: SchemaType.STRING, format: "date-time" },
        end: { type: SchemaType.STRING, format: "date-time" },
        attendees: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              email: { type: SchemaType.STRING, format: "email" },
              optional: { type: SchemaType.BOOLEAN, default: false }
            },
            required: ["email"]
          }
        },
        location: { type: SchemaType.STRING },
        conference: {
          type: SchemaType.OBJECT,
          description: "Optional video conference details to create (e.g., Google Meet).",
          properties: {
            create: { type: SchemaType.BOOLEAN, default: true }
          }
        },
        visibility: {
          type: SchemaType.STRING,
          enum: ["default", "private", "public"],
          default: "default"
        }
      },
      required: ["title", "start", "end"]
    }
  },
  {
    name: "set_out_of_office",
    description: "Set an automatic out-of-office responder for Gmail for a time window.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start: { type: SchemaType.STRING, format: "date-time" },
        end: { type: SchemaType.STRING, format: "date-time" },
        subject: { type: SchemaType.STRING },
        message: { type: SchemaType.STRING },
        internalOnly: {
          type: SchemaType.BOOLEAN,
          description: "If true, only auto-respond to people inside the domain.",
          default: false
        }
      },
      required: ["start", "end", "subject", "message"]
    }
  },
  {
    name: "remember",
    description: "Store a memory item with a key/value in a defined scope.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        scope: { type: SchemaType.STRING, enum: ["personal", "thread", "org"], default: "personal" },
        key: { type: SchemaType.STRING },
        value: { type: SchemaType.STRING },
        threadId: { type: SchemaType.STRING, description: "Required if scope is 'thread'." }
      },
      required: ["scope", "key", "value"]
    }
  },
  {
    name: "search_memory",
    description: "Semantic + keyword search of prior notes/memories.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        scope: { type: SchemaType.STRING, enum: ["personal", "thread", "org"], default: "personal" },
        threadId: { type: SchemaType.STRING, description: "If scope=thread, the thread to search within." },
        topK: { type: SchemaType.INTEGER, default: 5, minimum: 1, maximum: 50 }
      },
      required: ["query"]
    }
  },
  {
    name: "start_automation",
    description: "Start a durable automation (Temporal workflow).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          enum: ["follow_up_on_thread", "daily_digest", "ooo_window", "watch_calendar_changes", "watch_gmail_inbox"]
        },
        params: { type: "object", additionalProperties: true }
      },
      required: ["name", "params"]
    }
  },
  {
    name: "stop_automation",
    description: "Stop a running automation by ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        automationId: { type: SchemaType.STRING }
      },
      required: ["automationId"]
    }
  }
] as const;

// Helper function to create a tool configuration for Gemini
export function createToolConfig() {
  return {
    functionDeclarations: FUNCTION_DECLARATIONS
  };
}

// Type definitions for function parameters
export type GmailListRecentParams = {
  labelIds?: string[];
  maxResults?: number;
  sinceHistoryId?: string;
};

export type GmailSummarizeThreadParams = {
  threadId: string;
  includeQuotedText?: boolean;
};

export type GmailCreateDraftParams = {
  threadId?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  referencesMessageId?: string;
};

export type GmailSendDraftParams = {
  draftId: string;
};

export type CalendarFreeBusyParams = {
  participants: string[];
  durationMin: number;
  windowStart: string;
  windowEnd: string;
  workingHours?: {
    timezone?: string;
    startHour?: number;
    endHour?: number;
  };
  slotGranularityMin?: number;
  maxCandidates?: number;
};

export type CalendarCreateEventParams = {
  title: string;
  description?: string;
  start: string;
  end: string;
  attendees?: Array<{
    email: string;
    optional?: boolean;
  }>;
  location?: string;
  conference?: {
    create?: boolean;
  };
  visibility?: 'default' | 'private' | 'public';
};

export type SetOutOfOfficeParams = {
  start: string;
  end: string;
  subject: string;
  message: string;
  internalOnly?: boolean;
};

export type RememberParams = {
  scope: 'personal' | 'thread' | 'org';
  key: string;
  value: string;
  threadId?: string;
};

export type SearchMemoryParams = {
  query: string;
  scope?: 'personal' | 'thread' | 'org';
  threadId?: string;
  topK?: number;
};

export type StartAutomationParams = {
  name: 'follow_up_on_thread' | 'daily_digest' | 'ooo_window' | 'watch_calendar_changes' | 'watch_gmail_inbox';
  params: Record<string, any>;
};

export type StopAutomationParams = {
  automationId: string;
};

// Union type for all function call parameters
export type FunctionCallParams = 
  | { name: 'gmail_list_recent'; args: GmailListRecentParams }
  | { name: 'gmail_summarize_thread'; args: GmailSummarizeThreadParams }
  | { name: 'gmail_create_draft'; args: GmailCreateDraftParams }
  | { name: 'gmail_send_draft'; args: GmailSendDraftParams }
  | { name: 'calendar_freebusy'; args: CalendarFreeBusyParams }
  | { name: 'calendar_create_event'; args: CalendarCreateEventParams }
  | { name: 'set_out_of_office'; args: SetOutOfOfficeParams }
  | { name: 'remember'; args: RememberParams }
  | { name: 'search_memory'; args: SearchMemoryParams }
  | { name: 'start_automation'; args: StartAutomationParams }
  | { name: 'stop_automation'; args: StopAutomationParams };
