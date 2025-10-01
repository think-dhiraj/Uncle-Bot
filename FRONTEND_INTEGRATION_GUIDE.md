# 🎯 Frontend Integration Guide

**Date**: January 2025  
**Status**: Backend 100% Complete - Frontend Integration Required  
**Purpose**: Complete frontend integration with Uncle Bot backend authentication system

---

## 📋 **Executive Summary**

The backend authentication system is **100% complete** and production-ready. This document provides comprehensive instructions for the frontend team to integrate with the complete backend API, including:

- ✅ **User Authentication** (Google OAuth)
- ✅ **User API Key Management** (Encrypted Gemini API keys)
- ✅ **Persistent Chat Memory** (Cross-session conversations)
- ✅ **User Preferences** (Theme, language, timezone)
- ✅ **User-Specific AI Integration** (Personalized AI responses)

**Current Frontend Status**: ~30% complete - needs authentication, API integration, and user management features.

---

## 🔍 **Current Frontend Audit**

### ✅ **What's Already Implemented**
1. **Basic Layout**: AppLayout, sidebar navigation, page containers
2. **Theme System**: Dark/light mode toggle with next-themes
3. **Chat Interface**: Basic chat UI with message display
4. **Settings Page**: Basic settings structure with tabs
5. **tRPC Setup**: Basic tRPC client configuration
6. **UI Components**: Complete shadcn/ui component library

### ❌ **What's Missing (Critical)**
1. **Authentication System**: No Google OAuth integration
2. **User Management**: No user profile or authentication state
3. **API Integration**: Using old REST endpoints instead of tRPC
4. **Chat Persistence**: Local storage instead of backend persistence
5. **User Preferences**: No backend integration for settings
6. **API Key Management**: No user-specific API key handling

---

## 🚀 **Required Frontend Implementation**

### **Phase 1: Authentication Integration** (Priority 1)

#### **1.1 Install NextAuth.js**
```bash
pnpm add next-auth @auth/prisma-adapter
```

#### **1.2 Create Authentication Configuration**
**File**: `apps/web/src/lib/auth.ts`
```typescript
import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
}
```

#### **1.3 Create Authentication Pages**
**File**: `apps/web/src/app/auth/signin/page.tsx`
```typescript
import { signIn, getSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Uncle Bot</CardTitle>
          <CardDescription>
            Sign in with your Google account to access your AI assistant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => signIn('google')}
            className="w-full"
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

#### **1.4 Update Root Layout with Authentication**
**File**: `apps/web/src/app/layout.tsx`
```typescript
import { SessionProvider } from 'next-auth/react'
import { AuthProvider } from '@/components/auth-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AuthProvider>
              <Providers>{children}</Providers>
            </AuthProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
```

#### **1.5 Create Authentication Provider**
**File**: `apps/web/src/components/auth-provider.tsx`
```typescript
'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return // Still loading
    
    if (!session) {
      router.push('/auth/signin')
    }
  }, [session, status, router])

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  if (!session) {
    return null
  }

  return <>{children}</>
}
```

### **Phase 2: tRPC Integration** (Priority 1)

#### **2.1 Update tRPC Client with Authentication**
**File**: `apps/web/src/utils/trpc.ts`
```typescript
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import { getSession } from 'next-auth/react'
import type { AppRouter } from '../../../api/src/trpc/trpc.router'

export const trpc = createTRPCReact<AppRouter>()

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/trpc',
        async headers() {
          const session = await getSession()
          return {
            authorization: session?.accessToken ? `Bearer ${session.accessToken}` : '',
          }
        },
      }),
    ],
  })
}
```

#### **2.2 Update Providers with Authentication**
**File**: `apps/web/src/app/providers.tsx`
```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { trpc, getTRPCClient } from '@/utils/trpc'
import { ChatProvider } from '@/contexts/chat-context'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() => getTRPCClient())

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ChatProvider>{children}</ChatProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
```

### **Phase 3: User Management Integration** (Priority 1)

#### **3.1 Create User Profile Component**
**File**: `apps/web/src/components/user-profile.tsx`
```typescript
'use client'

