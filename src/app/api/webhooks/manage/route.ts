import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Ensure Admin SDK initialised (shares singleton with getAdminDb)
function ensureAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
}

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('x-firebase-token');
  if (!token) return false;
  try {
    ensureAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

// ─── GET /api/webhooks/manage ─── list all webhooks ──────────────────────────
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getAdminDb();
  const snap = await db.collection('webhooks').orderBy('createdAt', 'desc').get();
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ webhooks: data });
}

// ─── POST /api/webhooks/manage ─── create webhook ────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, url, events, createdBy } = body as Record<string, unknown>;
  if (!name || !url || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'name, url, and events are required' }, { status: 400 });
  }
  const db = getAdminDb();
  const ref = await db.collection('webhooks').add({
    name, url, events, active: true, createdBy: createdBy ?? null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id: ref.id });
}

// ─── PATCH /api/webhooks/manage ─── update webhook ───────────────────────────
export async function PATCH(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { id, ...updates } = body as { id: string; [k: string]: unknown };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const db = getAdminDb();
  await db.collection('webhooks').doc(id).update({ ...updates, updatedAt: new Date().toISOString() });
  return NextResponse.json({ success: true });
}

// ─── DELETE /api/webhooks/manage ─── delete webhook ──────────────────────────
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const db = getAdminDb();
  await db.collection('webhooks').doc(id).delete();
  return NextResponse.json({ success: true });
}
