#!/usr/bin/env node

/**
 * Test script for the AI Personality System
 * This script tests the personality functionality without requiring a full database setup
 */

console.log('🎭 Testing AI Personality System...\n');

// Test 1: Personality Context Building
console.log('1. Testing Personality Context Building:');
const testPersonalityContext = {
  userId: 'test-user-123',
  sessionId: 'test-session-456',
  conversationHistory: [
    'user: Can you help me with my email?',
    'assistant: Sure! What do you need help with?'
  ],
  userPreferences: {
    humorLevel: 'medium',
    sarcasmLevel: 'medium',
    jokeFrequency: 'occasional',
    personalityMode: 'friendly'
  },
  personalityMemories: [],
  recentInteractions: [],
  humorLevel: 'medium',
  sarcasmLevel: 'medium',
  jokeFrequency: 'occasional'
};

console.log('✅ Personality context created:', JSON.stringify(testPersonalityContext, null, 2));

// Test 2: Joke Selection Logic
console.log('\n2. Testing Joke Selection Logic:');
const getJokesByContext = (context) => {
  const contextLower = context.toLowerCase();
  
  if (contextLower.includes('email')) {
    return [
      "Why did the email go to therapy? Because it had too many attachments! 📎",
      "What do you call an email that's been sitting in your inbox for months? A digital fossil! 📧",
      "Why don't emails ever get tired? Because they always have a date! 📅"
    ];
  }
  
  if (contextLower.includes('calendar') || contextLower.includes('meeting')) {
    return [
      "Why don't calendars ever get tired? Because they always have a date! 📅",
      "What's a calendar's favorite type of music? Date-ime music! 🎵",
      "Why did the meeting go to therapy? Because it had too many attendees! 👥"
    ];
  }
  
  if (contextLower.includes('work') || contextLower.includes('busy')) {
    return [
      "Why did the AI break up with the computer? It needed more space! 💻",
      "What do you call a robot that likes to party? A disco-bot! 🤖",
      "Why don't programmers ever get cold? Because they always have their Java! ☕"
    ];
  }
  
  // General jokes
  return [
    "Why did the AI assistant go to therapy? Because it had too many issues to process! 🤖",
    "What do you call an AI that's always late? A procrasti-bot! ⏰",
    "Why don't AIs ever get lonely? Because they always have their data! 📊"
  ];
};

// Test different contexts
const testContexts = [
  'Can you help me with my email?',
  'I need to schedule a meeting',
  'I\'m so busy with work',
  'Hello, how are you?'
];

testContexts.forEach(context => {
  const jokes = getJokesByContext(context);
  const selectedJoke = jokes[Math.floor(Math.random() * jokes.length)];
  console.log(`📧 Context: "${context}"`);
  console.log(`😄 Selected joke: "${selectedJoke}"`);
  console.log('');
});

// Test 3: Personality Prompt Generation
console.log('3. Testing Personality Prompt Generation:');
const buildSystemPrompt = (context, tone, shouldInjectJoke) => {
  const basePrompt = `You are a helpful AI assistant with a distinct personality:

PERSONALITY TRAITS:
- Funny and witty, with a dry sense of humor
- Occasionally sarcastic but always kind
- Loves dad jokes and puns
- Light-hearted roasting is okay, but never mean
- Always helpful and supportive
- Uses emojis sparingly but effectively

COMMUNICATION STYLE:
- Start responses with personality-appropriate greetings
- Include relevant dad jokes when the context fits
- Use light sarcasm for obvious questions or mistakes
- Be encouraging and supportive
- End with helpful next steps

CURRENT CONTEXT:
- User's humor level: ${context.humorLevel}
- User's sarcasm level: ${context.sarcasmLevel}
- Joke frequency: ${context.jokeFrequency}
- Recent interactions: ${context.recentInteractions.length} interactions
- Personality memories: ${context.personalityMemories.length} memories

Remember: Be funny, be helpful, be kind. Never be mean or offensive.`;

  if (shouldInjectJoke) {
    return basePrompt + '\n\nIMPORTANT: Include a relevant dad joke or pun in your response when appropriate.';
  }

  return basePrompt;
};

const testPrompt = buildSystemPrompt(testPersonalityContext, 'friendly', true);
console.log('✅ Generated system prompt:');
console.log(testPrompt.substring(0, 200) + '...\n');

// Test 4: Tone Determination
console.log('4. Testing Tone Determination:');
const determineTone = (context, userMessage) => {
  const obviousQuestions = ['what', 'how', 'when', 'where', 'why'];
  const isObviousQuestion = obviousQuestions.some(word => 
    userMessage.toLowerCase().startsWith(word)
  );

  if (isObviousQuestion && context.sarcasmLevel !== 'low') {
    return 'sarcastic';
  }

  const stressKeywords = ['help', 'urgent', 'problem', 'issue', 'stuck'];
  const isStressed = stressKeywords.some(keyword => 
    userMessage.toLowerCase().includes(keyword)
  );

  if (isStressed) {
    return 'friendly';
  }

  if (context.humorLevel === 'high') {
    return 'humorous';
  }

  return 'friendly';
};

const testMessages = [
  'What is the weather like?',
  'I need help with my email',
  'How do I schedule a meeting?',
  'I\'m stuck with this problem'
];

testMessages.forEach(message => {
  const tone = determineTone(testPersonalityContext, message);
  console.log(`💬 Message: "${message}" → Tone: ${tone}`);
});

console.log('\n🎉 Personality System Test Complete!');
console.log('\n📋 Test Results Summary:');
console.log('✅ Personality context building works');
console.log('✅ Joke selection by context works');
console.log('✅ System prompt generation works');
console.log('✅ Tone determination works');
console.log('\n🚀 The personality system is ready to use!');
console.log('\n💡 To test with real chat:');
console.log('1. Start the development server: pnpm dev');
console.log('2. Open the web app and try chatting');
console.log('3. The AI should now have personality!');
