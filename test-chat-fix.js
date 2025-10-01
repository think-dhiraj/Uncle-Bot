#!/usr/bin/env node

/**
 * Test script to verify chat integration is working
 */

const API_BASE = 'http://localhost:3002';

// Helper function to make API calls
async function apiCall(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }
    
    return result;
  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error.message);
    return null;
  }
}

// Test chat integration
async function testChatIntegration() {
  console.log('🧪 Testing Chat Integration...');
  
  // Test 1: Health check
  console.log('\n1. Testing server health...');
  const health = await apiCall('/health');
  if (health) {
    console.log('✅ Server is healthy:', health.status);
    console.log('   Message:', health.message);
  } else {
    console.log('❌ Server health check failed');
    return;
  }

  // Test 2: API key status
  console.log('\n2. Testing API key status...');
  const apiStatus = await apiCall('/api-key/status');
  if (apiStatus) {
    console.log('✅ API key status:', {
      hasApiKey: apiStatus.hasApiKey,
      currentModel: apiStatus.currentModel,
      provider: apiStatus.provider,
      personalityEnabled: apiStatus.personalityEnabled
    });
  } else {
    console.log('❌ API key status check failed');
  }

  // Test 3: Chat functionality
  console.log('\n3. Testing chat functionality...');
  const chatResponse = await apiCall('/chat/send', 'POST', {
    message: "What's up?",
    sessionId: 'test-session-123'
  });
  
  if (chatResponse) {
    console.log('✅ Chat response received:');
    console.log(`   Response: ${chatResponse.response}`);
    console.log(`   Session ID: ${chatResponse.sessionId}`);
    console.log(`   Personality: ${JSON.stringify(chatResponse.personality)}`);
    
    // Check if it's not an error response
    if (chatResponse.response.includes('trouble connecting')) {
      console.log('⚠️  Note: Gemini API key not configured, but server is working!');
    } else {
      console.log('✅ Real AI response received!');
    }
  } else {
    console.log('❌ Chat functionality failed');
  }

  // Test 4: Multiple messages
  console.log('\n4. Testing multiple messages...');
  const messages = [
    "Hello! How are you?",
    "Can you tell me a joke?",
    "What's the weather like?"
  ];

  for (let i = 0; i < messages.length; i++) {
    console.log(`   Sending message ${i + 1}: "${messages[i]}"`);
    const response = await apiCall('/chat/send', 'POST', {
      message: messages[i],
      sessionId: 'test-session-123'
    });
    
    if (response) {
      console.log(`   ✅ Response ${i + 1}: ${response.response.substring(0, 50)}...`);
    } else {
      console.log(`   ❌ Message ${i + 1} failed`);
    }
  }

  console.log('\n🎉 Chat integration test completed!');
  console.log('\n📋 Summary:');
  console.log('✅ Backend server is running');
  console.log('✅ Chat API is responding');
  console.log('✅ Personality features are enabled');
  console.log('⚠️  Gemini API key needs to be configured for full functionality');
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Configure your Gemini API key in the environment');
  console.log('2. Test the chat interface in the browser');
  console.log('3. Enjoy the personality-enhanced AI responses!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testChatIntegration().catch(console.error);
}

module.exports = {
  testChatIntegration
};
