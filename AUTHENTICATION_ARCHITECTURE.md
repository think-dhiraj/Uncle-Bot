# 🔐 Authentication Architecture Plan

**Last Updated**: January 2025  
**Status**: Architectural Planning Complete  
**Next Phase**: Implementation

---

## 🎯 **Authentication Flow Design**

### **User Journey**
1. **User visits app** → Redirected to Google OAuth
2. **Google OAuth** → User grants Gmail/Calendar permissions
3. **OAuth callback** → Backend creates/updates user, stores encrypted tokens
4. **Frontend receives JWT** → User is authenticated
5. **API Key Setup** → User prompted to enter their Gemini API key
6. **Chat Memory** → All conversations persist per user

### **Key Requirements**
- ✅ **Gmail-only login** (no other auth providers)
- ✅ **Automatic Gmail sync** (permissions already granted)
- ✅ **User-specific Gemini API keys** (not company-wide)
- ✅ **Persistent chat memory** (conversations survive login/logout)
- ✅ **Encrypted API key storage** (KMS in production)

---

## 🏗️ **Database Schema Updates**

### **New Models Added**

#### **UserPreferences**
```prisma
model UserPreferences {
  id        String   @id @default(cuid())
  userId    String   @unique
  theme     String   @default("system") // 'light', 'dark', 'system'
  language  String   @default("en")
  timezone  String   @default("UTC")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

#### **ChatSession**
```prisma
model ChatSession {
  id        String   @id @default(cuid())
  userId    String
  title     String?  // Auto-generated or user-set title
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages ConversationMessage[]
}
```

#### **ConversationMessage**
```prisma
model ConversationMessage {
  id          String   @id @default(cuid())
  sessionId   String
  role        MessageRole
  content     String
  metadata    Json?    // Function calls, tool usage, etc.
  createdAt   DateTime @default(now())

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

### **User Model Updates**
- ✅ Added `preferences` relationship
- ✅ Added `geminiApiKey` field (encrypted)
- ✅ Added `chatSessions` relationship

---

## 🔑 **API Key Management System**

### **User API Key Flow**
1. **User logs in** → Redirected to settings if no API key
2. **Settings page** → Prominent API key input with instructions
3. **API key validation** → Test key with simple Gemini call
4. **Encrypted storage** → Store in `User.geminiApiKey` (KMS encrypted)
5. **Per-user usage** → All AI calls use user's specific key

### **API Key Security**
```typescript
// Backend: Encrypt API key before storage
const encryptedKey = await kmsService.encrypt(userApiKey);
await db.user.update({
  where: { id: userId },
  data: { geminiApiKey: encryptedKey }
});

// Backend: Decrypt API key for AI calls
const user = await db.user.findUnique({ where: { id: userId } });
const decryptedKey = await kmsService.decrypt(user.geminiApiKey);
```

### **Settings Page Integration**
- ✅ **API Key Input** → Secure password field
- ✅ **Validation Status** → "Connected" / "Not Connected" indicator
- ✅ **Test Connection** → "Test API Key" button
- ✅ **Usage Instructions** → Link to Gemini API key generation

---

## 💬 **Chat Memory Architecture**

### **Current State (Temporary)**
- Chat sessions stored in `AuditLog` table
- Messages stored as JSON metadata
- No proper conversation persistence

### **New Architecture**
- ✅ **Dedicated ChatSession table** → Proper session management
- ✅ **ConversationMessage table** → Individual message storage
- ✅ **Message roles** → USER, ASSISTANT, SYSTEM, FUNCTION_CALL, FUNCTION_RESULT
- ✅ **Metadata support** → Function calls, tool usage, timestamps

### **Chat Service Updates**
```typescript
// New ChatService methods needed:
async createChatSession(userId: string, title?: string): Promise<ChatSession>
async addMessage(sessionId: string, role: MessageRole, content: string, metadata?: any)
async getChatHistory(sessionId: string): Promise<ConversationMessage[]>
async getUserSessions(userId: string): Promise<ChatSession[]>
```

---

## 🔄 **Authentication Implementation Plan**

### **Phase 1: Database Migration**
1. **Update Prisma schema** ✅ (Completed)
2. **Generate migration** → `pnpm db:migrate`
3. **Update Prisma client** → `pnpm db:generate`

### **Phase 2: Backend API Updates**
1. **User API key endpoints**
   ```typescript
   // New tRPC routes needed:
   user.setApiKey(input: { apiKey: string })
   user.testApiKey()
   user.getApiKeyStatus()
   ```

2. **Enhanced Chat Service**
   ```typescript
   // Update ChatService to use new schema
   async sendMessage(userId: string, message: string, sessionId?: string)
   async getChatSessions(userId: string)
   async getChatSession(sessionId: string)
   ```

3. **User Preferences Service**
   ```typescript
   // New service for user settings
   async updatePreferences(userId: string, preferences: UserPreferences)
   async getPreferences(userId: string)
   ```

### **Phase 3: Frontend Authentication**
1. **NextAuth.js Setup**
   ```typescript
   // pages/api/auth/[...nextauth].ts
   providers: [
     GoogleProvider({
       clientId: process.env.GOOGLE_CLIENT_ID,
       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
       authorization: {
         params: {
           scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar"
         }
       }
     })
   ]
   ```

2. **Protected Routes**
   ```typescript
   // Middleware for protected pages
   export { default } from "next-auth/middleware"
   export const config = { matcher: ["/chat", "/settings", "/dashboard"] }
   ```

3. **API Key Setup Flow**
   ```typescript
   // Settings page with API key management
   const [apiKey, setApiKey] = useState('')
   const [isValidating, setIsValidating] = useState(false)
   const [apiKeyStatus, setApiKeyStatus] = useState<'connected' | 'disconnected'>()
   ```

### **Phase 4: Chat Memory Integration**
1. **Update Chat Interface**
   ```typescript
   // Load user's chat sessions on login
   const { data: sessions } = trpc.chat.sessions.useQuery()
   const { data: messages } = trpc.chat.getSession.useQuery({ sessionId })
   ```

2. **Persistent Sessions**
   ```typescript
   // Auto-save conversations
   const { mutate: sendMessage } = trpc.chat.send.useMutation({
     onSuccess: (data) => {
       // Update local state with new message
       setMessages(prev => [...prev, data.message])
     }
   })
   ```

---

## 🔒 **Security Considerations**

### **API Key Security**
- ✅ **KMS Encryption** → All API keys encrypted at rest
- ✅ **No plaintext storage** → Never store unencrypted keys
- ✅ **User isolation** → Each user's key is completely separate
- ✅ **Audit logging** → Track API key usage and changes

### **OAuth Token Security**
- ✅ **Encrypted storage** → OAuth tokens encrypted with KMS
- ✅ **Automatic refresh** → Handle token expiration gracefully
- ✅ **Scope validation** → Ensure proper Gmail/Calendar permissions

### **Data Privacy**
- ✅ **User data isolation** → All data scoped to user ID
- ✅ **Conversation privacy** → Chat sessions only accessible to owner
- ✅ **Secure transmission** → HTTPS for all API calls

---

## 🚀 **Implementation Priority**

### **Immediate (Week 1)**
1. ✅ **Database schema updates** (Completed)
2. **Database migration** → Apply schema changes
3. **Backend API updates** → User API key management
4. **Chat service refactor** → Use new conversation tables

### **Short Term (Week 2)**
1. **NextAuth.js integration** → Google OAuth flow
2. **Frontend authentication** → Protected routes and login
3. **Settings page updates** → API key management UI
4. **Chat memory persistence** → Load/save conversations

### **Medium Term (Week 3-4)**
1. **User preferences** → Theme, language, timezone settings
2. **Enhanced chat UI** → Session management, history
3. **API key validation** → Test connection functionality
4. **Error handling** → Comprehensive auth error states

---

## 📋 **Migration Checklist**

### **Database Changes**
- [ ] Run `pnpm db:migrate` to apply schema changes
- [ ] Update Prisma client with `pnpm db:generate`
- [ ] Test database connections and new models

### **Backend Updates**
- [ ] Add user API key management endpoints
- [ ] Update ChatService to use new conversation tables
- [ ] Add UserPreferences service
- [ ] Update authentication flow for API key setup

### **Frontend Updates**
- [ ] Install and configure NextAuth.js
- [ ] Create authentication pages and middleware
- [ ] Update settings page with API key management
- [ ] Implement chat memory persistence
- [ ] Add user preference management

### **Testing**
- [ ] Test OAuth flow end-to-end
- [ ] Verify API key encryption/decryption
- [ ] Test chat memory persistence
- [ ] Validate user data isolation

---

## 🎯 **Success Criteria**

The authentication system is complete when:
- ✅ Users can log in with Gmail only
- ✅ Gmail sync works automatically after login
- ✅ Users can set and manage their Gemini API keys
- ✅ Chat conversations persist across sessions
- ✅ All user data is properly isolated and encrypted
- ✅ Settings page allows preference management

**Current Status**: Architecture complete, ready for implementation.
