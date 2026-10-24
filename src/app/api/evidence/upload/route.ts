import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { authorize, database, isStudentDate, parseEvidencePath, tasksFromEntry } from '@/lib/homework-server';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (authorize(request) !== 'student') return respond('この操作はできません', 403);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return respond('画像保存の設定がありません', 503);

  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (authorize(request) !== 'student' || !clientPayload) throw new Error('Upload not allowed');
        const requested = parseEvidencePath(pathname);
        let payload: { date?: unknown; taskId?: unknown };
        try {
          payload = JSON.parse(clientPayload) as { date?: unknown; taskId?: unknown };
        } catch {
          throw new Error('Upload not allowed');
        }
        if (!requested || payload.date !== requested.date || payload.taskId !== requested.taskId || !isStudentDate(requested.date)) {
          throw new Error('Upload not allowed');
        }
        const snapshot = await database().collection('days').doc(requested.date).get();
        if (!snapshot.exists || !tasksFromEntry(snapshot.data() || {}).some((task) => task.id === requested.taskId)) {
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
