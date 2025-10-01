// JSON Schemas for Gemini Structured Output (responseSchema)

export const PRIORITY_CLASSIFIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    priority: {
      type: "string",
      description: "Urgency bucket for the message/thread.",
      enum: ["P0", "P1", "P2", "P3"]
    },
    intent: {
      type: "string",
      description: "High-level intent of the latest inbound message.",
      enum: ["request", "approval", "decision_needed", "status_update", "scheduling", "newsletter", "promo", "noise"]
    },
    reasons: {
      type: "array",
      description: "Short explanations of why this priority/intent was chosen.",
      items: { type: "string" },
      minItems: 1
    },
    suggestedActions: {
      type: "array",
      description: "Assistant-suggested next actions.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          action: { type: "string", enum: ["draft_reply", "schedule", "snooze", "mark_done", "follow_up_timer"] },
          data: { type: "object", additionalProperties: true }
        },
        required: ["label", "action"]
      },
      default: []
    }
  },
  required: ["priority", "intent", "reasons"]
} as const;

export const SLOT_CANDIDATES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    window: {
      type: "object",
      additionalProperties: false,
      properties: {
        start: { type: "string", format: "date-time" },
        end: { type: "string", format: "date-time" },
        timezone: { type: "string", description: "IANA timezone for display consistency." }
      },
      required: ["start", "end"]
    },
    participants: {
      type: "array",
      items: { type: "string", format: "email" },
      minItems: 1
    },
    durationMin: { type: "integer", minimum: 5 },
    candidates: {
      type: "array",
      description: "Ranked slot candidates (best-first).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          start: { type: "string", format: "date-time" },
          end: { type: "string", format: "date-time" },
          score: { type: "number", description: "Higher is better." },
          reasons: { type: "array", items: { type: "string" } }
        },
        required: ["start", "end", "score"]
      }
    },
    notes: { type: "array", items: { type: "string" }, default: [] }
  },
  required: ["window", "participants", "durationMin", "candidates"]
} as const;

export const DRAFT_REPLY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    threadId: { type: "string", description: "If replying in-thread." },
    subject: { type: "string" },
    tone: { type: "string", enum: ["neutral", "concise", "friendly", "formal", "apologetic", "assertive"], default: "concise" },
    summaryBullets: {
      type: "array",
      description: "Bulleted summary of the reply.",
      items: { type: "string" }
    },
    actions: {
      type: "array",
      description: "Decisions/asks to include (checkbox-style).",
      items: { type: "string" },
      default: []
    },
    to: { type: "array", items: { type: "string", format: "email" } },
    cc: { type: "array", items: { type: "string", format: "email" }, default: [] },
    bcc: { type: "array", items: { type: "string", format: "email" }, default: [] },
    bodyHtml: {
      type: "string",
      description: "Suggested HTML body. Keep links explicit. Include clear next steps."
    },
    sendMode: {
      type: "string",
      enum: ["create_draft_only", "ready_to_send_with_approval"],
      default: "create_draft_only"
    }
  },
  required: ["subject", "bodyHtml"]
} as const;

// Type definitions for the schemas
export type PriorityClassifierResult = {
  priority: "P0" | "P1" | "P2" | "P3";
  intent: "request" | "approval" | "decision_needed" | "status_update" | "scheduling" | "newsletter" | "promo" | "noise";
  reasons: string[];
  suggestedActions?: Array<{
    label: string;
    action: "draft_reply" | "schedule" | "snooze" | "mark_done" | "follow_up_timer";
    data?: Record<string, any>;
  }>;
};

export type SlotCandidatesResult = {
  window: {
    start: string;
    end: string;
    timezone?: string;
  };
  participants: string[];
  durationMin: number;
  candidates: Array<{
    start: string;
    end: string;
    score: number;
    reasons?: string[];
  }>;
  notes?: string[];
};

export type DraftReplyPlanResult = {
  threadId?: string;
  subject: string;
  tone?: "neutral" | "concise" | "friendly" | "formal" | "apologetic" | "assertive";
  summaryBullets?: string[];
  actions?: string[];
  to?: string[];
  cc?: string[];
  bcc?: string[];
  bodyHtml: string;
  sendMode?: "create_draft_only" | "ready_to_send_with_approval";
};

// Helper functions to use the schemas
export function createPriorityClassifierConfig() {
  return {
    responseSchema: PRIORITY_CLASSIFIER_SCHEMA,
    responseMimeType: 'application/json'
  };
}

export function createSlotCandidatesConfig() {
  return {
    responseSchema: SLOT_CANDIDATES_SCHEMA,
    responseMimeType: 'application/json'
  };
}

export function createDraftReplyPlanConfig() {
  return {
    responseSchema: DRAFT_REPLY_PLAN_SCHEMA,
    responseMimeType: 'application/json'
  };
}

// Schema registry for easy access
export const SCHEMAS = {
  PRIORITY_CLASSIFIER: PRIORITY_CLASSIFIER_SCHEMA,
  SLOT_CANDIDATES: SLOT_CANDIDATES_SCHEMA,
  DRAFT_REPLY_PLAN: DRAFT_REPLY_PLAN_SCHEMA,
} as const;

// Configuration helpers
export const SCHEMA_CONFIGS = {
  PRIORITY_CLASSIFIER: createPriorityClassifierConfig(),
  SLOT_CANDIDATES: createSlotCandidatesConfig(),
  DRAFT_REPLY_PLAN: createDraftReplyPlanConfig(),
} as const;
