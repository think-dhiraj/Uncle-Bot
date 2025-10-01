// Temporarily comment out problematic exports
// export { 
//   GeminiClient, 
//   GEMINI_MODELS,
//   type GeminiModelName,
//   type GeminiClientConfig 
// } from './client';
export { 
  SimpleGeminiClient,
  type SimpleGeminiMessage,
  type SimpleGeminiResponse 
} from './simple-client';
// export { GeminiLiveAPIClient } from './live-api';
// export { 
//   FUNCTION_DECLARATIONS, 
//   createToolConfig 
// } from './tools';
// export {
//   PRIORITY_CLASSIFIER_SCHEMA,
//   SLOT_CANDIDATES_SCHEMA,
//   DRAFT_REPLY_PLAN_SCHEMA,
//   SCHEMAS,
//   SCHEMA_CONFIGS,
//   createPriorityClassifierConfig,
//   createSlotCandidatesConfig,
//   createDraftReplyPlanConfig,
// } from './schemas';

export type {
  GeminiMessage,
  GeminiTool,
  GeminiCallOptions,
  GeminiResponse,
} from './client';

export type {
  LiveAPIConfig,
  LiveAPIMessage,
} from './live-api';

export type {
  GmailListRecentParams,
  GmailSummarizeThreadParams,
  GmailCreateDraftParams,
  GmailSendDraftParams,
  CalendarFreeBusyParams,
  CalendarCreateEventParams,
  SetOutOfOfficeParams,
  RememberParams,
  SearchMemoryParams,
  StartAutomationParams,
  StopAutomationParams,
  FunctionCallParams,
} from './tools';

export type {
  PriorityClassifierResult,
  SlotCandidatesResult,
  DraftReplyPlanResult,
} from './schemas';
