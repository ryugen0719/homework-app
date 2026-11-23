import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  computeLiveTimerState,
  database,
  LIVE_STALE_HIDE_AFTER_SEC,
  LiveTimerDoc,
} from '../../../lib/homework-server';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function respondError(message: string, status = 400) {
  return json({ error: message }, status);
}

export type LiveMemberPayload = {
  studentId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl: string;
  isMe: boolean;
  status: 'running' | 'paused';
  elapsedSec: number;
  accumulatedSec: number;
  startedAt: string;
  resumedAt: string | null;
  isStale: boolean;
  isCapped: boolean;
};

/**
 * 生徒のライブタイマー状態と、同グループ内で現在勉強中のメンバー一覧を取得
 * 認可境界: 勉強内容・写真・先生コメント・メモは一切返さない。
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return respondError('認証が必要です', 401);
  if (auth.role !== 'student') return respondError('生徒のみ利用できます', 403);

  try {
    const db = database();
    const nowMs = Date.now();
    const serverNow = new Date(nowMs).toISOString();

    const myStudentRef = db.collection('students').doc(auth.studentId);
    const [myStudentDoc, myTimerDoc] = await Promise.all([
      myStudentRef.get(),
      myStudentRef.collection('liveTimer').doc('current').get(),
    ]);

    const myStudentData = myStudentDoc.exists ? myStudentDoc.data() || {} : {};
    const teacherId = (myStudentData.teacherId as string) || auth.teacherId || 'default-teacher';

    const myTimer = myTimerDoc.exists
      ? computeLiveTimerState(myTimerDoc.data() as LiveTimerDoc, nowMs)
      : null;

    // 所属グループ検索
    const groupsSnapshot = await db.collection('groups').where('teacherId', '==', teacherId).limit(5).get();
    const liveMembers: LiveMemberPayload[] = [];

    if (!groupsSnapshot.empty) {
      const groupId = groupsSnapshot.docs[0].id;
      const membersSnapshot = await db.collection('groups').doc(groupId).collection('members').get();
      const memberIds = new Set<string>();
      const memberDefaults = new Map<string, { displayName: string; color: string; icon: string }>();

      for (const doc of membersSnapshot.docs) {
        const d = doc.data() || {};
        if (d.status === 'suspended') continue;
        const sid = (d.studentId as string) || doc.id;
        memberIds.add(sid);
        memberDefaults.set(sid, {
          displayName: (d.displayName as string) || '生徒',
          color: (d.color as string) || '#0F6F65',
          icon: (d.icon as string) || 'book',
        });
      }

      // 自分がまだグループに未登録でも自分のタイマーは返す
      memberIds.add(auth.studentId);

      const results = await Promise.all(
        Array.from(memberIds).map(async (sid) => {
          const isMe = sid === auth.studentId;
          if (isMe) {
            if (!myTimer) return null;
            const fallback = memberDefaults.get(sid);
            return {
              studentId: sid,
              displayName: (myStudentData.displayName as string) || (myStudentData.name as string) || fallback?.displayName || '生徒',
              color: (myStudentData.color as string) || fallback?.color || '#0F6F65',
              icon: (myStudentData.icon as string) || fallback?.icon || 'book',
              avatarUrl: (myStudentData.avatarUrl as string) || '',
              isMe: true,
              status: myTimer.status,
              elapsedSec: myTimer.elapsedSec,
              accumulatedSec: myTimer.accumulatedSec,
              startedAt: myTimer.startedAt,
              resumedAt: myTimer.resumedAt,
              isStale: myTimer.isStale,
              isCapped: myTimer.isCapped,
            } satisfies LiveMemberPayload;
          }

          const sRef = db.collection('students').doc(sid);
          const [sDoc, tDoc] = await Promise.all([
            sRef.get(),
            sRef.collection('liveTimer').doc('current').get(),
          ]);

          if (!tDoc.exists) return null;
          const sData = sDoc.exists ? sDoc.data() || {} : {};
          if (Boolean(sData.rankingOptOut) || sData.status === 'suspended') {
            return null;
          }

          const state = computeLiveTimerState(tDoc.data() as LiveTimerDoc, nowMs);
          // 放置（離席）で自動停止した他メンバーは、さらに30分以上経過していれば表示から外す
          if (state.isStale) {
            const hbMs = Date.parse(state.lastHeartbeatAt || state.startedAt);
            if (!Number.isNaN(hbMs) && nowMs - hbMs > LIVE_STALE_HIDE_AFTER_SEC * 1000) {
              return null;
            }
          }

          const fallback = memberDefaults.get(sid);
          return {
            studentId: sid,
            displayName: (sData.displayName as string) || (sData.name as string) || fallback?.displayName || '生徒',
            color: (sData.color as string) || fallback?.color || '#0F6F65',
            icon: (sData.icon as string) || fallback?.icon || 'book',
            avatarUrl: (sData.avatarUrl as string) || '',
            isMe: false,
            status: state.status,
            elapsedSec: state.elapsedSec,
            accumulatedSec: state.accumulatedSec,
            startedAt: state.startedAt,
            resumedAt: state.resumedAt,
            isStale: state.isStale,
            isCapped: state.isCapped,
          } satisfies LiveMemberPayload;
        })
      );

      for (const item of results) {
        if (item) liveMembers.push(item);
      }
    } else if (myTimer) {
      liveMembers.push({
        studentId: auth.studentId,
        displayName: (myStudentData.displayName as string) || (myStudentData.name as string) || '生徒',
        color: (myStudentData.color as string) || '#0F6F65',
        icon: (myStudentData.icon as string) || 'book',
        avatarUrl: (myStudentData.avatarUrl as string) || '',
        isMe: true,
        status: myTimer.status,
        elapsedSec: myTimer.elapsedSec,
        accumulatedSec: myTimer.accumulatedSec,
        startedAt: myTimer.startedAt,
        resumedAt: myTimer.resumedAt,
        isStale: myTimer.isStale,
        isCapped: myTimer.isCapped,
      });
    }

    // 勉強中を先に、経過秒数が長い順で並べる
    liveMembers.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
      return b.elapsedSec - a.elapsedSec;
    });

    return json({
      serverNow,
      myTimer,
      liveMembers,
    });
  } catch {
    return respondError('ライブ状態を取得できませんでした', 503);
  }
}

/**
 * 生徒本人のライブタイマー操作
 * action: start | pause | resume | heartbeat | prepare-finish | cancel
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return respondError('認証が必要です', 401);
  if (auth.role !== 'student') return respondError('生徒のみ操作できます', 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return respondError('リクエスト形式を確認してください', 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const db = database();
  const timerRef = db.collection('students').doc(auth.studentId).collection('liveTimer').doc('current');
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  try {
    if (action === 'start') {
      const timer = await db.runTransaction(async (tx) => {
        const snap = await tx.get(timerRef);
        if (snap.exists && !body.force) {
          return computeLiveTimerState(snap.data() as LiveTimerDoc, nowMs);
        }
        const doc: LiveTimerDoc = {
          status: 'running',
          startedAt: nowIso,
          resumedAt: nowIso,
          accumulatedSec: 0,
          lastHeartbeatAt: nowIso,
          updatedAt: nowIso,
          autoPausedReason: null,
          offlineSince: null,
        };
        tx.set(timerRef, doc);
        return computeLiveTimerState(doc, nowMs);
      });
      return json({ serverNow: nowIso, myTimer: timer });
    }

    if (action === 'pause' || action === 'prepare-finish') {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(timerRef);
        if (!snap.exists) return null;
        const current = computeLiveTimerState(snap.data() as LiveTimerDoc, nowMs);
        const doc: LiveTimerDoc = {
          status: 'paused',
          startedAt: current.startedAt,
          resumedAt: null,
          accumulatedSec: current.elapsedSec,
          lastHeartbeatAt: nowIso,
          updatedAt: nowIso,
          autoPausedReason: null,
          offlineSince: null,
        };
        tx.set(timerRef, doc);
        return computeLiveTimerState(doc, nowMs);
      });

      if (!result) {
        return json({ serverNow: nowIso, myTimer: null, flooredMinutes: 0 });
      }

      return json({
        serverNow: nowIso,
        myTimer: result,
        totalSec: result.elapsedSec,
        flooredMinutes: Math.floor(result.elapsedSec / 60),
        startedAt: result.startedAt,
        endedAt: nowIso,
      });
    }

    if (action === 'resume') {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(timerRef);
        if (!snap.exists) return null;
        const current = computeLiveTimerState(snap.data() as LiveTimerDoc, nowMs);
        if (current.isCapped) {
          const doc: LiveTimerDoc = {
            status: 'paused',
            startedAt: current.startedAt,
            resumedAt: null,
            accumulatedSec: current.elapsedSec,
            lastHeartbeatAt: nowIso,
            updatedAt: nowIso,
          };
          tx.set(timerRef, doc);
          return computeLiveTimerState(doc, nowMs);
        }
        const doc: LiveTimerDoc = {
          status: 'running',
          startedAt: current.startedAt,
          resumedAt: nowIso,
          accumulatedSec: current.elapsedSec,
          lastHeartbeatAt: nowIso,
          updatedAt: nowIso,
          autoPausedReason: null,
          offlineSince: null,
        };
        tx.set(timerRef, doc);
        return computeLiveTimerState(doc, nowMs);
      });
      return json({ serverNow: nowIso, myTimer: result });
    }

    if (action === 'heartbeat') {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(timerRef);
        if (!snap.exists) return null;
        const raw = snap.data() as LiveTimerDoc;
        const current = computeLiveTimerState(raw, nowMs);
        if (current.status === 'running') {
          tx.update(timerRef, {
            lastHeartbeatAt: nowIso,
            updatedAt: nowIso,
          });
          return { ...current, lastHeartbeatAt: nowIso };
        }
        if (raw.status === 'running' && (current.isStale || current.isCapped)) {
          const doc: LiveTimerDoc = {
            status: 'paused',
            startedAt: current.startedAt,
            resumedAt: null,
            accumulatedSec: current.elapsedSec,
            lastHeartbeatAt: current.isStale ? (current.offlineSince || raw.lastHeartbeatAt) : nowIso,
            updatedAt: nowIso,
            autoPausedReason: current.isStale ? 'stale' : 'capped',
            offlineSince: current.isStale ? (current.offlineSince || raw.lastHeartbeatAt) : null,
          };
          tx.set(timerRef, doc);
          return computeLiveTimerState(doc, nowMs);
        }
        return current;
      });
      return json({ serverNow: nowIso, myTimer: result });
    }

    if (action === 'cancel') {
      await timerRef.delete();
      return json({ serverNow: nowIso, myTimer: null });
    }

    return respondError('不明な操作です', 400);
  } catch {
    return respondError('ライブタイマーの更新に失敗しました', 503);
  }
}
