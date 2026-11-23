'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

function getClientAuth(): Auth {
  if (!isFirebaseClientConfigured()) {
    throw new Error('Firebase Authentication の環境変数が設定されていません');
  }
  const app: FirebaseApp = getApps()[0] || initializeApp(firebaseConfig);
  return getAuth(app);
}

export async function signInWithGoogleForGate(): Promise<{ idToken: string; email: string } | null> {
  const auth = getClientAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken(true);
    return { idToken, email: result.user.email || '' };
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function consumeGoogleRedirectIdToken(): Promise<{ idToken: string; email: string } | null> {
  if (!isFirebaseClientConfigured()) return null;
  const auth = getClientAuth();
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  const idToken = await result.user.getIdToken(true);
  return { idToken, email: result.user.email || '' };
}

export async function signOutGoogleGate(): Promise<void> {
  if (!isFirebaseClientConfigured()) return;
  try {
    const auth = getClientAuth();
    await signOut(auth);
  } catch {
    // ignore
  }
}
