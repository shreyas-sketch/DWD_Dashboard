# Vercel Deployment — Environment Variables Setup

## Step 1 — Firebase Client SDK Variables

Go to **[Firebase Console](https://console.firebase.google.com) → Your Project → Project Settings → Your Apps → Web App → SDK setup and configuration**.

Copy these values and add them in **Vercel → Project → Settings → Environment Variables**:

| Variable Name | Example Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyAbc123...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project-id` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789012:web:abc123...` |

---

## Step 2 — Firebase Admin SDK Variables

Go to **Firebase Console → Project Settings → Service Accounts → Generate new private key**.  
This downloads a JSON file. Open it and copy the values below:

| Variable Name | Key in the downloaded JSON file |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | `project_id` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | `private_key` (the full block including `-----BEGIN PRIVATE KEY-----`) |

---

## Step 3 — Webhook API Key

This is a secret key used to protect the `/api/webhooks/leads` endpoint (for Pabbly/Zapier).  
Generate one by running this command in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable Name | Notes |
|---|---|
| `WEBHOOK_API_KEY` | Any random 32+ character string |

---

## Step 4 — Add Variables in Vercel

1. Go to [vercel.com](https://vercel.com) → Open your project
2. Click **Settings** → **Environment Variables**
3. For each variable above:
   - Enter the **Name** (e.g. `NEXT_PUBLIC_FIREBASE_API_KEY`)
   - Paste the **Value**
   - Select environments: **Production**, **Preview**, **Development** (select all three)
   - Click **Save**
4. Once all variables are added, go to **Deployments** and **Redeploy** your latest deployment

---

## ⚠️ Important Notes

### Do NOT wrap values in quotes
In the Vercel UI, paste the raw value directly — **no surrounding quotes**.

| ❌ Wrong | ✅ Correct |
|---|---|
| `"AIzaSyAbc123..."` | `AIzaSyAbc123...` |
| `"your-project.firebaseapp.com"` | `your-project.firebaseapp.com` |

Pasting with quotes is the most common cause of the `auth/invalid-api-key` error.

### FIREBASE_ADMIN_PRIVATE_KEY — paste as-is
Paste the full multi-line value including the header and footer lines:
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqh...
...
-----END PRIVATE KEY-----
```
Vercel handles the newlines automatically. Do **not** replace `\n` manually.

---

## Final Checklist

- [ ] All 6 `NEXT_PUBLIC_FIREBASE_*` variables added
- [ ] All 3 `FIREBASE_ADMIN_*` variables added
- [ ] `WEBHOOK_API_KEY` added
- [ ] No quotes around any values
- [ ] All variables set to **Production + Preview + Development**
- [ ] Redeployed after adding variables
