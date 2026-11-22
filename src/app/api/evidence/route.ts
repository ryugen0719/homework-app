import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { authenticate, database, parseEvidencePath, sessionsFromDay } from '../../../lib/homework-server';

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return new NextResponse('Not found', { status: 404 });

  const pathname = request.nextUrl.searchParams.get('pathname') || '';
  const evidence = parseEvidencePath(pathname);
  if (!evidence) return new NextResponse('Not found', { status: 404 });

  const db = database();

  // 生徒本人のアクセス検証
  if (auth.role === 'student') {
    if (auth.studentId !== evidence.studentId) {
      return new NextResponse('Not found', { status: 404 });
    }
  } else if (auth.role === 'teacher') {
    // 担当生徒かどうかの検証
    if (evidence.studentId !== 'default-student') {
      const studentDoc = await db.collection('students').doc(evidence.studentId).get();
      if (!studentDoc.exists) return new NextResponse('Not found', { status: 404 });
      const studentData = studentDoc.data() || {};
      if (studentData.teacherId !== auth.teacherId) {
        return new NextResponse('Not found', { status: 404 });
      }
    }
  } else {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    // Firestore からセッションの確認
    let snapshot = await db.collection('students').doc(evidence.studentId).collection('days').doc(evidence.date).get();
    if (!snapshot.exists && evidence.studentId === 'default-student') {
      // 旧コレクション days/{date} へのフォールバック
      snapshot = await db.collection('days').doc(evidence.date).get();
    }

    const session = sessionsFromDay(snapshot.data() || {}).find((item) => item.id === evidence.sessionId);
    if (!session || session.evidencePath !== pathname) {
      return new NextResponse('Not found', { status: 404 });
    }

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
