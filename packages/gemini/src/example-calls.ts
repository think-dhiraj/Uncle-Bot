import {
  GeminiClient,
  GeminiMessage,
  FUNCTION_DECLARATIONS,
  PRIORITY_CLASSIFIER_SCHEMA,
  SLOT_CANDIDATES_SCHEMA,
  DRAFT_REPLY_PLAN_SCHEMA,
  PriorityClassifierResult,
  SlotCandidatesResult,
  DraftReplyPlanResult,
} from '.';

// This is a placeholder for your actual Gemini client instance
const getGeminiClient = () => new GeminiClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-gcp-project-id',
  location: process.env.GEMINI_LOCATION || 'us-central1',
  modelName: 'gemini-1.5-pro',
  companyApiKey: process.env.COMPANY_GEMINI_API_KEY || 'your-api-key',
});

/**
 * Classifies an email based on its headers and a snippet of its content.
 * @param headersAndSnippet A string containing email headers and a content snippet.
 * @returns A promise that resolves to the classification result.
 */
export async function classifyEmail(headersAndSnippet: string): Promise<PriorityClassifierResult> {
  const gemini = getGeminiClient();
  const messages: GeminiMessage[] = [
    { role: 'user', parts: [{ text: 'Classify the email for urgency and intent, providing structured output.' }] },
    { role: 'user', parts: [{ text: headersAndSnippet }] },
  ];

  const result = await gemini.callGemini({
    messages,
    responseSchema: PRIORITY_CLASSIFIER_SCHEMA,
  });

  return JSON.parse(result.text || '{}') as PriorityClassifierResult;
}

/**
 * Ranks potential meeting slots based on context and a list of raw candidates.
 * @param contextText A string providing context for the scheduling request.
 * @param rawCandidates An array of potential time slots.
 * @returns A promise that resolves to the ranked slot candidates.
 */
export async function rankSlots(contextText: string, rawCandidates: any[]): Promise<SlotCandidatesResult> {
  const gemini = getGeminiClient();
  const messages: GeminiMessage[] = [
    { role: 'user', parts: [{ text: 'Rank the provided slots. Prefer fairness, minimal conflicts, and working hours.' }] },
    { role: 'user', parts: [{ text: JSON.stringify({ context: contextText, rawCandidates }) }] },
  ];

  const result = await gemini.callGemini({
    messages,
    responseSchema: SLOT_CANDIDATES_SCHEMA,
  });

  return JSON.parse(result.text || '{}') as SlotCandidatesResult;
}

/**
 * Plans a draft reply for a given email thread context.
 * @param threadContext A string containing the context of the email thread.
 * @returns A promise that resolves to a planned draft reply.
 */
export async function planDraftReply(threadContext: string): Promise<DraftReplyPlanResult> {
  const gemini = getGeminiClient();
  const messages: GeminiMessage[] = [
    { role: 'user', parts: [{ text: 'Plan a reply. Use a concise, clear business tone unless otherwise stated.' }] },
    { role: 'user', parts: [{ text: threadContext }] },
  ];

  const result = await gemini.callGemini({
    messages,
    responseSchema: DRAFT_REPLY_PLAN_SCHEMA,
  });

  return JSON.parse(result.text || '{}') as DraftReplyPlanResult;
}
