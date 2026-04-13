import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, validateApiKey, fireOutboundWebhooks } from '@/lib/firebase-admin';

// ─── POST /api/webhooks/batches ───────────────────────────────────────────────
// Create a new batch inside a program level.
// Body: { programId, levelId, batchNumber, batchName?, startDate?, endDate?, remarks? }
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

  const { programId, levelId, batchNumber, batchName, startDate, endDate, remarks } = body as Record<
    string,
    string | undefined
  >;

  if (!programId) return NextResponse.json({ error: 'programId is required' }, { status: 400 });
  if (!levelId) return NextResponse.json({ error: 'levelId is required' }, { status: 400 });
  if (!batchNumber) return NextResponse.json({ error: 'batchNumber is required' }, { status: 400 });

  try {
    const db = getAdminDb();

    // Verify program exists
    const programSnap = await db.collection('programs').doc(programId).get();
    if (!programSnap.exists) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    // Verify level exists and belongs to the program
    const levelSnap = await db.collection('levels').doc(levelId).get();
    if (!levelSnap.exists || levelSnap.data()?.programId !== programId) {
      return NextResponse.json({ error: 'Level not found in this program' }, { status: 404 });
    }

    // Check for duplicate batchNumber in this level
    const dupSnap = await db
      .collection('batches')
      .where('levelId', '==', levelId)
      .where('batchNumber', '==', batchNumber.trim())
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      return NextResponse.json(
        { error: 'A batch with this batchNumber already exists in this level', batchId: dupSnap.docs[0].id },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const batchRef = db.collection('batches').doc();
    const batchDoc = {
      id: batchRef.id,
      programId,
      levelId,
      batchNumber: batchNumber.trim(),
      batchName: batchName?.trim() ?? '',
      startDate: startDate?.trim() ?? '',
      endDate: endDate?.trim() ?? '',
      remarks: remarks?.trim() ?? '',
      assignedCallingAssistIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: 'api',
    };
    await batchRef.set(batchDoc);

    // Fire outbound webhooks (non-blocking)
    void fireOutboundWebhooks('batch_created', {
      batchId: batchRef.id,
      programId,
      levelId,
      batchNumber: batchDoc.batchNumber,
      batchName: batchDoc.batchName,
    });

    return NextResponse.json({ success: true, batchId: batchRef.id }, { status: 201 });
  } catch (err) {
    console.error('[webhook/batches POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