import { useSession } from 'next-auth/react'
import { trpc } from '@/utils/trpc'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function UserProfile() {
  const { data: session } = useSession()
  const { data: user, isLoading } = trpc.user.me.useQuery()

  if (isLoading) return <div>Loading...</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src={session?.user?.image} />
            <AvatarFallback>{session?.user?.name?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{session?.user?.name}</h3>
            <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

#### **3.2 Update Sidebar with User Info**
**File**: `apps/web/src/components/layout/app-sidebar.tsx`
```typescript
// Add user profile section to sidebar
import { UserProfile } from '@/components/user-profile'

// In the sidebar component, add:
<div className="p-4 border-t">
  <UserProfile />
</div>
```

### **Phase 4: API Key Management** (Priority 1)

#### **4.1 Create API Key Management Component**
**File**: `apps/web/src/components/api-key-management.tsx`
```typescript
'use client'

import { useState } from 'react'
import { trpc } from '@/utils/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Key, CheckCircle, AlertCircle } from 'lucide-react'

export function ApiKeyManagement() {
  const [apiKey, setApiKey] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  
  const { data: apiKeyStatus, refetch } = trpc.user.getApiKeyStatus.useQuery()
  const setApiKeyMutation = trpc.user.setApiKey.useMutation()
  const testApiKeyMutation = trpc.user.testApiKey.useMutation()
  const removeApiKeyMutation = trpc.user.removeApiKey.useMutation()

  const handleSetApiKey = async () => {
    try {
      await setApiKeyMutation.mutateAsync({ apiKey })
      setApiKey('')
      setIsEditing(false)
      refetch()
    } catch (error) {
      console.error('Error setting API key:', error)
    }
  }

  const handleTestApiKey = async () => {
    try {
      const result = await testApiKeyMutation.mutateAsync({ apiKey })
      if (result.isValid) {
        alert('API key is valid!')
      } else {
        alert(`API key is invalid: ${result.error}`)
      }
    } catch (error) {
      console.error('Error testing API key:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          Gemini API Key
        </CardTitle>
        <CardDescription>
          Your personal Gemini API key for Uncle Bot AI responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {apiKeyStatus?.hasApiKey ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>API key configured</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => removeApiKeyMutation.mutate()}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your Gemini API key (AIza...)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSetApiKey} disabled={!apiKey.trim()}>
                Set API Key
              </Button>
              <Button 
                variant="outline" 
                onClick={handleTestApiKey}
                disabled={!apiKey.trim()}
              >
                Test Key
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

#### **4.2 Update Settings Page**
**File**: `apps/web/src/app/settings/page.tsx`
```typescript
// Replace the IntegrationsSettings component with:
import { ApiKeyManagement } from '@/components/api-key-management'

// In the integrations tab:
{activeTab === 'integrations' && (
  <div className="space-y-6">
    <ApiKeyManagement />
  </div>
)}
```

### **Phase 5: User Preferences Integration** (Priority 2)

#### **5.1 Create User Preferences Component**
**File**: `apps/web/src/components/user-preferences.tsx`
```typescript
'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/utils/trpc'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Palette, Globe, Clock } from 'lucide-react'

export function UserPreferences() {
  const [theme, setTheme] = useState('system')
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState('UTC')

  const { data: preferences, isLoading } = trpc.user.getPreferences.useQuery()
  const updatePreferencesMutation = trpc.user.updatePreferences.useMutation()
  const { data: availableThemes } = trpc.user.getAvailableThemes.useQuery()
  const { data: availableLanguages } = trpc.user.getAvailableLanguages.useQuery()
  const { data: availableTimezones } = trpc.user.getAvailableTimezones.useQuery()

  useEffect(() => {
    if (preferences) {
      setTheme(preferences.theme)
      setLanguage(preferences.language)
      setTimezone(preferences.timezone)
    }
  }, [preferences])

  const handleSave = async () => {
    try {
      await updatePreferencesMutation.mutateAsync({
        theme: theme as 'light' | 'dark' | 'system',
        language,
        timezone,
      })
    } catch (error) {
      console.error('Error updating preferences:', error)
    }
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Theme
          </CardTitle>
          <CardDescription>Choose your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableThemes?.map((themeOption) => (
                <SelectItem key={themeOption} value={themeOption}>
                  {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Language
          </CardTitle>
          <CardDescription>Select your preferred language</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages?.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Timezone
          </CardTitle>
          <CardDescription>Set your timezone for accurate scheduling</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTimezones?.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updatePreferencesMutation.isPending}>
        Save Preferences
      </Button>
    </div>
  )
}
```

#### **5.2 Update Settings Page with Preferences**
```typescript
// In the general tab:
{activeTab === 'general' && (
  <div className="space-y-6">
    <UserPreferences />
  </div>
)}
```

### **Phase 6: Chat Integration** (Priority 1)

#### **6.1 Update Chat Context with Backend Integration**
**File**: `apps/web/src/contexts/chat-context.tsx`
```typescript
'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { trpc } from '@/utils/trpc'

interface ChatInstance {
  id: string
  title: string
  isActive: boolean
  createdAt: string
  lastMessage?: string
}

interface ChatContextType {
  chats: ChatInstance[]
  activeChatId: string | null
  createNewChat: () => string
  setActiveChat: (id: string) => void
  updateChatTitle: (id: string, title: string) => void
  updateChatLastMessage: (id: string, message: string) => void
  deleteChat: (id: string) => void
  clearAllChats: () => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatInstance[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  // Use tRPC to fetch chats from backend
  const { data: backendChats, refetch } = trpc.chat.sessions.useQuery()
  const createChatMutation = trpc.chat.createSession.useMutation()
  const updateChatMutation = trpc.chat.updateSessionTitle.useMutation()
  const deleteChatMutation = trpc.chat.deleteSession.useMutation()

  // Sync with backend data
  useEffect(() => {
    if (backendChats) {
      setChats(backendChats)
      const activeChat = backendChats.find(chat => chat.isActive)
      if (activeChat) {
        setActiveChatId(activeChat.id)
      }
    }
  }, [backendChats])

  const createNewChat = async (): string => {
    try {
      const newChat = await createChatMutation.mutateAsync()
      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => ({ ...chat, isActive: false }))
        return [...updatedChats, newChat]
      })
      setActiveChatId(newChat.id)
      return newChat.id
    } catch (error) {
      console.error('Error creating chat:', error)
      // Fallback to local creation
      const newChatId = `chat-${Date.now()}`
      const newChat: ChatInstance = {
        id: newChatId,
        title: 'New Chat',
        isActive: true,
        createdAt: new Date().toISOString()
      }
      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => ({ ...chat, isActive: false }))
        return [...updatedChats, newChat]
      })
      setActiveChatId(newChatId)
      return newChatId
    }
  }

  const setActiveChat = (id: string) => {
    setChats(prevChats => 
      prevChats.map(chat => ({ 
        ...chat, 
        isActive: chat.id === id 
      }))
    )
    setActiveChatId(id)
  }

  const updateChatTitle = async (id: string, title: string) => {
    try {
      await updateChatMutation.mutateAsync({ sessionId: id, title })
      setChats(prevChats =>
        prevChats.map(chat =>
          chat.id === id ? { ...chat, title } : chat
        )
      )
    } catch (error) {
      console.error('Error updating chat title:', error)
    }
  }

  const updateChatLastMessage = (id: string, message: string) => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === id ? { ...chat, lastMessage: message } : chat
      )
    )
  }

  const deleteChat = async (id: string) => {
    try {
      await deleteChatMutation.mutateAsync({ sessionId: id })
      setChats(prevChats => {
        const filteredChats = prevChats.filter(chat => chat.id !== id)
        if (id === activeChatId && filteredChats.length > 0) {
          const newActiveChat = filteredChats[0]
          setActiveChatId(newActiveChat.id)
          newActiveChat.isActive = true
        }
        return filteredChats
      })
    } catch (error) {
      console.error('Error deleting chat:', error)
    }
  }

  const clearAllChats = () => {
    setChats([])
    setActiveChatId(null)
  }

  return (
    <ChatContext.Provider value={{
      chats,
      activeChatId,
      createNewChat,
      setActiveChat,
      updateChatTitle,
      updateChatLastMessage,
      deleteChat,
      clearAllChats
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
```

#### **6.2 Update Chat Page with tRPC Integration**
**File**: `apps/web/src/app/page.tsx`
```typescript
// Replace the handleSend function with:
const handleSend = async (message: string) => {
  if (!message.trim() || isTyping) return

  if (showInitialState) {
    const newChatId = await createNewChat()
    setShowInitialState(false)
  }

  const userMessage: ChatMessage = {
    id: uid(),
    role: "user",
    content: message,
    createdAt: iso(),
  }

  setMessages(prev => [...prev, userMessage])
  setInput("")
  setIsTyping(true)

  if (!hasUserSentMessage) {
    setHasUserSentMessage(true)
    const title = message.length > 30 ? message.substring(0, 30) + "..." : message
    updateChatTitle(activeChatId || '', title)
  }

  try {
    // Use tRPC instead of direct API call
    const response = await trpc.chat.send.mutate({
      message,
      sessionId: activeChatId,
    })
    
    const assistantMessage: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: response.response,
      createdAt: iso(),
    }
    setMessages(prev => [...prev, assistantMessage])
    updateChatLastMessage(activeChatId || '', response.response)
  } catch (error) {
    console.error('Error sending message:', error)
    const errorMessage: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "Sorry, I encountered an error. Please try again.",
      createdAt: iso(),
    }
    setMessages(prev => [...prev, errorMessage])
  } finally {
    setIsTyping(false)
  }
}
```

### **Phase 7: Environment Configuration** (Priority 1)

#### **7.1 Create Environment Variables**
**File**: `apps/web/.env.local`
```bash
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### **7.2 Update Next.js Configuration**
**File**: `apps/web/next.config.ts`
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
};

