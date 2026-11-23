import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import {
  createGateToken,
  GATE_COOKIE_NAME,
  getAllowedGoogleEmails,
  getFirebaseAdminApp,
  isGoogleGateEnabled,
  verifyGateRequest,
} from '../../../../lib/google-gate';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const result = verifyGateRequest(request);
  return json({
    enabled: result.enabled,
    authenticated: result.ok,
    email: result.email,
  });
}

export async function POST(request: Request) {
  if (!isGoogleGateEnabled()) {
    return json({ ok: true, enabled: false });
  }

  try {
    const body = (await request.json()) as { idToken?: unknown };
    const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      return json({ error: '認証トークンが見つかりません' }, 400);
    }

    const app = getFirebaseAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const email = (decoded.email || '').trim().toLowerCase();

    if (!email || decoded.email_verified !== true) {
      return json({ error: 'メールアドレスが確認されたGoogleアカウントを使用してください' }, 403);
    }

    const allowed = getAllowedGoogleEmails();
    if (!allowed.has(email)) {
      return json(
        {
          error: `このGoogleアカウント（${email}）はアクセスが許可されていません`,
          deniedEmail: email,
        },
        403
      );
    }

    const sessionToken = createGateToken(email);
    const response = json({ ok: true, email });
    response.cookies.set({
      name: GATE_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return json({ error: 'Google認証の確認に失敗しました。もう一度お試しください。' }, 401);
  }
}

export async function DELETE() {
  const response = json({ ok: true });
  response.cookies.set({
    name: GATE_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
