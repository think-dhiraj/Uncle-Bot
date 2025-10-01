import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { GeminiFunctionHandlerService } from '../gemini/gemini-function-handler.service';
import { UserApiKeyService } from '../user-api-key/user-api-key.service';
import { PersonalityService } from '../personality/personality.service';
import { SmartContextService } from '../memory/smart-context.service';
// Enhanced Gemini client with user-specific API key support
class UserGeminiClient {
  constructor(
    private apiKey: string,
    private projectId: string,
    private location: string = 'us-central1',
    private modelName: string = 'gemini-1.5-pro'
  ) {}

  async sendMessages(messages: Array<{ role: 'user' | 'model'; content: string }>): Promise<{ text: string }> {
    if (!this.apiKey) {
      throw new Error('User API key is required for Gemini integration');
    }

    const lastMessage = messages[messages.length - 1];
    const requestBody = {
      contents: [{
        parts: [{
          text: lastMessage.content
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1000,
      }
    };

    console.log('Sending to Gemini with user API key:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return { text: data.candidates[0].content.parts[0].text };
    } else {
      throw new Error('Invalid response format from Gemini API');
    }
  }
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  functionCalls?: Array<{
    name: string;
    args: any;
    result?: any;
  }>;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ChatService {
  constructor(
    private databaseService: DatabaseService,
    private authService: AuthService,
    private geminiHandler: GeminiFunctionHandlerService,
    private userApiKeyService: UserApiKeyService,
    private personalityService: PersonalityService,
    private smartContextService: SmartContextService,
  ) {}

  async sendMessage(userId: string, message: string, sessionId?: string): Promise<{
    response: string;
    functionCalls?: Array<{ name: string; args: any; result: any }>;
    sessionId: string;
  }> {
    try {
      // Get or create chat session using new database models
      const session = sessionId ? 
        await this.getChatSession(userId, sessionId) : 
        await this.createChatSession(userId);

      // Get user's API key
      const userApiKey = await this.userApiKeyService.getApiKey(userId);
      if (!userApiKey) {
        // For dev users, provide a helpful error message
        if (userId === 'dev-user-123') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Dev user API key not found. Please ensure the dev user is properly initialized.',
          });
        }
        
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Gemini API key found. Please set your API key in settings.',
        });
      }

      // Initialize Gemini client with user's API key
      const geminiClient = new UserGeminiClient(
        userApiKey,
        process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
        process.env.GEMINI_LOCATION || 'us-central1',
        process.env.GEMINI_MODEL || 'gemini-1.5-pro'
      );

      // Use smart context service to build optimized context
      const contextResult = await this.smartContextService.buildContext(
        userId,
        session.id,
        message,
        4000 // Token budget
      );

      // Build messages array with smart context
      const messages = [
        { role: 'user' as 'user' | 'model', content: contextResult.recentContext },
        ...(contextResult.relevantHistory ? [{ role: 'user' as 'user' | 'model', content: contextResult.relevantHistory }] : []),
        { role: 'user' as 'user' | 'model', content: message }
      ];

      // Generate personality-enhanced prompt
      const personalityPrompt = await this.personalityService.generatePersonalityPrompt(
        userId,
        message,
        session.id
      );

      // Get response from Gemini with personality-enhanced system prompt
      const geminiResponse = await geminiClient.sendMessages([
        { role: 'user', content: personalityPrompt.systemPrompt },
        ...messages
      ]);
      const response = geminiResponse.text;

      // Track personality interaction
      await this.personalityService.trackPersonalityInteraction(
        userId,
        'PERSONALITY_FEEDBACK' as any,
        message,
        { sessionId: session.id, timestamp: new Date().toISOString() },
        session.id
      );

      // Save messages to session using new database models
      await this.addMessageToSession(session.id, {
        role: 'user',
        content: message,
      });

      await this.addMessageToSession(session.id, {
        role: 'assistant',
        content: response,
      });

      // Update message importance scores
      await this.smartContextService.updateMessageImportance(session.id);

      // Log the interaction for audit purposes
      await this.databaseService.auditLog.create({
        data: {
          userId,
          action: 'chat.message',
          metadata: {
            sessionId: session.id,
            messageLength: message.length,
            responseLength: response.length,
            functionCallCount: 0,
            functionCalls: [],
          },
        },
      });

      return {
        response,
        sessionId: session.id,
      };
    } catch (error) {
      console.error('Chat service error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process chat message',
      });
    }
  }

  async getChatSessions(userId: string): Promise<ChatSession[]> {
    // Use new ChatSession database model
    const sessions = await this.databaseService.getUserChatSessions(userId, {
      limit: 10,
      isActive: true
    });

    return sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      messages: [], // Messages loaded separately for performance
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  }

  async getChatSession(userId: string, sessionId: string): Promise<ChatSession> {
    // Use new ChatSession and ConversationMessage database models
    const sessionWithMessages = await this.databaseService.getChatSessionWithMessages(sessionId);
    
    if (!sessionWithMessages) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Chat session not found',
      });
    }

    // Verify the session belongs to the user
    if (sessionWithMessages.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to this chat session',
      });
    }

    return {
      id: sessionWithMessages.id,
      userId: sessionWithMessages.userId,
      messages: sessionWithMessages.messages.map(msg => ({
        id: msg.id,
        role: msg.role.toLowerCase() as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.createdAt,
        functionCalls: (msg.metadata as any)?.functionCalls,
      })),
      createdAt: sessionWithMessages.createdAt,
      updatedAt: sessionWithMessages.updatedAt,
    };
  }

  private async createChatSession(userId: string): Promise<ChatSession> {
    // Use new ChatSession database model
    const session = await this.databaseService.createChatSession({
      userId,
      title: "New Chat", // Default title, will be updated later
      isActive: true,
    });

    return {
      id: session.id,
      userId: session.userId,
      messages: [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private async addMessageToSession(
    sessionId: string, 
    message: Omit<ChatMessage, 'id' | 'timestamp'>
  ): Promise<void> {
    // Use new ConversationMessage database model
    await this.databaseService.createConversationMessage({
      sessionId,
      role: message.role.toUpperCase() as 'USER' | 'ASSISTANT' | 'SYSTEM' | 'FUNCTION_CALL' | 'FUNCTION_RESULT',
      content: message.content,
      metadata: message.functionCalls ? { functionCalls: message.functionCalls } : null,
    });
  }

  // Utility method to get conversation context for other services
  async getConversationContext(userId: string, sessionId: string): Promise<string> {
    const contextResult = await this.smartContextService.buildContext(
      userId,
      sessionId,
      '', // No current message for general context
      2000 // Smaller budget for utility context
    );
    
    return contextResult.recentContext + 
           (contextResult.relevantHistory ? '\n' + contextResult.relevantHistory : '');
  }

  // New methods for enhanced session management
  async updateChatSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
    // Verify session belongs to user
    const session = await this.databaseService.getChatSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to this chat session',
      });
    }

    await this.databaseService.updateChatSession(sessionId, { title });
  }

  async deactivateChatSession(userId: string, sessionId: string): Promise<void> {
    // Verify session belongs to user
    const session = await this.databaseService.getChatSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to this chat session',
      });
    }

    await this.databaseService.updateChatSession(sessionId, { isActive: false });
  }

  async deleteChatSession(userId: string, sessionId: string): Promise<void> {
    // Verify session belongs to user
    const session = await this.databaseService.getChatSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to this chat session',
      });
    }

    await this.databaseService.deleteChatSession(sessionId);
  }

  async getActiveChatSession(userId: string): Promise<ChatSession | null> {
    const session = await this.databaseService.getUserActiveChatSession(userId);
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      messages: [], // Messages loaded separately for performance
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async getChatSessionMessageCount(userId: string, sessionId: string): Promise<number> {
    // Verify session belongs to user
    const session = await this.databaseService.getChatSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to this chat session',
      });
    }

    return await this.databaseService.getSessionMessageCount(sessionId);
  }
}
