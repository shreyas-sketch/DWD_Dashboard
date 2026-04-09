import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Firebase Admin init ───────────────────────────────────────────────────────
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
  return getFirestore();
}

// ─── POST /api/webhooks/leads ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth: validate API key
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.WEBHOOK_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { batchId, name, email, phone } = body as {
    batchId?: string;
    name?: string;
    email?: string;
    phone?: string;
  };

  if (!batchId || typeof batchId !== 'string') {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }
  if (!name && !email && !phone) {
    return NextResponse.json({ error: 'At least one of name, email, phone is required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Verify batch exists
    const batchRef = db.collection('batches').doc(batchId);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }
    const batchData = batchSnap.data()!;

    // Get next serial number
    const leadsSnap = await db.collection('leads').where('batchId', '==', batchId).count().get();
    const serialNumber = leadsSnap.data().count + 1;

    // Create lead
    const leadRef = db.collection('leads').doc();
    const now = new Date().toISOString();
    await leadRef.set({
      id: leadRef.id,
      batchId,
      programId: batchData.programId ?? '',
      levelId: batchData.levelId ?? '',
      name: (name as string | undefined)?.trim() ?? '',
      email: (email as string | undefined)?.trim().toLowerCase() ?? '',
      phone: (phone as string | undefined)?.trim() ?? '',
      handlerId: null,
      handlerName: null,
      serialNumber,
      createdAt: now,
      updatedAt: now,
      source: 'api',
    });

    return NextResponse.json({ success: true, leadId: leadRef.id, serialNumber }, { status: 201 });
  } catch (err) {
    console.error('[webhook/leads] error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET /api/webhooks/leads — export leads from a batch ──────────────────────
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.WEBHOOK_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId query param required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection('leads')
      .where('batchId', '==', batchId)
      .orderBy('serialNumber', 'asc')
      .get();

    const leads = snap.docs.map((d) => d.data());
    return NextResponse.json({ leads, count: leads.length });
  } catch (err) {
    console.error('[webhook/leads GET] error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
