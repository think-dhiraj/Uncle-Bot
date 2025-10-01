# AI Providers Setup Guide

Your Uncle Bot AI Assistant now supports multiple AI providers! Here's how to get API keys for each:

## 🥇 Option 1: Anthropic Claude (Recommended)

**Why Claude?** Excellent reasoning, generous free tier, and great for work tasks.

### Get API Key:
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up with your email
3. Go to "API Keys" section
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

### Set Environment Variable:
```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

### Pricing:
- **Free tier**: $5 credit monthly
- **Paid**: $3/million input tokens, $15/million output tokens

---

## 🥈 Option 2: OpenAI GPT

**Why OpenAI?** Most popular, reliable, good for general tasks.

### Get API Key:
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up/login
3. Go to "API Keys" section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)

### Set Environment Variable:
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### Pricing:
- **GPT-3.5-turbo**: $0.50/million input, $1.50/million output tokens
- **GPT-4**: $30/million input, $60/million output tokens

---

## 🥉 Option 3: Perplexity AI

**Why Perplexity?** Real-time web search, great for current information.

### Get API Key:
1. Go to [perplexity.ai](https://perplexity.ai)
2. Sign up for Pro account ($20/month)
3. Go to "API" section
4. Generate API key

### Set Environment Variable:
```bash
export PERPLEXITY_API_KEY="pplx-your-key-here"
```

### Pricing:
- **Pro Plan**: $20/month for API access
- **Pay-per-use**: $5/million tokens

---

## 🆓 Option 4: Free Alternatives

### Hugging Face (Free)
1. Go to [huggingface.co](https://huggingface.co)
2. Sign up and get free API key
3. Use models like `microsoft/DialoGPT-large`

### Groq (Free tier)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for free account
3. Get API key
4. Very fast inference

---

## 🚀 Quick Start

1. **Choose a provider** (I recommend Claude for best results)
2. **Get your API key** using the steps above
3. **Set the environment variable**:
   ```bash
   # For Claude (recommended)
   export ANTHROPIC_API_KEY="sk-ant-your-key-here"
   
   # OR for OpenAI
   export OPENAI_API_KEY="sk-your-key-here"
   
   # OR for Perplexity
   export PERPLEXITY_API_KEY="pplx-your-key-here"
   ```

4. **Restart your API server**:
   ```bash
   cd apps/api
   npx tsx src/simple-server.ts
   ```

5. **Test it!** Send a message in the web interface

---

## 🔧 Advanced Configuration

You can also specify the provider explicitly:

```bash
# Force Claude
export AI_PROVIDER="claude"
export ANTHROPIC_API_KEY="sk-ant-your-key"

# Force OpenAI
export AI_PROVIDER="openai"
export OPENAI_API_KEY="sk-your-key"

# Force Perplexity
export AI_PROVIDER="perplexity"
export PERPLEXITY_API_KEY="pplx-your-key"
```

---

## 💡 Recommendations

- **For work tasks**: Claude (best reasoning)
- **For general chat**: OpenAI GPT-3.5 (cheapest)
- **For current events**: Perplexity (web search)
- **For free usage**: Hugging Face or Groq

---

## 🛠️ Troubleshooting

### "API key not set" error:
- Make sure you've set the environment variable
- Restart the API server after setting the variable
- Check that the key is correct (no extra spaces)

### "API error" messages:
- Check your API key is valid
- Ensure you have credits/quota remaining
- Try a different provider

### Still having issues?
- Check the server logs: `cd apps/api && npx tsx src/simple-server.ts`
- Test the API directly: `curl -X POST "http://localhost:3001/chat/send" -H "Content-Type: application/json" -d '{"message": "test"}'`
