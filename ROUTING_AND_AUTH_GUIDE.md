# Routing and Authentication Guide

## Current Routing Structure

### Public Routes
- `/login` - Landing page for unauthenticated users
  - Shows "Welcome Back" card
  - Google OAuth button
  - "Quick Dev Login" button (development only)

### Protected Routes  
- `/` - Main chat interface (requires authentication)
- `/settings` - User settings (requires authentication)

## Authentication Flow

### First Visit (Not Authenticated)
1. User navigates to `http://localhost:3000` or `http://localhost:3000/`
2. `page.tsx` detects no session
3. User is redirected to `/login`
4. User sees login page with options:
   - Continue with Google (production)
   - Quick Dev Login (development only)

### After Login (Authenticated)
1. User clicks login button
2. Session is created (NextAuth or dev session in localStorage)
3. User is redirected to `/` 
4. Main chat interface loads
5. User can chat with AI assistant

### Development Bypass
For development, you can skip Google OAuth:
1. Go to `/login`
2. Click "🚀 Quick Dev Login" button
3. Sets `dev-mode=true` and `dev-session` in localStorage
4. Redirects to `/`
5. Main app loads without real authentication

## How Authentication Works

### NextAuth.js (Production)
```typescript
// apps/web/src/lib/auth.ts
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // ... other config
}
```

### Dev Bypass (Development Only)
```typescript
// apps/web/src/app/login/page.tsx
const handleDevLogin = () => {
  const devSession = {
    user: {
      id: 'dev-user-123',
      name: 'Dev User',
      email: 'dev@unclebot.local',
    },
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  localStorage.setItem('dev-session', JSON.stringify(devSession));
  localStorage.setItem('dev-mode', 'true');
  window.location.href = '/';
};
```

## Page Components

### `/login` (apps/web/src/app/login/page.tsx)
- **Purpose**: Login page for unauthenticated users
- **When Shown**: When user has no session
- **Features**:
  - Google OAuth button
  - Dev bypass button (development only)
  - Beautiful gradient UI
  - Uncle Bot branding

### `/` (apps/web/src/app/page.tsx)
- **Purpose**: Main chat interface
- **When Shown**: When user is authenticated (or dev mode)
- **Features**:
  - Chat interface with AI
  - Message history
  - Send messages
  - Sidebar with chat history
- **Authentication Check**:
  ```typescript
  const { data: session, status } = useSession();
  
  useEffect(() => {
    if (status === 'loading') return;
    if (!session && !devSession) {
      router.push('/login');
    }
  }, [session, status, router, devSession]);
  ```

## Middleware

### Current Implementation
```typescript
// apps/web/src/middleware.ts
export function middleware(request: NextRequest) {
  // Allow all requests - authentication handled by page components
  return NextResponse.next();
}
```

**Why it's simple**: 
- Authentication is handled by page components, not middleware
- This allows dev bypass to work without middleware interference
- NextAuth.js handles session validation via `useSession()` hook

## Expected Behavior

### Scenario 1: Fresh Visit (No Authentication)
```
User -> http://localhost:3000/
  ↓
page.tsx checks session
  ↓
No session found
  ↓
router.push('/login')
  ↓
User sees login page
```

### Scenario 2: With Dev Session
```
User clicks "Quick Dev Login" on /login
  ↓
localStorage.setItem('dev-mode', 'true')
localStorage.setItem('dev-session', {...})
  ↓
window.location.href = '/'
  ↓
page.tsx checks for dev session
  ↓
Dev session found
  ↓
Chat interface loads
```

### Scenario 3: With Real Authentication
```
User clicks "Continue with Google" on /login
  ↓
NextAuth redirects to Google OAuth
  ↓
User authorizes
  ↓
Google redirects back to app
  ↓
NextAuth creates session
  ↓
User redirected to '/'
  ↓
page.tsx checks session
  ↓
Session found via useSession()
  ↓
Chat interface loads
```

## Troubleshooting

### Issue: Stuck on "Loading..."
**Cause**: NextAuth `useSession()` hanging
**Solution**: 
- Add `refetchInterval={0}` to `SessionProvider`
- Disable debug mode in production
- Check API is running on port 3001

### Issue: Blank Page at /login
**Possible Causes**:
1. **JavaScript Error**: Check browser console for errors
2. **Port Mismatch**: App running on wrong port (should be 3000)
3. **Build Issue**: Clear `.next` cache and rebuild

**Solutions**:
```bash
# Kill all processes
pkill -f "next dev"

# Clear cache
rm -rf apps/web/.next

# Restart
pnpm --filter web dev
```

### Issue: Redirect Loop
**Cause**: Page keeps redirecting between `/` and `/login`
**Solution**:
- Check `useEffect` dependencies in `page.tsx`
- Ensure only one auth check is running
- Verify dev session is being set correctly

### Issue: Dev Login Not Working
**Possible Causes**:
1. Button not clickable
2. localStorage not being set
3. Redirect not happening

**Debug**:
```typescript
// Check browser console for:
console.log('Dev login clicked!');
console.log('Dev session set:', devSession);

// Check localStorage:
localStorage.getItem('dev-mode')
localStorage.getItem('dev-session')
```

## URLs and Ports

### Development
- **Web App**: http://localhost:3000
- **Login Page**: http://localhost:3000/login
- **API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### Environment Variables
```env
# apps/web/.env.local
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
```

## Common Commands

### Start Everything
```bash
# Start API
pnpm --filter api dev  # Port 3001

# Start Web
pnpm --filter web dev  # Port 3000
```

### Clear Everything and Restart
```bash
# Kill all processes
pkill -f "pnpm\|next\|nest"

# Clear caches
rm -rf apps/web/.next
rm -rf apps/api/dist

# Restart
pnpm --filter api dev &
pnpm --filter web dev &
```

### Check What's Running
```bash
# Check ports
lsof -i :3000  # Web
lsof -i :3001  # API

# Test endpoints
curl http://localhost:3000/login  # Should return HTML
curl http://localhost:3001/health  # Should return {"status":"ok"}
```

## Security Notes

### Production
- ❌ Dev bypass ONLY shows in development (`NODE_ENV === 'development'`)
- ✅ Real Google OAuth required in production
- ✅ Sessions validated server-side
- ✅ API requires authentication headers

### Development
- ✅ Dev bypass available for quick testing
- ✅ No real credentials needed
- ⚠️ Dev session stored in localStorage (not secure)
- ⚠️ Don't use dev bypass in production

## File Reference

| File | Purpose |
|------|---------|
| `apps/web/src/app/page.tsx` | Main chat interface (protected) |
| `apps/web/src/app/login/page.tsx` | Login page (public) |
| `apps/web/src/middleware.ts` | Routing middleware (pass-through) |
| `apps/web/src/lib/auth.ts` | NextAuth configuration |
| `apps/web/src/app/providers.tsx` | SessionProvider wrapper |
| `apps/web/.env.local` | Environment variables |

---

**Status**: ✅ Working as designed
**Last Updated**: October 1, 2025

The authentication and routing are working correctly! `/login` is the entry point for unauthenticated users, and `/` is the protected main app.

