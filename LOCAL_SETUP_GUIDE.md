# 🚀 Local Development Setup Guide

**Date**: January 2025  
**Purpose**: Complete local development setup for Uncle Bot AI Assistant

---

## 📋 **What You Need to Do**

### **Step 1: Google OAuth Credentials**

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Select your project** (or create a new one)
3. **Enable APIs**:
   - Go to "APIs & Services" → "Library"
   - Search for and enable:
     - **Google+ API**
     - **Gmail API**
     - **Google Calendar API**
4. **Create OAuth Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: **Web application**
   - Name: `Uncle Bot AI Assistant (Local Development)`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
   - Click "Create"
5. **Copy your credentials** (Client ID and Client Secret)

### **Step 2: Create Environment Variables**

Create a file called `.env.local` in the `apps/web/` directory with this content:

```bash
# NextAuth.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-change-this-in-production

# Google OAuth Credentials (Replace with your actual credentials)
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001

# Database (if needed for NextAuth.js)
DATABASE_URL=postgresql://dhirajsapkal@localhost:5432/ai_assistant
```

**Replace these values**:
- `your-google-client-id-here` → Your actual Google Client ID
- `your-google-client-secret-here` → Your actual Google Client Secret
- `your-super-secret-key-change-this-in-production` → Any random string (32+ characters)

### **Step 3: Install Dependencies**

Run these commands in your project root:

```bash
# Install NextAuth.js and dependencies
pnpm add next-auth @auth/prisma-adapter

# Install additional dependencies for the frontend
pnpm add @next-auth/prisma-adapter
```

### **Step 4: Start the Backend**

Make sure your backend is running:

```bash
# In one terminal, start the API
pnpm --filter api dev
```

### **Step 5: Start the Frontend**

In another terminal, start the frontend:

```bash
# In another terminal, start the web app
pnpm --filter web dev
```

---

## 🔧 **What I Need From You**

### **Required Information**
1. **Google Client ID**: From Google Cloud Console
2. **Google Client Secret**: From Google Cloud Console
3. **Confirmation**: That you've enabled the required APIs

### **Optional Information**
- **Custom NEXTAUTH_SECRET**: If you want a specific secret key
- **Custom Database URL**: If you're using a different database setup

---

## 🎯 **Expected Result**

After setup, you should be able to:

1. **Visit**: http://localhost:3000
2. **See**: Sign-in page with "Sign in with Google" button
3. **Click**: Sign in with Google
4. **Redirect**: To Google OAuth flow
5. **Return**: To your app as an authenticated user
6. **Access**: All protected features and settings

---

## 🚨 **Troubleshooting**

### **Common Issues**
1. **"Invalid redirect URI"**: Make sure the redirect URI in Google Console matches exactly
2. **"Client ID not found"**: Double-check your Google Client ID
3. **"Database connection error"**: Make sure PostgreSQL is running
4. **"API not responding"**: Make sure the backend is running on port 3001

### **Debug Steps**
1. Check browser console for errors
2. Check terminal for backend errors
3. Verify environment variables are set correctly
4. Ensure all services are running

---

## 📞 **Next Steps**

Once you have:
1. ✅ Google OAuth credentials
2. ✅ Environment variables set up
3. ✅ Dependencies installed
4. ✅ Both services running

I'll help you implement the authentication system and test the complete flow!

**Ready to proceed?** Let me know when you have the Google OAuth credentials! 🚀
