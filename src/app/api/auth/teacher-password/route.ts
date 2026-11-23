import { NextResponse } from 'next/server';
import {
  authenticate,
  updateTeacherPassword,
  verifyTeacherPassword,
} from '../../../../lib/homework-server';

function respond(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth || auth.role !== 'teacher') {
    return respond('先生アカウントでのログインが必要です', 401);
  }

  try {
    const body = (await request.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword.trim() : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword.trim() : '';

    if (!currentPassword) {
      return respond('現在のパスワードを入力してください', 400);
    }

    const ok = await verifyTeacherPassword(currentPassword);
    if (!ok) {
      return respond('現在のパスワードが正しくありません', 400);
    }

    if (newPassword.length < 4 || newPassword.length > 64) {
      return respond('新しいパスワードは4文字以上64文字以内で入力してください', 400);
    }

    await updateTeacherPassword(newPassword);

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return respond(
      'パスワードの更新に失敗しました: ' +
        (error instanceof Error ? error.message : 'Unknown error'),
      500
    );
  }
}
