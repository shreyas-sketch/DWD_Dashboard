import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { WebhookEvent } from '@/types';

export function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
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
  return !!(expected && apiKey === expected);
}
