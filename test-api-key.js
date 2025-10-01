#!/usr/bin/env node

/**
 * Test script to verify Gemini API key is working
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Set the API key
const API_KEY = "AIzaSyCi-ltQczruNbbtrw-mYX1t4Jh-KI8QURg";

console.log('🧪 Testing Gemini API Key...');
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);

try {
  // Initialize Gemini AI
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  console.log('✅ Gemini client initialized successfully');

  // Test with a simple message
  const testMessage = "Hello! Can you tell me a short joke?";
  console.log(`\n📝 Testing with message: "${testMessage}"`);

  const result = await model.generateContent(testMessage);
  const response = await result.response;
  const text = response.text();

  console.log('✅ API call successful!');
  console.log(`🤖 Response: ${text}`);
  
  console.log('\n🎉 Your API key is working perfectly!');
  console.log('🚀 You can now use the chat system with full AI functionality!');

} catch (error) {
  console.error('❌ API test failed:', error.message);
  
  if (error.message.includes('API key not valid')) {
    console.log('\n💡 The API key format looks correct, but Google is rejecting it.');
    console.log('   Please double-check that:');
    console.log('   1. The API key is correct');
    console.log('   2. The API key has the right permissions');
    console.log('   3. You\'re using the correct Google AI Studio API key');
  }
}
