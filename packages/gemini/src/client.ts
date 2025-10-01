import { VertexAI, GenerativeModel, FunctionDeclaration, GenerateContentRequest, GenerateContentResult } from '@google-cloud/vertexai';
import { FUNCTION_DECLARATIONS } from './tools';

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    functionCall?: {
      name: string;
      args: Record<string, any>;
    };
    functionResponse?: {
      name: string;
      response: Record<string, any>;
    };
  }>;
}

export interface GeminiTool {
  functionDeclarations: FunctionDeclaration[];
}

export interface GeminiCallOptions {
  messages: GeminiMessage[];
  tools?: GeminiTool[];
  responseSchema?: Record<string, any>;
  stream?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResponse {
  text?: string;
  functionCalls?: Array<{
    name: string;
    args: Record<string, any>;
  }>;
  finishReason?: string;
}

// Available Gemini models with their capabilities
export const GEMINI_MODELS = {
  'gemini-2.5-pro': {
    name: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    maxTokens: 32768,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    description: 'Latest and most capable model with enhanced reasoning',
  },
  'gemini-2.0-flash-exp': {
    name: 'gemini-2.0-flash-exp',
    displayName: 'Gemini 2.0 Flash (Experimental)',
    maxTokens: 8192,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    description: 'Fast experimental model with multimodal capabilities',
  },
  'gemini-1.5-pro': {
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    maxTokens: 8192,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    description: 'Stable production model',
  },
  'gemini-1.5-flash': {
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    maxTokens: 8192,
    supportsFunctionCalling: true,
    supportsStructuredOutput: true,
    description: 'Fast and efficient model for high-throughput tasks',
  },
} as const;

export type GeminiModelName = keyof typeof GEMINI_MODELS;

export interface GeminiClientConfig {
  projectId: string;
  location?: string;
  modelName?: GeminiModelName;
  companyApiKey: string; // Company's master Gemini API key
  customEndpoint?: string; // Optional: custom API endpoint for company instances
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

export class GeminiClient {
  private vertex: VertexAI | null = null;
  private model!: GenerativeModel;
  private modelConfig: typeof GEMINI_MODELS[GeminiModelName];
  private config: Required<GeminiClientConfig>;

  constructor(config: GeminiClientConfig) {
    // Set defaults
    this.config = {
      location: 'us-central1',
      modelName: 'gemini-2.5-pro',
      defaultTemperature: 0.7,
      defaultMaxTokens: 8192,
      customEndpoint: '',
      ...config,
    };

    this.modelConfig = GEMINI_MODELS[this.config.modelName];

    // Initialize with company API key
    this.initializeWithCompanyKey();

    console.log(`[Gemini] Initialized ${this.modelConfig.displayName} with company API key`);
  }

  private initializeWithCompanyKey() {
    const maxTokens = Math.min(
      this.config.defaultMaxTokens,
      this.modelConfig.maxTokens
    );

    if (this.config.customEndpoint) {
      // Using company's custom Gemini instance
      console.log(`[Gemini] Using company instance at ${this.config.customEndpoint}`);
      // Custom endpoint implementation would go here
      // For now, use Vertex AI as fallback
    }

    // Use Vertex AI with company's project and API key
    this.vertex = new VertexAI({
      project: this.config.projectId,
      location: this.config.location,
    });

    this.model = this.vertex.getGenerativeModel({
      model: this.modelConfig.name,
      generationConfig: {
        temperature: this.config.defaultTemperature,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: maxTokens,
      },
    });
  }

  /**
   * Call Gemini with function calling and structured output support
   */
  async callGemini(options: GeminiCallOptions): Promise<GeminiResponse> {
    const { messages, tools, responseSchema, stream = false, temperature, maxOutputTokens } = options;

    // Configure generation settings
    const generationConfig: any = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
      generationConfig.responseMimeType = 'application/json';
    }

    // Prepare the request
    const request: GenerateContentRequest = {
      contents: messages.map(msg => ({
        role: msg.role,
        parts: msg.parts.map(part => {
          if (part.text) {
            return { text: part.text };
          } else if (part.functionCall) {
            return { 
              functionCall: {
                name: part.functionCall.name,
                args: part.functionCall.args
              }
            };
          } else if (part.functionResponse) {
            return {
              functionResponse: {
                name: part.functionResponse.name,
                response: part.functionResponse.response
              }
            };
          }
          return { text: '' };
        }),
      })) as any, // Temporarily use any to bypass type issues
      generationConfig,
    };

    if (tools && tools.length > 0) {
      request.tools = tools;
    }

