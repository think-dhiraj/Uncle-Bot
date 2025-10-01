# 🔐 Authentication Flow Architecture

## User Authentication Journey

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User visits   │───▶│  Google OAuth   │───▶│  OAuth Callback │
│   application   │    │   (Gmail only)  │    │   (Backend)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │◀───│  JWT Token      │◀───│  Create/Update  │
│   receives JWT  │    │  Generation     │    │  User in DB     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Check API Key │───▶│  API Key Setup  │───▶│  Encrypted      │
│   Status        │    │  (Settings)     │    │  Storage        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chat Memory   │───▶│  Persistent     │───▶│  User-specific  │
│   Loaded        │    │  Conversations  │    │  Data Isolation │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Database Schema Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER TABLE                               │
├─────────────────────────────────────────────────────────────────┤
│  id (PK)           │  email (unique)  │  name                  │
│  image             │  geminiApiKey   │  createdAt             │
│  updatedAt         │  preferences    │  oauthTokens          │
│  chatSessions      │  threads        │  automations          │
│  tasks             │  notifications  │  auditLogs            │
│  calendarWatchChannels │ events    │                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    USER PREFERENCES                            │
├─────────────────────────────────────────────────────────────────┤
│  id (PK)           │  userId (FK)    │  theme (light/dark/system) │
│  language          │  timezone     │  createdAt                │
│  updatedAt         │              │                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CHAT SESSIONS                                │
├─────────────────────────────────────────────────────────────────┤
│  id (PK)           │  userId (FK)  │  title                   │
│  isActive          │  createdAt    │  updatedAt              │
│  messages          │               │                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                CONVERSATION MESSAGES                            │
├─────────────────────────────────────────────────────────────────┤
│  id (PK)           │  sessionId (FK) │  role (USER/ASSISTANT)  │
│  content           │  metadata       │  createdAt             │
└─────────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                             │
├─────────────────────────────────────────────────────────────────┤
│  NextAuth.js     │  JWT Token     │  API Key Input            │
│  Google OAuth    │  Session Mgmt  │  (Settings Page)          │
│  Protected Routes│  Chat Memory   │  User Preferences         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│  tRPC Router     │  Auth Guards   │  User Context              │
│  Protected Routes│  JWT Validation│  API Key Management       │
│  Chat Service    │  User Service  │  Preferences Service      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  User Table      │  Chat Sessions │  Conversation Messages    │
│  OAuth Tokens    │  (Encrypted)   │  User Preferences         │
│  KMS Encryption  │  Audit Logs    │  Data Isolation           │
└─────────────────────────────────────────────────────────────────┘
```

## API Key Management Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User enters   │───▶│  API Key       │───▶│  Validation     │
│   API Key       │    │  Input          │    │  (Test Call)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Success       │◀───│  KMS Encryption │◀───│  Store in DB    │
│   Indicator     │    │  (Secure)       │    │  (Encrypted)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   All AI calls  │───▶│  Use User's     │───▶│  Per-user       │
│   use user key  │    │  specific key   │    │  isolation      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Chat Memory Persistence

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User sends    │───▶│  Create/Update  │───▶│  Store Message  │
│   message       │    │  Chat Session   │    │  in Database    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Chat     │◀───│  Retrieve       │◀───│  Query Messages │
│   History       │    │  Session Data   │    │  by Session ID  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Persistent    │───▶│  User-specific   │───▶│  Cross-session  │
│   Conversations │    │  Data Isolation  │    │  Memory         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Implementation Phases

### Phase 1: Database Foundation
- ✅ Update Prisma schema
- [ ] Run database migration
- [ ] Update Prisma client

### Phase 2: Backend Services
- [ ] User API key management endpoints
- [ ] Enhanced ChatService with new schema
- [ ] UserPreferences service
- [ ] API key encryption/decryption

### Phase 3: Frontend Authentication
- [ ] NextAuth.js setup with Google OAuth
- [ ] Protected routes and middleware
- [ ] Settings page API key management
- [ ] User preference management

### Phase 4: Chat Memory Integration
- [ ] Chat session persistence
- [ ] Conversation history loading
- [ ] Cross-session memory retention
- [ ] Enhanced chat UI

## Security Considerations

### Data Encryption
- **OAuth Tokens**: Encrypted with KMS
- **API Keys**: Encrypted with KMS
- **User Data**: Isolated by user ID
- **Transmission**: HTTPS only

### Access Control
- **Authentication**: Google OAuth only
- **Authorization**: JWT-based session management
- **Data Access**: User-scoped queries only
- **API Keys**: Per-user isolation

### Privacy
- **Chat History**: Only accessible to user
- **API Usage**: User's own Gemini key
- **Data Retention**: Configurable per user
- **Audit Logging**: Complete operation trail
