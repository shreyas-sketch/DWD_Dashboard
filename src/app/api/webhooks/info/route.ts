import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, validateApiKey } from '@/lib/firebase-admin';

// ─── GET /api/webhooks/info ────────────────────────────────────────────────────
// Look up IDs by name — useful in Zapier "lookup" steps before creating leads.
//
// Query params:
//   ?resource=programs
//   ?resource=levels&programId=<id>
//   ?resource=batches&levelId=<id>
//   ?resource=batch&batchId=<id>          — single batch details
//
// Returns: { items: [{ id, name, ... }] }
export async function GET(req: NextRequest) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get('resource');

  try {
    const db = getAdminDb();

    if (resource === 'programs') {
      const snap = await db.collection('programs').orderBy('name', 'asc').get();
      const items = snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }));
      return NextResponse.json({ items });
    }

    if (resource === 'levels') {
      const programId = searchParams.get('programId');
      if (!programId) {
        return NextResponse.json({ error: 'programId is required for resource=levels' }, { status: 400 });
      }
      const snap = await db
        .collection('levels')
        .where('programId', '==', programId)
        .orderBy('order', 'asc')
        .get();
      const items = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        order: d.data().order as number,
      }));
      return NextResponse.json({ items });
    }

    if (resource === 'batches') {
      const levelId = searchParams.get('levelId');
      if (!levelId) {
        return NextResponse.json({ error: 'levelId is required for resource=batches' }, { status: 400 });
      }
      const snap = await db
        .collection('batches')
        .where('levelId', '==', levelId)
        .orderBy('createdAt', 'desc')
        .get();
      const items = snap.docs.map((d) => ({
        id: d.id,
        batchNumber: d.data().batchNumber as string,
        batchName: d.data().batchName as string,
        programId: d.data().programId as string,
        levelId: d.data().levelId as string,
      }));
      return NextResponse.json({ items });
    }

    if (resource === 'batch') {
      const batchId = searchParams.get('batchId');
      if (!batchId) {
        return NextResponse.json({ error: 'batchId is required for resource=batch' }, { status: 400 });
      }
      const snap = await db.collection('batches').doc(batchId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
      return NextResponse.json({ batch: { id: snap.id, ...snap.data() } });
    }

    return NextResponse.json(
      { error: 'resource must be one of: programs, levels, batches, batch' },
      { status: 400 },
    );
  } catch (err) {
    console.error('[webhook/info GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