    try {
      if (stream) {
        return this.handleStreamResponse(await this.model.generateContentStream(request) as any);
      } else {
        const result = await this.model.generateContent(request);
        return this.parseResponse(result.response);
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error(`Gemini API call failed: ${error}`);
    }
  }

  /**
   * Stream Gemini response for real-time updates
   */
  async *streamGemini(options: GeminiCallOptions): AsyncGenerator<GeminiResponse, void, unknown> {
    const streamOptions = { ...options, stream: true };
    const { messages, tools, responseSchema, temperature, maxOutputTokens } = streamOptions;

    const generationConfig: any = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
      generationConfig.responseMimeType = 'application/json';
    }

    const request: GenerateContentRequest = {
      contents: messages.map(msg => ({
        role: msg.role,
        parts: msg.parts,
      })),
      generationConfig,
    };

    if (tools && tools.length > 0) {
      request.tools = tools;
    }

    try {
      const streamResult = await this.model.generateContentStream(request);
      
      for await (const chunk of streamResult.stream) {
        const response = this.parseResponse(chunk);
        if (response.text || response.functionCalls) {
          yield response;
        }
      }
    } catch (error) {
      console.error('Gemini Stream Error:', error);
      throw new Error(`Gemini stream failed: ${error}`);
    }
  }

  /**
   * Get information about the current model
   */
  getModelInfo() {
    return {
      ...this.modelConfig,
      currentConfig: {
        temperature: this.config.defaultTemperature,
        maxTokens: this.config.defaultMaxTokens,
        location: this.config.location,
      },
    };
  }

  /**
   * Get list of all available models
   */
  static getAvailableModels() {
    return Object.values(GEMINI_MODELS);
  }

  /**
   * Check if current model supports a specific feature
   */
  supportsFeature(feature: 'functionCalling' | 'structuredOutput'): boolean {
    switch (feature) {
      case 'functionCalling':
        return this.modelConfig.supportsFunctionCalling;
      case 'structuredOutput':
        return this.modelConfig.supportsStructuredOutput;
      default:
        return false;
    }
  }

  /**
   * Create the standard AI Assistant tool configuration
   * Uses the comprehensive FUNCTION_DECLARATIONS from tools.ts
   */
  createStandardTools(): GeminiTool {
    if (!this.supportsFeature('functionCalling')) {
      console.warn(`[Gemini] Model ${this.modelConfig.name} does not support function calling`);
      return { functionDeclarations: [] };
    }

    return {
      functionDeclarations: [...FUNCTION_DECLARATIONS],
    };
  }

  /**
   * Create email classification tool for priority and intent detection
   * @deprecated Use createStandardTools() instead for comprehensive function support
   */
  createClassificationTool(): GeminiTool {
    return {
      functionDeclarations: [
        {
          name: 'classify_email',
          description: 'Classify email priority and intent',
          parameters: {
            type: 'object',
            properties: {
              priority: {
                type: 'string',
                enum: ['P0', 'P1', 'P2', 'P3'],
                description: 'Email priority: P0=Critical, P1=High, P2=Medium, P3=Low',
              },
              intent: {
                type: 'string',
                description: 'Primary intent of the email',
              },
              reasons: {
                type: 'array',
                items: { type: 'string' },
                description: 'Reasons for the classification',
              },
            },
            required: ['priority', 'intent', 'reasons'],
          },
        },
      ],
    };
  }

  private parseResponse(response: any): GeminiResponse {
    const result: GeminiResponse = {};

    if (response.candidates && response.candidates[0]) {
      const candidate = response.candidates[0];
      
      if (candidate.content && candidate.content.parts) {
        const parts = candidate.content.parts;
        
        // Extract text content
        const textParts = parts.filter((part: any) => part.text);
        if (textParts.length > 0) {
          result.text = textParts.map((part: any) => part.text).join('');
        }

        // Extract function calls
        const functionCalls = parts.filter((part: any) => part.functionCall);
        if (functionCalls.length > 0) {
          result.functionCalls = functionCalls.map((part: any) => ({
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          }));
        }
      }

      result.finishReason = candidate.finishReason;
    }

    return result;
  }

  private async handleStreamResponse(streamResult: GenerateContentResult): Promise<GeminiResponse> {
    let fullText = '';
    let functionCalls: Array<{ name: string; args: Record<string, any> }> = [];
    let finishReason = '';

    for await (const chunk of streamResult.stream) {
      const response = this.parseResponse(chunk);
      if (response.text) {
        fullText += response.text;
      }
      if (response.functionCalls) {
        functionCalls.push(...response.functionCalls);
      }
      if (response.finishReason) {
        finishReason = response.finishReason;
      }
    }

    return {
      text: fullText || undefined,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      finishReason,
    };
  }
}
