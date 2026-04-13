import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, validateApiKey, fireOutboundWebhooks } from '@/lib/firebase-admin';

// ─── POST /api/webhooks/leads ─────────────────────────────────────────────────
// Add a lead to a batch. Two lookup modes:
//   Mode A (by batchId):  { batchId, name, email, phone }
//   Mode B (by program):  { programId, levelId, batchNumber?, name, email, phone }
//                         — if batchNumber is omitted the most-recently-created batch is used
export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { batchId, programId, levelId, batchNumber, name, email, phone } = body as Record<string, string | undefined>;

  if (!name && !email && !phone) {
    return NextResponse.json({ error: 'At least one of name, email, phone is required' }, { status: 400 });
  }

  // Need either batchId or (programId + levelId)
  if (!batchId && (!programId || !levelId)) {
    return NextResponse.json(
      { error: 'Provide either batchId or both programId and levelId' },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    let resolvedBatchId: string;
    let batchData: FirebaseFirestore.DocumentData;

    if (batchId) {
      // Mode A — direct batchId
      const snap = await db.collection('batches').doc(batchId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
      resolvedBatchId = batchId;
      batchData = snap.data()!;
    } else {
      // Mode B — look up by programId + levelId + optional batchNumber
      let q = db
        .collection('batches')
        .where('programId', '==', programId!)
        .where('levelId', '==', levelId!);

      if (batchNumber) {
        q = q.where('batchNumber', '==', batchNumber) as typeof q;
      } else {
        q = (q as FirebaseFirestore.Query).orderBy('createdAt', 'desc').limit(1) as typeof q;
      }

      const snap = await q.get();
      if (snap.empty) {
        return NextResponse.json(
          { error: 'No matching batch found for the given programId / levelId' },
          { status: 404 },
        );
      }
      const doc = snap.docs[0];
      resolvedBatchId = doc.id;
      batchData = doc.data();
    }

    // Duplicate-email check within the same batch
    if (email?.trim()) {
      const dupSnap = await db
        .collection('leads')
        .where('batchId', '==', resolvedBatchId)
        .where('email', '==', email.trim().toLowerCase())
        .limit(1)
        .get();
      if (!dupSnap.empty) {
        return NextResponse.json(
          { error: 'A lead with this email already exists in this batch', leadId: dupSnap.docs[0].id },
          { status: 409 },
        );
      }
    }

    // Next serial number
    const countSnap = await db
      .collection('leads')
      .where('batchId', '==', resolvedBatchId)
      .count()
      .get();
    const serialNumber = countSnap.data().count + 1;

    const now = new Date().toISOString();
    const leadRef = db.collection('leads').doc();
    const leadDoc = {
      id: leadRef.id,
      batchId: resolvedBatchId,
      programId: batchData.programId ?? '',
      levelId: batchData.levelId ?? '',
      name: name?.trim() ?? '',
      email: email?.trim().toLowerCase() ?? '',
      phone: phone?.trim() ?? '',
      handlerId: null,
      handlerName: null,
      serialNumber,
      source: 'api' as const,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    await leadRef.set(leadDoc);

    // Fire outbound webhooks (non-blocking)
    void fireOutboundWebhooks('lead_created', {
      leadId: leadRef.id,
      batchId: resolvedBatchId,
      programId: batchData.programId,
      levelId: batchData.levelId,
      name: leadDoc.name,
      email: leadDoc.email,
      phone: leadDoc.phone,
      serialNumber,
    });

    return NextResponse.json(
      { success: true, leadId: leadRef.id, batchId: resolvedBatchId, serialNumber },
      { status: 201 },
    );
  } catch (err) {
    console.error('[webhook/leads POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET /api/webhooks/leads?batchId=xxx ─────────────────────────────────────
// Export all leads from a batch (useful as a Zapier lookup step)
export async function GET(req: NextRequest) {
  if (!validateApiKey(req)) {
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
    console.error('[webhook/leads GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
