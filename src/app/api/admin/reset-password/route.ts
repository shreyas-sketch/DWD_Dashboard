import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

// POST /api/admin/reset-password
// Headers: Authorization: Bearer <idToken>
// Body: { uid: string, password: string }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auth, db } = getAdminApp();

  // Verify caller is an admin
  let callerUid: string;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { uid?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { uid, password } = body;
  if (!uid || !password || password.length < 8) {
    return NextResponse.json({ error: 'uid and password (min 8 chars) are required' }, { status: 400 });
  }

  try {
    await auth.updateUser(uid, { password });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Failed to update password';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
