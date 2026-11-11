import { del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { authorize, database, isStudentDate, parseEvidencePath, sessionsFromDay, validDate, weekStartFor } from '../../../lib/homework-server';

type Payload = Record<string, unknown>;
const stamps = ['確認しました', 'よくできました', 'ていねいです'];
const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const validSessionId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
function validMonth(month: unknown): month is string {
  if (typeof month !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return false;
  const year = Number(match[1]);
  const m = Number(match[2]);
  return year >= 2000 && year <= 2100 && m >= 1 && m <= 12;
}

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const role = authorize(request);
  if (!role) return respond('ページを表示できません', 404);
  try {
    const db = database();
    const url = new URL(request.url);
    const month = url.searchParams.get('month');
    const weekStart = url.searchParams.get('weekStart');

    let dates: string[] = [];
    if (month) {
      if (!validMonth(month)) return respond('月の指定を確認してください', 400);
      const [yearStr, monthStr] = month.split('-');
      const year = Number(yearStr);
      const m = Number(monthStr);
      const lastDay = new Date(year, m, 0).getDate();
      dates = Array.from({ length: lastDay }, (_, index) => {
        const dayStr = String(index + 1).padStart(2, '0');
        return `${month}-${dayStr}`;
      });
    } else if (weekStart) {
      if (!validDate(weekStart) || weekStartFor(weekStart) !== weekStart) return respond('週の指定を確認してください', 400);
      const start = new Date(`${weekStart}T12:00:00+09:00`);
      dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
      });
    } else {
      return respond('月または週を指定してください', 400);
    }

    const snapshots = await Promise.all(dates.map((date) => db.collection('days').doc(date).get()));
    const entries = Object.fromEntries(snapshots.flatMap((snapshot, index) => {
      if (!snapshot.exists) return [];
      const data = snapshot.data() || {};
      const sessions = sessionsFromDay(data);
      const rawReview = data.review && typeof data.review === 'object' ? data.review as Payload : {};
      const review = typeof rawReview.stamp === 'string'
        && stamps.includes(rawReview.stamp)
        && typeof rawReview.comment === 'string'
        && typeof rawReview.reviewedAt === 'string'
        ? { stamp: rawReview.stamp, comment: rawReview.comment, reviewedAt: rawReview.reviewedAt }
        : undefined;
      return [[dates[index], {
        date: dates[index],
        sessions,
        ...(sessions.length && review ? { review } : {}),
      }]];
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
    const { action, ...value } = await request.json() as Payload;
    const db = database();

    if (action === 'session-save') {
      if (role !== 'student' || !validDate(value.date) || value.date > todayJst()) return respond('今日までの日付を選んでください', 403);
      if (!validSessionId(value.id) || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 1000) return respond('勉強した内容を入力してください', 400);
      if (value.minutes !== undefined && (!Number.isInteger(value.minutes) || (value.minutes as number) < 1 || (value.minutes as number) > 1440)) return respond('学習時間は1〜1440分で入力してください', 400);

      const id = value.id;
      const content = value.content.trim();
      const date = value.date;
      const minutes = value.minutes as number | undefined;
      const ref = db.collection('days').doc(value.date);
      const now = new Date().toISOString();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.data() || {};
        const sessions = sessionsFromDay(previous);
        const old = sessions.find((session) => session.id === id);
        const next = {
          id,
          content,
          ...(minutes === undefined ? {} : { minutes }),
          ...(old?.evidencePath ? { evidencePath: old.evidencePath } : {}),
          createdAt: old?.createdAt || now,
          updatedAt: now,
        };
        const updated = old ? sessions.map((session) => session.id === next.id ? next : session) : [...sessions, next];
        transaction.set(ref, { date, sessions: updated, updatedAt: now }, { merge: true });
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'session-delete') {
      if (role !== 'student' || !validDate(value.date) || value.date > todayJst() || !validSessionId(value.sessionId)) return respond('この記録は削除できません', 403);
      const ref = db.collection('days').doc(value.date);
      const removedPath = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.data() || {};
        const sessions = sessionsFromDay(previous);
        const removed = sessions.find((session) => session.id === value.sessionId);
        if (!removed) return undefined;
        transaction.set(ref, { date: value.date, sessions: sessions.filter((session) => session.id !== value.sessionId), updatedAt: new Date().toISOString() }, { merge: true });
        return removed.evidencePath;
      });
      if (removedPath === undefined) {
        const snapshot = await ref.get();
        if (sessionsFromDay(snapshot.data() || {}).some((session) => session.id === value.sessionId)) return respond('記録を削除できませんでした', 503);
      }
      if (removedPath) await del(removedPath).catch(() => undefined);
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'session-photo') {
      if (role !== 'student' || !validDate(value.date) || !isStudentDate(value.date) || !validSessionId(value.sessionId) || typeof value.evidencePath !== 'string') return respond('写真を確認できません', 403);
      const parsed = parseEvidencePath(value.evidencePath);
      if (!parsed || parsed.date !== value.date || parsed.sessionId !== value.sessionId) return respond('写真を確認できません', 400);
      const blob = await head(value.evidencePath);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.contentType) || blob.size > 5 * 1024 * 1024) return respond('画像は5MB以下のJPEG、PNG、WebPにしてください', 400);
      const ref = db.collection('days').doc(value.date);
      const previousPath = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.data() || {};
        const sessions = sessionsFromDay(previous);
        const old = sessions.find((session) => session.id === value.sessionId);
        if (!old) return null;
        transaction.set(ref, {
          date: value.date,
          sessions: sessions.map((session) => session.id === value.sessionId ? { ...session, evidencePath: value.evidencePath, updatedAt: new Date().toISOString() } : session),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        return old.evidencePath || '';
      });
      if (previousPath === null) return respond('記録が見つかりません', 404);
      if (previousPath) await del(previousPath).catch(() => undefined);
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'review') {
      if (role !== 'teacher' || !validDate(value.date) || value.date > todayJst()) return respond('この操作はできません', 403);
      if (typeof value.comment !== 'string' || value.comment.length > 120 || typeof value.stamp !== 'string' || !stamps.includes(value.stamp)) return respond('確認内容を確認してください', 400);
      const comment = value.comment.trim();
      const stamp = value.stamp;
      const ref = db.collection('days').doc(value.date);
      const found = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.data() || {};
        if (!sessionsFromDay(previous).length) return false;
        transaction.set(ref, { date: value.date, review: { stamp, comment, reviewedAt: new Date().toISOString() } }, { merge: true });
        return true;
      });
      if (!found) return respond('学習記録がありません', 404);
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return respond('更新内容を確認してください', 400);
  } catch {
    return respond('データを保存できませんでした', 503);
  }
}
