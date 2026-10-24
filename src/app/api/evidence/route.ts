import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { authorize, database, parseEvidencePath, tasksFromEntry } from '@/lib/homework-server';

export async function GET(request: NextRequest) {
  const role = authorize(request);
  if (!role) return new NextResponse('Not found', { status: 404 });
  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  const evidence = parseEvidencePath(pathname);
  if (!evidence) return new NextResponse('Not found', { status: 404 });

  try {
    const snapshot = await database().collection('days').doc(evidence.date).get();
    const task = tasksFromEntry(snapshot.data() || {}).find((item) => item.id === evidence.taskId);
    if (!task || task.evidencePath !== pathname) return new NextResponse('Not found', { status: 404 });
    const blob = await get(pathname, { access: 'private' });
    if (!blob || blob.statusCode !== 200 || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.blob.contentType)) {
      return new NextResponse('Not found', { status: 404 });
    }
    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': blob.blob.contentType,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse('Image unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
