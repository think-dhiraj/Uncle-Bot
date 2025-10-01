# AI Assistant Monorepo

A comprehensive TypeScript monorepo for an AI-powered email and calendar assistant with real-time features, built with modern technologies.

## 🏗️ Architecture

### Apps
- **`apps/web`** - Next.js 15 frontend with App Router, Tailwind, shadcn/ui, tRPC, next-auth
- **`apps/api`** - NestJS backend with tRPC adapter, REST webhooks, OAuth flows
- **`apps/worker`** - Temporal worker for background workflows and automations

### Packages
- **`packages/google`** - Gmail and Calendar API helpers with incremental sync
- **`packages/gemini`** - Vertex AI Gemini client with Function Calling and Live API
- **`db`** - Prisma schema and database utilities

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- pnpm 8+
- PostgreSQL 14+
- Docker (for Temporal)
- Google Cloud Project with APIs enabled

### 1. Clone and Install
```bash
git clone <repository-url>
cd ai-assistant
pnpm install
```

### 2. Environment Setup
```bash
# Copy environment templates
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env.local
```

### 3. Database Setup
```bash
# Start PostgreSQL with pgvector extension
docker run -d --name postgres-ai \
  -e POSTGRES_DB=ai_assistant \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Generate Prisma client and push schema
pnpm db:generate
pnpm db:push
```

### 4. Google Cloud Setup

#### Enable APIs
```bash
gcloud services enable gmail.googleapis.com
gcloud services enable calendar-json.googleapis.com
gcloud services enable aiplatform.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable cloudkms.googleapis.com
```

#### OAuth 2.0 Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services > Credentials
3. Create OAuth 2.0 Client ID for web application
4. Add authorized redirect URI: `http://localhost:3001/oauth/google/callback`
5. Copy Client ID and Secret to your `.env.local`

#### Pub/Sub Setup for Gmail Push
```bash
# Create topic for Gmail notifications
gcloud pubsub topics create gmail-push

# Create subscription with proper configuration
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint=http://localhost:3001/webhooks/gmail \
  --ack-deadline=600 \
  --message-retention-duration=7d \
  --max-delivery-attempts=5

# Grant Gmail service account publish permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher

# For production, use your actual domain
gcloud pubsub subscriptions modify gmail-push-sub \
  --push-endpoint=https://your-api-domain.com/webhooks/gmail
```

#### Gemini AI Configuration (Company Instance)

The AI Assistant uses your company's Gemini API key for all AI operations. This ensures:
- **Enterprise Control**: All API usage goes through your company's account
- **Cost Management**: Centralized billing and usage monitoring  
- **Data Governance**: Consistent with your company's AI policies
- **Security**: Single point of API key management

**Configuration:**
```bash
# Required: Your company's master Gemini API key
export COMPANY_GEMINI_API_KEY="your-company-master-api-key"

# Set your preferred model
export GEMINI_MODEL="gemini-2.5-pro"

# Optional: Custom endpoint for company's private Gemini instance
export COMPANY_GEMINI_ENDPOINT="https://your-company-gemini-api.com"

# Location for Vertex AI
export GEMINI_LOCATION="us-central1"
```

**Available Models:**
- **`gemini-2.5-pro`** (Default) - Latest and most capable model with enhanced reasoning
- **`gemini-2.0-flash-exp`** - Fast experimental model with multimodal capabilities  
- **`gemini-1.5-pro`** - Stable production model
- **`gemini-1.5-flash`** - Fast and efficient for high-throughput tasks

**Note:** The system automatically adapts to newer models as they become available. Simply update the `GEMINI_MODEL` environment variable.

#### KMS Setup (Production)
```bash
# Create key ring and key for token encryption
gcloud kms keyrings create ai-assistant --location=global
gcloud kms keys create oauth-tokens \
  --location=global \
  --keyring=ai-assistant \
  --purpose=encryption
```

### 5. Temporal Setup
```bash
# Start Temporal server
docker run -d --name temporal \
  -p 7233:7233 \
  -p 8233:8233 \
  temporalio/auto-setup:latest

# Or use Temporal CLI (recommended for development)
temporal server start-dev
```

### 6. Start Development Servers
```bash
# Start all services
pnpm dev

# Or start individually
pnpm --filter web dev          # Frontend on :3000
pnpm --filter api dev          # API on :3001  
pnpm --filter worker dev       # Temporal worker
```

## 🔧 Configuration

### Environment Variables

