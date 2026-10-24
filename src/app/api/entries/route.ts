import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

type EntryInput = {
  date?: unknown;
  text?: unknown;
  isRestDay?: unknown;
  done?: unknown;
  stamp?: unknown;
  comment?: unknown;
  reviewedAt?: unknown;
};

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function database() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase is not configured');
  const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return getFirestore(app);
}

function authorize(request: Request) {
  const token = request.headers.get('x-app-token');
  if (!token) return null;
  if (token.length >= 32 && token === process.env.TEACHER_TOKEN) return 'teacher';
  if (token.length >= 32 && token === process.env.STUDENT_TOKEN) return 'student';
  return null;
}

export async function GET(request: Request) {
  if (!authorize(request)) return respond('ページを表示できません', 404);
  try {
    const snapshot = await database().collection('days').get();
    const entries = Object.fromEntries(snapshot.docs.map((document) => {
      const data = Object.fromEntries(Object.entries(document.data()).filter(([key]) => key !== 'photos'));
      return [document.id, data];
    }));
    return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('データを読み込めませんでした', 503);
  }
}

export async function PUT(request: Request) {
  const role = authorize(request);
  if (!role) return respond('ページを表示できません', 404);
  try {
    const payload = await request.json() as { entry?: EntryInput };
    const value = payload.entry;
    if (!value || typeof value !== 'object' || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
      return respond('入力を確認してください', 400);
    }

    const date = value.date;
    const reference = database().collection('days').doc(date);
    const snapshot = await reference.get();
    const previous = snapshot.data() || {};

    if (role === 'student') {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
      const yesterdayDate = new Date(`${today}T12:00:00+09:00`);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(yesterdayDate);
      if (date !== today && date !== yesterday) return respond('この日は完了にできません', 403);
      if (typeof previous.text !== 'string' || previous.text.length === 0 || previous.isRestDay === true) {
        return respond('この日に登録された宿題はありません', 409);
      }
      const done = value.done === true;
      await reference.set({ ...previous, date, done, doneAt: done ? new Date().toISOString() : null });
    } else {
      if (typeof value.text !== 'string' || value.text.length > 5000) return respond('宿題は5000文字以内で入力してください', 400);
      if (typeof value.comment === 'string' && value.comment.length > 60) return respond('コメントは60文字以内で入力してください', 400);
      const isRestDay = value.isRestDay === true;
      if (!isRestDay && value.text.trim().length === 0) return respond('宿題を入力してください', 400);
      const next: Record<string, unknown> = {
        ...previous,
        date,
        text: isRestDay ? '' : value.text,
        isRestDay,
        ...(isRestDay ? { done: false, doneAt: null, stamp: null, comment: null, reviewedAt: null } : {}),
      };
      if (value.stamp === '確認しました' || value.stamp === 'よくできました' || value.stamp === 'ていねいです') next.stamp = value.stamp;
      if (typeof value.comment === 'string') next.comment = value.comment.slice(0, 60);
      if (typeof value.reviewedAt === 'string') next.reviewedAt = value.reviewedAt;
      await reference.set(next);
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('データを保存できませんでした', 503);
  }
}

export async function DELETE(request: Request) {
  const role = authorize(request);
  if (!role) return respond('ページを表示できません', 404);
  if (role !== 'teacher') return respond('この操作はできません', 403);
  try {
    const payload = await request.json() as { date?: unknown };
    if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return respond('日付を確認してください', 400);
    await database().collection('days').doc(payload.date).delete();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('削除できませんでした。通信状況を確認して、もう一度お試しください', 503);
  }
}
