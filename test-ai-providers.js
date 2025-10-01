#!/usr/bin/env node

/**
 * Test script for AI providers
 * Run this to test your API keys before using them in the main app
 */

const providers = {
  claude: {
    name: 'Anthropic Claude',
    envVar: 'ANTHROPIC_API_KEY',
    testUrl: 'https://api.anthropic.com/v1/messages',
    testPayload: {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello!' }]
    },
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }
  },
  openai: {
    name: 'OpenAI GPT',
    envVar: 'OPENAI_API_KEY',
    testUrl: 'https://api.openai.com/v1/chat/completions',
    testPayload: {
      model: 'gpt-3.5-turbo',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello!' }]
    },
    headers: {
      'Content-Type': 'application/json'
    }
  },
  perplexity: {
    name: 'Perplexity AI',
    envVar: 'PERPLEXITY_API_KEY',
    testUrl: 'https://api.perplexity.ai/chat/completions',
    testPayload: {
      model: 'llama-3.1-sonar-small-128k-online',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello!' }]
    },
    headers: {
      'Content-Type': 'application/json'
    }
  }
};

async function testProvider(providerName, config) {
  console.log(`\n🧪 Testing ${config.name}...`);
  
  const apiKey = process.env[config.envVar];
  if (!apiKey) {
    console.log(`❌ ${config.name}: No API key found (set ${config.envVar})`);
    return false;
  }

  try {
    const headers = {
      ...config.headers,
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey
    };

    const response = await fetch(config.testUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(config.testPayload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${config.name}: Working! Response received.`);
      return true;
    } else {
      console.log(`❌ ${config.name}: API error (${response.status}): ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${config.name}: Network error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 AI Provider Test Suite');
  console.log('==========================');
  
  const results = {};
  
  for (const [name, config] of Object.entries(providers)) {
    results[name] = await testProvider(name, config);
  }
  
  console.log('\n📊 Summary:');
  console.log('============');
  
  const working = Object.entries(results).filter(([_, working]) => working);
  const notWorking = Object.entries(results).filter(([_, working]) => !working);
  
  if (working.length > 0) {
    console.log('✅ Working providers:');
    working.forEach(([name, _]) => {
      console.log(`   - ${providers[name].name}`);
    });
  }
  
  if (notWorking.length > 0) {
    console.log('❌ Not working:');
    notWorking.forEach(([name, _]) => {
      console.log(`   - ${providers[name].name} (check ${providers[name].envVar})`);
    });
  }
  
  if (working.length === 0) {
    console.log('\n💡 No working providers found. Try:');
    console.log('   1. Get an API key from one of the providers');
    console.log('   2. Set the environment variable');
    console.log('   3. Run this test again');
    console.log('\n📖 See AI_PROVIDERS_GUIDE.md for detailed instructions');
  } else {
    console.log('\n🎉 Great! You can now use ADA with AI responses.');
    console.log('   Restart your API server to use the working provider.');
  }
}

main().catch(console.error);
