import { del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authorize, database, dayProgress, isStudentDate, parseEvidencePath, tasksFromWeek, validDate, weekStartFor } from '../../../lib/homework-server';

type Payload = Record<string, unknown>;
function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function validTaskId(id: unknown): id is string { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id); }
function normalizeTasks(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const tasks: { id: string; text: string }[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const task = item as Payload;
    if (!validTaskId(task.id) || ids.has(task.id) || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 500) return null;
    ids.add(task.id); tasks.push({ id: task.id, text: task.text.trim() });
  }
  if (tasks.reduce((sum, task) => sum + task.text.length, 0) > 5000) return null;
  return tasks;
}

export async function GET(request: Request) {
  const role = authorize(request);
  if (!role) return respond('ページを表示できません', 404);
  try {
    const db = database();
    const weekStart = new URL(request.url).searchParams.get('weekStart');
    if (!validDate(weekStart) || weekStartFor(weekStart) !== weekStart) return respond('週の指定を確認してください', 400);
    const start = new Date(`${weekStart}T12:00:00+09:00`);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
    });
    const [weekSnapshot, weekDays, recentDays] = await Promise.all([
      db.collection('weeks').doc(weekStart).get(),
      Promise.all(dates.map((date) => db.collection('days').doc(date).get())),
      role === 'student' ? db.collection('days').orderBy('date', 'desc').limit(12).get() : Promise.resolve(null),
    ]);
    const weekData = weekSnapshot.data();
    if (weekData && role === 'teacher') delete weekData.studentTasks;
    const weeks = weekData ? { [weekStart]: weekData } : {};
    const uniqueDays = new Map([...weekDays, ...(recentDays?.docs || [])].flatMap((snapshot) => snapshot.exists ? [[snapshot.id, snapshot] as const] : []));
    const entries = Object.fromEntries([...uniqueDays].map(([date, snapshot]) => [date, Object.fromEntries(Object.entries(snapshot.data() || {}).filter(([key]) => key !== 'photos' && !(role === 'student' && key === 'planHistory')))]));
    return NextResponse.json({ weeks, entries }, { headers: { 'Cache-Control': 'no-store' } });
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

    if (action === 'week') {
      if (role !== 'teacher' || !validDate(value.weekStart) || weekStartFor(value.weekStart) !== value.weekStart) return respond('週の指定を確認してください', 400);
      const tasks = normalizeTasks(value.tasks);
      if (!tasks) return respond('宿題は1〜20件、各500文字以内で入力してください', 400);
      const ref = db.collection('weeks').doc(value.weekStart);
      const oldSnapshot = await ref.get();
      const old = tasksFromWeek(oldSnapshot.data() || {});
      const removed = old.filter((task) => !tasks.some((next) => next.id === task.id)).map((task) => task.id);
      await ref.set({ weekStart: value.weekStart, tasks, updatedAt: new Date().toISOString() }, { merge: true });
      if (removed.length) {
        const days = await db.collection('days').get();
        const deletions: string[] = [];
        const batch = db.batch();
        for (const doc of days.docs) {
          if (weekStartFor(doc.id) !== value.weekStart) continue;
          const data = doc.data();
          const plans = (data.plans || {}) as Record<string, unknown>;
          const progress = (data.progress || {}) as Record<string, unknown>;
          const update: Record<string, unknown> = {};
          for (const id of removed) {
            if (id in plans) update[`plans.${id}`] = FieldValue.delete();
            const record = progress[id] as Payload | undefined;
            if (record) {
              if (typeof record.evidencePath === 'string') deletions.push(record.evidencePath);
              update[`progress.${id}`] = FieldValue.delete();
            }
          }
          if (Object.keys(update).length) batch.update(doc.ref, update);
        }
        await batch.commit();
        if (deletions.length) await del(deletions).catch(() => undefined);
      }
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'student-week') {
      if (role !== 'student' || !validDate(value.weekStart) || weekStartFor(value.weekStart) !== value.weekStart) return respond('週の指定を確認してください', 400);
      const tasks = value.tasks === undefined ? [] : (Array.isArray(value.tasks) && value.tasks.length <= 20 ? value.tasks : null);
      if (!tasks || tasks.some((item) => {
        if (!item || typeof item !== 'object') return true;
        const task = item as Payload;
        return !validTaskId(task.id) || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 500;
      })) return respond('学習内容は20件以内、各500文字以内で入力してください', 400);
      const teacherTasks = tasksFromWeek((await db.collection('weeks').doc(value.weekStart).get()).data() || {});
      const ref = db.collection('weeks').doc(value.weekStart);
      await ref.set({ weekStart: value.weekStart, studentTasks: tasks, updatedAt: new Date().toISOString() }, { merge: true });
      return NextResponse.json({ ok: true, tasks: [...teacherTasks, ...tasks] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'plan' || action === 'progress') {
      if (role !== 'student' || !validDate(value.date)) return respond('日付を確認してください', 400);
      const date = value.date;
      const weekStart = weekStartFor(date);
      const weekRef = db.collection('weeks').doc(weekStart);
      const weekSnapshot = await weekRef.get();
      const weekData = weekSnapshot.data() || {};
      const weeklyTasks = [...tasksFromWeek(weekData), ...(Array.isArray(weekData.studentTasks) ? weekData.studentTasks as { id: string; text: string }[] : [])];
      const dayRef = db.collection('days').doc(date);
      const daySnapshot = await dayRef.get();
      const previous = daySnapshot.data() || {};
      const validIds = new Set(weeklyTasks.map((task) => task.id));
      if (action === 'plan') {
        if (!value.plans || typeof value.plans !== 'object' || Array.isArray(value.plans)) return respond('計画を確認してください', 400);
        const incoming = value.plans as Record<string, unknown>;
        if (Object.keys(incoming).some((id) => !validIds.has(id) || typeof incoming[id] !== 'string' || (incoming[id] as string).length > 500)) return respond('計画内容を確認してください', 400);
        const oldPlans = (previous.plans || {}) as Record<string, unknown>;
        const history = Array.isArray(previous.planHistory) ? previous.planHistory.slice(-99) as Payload[] : [];
        const now = new Date().toISOString();
        for (const task of weeklyTasks) {
          const from = typeof oldPlans[task.id] === 'string' ? oldPlans[task.id] as string : '';
          const to = typeof incoming[task.id] === 'string' ? (incoming[task.id] as string).trim() : '';
          if (from !== to) history.push({ taskId: task.id, from, to, at: now });
        }
        await dayRef.set({ date, plans: incoming, planHistory: history, updatedAt: now }, { merge: true });
        return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (!isStudentDate(date)) return respond('実績は当日または前日の分を記録できます', 403);
      if (!validTaskId(value.taskId) || !validIds.has(value.taskId) || typeof value.actual !== 'string' || value.actual.length > 1000 || typeof value.done !== 'boolean') return respond('実績内容を確認してください', 400);
      const oldProgress = dayProgress(previous, value.taskId) || {};
      const nextProgress: Payload = { ...oldProgress, actual: value.actual.trim(), done: value.done, updatedAt: new Date().toISOString() };
      if (typeof value.evidencePath === 'string') {
        const parsed = parseEvidencePath(value.evidencePath);
        if (!parsed || parsed.date !== date || parsed.taskId !== value.taskId) return respond('画像を確認できません', 400);
        const blob = await head(value.evidencePath);
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.contentType) || blob.size > 5 * 1024 * 1024) return respond('画像は5MB以下のJPEG、PNG、WebPにしてください', 400);
        nextProgress.evidencePath = value.evidencePath;
      }
      await dayRef.set({ date, progress: { [value.taskId]: nextProgress }, updatedAt: new Date().toISOString() }, { merge: true });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'progress-batch') {
      if (role !== 'student' || !validDate(value.date)) return respond('日付を確認してください', 400);
      const date = value.date;
      if (!isStudentDate(date)) return respond('実績は当日または前日の分を記録できます', 403);
      if (!Array.isArray(value.records) || value.records.length > 20) return respond('記録内容を確認してください', 400);

      const records: { taskId: string; actual: string; done: boolean }[] = [];
      const seen = new Set<string>();
      for (const item of value.records) {
        if (!item || typeof item !== 'object') return respond('記録内容を確認してください', 400);
        const record = item as Payload;
        if (!validTaskId(record.taskId) || seen.has(record.taskId) || typeof record.actual !== 'string' || record.actual.length > 1000 || typeof record.done !== 'boolean') {
          return respond('記録内容を確認してください', 400);
        }
        seen.add(record.taskId);
        records.push({ taskId: record.taskId, actual: record.actual.trim(), done: record.done });
      }

      const weekData = (await db.collection('weeks').doc(weekStartFor(date)).get()).data() || {};
      const weeklyTasks = [...tasksFromWeek(weekData), ...(Array.isArray(weekData.studentTasks) ? weekData.studentTasks as { id: string; text: string }[] : [])];
      const validIds = new Set(weeklyTasks.map((task) => task.id));
      if (records.some((record) => !validIds.has(record.taskId))) return respond('記録内容を確認してください', 400);

      const dayRef = db.collection('days').doc(date);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(dayRef);
        const previous = snapshot.data() || {};
        const previousProgress = previous.progress && typeof previous.progress === 'object' ? previous.progress as Record<string, Payload> : {};
        const progress = { ...previousProgress };
        const now = new Date().toISOString();
        for (const record of records) {
          progress[record.taskId] = { ...(previousProgress[record.taskId] || {}), actual: record.actual, done: record.done, updatedAt: now };
        }
        transaction.set(dayRef, { date, progress, updatedAt: now }, { merge: true });
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'review') {
      if (role !== 'teacher' || !validDate(value.date)) return respond('この操作はできません', 403);
      if (typeof value.comment !== 'string' || value.comment.length > 120 || typeof value.stamp !== 'string' || !['確認しました', 'よくできました', 'ていねいです'].includes(value.stamp)) return respond('確認内容を確認してください', 400);
      const ref = db.collection('days').doc(value.date);
      await ref.set({ date: value.date, review: { stamp: value.stamp, comment: value.comment.trim(), reviewedAt: new Date().toISOString() } }, { merge: true });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return respond('更新内容を確認してください', 400);
  } catch {
    return respond('データを保存できませんでした', 503);
  }
}
