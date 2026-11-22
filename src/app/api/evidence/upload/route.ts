import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { authenticate, database, isStudentDate, parseEvidencePath, sessionsFromDay } from '../../../../lib/homework-server';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth || auth.role !== 'student') return respond('この操作はできません', 403);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return respond('画像保存の設定がありません', 503);

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!clientPayload) throw new Error('Upload not allowed');
        const requested = parseEvidencePath(pathname);
        let payload: { date?: unknown; sessionId?: unknown; studentId?: unknown };
        try {
          payload = JSON.parse(clientPayload) as { date?: unknown; sessionId?: unknown; studentId?: unknown };
        } catch {
          throw new Error('Upload not allowed');
        }
        if (!requested || payload.date !== requested.date || payload.sessionId !== requested.sessionId || !isStudentDate(requested.date)) {
          throw new Error('Upload not allowed');
        }

        // 認可チェック: アップロード要求の生徒IDが認証主体と一致しているか
        if (requested.studentId !== auth.studentId) {
          throw new Error('Upload not allowed');
        }

        const db = database();
        let snapshot = await db.collection('students').doc(auth.studentId).collection('days').doc(requested.date).get();
        if (!snapshot.exists && auth.studentId === 'default-student') {
          snapshot = await db.collection('days').doc(requested.date).get();
        }

        if (!snapshot.exists || !sessionsFromDay(snapshot.data() || {}).some((session) => session.id === requested.sessionId)) {
          throw new Error('Upload not allowed');
        }

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify(requested),
        };
      },
    });
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('画像をアップロードできませんでした', 400);
  }
}