#### Root `.env.local`
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_assistant"
```

#### API `.env.local`
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_assistant"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3001/oauth/google/callback"

# Google Cloud
GOOGLE_CLOUD_PROJECT="your-project-id"

# KMS (Production)
KMS_KEY_RING="ai-assistant"
KMS_KEY_ID="oauth-tokens"
KMS_LOCATION="global"

# Local encryption key (Development)
LOCAL_ENCRYPTION_KEY="local-dev-key-32-chars-long!!!"

# Gemini AI Configuration (Company Instance)
GEMINI_MODEL="gemini-2.5-pro"  # Options: gemini-2.5-pro, gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
GEMINI_LOCATION="us-central1"
COMPANY_GEMINI_API_KEY="your-company-master-api-key"  # Required: Company's master Gemini API key
COMPANY_GEMINI_ENDPOINT=""  # Optional: Custom endpoint for company's private Gemini instance

# Frontend URL
FRONTEND_URL="http://localhost:3000"

# Environment flags
NODE_ENV="development"
STRICT_PRIVACY_MODE="false"
RETENTION_DAYS="90"
```

#### Worker `.env.local`
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_assistant"

# Temporal
TEMPORAL_ADDRESS="localhost:7233"
TEMPORAL_NAMESPACE="default"
TEMPORAL_TASK_QUEUE="ai-assistant"

# Google Cloud
GOOGLE_CLOUD_PROJECT="your-project-id"

# Same KMS and Gemini settings as API
```

#### Web `.env.local`
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

## 🔄 Webhooks Setup (Local Development)

### Using ngrok for Gmail/Calendar Push Notifications

1. **Install ngrok**
```bash
npm install -g ngrok
# or
brew install ngrok
```

2. **Expose local API**
```bash
ngrok http 3001
```

3. **Update Pub/Sub subscription**
```bash
# Update the push endpoint with your ngrok URL
gcloud pubsub subscriptions modify gmail-push-sub \
  --push-endpoint=https://your-ngrok-url.ngrok.io/webhooks/gmail
```

4. **Set up Gmail watch**
```bash
# Use the Gmail API to set up push notifications
# This is typically done through the application after OAuth
```

## 📋 Available Scripts

### Root Level
```bash
pnpm dev          # Start all services in development
pnpm build        # Build all packages and apps
pnpm lint         # Lint all packages
pnpm format       # Format code with Prettier
pnpm clean        # Clean all build outputs

# Database
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to database
pnpm db:migrate   # Create and run migrations
pnpm db:studio    # Open Prisma Studio
```

### Individual Apps
```bash
pnpm --filter web dev         # Next.js development server
pnpm --filter api dev         # NestJS development server  
pnpm --filter worker dev      # Temporal worker development
```

## 🎯 Core Features

### 1. Email Summarization
```typescript
// Summarize latest unread emails with draft replies
const result = await trpc.email.summarize.mutate({
  threadIds: ['thread1', 'thread2'],
  generateReplies: true
});
```

### 2. Calendar Scheduling
```typescript
// Find available 30-minute slots this week
const slots = await trpc.calendar.findSlots.query({
  attendees: ['alice@example.com', 'bob@example.com'],
  duration: 30,
  start: '2024-01-15T00:00:00Z',
  end: '2024-01-21T23:59:59Z'
});
```

### 3. Follow-up Automations
```typescript
// Set up 3-day follow-up reminder
await trpc.automation.create.mutate({
  name: 'Follow-up reminder',
  type: 'FOLLOW_UP_REMINDER',
  config: { waitDays: 3, message: 'Gentle reminder about...' },
  threadId: 'thread123'
});
```

### 4. Push Notifications
- Gmail push via Cloud Pub/Sub
- Calendar push via webhooks  
- Real-time sync with incremental updates

### 5. AI Classification
```typescript
// Classify email priority and intent
const classification = await trpc.email.classify.mutate({
  threadId: 'thread123'
});
// Returns: { priority: 'P1', intent: 'meeting_request', reasons: [...] }
```

## 🏗️ Temporal Workflows

### Follow-up Watcher
```typescript
// Monitors threads for replies, creates follow-up tasks
await temporal.workflow.start(followUpWatcher, {
  args: [{ threadId, userId, waitDays: 3 }],
  taskQueue: 'ai-assistant',
  workflowId: `follow-up-${threadId}`
});
```

### Daily Digest (CRON)
```typescript  
// Runs at 8:30 AM local time for each user
await temporal.schedule.create({
  scheduleId: `daily-digest-${userId}`,
  spec: { cron: '30 8 * * *' },
  action: {
    type: 'startWorkflow',
    workflowType: dailyDigest,
    args: [{ userId, userEmail, timeZone }]
  }
});
```

### Out of Office Window
```typescript
// Manages auto-replies and calendar blocking
await temporal.workflow.start(oooWindow, {
  args: [{ 
    userId, 
    startDate: '2024-01-15T09:00:00Z',
    endDate: '2024-01-19T17:00:00Z',
    message: 'Out of office until Friday...'
  }]
});
```

## 🚀 Deployment (Google Cloud)

### Cloud Run Deployment
```bash
# Build and deploy API
gcloud run deploy ai-assistant-api \
  --source=apps/api \
  --region=us-central1 \
  --allow-unauthenticated

