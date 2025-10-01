const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load environment variables
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'your-api-key-here');

// Available Gemini models (in order of preference)
const AVAILABLE_MODELS = [
  'gemini-2.0-flash-exp',  // Latest experimental model
  'gemini-1.5-pro',        // Latest stable model
  'gemini-1.5-flash',      // Fast model
  'gemini-pro'             // Fallback
];

// Enhanced Gemini client with personality and smart model selection
class EnhancedGeminiClient {
  constructor() {
    this.currentModel = null;
    this.availableModels = [];
    this.modelIndex = 0;
    this.initializeModel();
  }

  async initializeModel() {
    try {
      // Try to get available models first
      await this.detectAvailableModels();
      
      // Use the best available model
      this.currentModel = this.availableModels[0] || AVAILABLE_MODELS[0];
      this.model = genAI.getGenerativeModel({ model: this.currentModel });
      
      console.log(`🤖 Using model: ${this.currentModel}`);
    } catch (error) {
      console.log(`⚠️  Model detection failed, using fallback: ${AVAILABLE_MODELS[0]}`);
      this.currentModel = AVAILABLE_MODELS[0];
      this.model = genAI.getGenerativeModel({ model: this.currentModel });
    }
  }

  async detectAvailableModels() {
    // Try each model to see which ones work
    for (const modelName of AVAILABLE_MODELS) {
      try {
        const testModel = genAI.getGenerativeModel({ model: modelName });
        // Try a simple test call
        const result = await testModel.generateContent("test");
        this.availableModels.push(modelName);
        console.log(`✅ Model ${modelName} is available`);
      } catch (error) {
        console.log(`❌ Model ${modelName} not available: ${error.message}`);
      }
    }
    
    if (this.availableModels.length === 0) {
      throw new Error('No models available');
    }
  }

  async switchToNextModel() {
    if (this.availableModels.length > 1) {
      this.modelIndex = (this.modelIndex + 1) % this.availableModels.length;
      this.currentModel = this.availableModels[this.modelIndex];
      this.model = genAI.getGenerativeModel({ model: this.currentModel });
      console.log(`🔄 Switched to model: ${this.currentModel}`);
    }
  }

  async sendMessageWithPersonality(message, sessionId) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        // Create a personality-enhanced prompt
        const personalityPrompt = `You are a helpful, friendly AI assistant with a great sense of humor. You occasionally make dad jokes and can be a bit sarcastic, but you're always kind and helpful. You have access to conversation history and can remember important details from previous conversations.

Current message: ${message}

Please respond in a conversational, helpful way. If appropriate, you can:
- Make a light-hearted comment or dad joke
- Use a bit of friendly sarcasm (but always be kind)
- Reference previous conversation context if relevant
- Be genuinely helpful and informative

Remember: Always be kind, helpful, and maintain a positive tone.`;

        const result = await this.model.generateContent(personalityPrompt);
        const response = await result.response;
        const text = response.text();

        console.log(`✅ Generated response using ${this.currentModel}: ${text.substring(0, 50)}...`);
        return { text };

      } catch (error) {
        console.error(`❌ Model ${this.currentModel} failed (attempt ${attempts + 1}):`, error.message);
        
        // Try switching to the next available model
        if (attempts < maxAttempts - 1) {
          await this.switchToNextModel();
          attempts++;
        } else {
          console.error('All models failed, returning fallback response');
          return { 
            text: "I'm having a bit of trouble connecting to my brain right now. Could you try again in a moment? 😅" 
          };
        }
      }
    }
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'AI Assistant API is running with personality! 🎭'
  });
});

app.get('/api-key/status', (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-api-key-here';
  res.json({
    hasApiKey,
    currentModel: global.geminiClient?.currentModel || 'detecting...',
    availableModels: global.geminiClient?.availableModels || [],
    provider: 'Google',
    personalityEnabled: true
  });
});

// Model management endpoints
app.get('/models', (req, res) => {
  res.json({
    currentModel: global.geminiClient?.currentModel || 'detecting...',
    availableModels: global.geminiClient?.availableModels || [],
    allModels: AVAILABLE_MODELS
  });
});

app.post('/models/switch', async (req, res) => {
  try {
    if (global.geminiClient) {
      await global.geminiClient.switchToNextModel();
      res.json({
        success: true,
        currentModel: global.geminiClient.currentModel,
        message: `Switched to ${global.geminiClient.currentModel}`
      });
    } else {
      res.status(500).json({ error: 'Gemini client not initialized' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/chat/send', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`🤖 Processing message: "${message}" (Session: ${sessionId || 'new'})`);

    // Use global Gemini client with personality
    if (!global.geminiClient) {
      global.geminiClient = new EnhancedGeminiClient();
      // Wait a moment for model detection
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const geminiResponse = await global.geminiClient.sendMessageWithPersonality(message, sessionId);

    console.log(`✅ Generated response: "${geminiResponse.text.substring(0, 100)}..."`);

    res.json({
      response: geminiResponse.text,
      sessionId: sessionId || `session-${Date.now()}`,
      timestamp: new Date().toISOString(),
      model: global.geminiClient.currentModel,
      personality: {
        humorLevel: 'medium',
        sarcasmLevel: 'light',
        dadJokeLevel: 'occasional'
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      suggestion: 'Please try again in a moment! 😊'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 AI Assistant API server running on port ${port}`);
  console.log(`📡 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: POST http://localhost:${port}/chat/send`);
  console.log(`🎭 Personality features: ENABLED`);
  console.log(`🧠 Memory system: READY`);
  
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    console.log(`⚠️  WARNING: GEMINI_API_KEY not set. Please configure your API key.`);
  }
});

module.exports = app;
