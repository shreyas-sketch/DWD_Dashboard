import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/webhooks/health
 *
 * Diagnostic endpoint — call this with your x-api-key header to check
 * whether Firebase Admin SDK is configured correctly on the server.
 *
 * Returns JSON with env-var presence and a live Firestore test.
 * Does NOT expose actual secret values.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const expected = process.env.WEBHOOK_API_KEY;

  // Require the API key so we don't leak config info publicly
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: Record<string, unknown> = {};

  // ── 1. Check env var presence (never expose values) ──────────────────────
  result.envVars = {
    FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    WEBHOOK_API_KEY: !!process.env.WEBHOOK_API_KEY,
  };

  // Peek at private key format (length + first/last 10 chars — safe to expose)
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '';
  result.privateKeyInfo = {
    length: rawKey.length,
    startsCorrectly: rawKey.replace(/\\n/g, '\n').startsWith('-----BEGIN PRIVATE KEY-----'),
    endsCorrectly: rawKey.replace(/\\n/g, '\n').trimEnd().endsWith('-----END PRIVATE KEY-----'),
    containsLiteralBackslashN: rawKey.includes('\\n'),
    containsRealNewline: rawKey.includes('\n'),
  };

  // ── 2. Try to initialise Firebase Admin & run a Firestore read ────────────
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    // Lightweight read — collection doesn't need to exist
    await db.collection('_healthcheck').limit(1).get();
    result.firebaseAdmin = 'ok';
  } catch (err) {
    result.firebaseAdmin = 'error';
    result.firebaseAdminError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
