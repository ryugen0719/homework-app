import crypto from 'node:crypto';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';

export const GATE_COOKIE_NAME = 'hw_gate';
const GATE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

function getFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase is not configured');
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export { getFirebaseAdminApp };

/**
 * 許可されたGoogleメールアドレス一覧を取得（環境変数 ALLOWED_GOOGLE_EMAILS）
 * カンマ・空白・改行区切りに対応し、小文字に正規化する。
 */
export function getAllowedGoogleEmails(): Set<string> {
  const raw = process.env.ALLOWED_GOOGLE_EMAILS || '';
  const list = raw
    .split(/[,\s\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

export function isGoogleGateEnabled(): boolean {
  return getAllowedGoogleEmails().size > 0;
}

function getGateSecret(): string {
  const secret =
    process.env.GATE_SESSION_SECRET ||
    process.env.TEACHER_TOKEN ||
    process.env.FIREBASE_PRIVATE_KEY;
  if (!secret) {
    throw new Error('Gate session secret is not configured');
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getGateSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createGateToken(email: string): string {
  const payload = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + GATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function verifyGateToken(token: string): { ok: true; email: string } | { ok: false } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { ok: false };
    const [encoded, sig] = parts;
    if (!encoded || !sig) return { ok: false };

    const expectedSig = signPayload(encoded);
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: false };
    }

    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') {
      return { ok: false };
    }
    if (Date.now() > parsed.exp) {
      return { ok: false };
    }

    const normalized = parsed.email.trim().toLowerCase();
    const allowed = getAllowedGoogleEmails();
    if (allowed.size > 0 && !allowed.has(normalized)) {
      return { ok: false };
    }

    return { ok: true, email: normalized };
  } catch {
    return { ok: false };
  }
}

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export function verifyGateRequest(request: Request): {
  ok: boolean;
  enabled: boolean;
  email: string | null;
} {
  const enabled = isGoogleGateEnabled();
  if (!enabled) {
    return { ok: true, enabled: false, email: null };
  }
  const cookieVal = parseCookieValue(request.headers.get('cookie'), GATE_COOKIE_NAME);
  if (!cookieVal) {
    return { ok: false, enabled: true, email: null };
  }
  const verified = verifyGateToken(cookieVal);
  if (!verified.ok) {
    return { ok: false, enabled: true, email: null };
  }
  return { ok: true, enabled: true, email: verified.email };
}