export default nextConfig;
```

---

## 📊 **Implementation Checklist**

### **Phase 1: Authentication** ✅ Required
- [ ] Install NextAuth.js and dependencies
- [ ] Create authentication configuration
- [ ] Create sign-in/sign-out pages
- [ ] Update root layout with SessionProvider
- [ ] Create authentication provider component
- [ ] Add protected route middleware

### **Phase 2: tRPC Integration** ✅ Required
- [ ] Update tRPC client with authentication headers
- [ ] Update providers with authenticated tRPC client
- [ ] Remove old REST API calls
- [ ] Update all API calls to use tRPC

### **Phase 3: User Management** ✅ Required
- [ ] Create user profile component
- [ ] Update sidebar with user information
- [ ] Add user profile to settings page
- [ ] Implement user profile updates

### **Phase 4: API Key Management** ✅ Required
- [ ] Create API key management component
- [ ] Update settings page with API key management
- [ ] Add API key validation and testing
- [ ] Implement API key status display

### **Phase 5: User Preferences** ✅ Required
- [ ] Create user preferences component
- [ ] Update settings page with preferences
- [ ] Implement theme, language, timezone settings
- [ ] Add preferences persistence

### **Phase 6: Chat Integration** ✅ Required
- [ ] Update chat context with backend integration
- [ ] Replace local storage with backend persistence
- [ ] Update chat page with tRPC integration
- [ ] Implement session management

### **Phase 7: Environment Setup** ✅ Required
- [ ] Create environment variables file
- [ ] Update Next.js configuration
- [ ] Set up Google OAuth credentials
- [ ] Configure API endpoints

---

## 🎯 **Success Criteria**

The frontend integration is complete when:

- ✅ **Users can sign in with Google OAuth**
- ✅ **User profile and authentication state is managed**
- ✅ **API key management works with backend**
- ✅ **User preferences are saved and loaded**
- ✅ **Chat conversations persist across sessions**
- ✅ **All API calls use tRPC instead of REST**
- ✅ **User-specific AI responses work correctly**

---

## 🚀 **Next Steps**

1. **Start with Phase 1**: Authentication integration is the foundation
2. **Implement Phase 2**: tRPC integration enables all backend features
3. **Complete Phase 3-6**: User management, API keys, preferences, and chat
4. **Test thoroughly**: Ensure all features work with the backend
5. **Deploy**: Frontend is ready for production

The backend is **100% complete** and ready for frontend integration. This guide provides everything needed to create a fully functional frontend that leverages all backend capabilities.

**Ready for Implementation!** 🎉
