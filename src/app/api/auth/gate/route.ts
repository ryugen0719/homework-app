import { NextResponse } from 'next/server';
import {
  createGateToken,
  GATE_COOKIE_NAME,
  getAllowedGoogleEmails,
  isGoogleGateEnabled,
  verifyGateRequest,
} from '../../../../lib/google-gate';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Firebase Identity Toolkit REST API で ID トークンを公式検証し、
 * メールアドレス・検証済み状態・アカウント有効状態を取得する。
 * （firebase-admin/auth のバンドル依存を持たないため、Serverless環境でも軽量・安定動作する）
 */
async function verifyFirebaseIdTokenViaRest(idToken: string): Promise<{
  email: string;
  emailVerified: boolean;
  disabled: boolean;
}> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '';
  if (!apiKey) {
    throw new Error('Firebase Web API key is not configured');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    throw new Error(`Token verification failed (${res.status})`);
  }

  const data = (await res.json()) as {
    users?: Array<{
      email?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    }>;
  };
  const user = data.users?.[0];
  if (!user || typeof user.email !== 'string') {
    throw new Error('User not found for token');
  }

  return {
    email: user.email.trim().toLowerCase(),
    emailVerified: Boolean(user.emailVerified),
    disabled: Boolean(user.disabled),
  };
}

export async function GET(request: Request) {
  try {
    const result = verifyGateRequest(request);
    return json({
      enabled: result.enabled,
      authenticated: result.ok,
      email: result.email,
    });
  } catch (err) {
    console.error('[gate GET] error:', err);
    return json({ error: '認証状態の確認に失敗しました' }, 500);
  }
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

    const user = await verifyFirebaseIdTokenViaRest(idToken);

    if (user.disabled) {
      return json({ error: 'このGoogleアカウントは無効化されています' }, 403);
    }

    if (!user.email || !user.emailVerified) {
      return json({ error: 'メールアドレスが確認されたGoogleアカウントを使用してください' }, 403);
    }

    const allowed = getAllowedGoogleEmails();
    if (!allowed.has(user.email)) {
      return json(
        {
          error: `このGoogleアカウント（${user.email}）はアクセスが許可されていません`,
          deniedEmail: user.email,
        },
        403
      );
    }

    const sessionToken = createGateToken(user.email);
    const response = json({ ok: true, email: user.email });
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
  } catch (err) {
    console.error('[gate POST] error:', err);
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
