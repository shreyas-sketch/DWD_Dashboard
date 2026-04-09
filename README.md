# DWD Dashboard — README

## Overview

DWD Dashboard is a full-stack Next.js 14 backend management system for digital training programs. It supports 4 login roles, program/level/batch/lead management, call reporting, CSV import, lead redistribution and secure webhooks.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Glassmorphism |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Deployment | Vercel (Free tier) |
| Webhooks | Firebase Admin SDK (server-side) |

---

## Roles

| Role | Dashboard | Master | Assign Data | Users |
|---|---|---|---|---|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Backend Manager | ✅ | ✅ | ✅ | ❌ |
| Backend Assist | ✅ | ❌ | ✅ (own leads) | ❌ |
| Calling Assist | ✅ | ❌ | ✅ (calling only) | ❌ |

---

## Features

- **Programs → Levels → Batches** hierarchy
- **Leads**: Manual add, CSV import, Webhook (API), auto-distribute to Backend Assist users
- **Call sessions**: Multiple calls per date with per-lead status dropdowns
- **Call Reports**: Registration report (admin/manager), Calling Assist status, Handler status, Custom fields
- **Custom Fields**: Text, Dropdown, Checkbox, Date — reorderable
- **User Management**: Admin creates users with hashed Firebase Auth passwords
- **Auto-logout** after 8 hours session timeout
- **Remember Me** for 30-day persistence
- **Webhook API** for Pabbly/Zapier integration (POST & GET)

---

## Local Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USER/dwd-dashboard.git
cd dwd-dashboard
npm install
```

### 2. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create a project
2. Enable **Authentication** → Email/Password provider
3. Enable **Firestore Database** (start in production mode)
4. In Project Settings → Your apps → Add Web App → copy config

### 3. Firebase Admin (for Webhooks)

1. Project Settings → Service Accounts → Generate new private key
2. Save the JSON file contents

### 4. Environment Variables

Create `.env.local` in the project root:

```env
# Firebase Client (public)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (server-side, for webhooks)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Webhook API Key (generate a random 32+ char string)
WEBHOOK_API_KEY=your_super_secret_random_key
```

> **Tip**: Generate a secure API key:
> ```js
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 5. Firestore Security Rules

In Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    // Authenticated users can read all data
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### 6. Create First Admin User

Run the dev server and navigate to `/login`. Since no users exist in Firestore yet, use the Firebase Console to:

1. **Authentication** → Add user (email + password)
2. **Firestore** → Create collection `users` → Add document with the UID as ID:
   ```json
   {
     "uid": "FIREBASE_UID_HERE",
     "email": "admin@example.com",
     "displayName": "Admin",
     "role": "admin",
     "createdAt": "2025-01-01T00:00:00.000Z",
     "updatedAt": "2025-01-01T00:00:00.000Z"
   }
   ```
3. Sign in → create other users from the **Users** page in the dashboard.

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel (Free)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Initial DWD Dashboard"
git push origin main
```

### Step 2: Import on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Framework preset: **Next.js** (auto-detected)
3. Click **Environment Variables** and add all variables from your `.env.local`

> ⚠️ For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the raw value including the `-----BEGIN PRIVATE KEY-----` lines. Vercel handles newlines automatically.
> 
> ⚠️ For all `NEXT_PUBLIC_FIREBASE_*` values, paste the raw value without surrounding quotes. If you paste values like `"AIza..."` into the Vercel UI, the quotes become part of the value and Firebase will fail with `auth/invalid-api-key`.

### Step 3: Deploy

Click **Deploy**. Your app will be live at `https://your-project.vercel.app`.

---

## Webhook API Reference

### POST /api/webhooks/leads — Add a lead

**Headers:**
```
x-api-key: YOUR_WEBHOOK_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "batchId": "FIRESTORE_BATCH_DOC_ID",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+91 9876543210"
}
```

**Response (201):**
```json
{
  "success": true,
  "leadId": "abc123",
  "serialNumber": 51
}
```

### GET /api/webhooks/leads?batchId=XXX — Export leads

**Headers:**
```
x-api-key: YOUR_WEBHOOK_API_KEY
```

**Response:**
```json
{
  "leads": [...],
  "count": 50
}
```

### Pabbly / Zapier Integration

1. In Pabbly Connect / Zapier, add a **Webhook** action
2. Method: `POST`
3. URL: `https://your-app.vercel.app/api/webhooks/leads`
4. Headers: `x-api-key: YOUR_KEY`
5. Map fields: `batchId`, `name`, `email`, `phone`

---

## Project Structure

```
src/
├── app/
│   ├── login/              # Login page
│   ├── dashboard/
│   │   ├── layout.tsx      # Auth guard + shell
│   │   ├── page.tsx        # Dashboard home
│   │   ├── master/
│   │   │   └── programs/   # Programs → Levels → Batches → [Batch detail]
│   │   ├── assign-data/    # Role-based call reporting
│   │   └── users/          # Admin: user management
│   └── api/
│       └── webhooks/leads/ # Secure lead import webhook
├── components/
│   ├── ui/                 # Modal, Input, Select, Badge, Button, Spinner
│   └── layout/             # Sidebar, DashboardShell
├── contexts/
│   └── AuthContext.tsx     # Firebase auth + session management
├── hooks/                  # Real-time Firestore hooks
├── lib/
│   ├── firebase.ts         # Firebase client init
│   ├── firestore.ts        # Firestore helpers
│   └── utils.ts            # cn, formatDate, distributeLeads
└── types/
    └── index.ts            # All TypeScript types & dropdown constants
```

---

## Security Notes

- Passwords are hashed by Firebase Authentication (bcrypt internally)
- Sessions auto-expire after 8 hours
- Webhook API uses a secret key header (`x-api-key`)
- Firebase Admin SDK runs server-side only
- All Firestore access requires Firebase authentication
