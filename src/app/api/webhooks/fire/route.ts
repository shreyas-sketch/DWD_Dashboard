import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { WebhookEvent } from '@/types';

// ─── Firebase Admin init (client-side token auth) ─────────────────────────────
function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore(getApp());
}

// ─── POST /api/webhooks/fire ──────────────────────────────────────────────────
// Internal endpoint — called by the dashboard frontend to fire outbound webhooks
// when a dashboard action happens (lead created, batch created, etc.).
//
// Body: { event: WebhookEvent, data: object }
// Auth: Firebase ID token in Authorization: Bearer <token>
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { event: WebhookEvent; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event, data } = body;
  if (!event || !data) {
    return NextResponse.json({ error: 'event and data are required' }, { status: 400 });
  }

  // Verify the user is authenticated (Firebase ID token)
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const token = authHeader.slice(7);
    await getAuth(getApp()).verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection('webhooks')
      .where('active', '==', true)
      .get();

    const hooks = snap.docs
      .map((d) => d.data())
      .filter((h) => Array.isArray(h.events) && (h.events as string[]).includes(event));

    const results = await Promise.allSettled(
      hooks.map(async (h) => {
        const res = await fetch(h.url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
        });
        return { url: h.url, status: res.status };
      }),
    );

    const fired = results.map((r, i) => ({
      url: hooks[i]?.url ?? '',
      success: r.status === 'fulfilled',
      status: r.status === 'fulfilled' ? r.value.status : null,
      error: r.status === 'rejected' ? String(r.reason) : null,
    }));

    return NextResponse.json({ fired, count: fired.length });
  } catch (err) {
    console.error('[webhook/fire POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
