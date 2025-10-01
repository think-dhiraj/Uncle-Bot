import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Gemini AI Client
class GeminiClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || 'AIzaSyCi-ltQczruNbbtrw-mYX1t4Jh-KI8QURg';
    this.model = model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  }

  setModel(model: string) {
    this.model = model;
  }

  getModel() {
    return this.model;
  }

  async sendMessages(messages: Array<{ role: 'user' | 'model'; content: string }>): Promise<{ text: string }> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not set');
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

    console.log('Sending to Gemini:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
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

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Gemini client instance
let geminiClient = new GeminiClient();

// Available models
const AVAILABLE_MODELS = [
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Latest experimental model' },
  { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash 001', description: 'Stable version of Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Stable version of Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Stable release of Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Stable version of Gemini 2.5 Flash-Lite' }
];

// API Key and Model management endpoints
app.get('/api-key/status', (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY || true; // true because we have it hardcoded
  res.json({ 
    hasApiKey,
    provider: 'gemini',
    currentModel: geminiClient.getModel(),
    availableModels: AVAILABLE_MODELS,
    message: hasApiKey ? 'Gemini API key is configured' : 'No API key found'
  });
});

app.post('/api-key/set', (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  
  // Set the environment variable for this session
  process.env.GEMINI_API_KEY = apiKey;
  
  // Update the global client
  geminiClient = new GeminiClient(apiKey, geminiClient.getModel());
  
  res.json({ 
    success: true, 
    message: 'API key updated successfully',
    provider: 'gemini',
    currentModel: geminiClient.getModel()
  });
});

app.post('/model/set', (req, res) => {
  const { model } = req.body;
  
  if (!model) {
    return res.status(400).json({ error: 'Model is required' });
  }
  
  // Validate model exists
  const validModel = AVAILABLE_MODELS.find(m => m.id === model);
  if (!validModel) {
    return res.status(400).json({ error: 'Invalid model selected' });
  }
  
  // Update the global client
  geminiClient.setModel(model);
  
  res.json({ 
    success: true, 
    message: `Model switched to ${validModel.name}`,
    currentModel: model,
    modelInfo: validModel
  });
});

app.get('/models', (req, res) => {
  res.json({
    currentModel: geminiClient.getModel(),
    availableModels: AVAILABLE_MODELS
  });
});

app.post('/chat/send', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Enhanced Gemini client with personality and memory
    class EnhancedGeminiClient extends GeminiClient {
      async sendMessageWithPersonality(message: string, sessionId?: string): Promise<{ text: string }> {
        // Create a personality-enhanced prompt
        const personalityPrompt = `You are a helpful, friendly AI assistant with a great sense of humor. You occasionally make dad jokes and can be a bit sarcastic, but you're always kind and helpful. You have access to conversation history and can remember important details from previous conversations.

Current message: ${message}

Please respond in a conversational, helpful way. If appropriate, you can:
- Make a light-hearted comment or dad joke
- Use a bit of friendly sarcasm (but always be kind)
- Reference previous conversation context if relevant
- Be genuinely helpful and informative

Remember: Always be kind, helpful, and maintain a positive tone.`;

        // Use the global Gemini client with enhanced prompt
        const geminiResponse = await this.sendMessages([
          { role: 'user', content: personalityPrompt }
        ]);

        return geminiResponse;
      }
    }

    const enhancedClient = new EnhancedGeminiClient();
    const geminiResponse = await enhancedClient.sendMessageWithPersonality(message, sessionId);

    res.json({
      response: geminiResponse.text,
      sessionId: sessionId || 'temp-session',
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Simple API server running on port ${port}`);
  console.log(`📡 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: POST http://localhost:${port}/chat/send`);
});
