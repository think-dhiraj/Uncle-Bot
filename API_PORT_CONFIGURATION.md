# API Port Configuration - Single Source of Truth

## Problem Solved
The application had hardcoded API URLs in multiple places, causing port mismatch issues:
- `chat-context.tsx` was hardcoded to `http://localhost:3002`
- API was actually running on `http://localhost:3001`
- Multiple files had duplicate configuration

## Solution: Centralized Configuration

### Single Source of Truth
**File**: `apps/web/src/config/api.ts`

```typescript
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const API_URL = API_BASE_URL.replace(/\/$/, '');

export const API_ENDPOINTS = {
  health: `${API_URL}/health`,
  chat: `${API_URL}/chat/send`,
  trpc: `${API_URL}/trpc`,
  docs: `${API_URL}/api/docs`,
} as const;
```

### Environment Variable
**File**: `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## How It Works

1. **Development**: 
   - API runs on port 3001 (NestJS default)
   - Web runs on port 3000 (Next.js default)
   - `NEXT_PUBLIC_API_URL=http://localhost:3001` in `.env.local`

2. **Production**:
   - Set `NEXT_PUBLIC_API_URL=https://api.your-domain.com`
   - All API calls automatically use production URL

3. **Custom Port**:
   - Change `NEXT_PUBLIC_API_URL` in `.env.local`
   - Or set environment variable
   - All files automatically use new URL

## Files That Use Centralized Config

### ✅ Now Importing from `@/config/api`
1. `apps/web/src/contexts/chat-context.tsx`
   ```typescript
   import { API_ENDPOINTS } from '@/config/api';
   fetch(API_ENDPOINTS.chat, {...})
   ```

2. `apps/web/src/utils/api.ts`
   ```typescript
   import { API_URL } from '@/config/api';
   const API_BASE_URL = API_URL;
   ```

3. `apps/web/src/utils/trpc.ts`
   ```typescript
   import { API_ENDPOINTS } from '@/config/api';
   url: API_ENDPOINTS.trpc
   ```

## Rules to Prevent This Again

### ✅ DO:
- Always import API URLs from `@/config/api`
- Use `API_ENDPOINTS.chat`, `API_ENDPOINTS.trpc`, etc.
- Update `.env.local` if you need to change the port
- Use environment variables for configuration

### ❌ DON'T:
- ❌ **NEVER** hardcode `http://localhost:3001` or any URL
- ❌ **NEVER** hardcode `http://localhost:3002` or any port
- ❌ **NEVER** use `process.env.NEXT_PUBLIC_API_URL` directly in components
- ❌ **NEVER** duplicate API URL configuration

## Example: Adding a New API Call

**WRONG** ❌:
```typescript
fetch('http://localhost:3001/new-endpoint', {...})
```

**CORRECT** ✅:
```typescript
import { API_URL } from '@/config/api';
fetch(`${API_URL}/new-endpoint`, {...})
```

**EVEN BETTER** ✅:
```typescript
// Add to apps/web/src/config/api.ts
export const API_ENDPOINTS = {
  // ... existing
  newEndpoint: `${API_URL}/new-endpoint`,
};

// Then use it:
import { API_ENDPOINTS } from '@/config/api';
fetch(API_ENDPOINTS.newEndpoint, {...})
```

## Verification

```bash
# Check API is running on correct port
curl http://localhost:3001/health

# Check no hardcoded ports in code
grep -r "localhost:300" apps/web/src --exclude-dir=node_modules
# Should only find: src/config/api.ts (fallback)

# Check .env.local has correct config
cat apps/web/.env.local | grep NEXT_PUBLIC_API_URL
# Should show: NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Port Summary

| Service | Port | Configuration |
|---------|------|---------------|
| Web (Next.js) | 3000 | `next dev` default |
| API (NestJS) | 3001 | `main.ts: process.env.PORT \|\| 3001` |
| Database (PostgreSQL) | 5432 | Docker/Local |
| Temporal | 7233 | Temporal default |

## If API Port Needs to Change

1. **Change in API**:
   ```typescript
   // apps/api/src/main.ts
   const port = process.env.PORT || 3005; // NEW PORT
   ```

2. **Update Web Config**:
   ```env
   # apps/web/.env.local
   NEXT_PUBLIC_API_URL=http://localhost:3005
   ```

3. **Restart Both Servers**:
   ```bash
   pkill -f "pnpm\|next\|nest"
   pnpm --filter api dev &
   pnpm --filter web dev &
   ```

That's it! No code changes needed anywhere else.

---

**Status**: ✅ Fixed and Centralized
**Branch**: backend-dev-fresh
**Date**: October 1, 2025

**This will never be a problem again!** 🎉

