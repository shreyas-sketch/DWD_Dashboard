import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { WebhookEvent } from '@/types';

function ensureAdminApp() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

    if (!projectId || !clientEmail || !rawKey) {
      throw new Error(
        `[firebase-admin] Missing env vars: ${[
          !projectId && 'FIREBASE_ADMIN_PROJECT_ID',
          !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
          !rawKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
        ].filter(Boolean).join(', ')}`,
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
}

export function getAdminDb() {
  ensureAdminApp();
  return getFirestore(getApp());
}

export function getAdminAuth() {
  ensureAdminApp();
  return getAuth(getApp());
}

// ─── Verify Firebase ID token and check role from Firestore ───────────────────
export type TokenResult =
  | { ok: true; uid: string; role: string }
  | { ok: false; status: 401 | 403 | 503; reason: string };

export async function verifyUserToken(
  req: Request,
  requiredRole?: string,
): Promise<TokenResult> {
  // Accept token from x-firebase-token header OR Authorization: Bearer <token>
  const tokenFromHeader = req.headers.get('x-firebase-token');
  const authHeader = req.headers.get('authorization');
  const token = tokenFromHeader ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
  if (!token) return { ok: false, status: 401, reason: 'No auth token provided' };

  try {
    let decoded: import('firebase-admin/auth').DecodedIdToken;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Firebase Admin SDK itself failed to initialise or verify
      const isConfigError = msg.includes('credential') || msg.includes('private key') ||
        msg.includes('FIREBASE_ADMIN') || msg.includes('app/no-app') || msg.includes('invalid_grant');
      console.error('[verifyUserToken] verifyIdToken error:', msg);
      return {
        ok: false,
        status: isConfigError ? 503 : 401,
        reason: isConfigError
          ? `Firebase Admin configuration error: ${msg}`
          : 'Invalid or expired token',
      };
    }

    const uid = decoded.uid;
    // Look up role from Firestore (not custom claims)
    const userDoc = await getAdminDb().collection('users').doc(uid).get();
    if (!userDoc.exists) return { ok: false, status: 401, reason: 'User not found' };
    const role = (userDoc.data()?.role as string) ?? '';

    if (requiredRole && role !== requiredRole) {
      return { ok: false, status: 403, reason: `Role '${role}' is not allowed (need '${requiredRole}')` };
    }
    return { ok: true, uid, role };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verifyUserToken] unexpected error:', msg);
    return { ok: false, status: 503, reason: `Server error during auth: ${msg}` };
  }
}

// ─── Outbound webhook helper ──────────────────────────────────────────────────
export async function fireOutboundWebhooks(event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection('webhooks')
      .where('active', '==', true)
      .get();

    const hooks = snap.docs
      .map((d) => d.data())
      .filter((h) => Array.isArray(h.events) && (h.events as string[]).includes(event));

    await Promise.allSettled(
      hooks.map((h) =>
        fetch(h.url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload }),
        }).catch((err) => console.error('[outbound webhook] failed', h.url, err.message)),
      ),
    );
  } catch (err) {
    // Outbound failures must never break the inbound request
    console.error('[fireOutboundWebhooks] error', err);
  }
}

// ─── Auth helper for API routes ───────────────────────────────────────────────
export function validateApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key');
  const expected = process.env.WEBHOOK_API_KEY;
  if (!expected) {
    console.error('[validateApiKey] WEBHOOK_API_KEY env var is not set');
    return false;
  }
  return apiKey === expected;
}
