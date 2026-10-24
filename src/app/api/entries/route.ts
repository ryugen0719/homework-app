import { del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { authorize, database, isStudentDate, parseEvidencePath, tasksFromEntry, type HomeworkTask } from '@/lib/homework-server';

type EntryInput = {
  date?: unknown;
  text?: unknown;
  isRestDay?: unknown;
  done?: unknown;
  stamp?: unknown;
  comment?: unknown;
  reviewedAt?: unknown;
  tasks?: unknown;
  taskId?: unknown;
  taskDone?: unknown;
  evidencePath?: unknown;
};

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
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
      if (!isStudentDate(date)) return respond('この日は更新できません', 403);
      const tasks = tasksFromEntry(previous);
      if (!tasks.length || previous.isRestDay === true) {
        return respond('この日に登録された宿題はありません', 409);
      }
      if (typeof value.taskId === 'string') {
        if (typeof value.taskDone !== 'boolean' && typeof value.evidencePath !== 'string') return respond('更新内容を確認してください', 400);
        const index = tasks.findIndex((task) => task.id === value.taskId);
        if (index < 0) return respond('この宿題は更新できません', 404);
        const updatedTask = { ...tasks[index] };
        if (typeof value.taskDone === 'boolean') updatedTask.done = value.taskDone;
        if (typeof value.evidencePath === 'string') {
          const path = parseEvidencePath(value.evidencePath);
          if (!path || path.date !== date || path.taskId !== updatedTask.id) return respond('画像を確認できません', 400);
          const blob = await head(value.evidencePath);
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.contentType) || blob.size > 5 * 1024 * 1024) {
            return respond('画像は5MB以下のJPEG、PNG、WebPにしてください', 400);
          }
          updatedTask.evidencePath = value.evidencePath;
          updatedTask.evidenceAt = new Date().toISOString();
        }
        tasks[index] = updatedTask;
      } else {
        const done = value.done === true;
        for (const task of tasks) task.done = done;
      }
      const done = tasks.length > 0 && tasks.every((task) => task.done);
      const next = {
        ...previous,
        date,
        tasks,
        text: tasks.map((task) => task.text).join('\n'),
        done,
        doneAt: done ? (previous.doneAt || new Date().toISOString()) : null,
        ...(done ? {} : { stamp: null, comment: null, reviewedAt: null }),
      };
      await reference.set(next);
    } else {
      if (typeof value.comment === 'string' && value.comment.length > 60) return respond('コメントは60文字以内で入力してください', 400);
      const isRestDay = value.isRestDay === true;
      const requestedTasks: HomeworkTask[] = [];
      if (!isRestDay) {
        const rawTasks = Array.isArray(value.tasks)
          ? value.tasks
          : typeof value.text === 'string' && value.text.trim() ? [{ id: 'legacy', text: value.text }] : [];
        if (rawTasks.length === 0 || rawTasks.length > 20) return respond('宿題は1件以上、20件以内で登録してください', 400);
        const ids = new Set<string>();
        for (const rawTask of rawTasks) {
          if (!rawTask || typeof rawTask !== 'object') return respond('宿題の内容を確認してください', 400);
          const task = rawTask as Record<string, unknown>;
          if (typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(task.id) || ids.has(task.id)) return respond('宿題の識別情報を確認してください', 400);
          if (typeof task.text !== 'string' || !task.text.trim() || task.text.length > 500) return respond('各宿題は1〜500文字で入力してください', 400);
          ids.add(task.id);
          requestedTasks.push({ id: task.id, text: task.text.trim(), done: false });
        }
        if (requestedTasks.reduce((total, task) => total + task.text.length, 0) > 5000) return respond('宿題の合計は5000文字以内にしてください', 400);
      }
      const previousTasks = tasksFromEntry(previous);
      const tasks = requestedTasks.map((task) => {
        const old = previousTasks.find((item) => item.id === task.id);
        return old?.text === task.text ? { ...task, done: old.done, ...(old.evidencePath ? { evidencePath: old.evidencePath } : {}), ...(old.evidenceAt ? { evidenceAt: old.evidenceAt } : {}) } : task;
      });
      const assignmentsChanged = previousTasks.length !== tasks.length || previousTasks.some((old, index) => old.id !== tasks[index]?.id || old.text !== tasks[index]?.text);
      const removedEvidence = previousTasks
        .filter((task) => task.evidencePath && !tasks.some((next) => next.evidencePath === task.evidencePath))
        .map((task) => task.evidencePath!);
      const done = tasks.length > 0 && tasks.every((task) => task.done);
      const now = new Date().toISOString();
      const next: Record<string, unknown> = {
        ...previous,
        date,
        text: tasks.map((task) => task.text).join('\n'),
        tasks,
        isRestDay,
        done: isRestDay ? false : done,
        doneAt: isRestDay || !done ? null : assignmentsChanged ? now : previous.doneAt || now,
        ...(isRestDay || assignmentsChanged ? { stamp: null, comment: null, reviewedAt: null } : {}),
      };
      if (value.stamp === '確認しました' || value.stamp === 'よくできました' || value.stamp === 'ていねいです') next.stamp = value.stamp;
      if (typeof value.comment === 'string') next.comment = value.comment.slice(0, 60);
      if (typeof value.reviewedAt === 'string') next.reviewedAt = value.reviewedAt;
      await reference.set(next);
      if (removedEvidence.length) await del(removedEvidence).catch(() => undefined);
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
    const reference = database().collection('days').doc(payload.date);
    const snapshot = await reference.get();
    const paths = tasksFromEntry(snapshot.data() || {}).flatMap((task) => task.evidencePath ? [task.evidencePath] : []);
    await reference.delete();
    if (paths.length) await del(paths).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('削除できませんでした。通信状況を確認して、もう一度お試しください', 503);
  }
}
