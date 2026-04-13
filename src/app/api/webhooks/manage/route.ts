import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyUserToken } from '@/lib/firebase-admin';

function authError(result: { status: number; reason: string }) {
  return NextResponse.json({ error: result.reason }, { status: result.status });
}

// ─── GET /api/webhooks/manage ─── list all webhooks ──────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyUserToken(req, 'admin');
  if (!auth.ok) return authError(auth);

  try {
    const db = getAdminDb();
    const snap = await db.collection('webhooks').orderBy('createdAt', 'desc').get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ webhooks: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch webhooks';
    console.error('[webhooks/manage GET]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/webhooks/manage ─── create webhook ────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyUserToken(req, 'admin');
  if (!auth.ok) return authError(auth);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, url, events } = body as Record<string, unknown>;
  if (!name || !url || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'name, url, and events are required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const ref = await db.collection('webhooks').add({
      name, url, events, active: true, createdBy: auth.uid,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create webhook';
    console.error('[webhooks/manage POST]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH /api/webhooks/manage ─── update webhook ───────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await verifyUserToken(req, 'admin');
  if (!auth.ok) return authError(auth);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, ...updates } = body as { id: string; [k: string]: unknown };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const db = getAdminDb();
    await db.collection('webhooks').doc(id).update({ ...updates, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update webhook';
    console.error('[webhooks/manage PATCH]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/webhooks/manage ─── delete webhook ──────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyUserToken(req, 'admin');
  if (!auth.ok) return authError(auth);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const db = getAdminDb();
    await db.collection('webhooks').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete webhook';
    console.error('[webhooks/manage DELETE]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