# Build and deploy Web  
gcloud run deploy ai-assistant-web \
  --source=apps/web \
  --region=us-central1 \
  --allow-unauthenticated

# Build and deploy Worker
gcloud run deploy ai-assistant-worker \
  --source=apps/worker \
  --region=us-central1 \
  --no-allow-unauthenticated
```

### Cloud SQL Setup
```bash
gcloud sql instances create ai-assistant-db \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create ai_assistant \
  --instance=ai-assistant-db
```

### Cloud Scheduler (for watch renewals)
```bash
gcloud scheduler jobs create http gmail-watch-renewal \
  --schedule="0 */12 * * *" \
  --uri="https://your-api-url/webhooks/renew-gmail-watch" \
  --http-method=POST
```

## 🔒 Security & Privacy

### Environment Flags
- `STRICT_PRIVACY_MODE`: Enhanced privacy controls
- `RETENTION_DAYS`: Data retention period
- `GEMINI_MODEL`: AI model selection (pro|flash)

### IAM Least Privilege
- API service account: Gmail/Calendar read/write, KMS encrypt/decrypt
- Worker service account: Pub/Sub subscribe, KMS decrypt
- Web service account: None (uses user OAuth)

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Test individual packages
pnpm --filter api test
pnpm --filter web test

# E2E tests
pnpm test:e2e
```

## 📚 API Documentation

- **API Docs**: http://localhost:3001/api/docs (Swagger)
- **tRPC Panel**: http://localhost:3000/api/panel (Development)
- **Database Studio**: `pnpm db:studio`

## 🐛 Troubleshooting

### Common Issues

1. **Gmail push not working**
   - Verify Pub/Sub topic and subscription setup
   - Check ngrok URL is accessible
   - Ensure Gmail API push permissions

2. **Temporal connection failed**
   - Start Temporal server: `temporal server start-dev`
   - Check port 7233 is available

3. **Database connection error**
   - Verify PostgreSQL is running
   - Check DATABASE_URL in environment files
   - Run `pnpm db:push` to sync schema

4. **OAuth errors**
   - Verify Google OAuth credentials
   - Check redirect URI matches exactly
   - Ensure APIs are enabled in Google Cloud

### Logs
```bash
# API logs
pnpm --filter api start | bunyan

# Worker logs  
pnpm --filter worker start

# Temporal UI
open http://localhost:8233
```

## 🤖 For AI Agents & Developers

**⚠️ CRITICAL: READ FIRST**

Before working on this project, **ALWAYS** read `PROJECT_CONTEXT.md` first. This file contains:
- Complete implementation status
- Architecture decisions
- What's done vs. what's pending
- Critical configuration details
- Next steps priority

**🔄 KEEP CONTEXT UPDATED**

After making ANY significant changes:
1. Update `PROJECT_CONTEXT.md` with new implementation status
2. Update the "Last Updated" date
3. Modify the "Next Steps Priority" section
4. Document any new architecture decisions

This ensures every new AI agent or developer has complete, current project knowledge.

## 🤝 Contributing

1. **Read `PROJECT_CONTEXT.md` first** 📋
2. Fork the repository
3. Create a feature branch
4. Make changes with tests
5. **Update `PROJECT_CONTEXT.md`** 📝
6. Run `pnpm lint` and `pnpm format`
7. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

## 🔮 Roadmap

- [ ] Voice conversations with Gemini Live API
- [ ] Advanced email templates and signatures
- [ ] Multi-calendar support
- [ ] Slack/Teams integrations
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Custom AI model fine-tuning
