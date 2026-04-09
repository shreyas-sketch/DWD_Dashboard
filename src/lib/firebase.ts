import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Must be declared before firebaseConfig so the isBrowser guard applies to initializeApp too.
// This prevents Next.js from calling initializeApp during static prerendering (server-side),
// where NEXT_PUBLIC_FIREBASE_* vars resolve to undefined and Firebase throws auth/invalid-api-key.
const isBrowser = typeof window !== 'undefined';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only initialize Firebase on the client. On the server (prerender/build) we return null
// so no Firebase call is ever attempted, avoiding auth/invalid-api-key build errors.
const app: FirebaseApp | null = isBrowser
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

function getMissingClientEnvKeys() {
  return Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function assertFirebaseClientEnv() {
  const missingKeys = getMissingClientEnvKeys();

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing Firebase client environment variables: ${missingKeys.join(', ')}. ` +
        'Set the NEXT_PUBLIC_FIREBASE_* values in Vercel project settings.',
    );
  }
}

export const auth = (isBrowser && app
  ? (() => {
      assertFirebaseClientEnv();
      return getAuth(app);
    })()
  : null) as Auth;

export const db = (isBrowser && app
  ? (() => {
      assertFirebaseClientEnv();
      return getFirestore(app);
    })()
  : null) as Firestore;

export default app;
