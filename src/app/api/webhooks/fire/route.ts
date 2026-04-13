import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyUserToken } from '@/lib/firebase-admin';
import type { WebhookEvent } from '@/types';

// ─── POST /api/webhooks/fire ──────────────────────────────────────────────────
// Internal endpoint — called by the dashboard frontend to fire outbound webhooks.
// Body: { event: WebhookEvent, data: object }
// Auth: Firebase ID token in x-firebase-token or Authorization: Bearer <token>
export async function POST(req: NextRequest) {
  const user = await verifyUserToken(req, 'admin');
  if (!user) {
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
