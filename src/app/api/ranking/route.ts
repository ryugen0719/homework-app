import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import {
  authenticate,
  calculateWeeklyPoints,
  computeLiveTimerState,
  database,
  ensureDefaultStudent,
  LIVE_STALE_HIDE_AFTER_SEC,
  LiveTimerDoc,
  MAX_MEMBERS_PER_GROUP,
  offsetDateJst,
  sessionsFromDay,
  validDate,
  weekStartFor,
} from '../../../lib/homework-server';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function respondError(message: string, status = 400) {
  return json({ error: message }, status);
}

const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());

type RankingPeriod =
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-30'
  | 'all'
  | 'custom';

function calculateRangePoints(
  allHistory: Record<string, ReturnType<typeof sessionsFromDay>>,
  rangeStart: string,
  rangeEnd: string,
) {
  const sortedDates = Object.keys(allHistory)
    .filter((d) => validDate(d))
    .sort();

  const dailyBonusMap: Record<string, number> = {};
  const dailyPhotoBonusMap: Record<string, number> = {};
  const dailyMinutesMap: Record<string, number> = {};

  let currentStreak = 0;
  let prevDate = '';

  for (const date of sortedDates) {
    const sessions = allHistory[date] || [];
    const dayMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
    dailyMinutesMap[date] = dayMinutes;

    if (sessions.some((s) => Boolean(s.evidencePath))) {
      dailyPhotoBonusMap[date] = 5;
    }

    if (dayMinutes >= 10) {
      if (prevDate && offsetDateJst(prevDate, 1) === date) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      prevDate = date;
      dailyBonusMap[date] = Math.min(5, currentStreak) * 5;
    }
  }

  let totalMinutes = 0;
  let totalStreakBonus = 0;
  let totalPhotoBonus = 0;
  let activeDays = 0;

  for (const date of sortedDates) {
    if (date < rangeStart || date > rangeEnd) continue;
    const mins = dailyMinutesMap[date] || 0;
    const hasSessions = (allHistory[date]?.length || 0) > 0;
    if (hasSessions) activeDays += 1;
    totalMinutes += mins;
    totalStreakBonus += dailyBonusMap[date] || 0;
    totalPhotoBonus += dailyPhotoBonusMap[date] || 0;
  }

  return {
    weekMinutes: totalMinutes,
    weekStreakBonus: totalStreakBonus,
    weekPhotoBonus: totalPhotoBonus,
    weekPoints: totalMinutes + totalStreakBonus + totalPhotoBonus,
    currentStreak,
    activeDays,
  };
}

/**
 * 先生または生徒が所属するグループ、およびそのグループの週次ランキングを取得
 * 認可境界: 学習内容、提出写真、先生コメントは絶対に返さない。
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return respondError('認証が必要です', 401);

  const db = database();
  const today = todayJst();
  const currentWeekStart = weekStartFor(today);
  const requestedWeek = request.nextUrl.searchParams.get('weekStart');
  const requestedPeriod = request.nextUrl.searchParams.get('period') as RankingPeriod | null;
  const requestedStart = request.nextUrl.searchParams.get('startDate');
  const requestedEnd = request.nextUrl.searchParams.get('endDate');

  let period: RankingPeriod = 'this-week';
  let targetWeekStart = currentWeekStart;
  let rangeStart = currentWeekStart;
  let rangeEnd = offsetDateJst(currentWeekStart, 6);

  if (requestedWeek && validDate(requestedWeek)) {
    targetWeekStart = weekStartFor(requestedWeek);
    if (targetWeekStart > currentWeekStart) targetWeekStart = currentWeekStart;
    period = targetWeekStart === currentWeekStart ? 'this-week' : 'last-week';
    rangeStart = targetWeekStart;
    rangeEnd = offsetDateJst(targetWeekStart, 6);
  } else if (requestedPeriod === 'last-week') {
    period = 'last-week';
    targetWeekStart = offsetDateJst(currentWeekStart, -7);
    rangeStart = targetWeekStart;
    rangeEnd = offsetDateJst(targetWeekStart, 6);
  } else if (requestedPeriod === 'this-month') {
    period = 'this-month';
    const ym = today.slice(0, 7);
    rangeStart = `${ym}-01`;
    rangeEnd = today;
  } else if (requestedPeriod === 'last-month') {
    period = 'last-month';
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    const prevFirst = new Date(y, m - 2, 1);
    const py = prevFirst.getFullYear();
    const pm = prevFirst.getMonth() + 1;
    const lastDay = new Date(py, pm, 0).getDate();
    const pym = `${py}-${String(pm).padStart(2, '0')}`;
    rangeStart = `${pym}-01`;
    rangeEnd = `${pym}-${String(lastDay).padStart(2, '0')}`;
  } else if (requestedPeriod === 'last-30') {
    period = 'last-30';
    rangeStart = offsetDateJst(today, -29);
    rangeEnd = today;
  } else if (requestedPeriod === 'all') {
    period = 'all';
    rangeStart = '2020-01-01';
    rangeEnd = today;
  } else if (
    requestedPeriod === 'custom' &&
    requestedStart &&
    requestedEnd &&
    validDate(requestedStart) &&
    validDate(requestedEnd)
  ) {
    period = 'custom';
    rangeStart = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    rangeEnd = requestedStart <= requestedEnd ? requestedEnd : requestedStart;
    if (rangeEnd > today) rangeEnd = today;
  }

  const isWeeklyMode = !requestedPeriod || requestedPeriod === 'this-week' || requestedPeriod === 'last-week' || Boolean(requestedWeek);
  const isCurrentWeek = isWeeklyMode && targetWeekStart === currentWeekStart;

  try {
    // 先生の場合は自身のID、生徒の場合は担当先生または所属グループを探す
    let teacherId = auth.role === 'teacher' ? auth.teacherId : auth.teacherId || 'default-teacher';
    const currentStudentId = auth.role === 'student' ? auth.studentId : '';

    // 生徒本人の情報取得
    let studentOptOut = false;
    if (auth.role === 'student') {
      const studentDoc = await db.collection('students').doc(auth.studentId).get();
      if (studentDoc.exists) {
        const sData = studentDoc.data() || {};
        studentOptOut = Boolean(sData.rankingOptOut);
        if (sData.teacherId) teacherId = sData.teacherId;
      }
    }

    // デフォルトグループの確認/取得 (先生IDに紐づくグループ)
    const groupsSnapshot = await db.collection('groups').where('teacherId', '==', teacherId).limit(5).get();
    let groupId = '';
    let groupData: FirebaseFirestore.DocumentData = {};

    if (!groupsSnapshot.empty) {
      const doc = groupsSnapshot.docs[0];
      groupId = doc.id;
      groupData = doc.data();
    } else {
      // グループがまだ無ければ自動で「クラスレース」グループを1つ作成
      const newGroupId = `group-${crypto.randomBytes(6).toString('hex')}`;
      const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const newGroupData = {
        name: 'クラスレース',
        teacherId,
        inviteCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection('groups').doc(newGroupId).set(newGroupData);
      groupId = newGroupId;
      groupData = newGroupData;

      // 初期メンバーとして先生の生徒たちを登録
      const defaultStudent = await ensureDefaultStudent(teacherId);
      await db.collection('groups').doc(newGroupId).collection('members').doc(defaultStudent.id).set({
        studentId: defaultStudent.id,
        teacherId,
        displayName: defaultStudent.displayName,
        color: defaultStudent.color,
        icon: defaultStudent.icon,
        status: 'active',
        joinedAt: new Date().toISOString(),
      });
    }

    // メンバー取得
    const membersSnapshot = await db.collection('groups').doc(groupId).collection('members').get();
    
    // 生徒がまだグループメンバーにいなければ、自先生の生徒なら自動参加
    const members = membersSnapshot.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        studentId: d.studentId || doc.id,
        teacherId: d.teacherId || '',
        displayName: d.displayName || '生徒',
        color: d.color || '#0F6F65',
        icon: d.icon || 'book',
        status: d.status || 'active',
        joinedAt: d.joinedAt || '',
      };
    });

    if (auth.role === 'student' && !members.some((m) => m.studentId === auth.studentId)) {
      const sDoc = await db.collection('students').doc(auth.studentId).get();
      if (sDoc.exists && members.length < MAX_MEMBERS_PER_GROUP) {
        const sData = sDoc.data() || {};
        const newMember = {
          studentId: auth.studentId,
          teacherId,
          displayName: sData.displayName || sData.name || '生徒',
          color: sData.color || '#0F6F65',
          icon: sData.icon || 'book',
          status: 'active',
          joinedAt: new Date().toISOString(),
        };
        await db.collection('groups').doc(groupId).collection('members').doc(auth.studentId).set(newMember);
        members.push(newMember);
      }
    }

    // 各メンバーの集計（Promise.allで完全並列取得）
    // 履歴一覧（直近8週）も追加クエリなしで同時計算できるよう開始日を十分に確保
    const earliestHistoryWeek = offsetDateJst(currentWeekStart, -7 * 8);
    const streakBufferStart = period === 'all' ? '2020-01-01' : offsetDateJst(rangeStart, -14);
    const historyStartDate = streakBufferStart < earliestHistoryWeek ? streakBufferStart : earliestHistoryWeek;
    const currentWeekEnd = offsetDateJst(currentWeekStart, 6);
    const historyEndDate = rangeEnd > currentWeekEnd ? rangeEnd : currentWeekEnd;

    const activeMembers = members.filter((m) => m.status !== 'suspended');
    const nowMs = Date.now();
    const serverNow = new Date(nowMs).toISOString();

    const memberHistories = await Promise.all(
      activeMembers.map(async (member) => {
        const studentRef = db.collection('students').doc(member.studentId);
        const daysQuery =
          period === 'all'
            ? studentRef.collection('days')
            : studentRef
                .collection('days')
                .where(FieldPath.documentId(), '>=', historyStartDate)
                .where(FieldPath.documentId(), '<=', historyEndDate);

        // 生徒情報・学習日ドキュメント・現在のライブタイマーを同一スナップショットで並列取得
        const [sDoc, daysSnapshot, timerDoc] = await Promise.all([
          studentRef.get(),
          daysQuery.get(),
          studentRef.collection('liveTimer').doc('current').get(),
        ]);

        const sData = sDoc.exists ? sDoc.data() || {} : {};
        const isOptedOut = Boolean(sData.rankingOptOut);

        // 他の生徒がオプトアウトしている場合はランキングに含めない
        if (isOptedOut && member.studentId !== currentStudentId) {
          return null;
        }

        const isMe = auth.role === 'student' && member.studentId === auth.studentId;
        let liveTimer: {
          status: 'running' | 'paused';
          elapsedSec: number;
          accumulatedSec: number;
          startedAt: string;
          resumedAt: string | null;
          isStale: boolean;
          isCapped: boolean;
        } | null = null;

        if (timerDoc.exists) {
          const state = computeLiveTimerState(timerDoc.data() as LiveTimerDoc, nowMs);
          let hideStale = false;
          if (!isMe && state.isStale) {
            const hbMs = Date.parse(state.lastHeartbeatAt || state.startedAt);
            if (!Number.isNaN(hbMs) && nowMs - hbMs > LIVE_STALE_HIDE_AFTER_SEC * 1000) {
              hideStale = true;
            }
          }
          if (!hideStale) {
            liveTimer = {
              status: state.status,
              elapsedSec: state.elapsedSec,
              accumulatedSec: state.accumulatedSec,
              startedAt: state.startedAt,
              resumedAt: state.resumedAt,
              isStale: state.isStale,
              isCapped: state.isCapped,
            };
          }
        }

        const history: Record<string, ReturnType<typeof sessionsFromDay>> = {};
        for (const dayDoc of daysSnapshot.docs) {
          history[dayDoc.id] = sessionsFromDay(dayDoc.data() || {});
        }

        // default-student かつ新コレクションが空の場合のみ旧コレクションへフォールバック
        if (member.studentId === 'default-student' && Object.keys(history).length === 0) {
          const oldDaysQuery =
            period === 'all'
              ? db.collection('days')
              : db
                  .collection('days')
                  .where(FieldPath.documentId(), '>=', historyStartDate)
                  .where(FieldPath.documentId(), '<=', historyEndDate);
          const oldDaysSnapshot = await oldDaysQuery.get();
          for (const dayDoc of oldDaysSnapshot.docs) {
            history[dayDoc.id] = sessionsFromDay(dayDoc.data() || {});
          }
        }

        return {
          studentId: member.studentId,
          displayName: (sData.displayName as string) || member.displayName,
          color: (sData.color as string) || member.color,
          icon: (sData.icon as string) || member.icon,
          avatarUrl: (sData.avatarUrl as string) || '',
          isMe,
          isOptedOut,
          liveTimer,
          history,
        };
      })
    );

    const validMembers = memberHistories.filter((item): item is NonNullable<typeof item> => item !== null);

    const assignRanks = <T extends { weekPoints: number }>(list: T[]) => {
      const sorted = [...list].sort((a, b) => b.weekPoints - a.weekPoints);
      let currentRank = 1;
      let prevPoints = -1;
      return sorted.map((m, index) => {
        if (index === 0) {
          currentRank = 1;
          prevPoints = m.weekPoints;
        } else if (m.weekPoints < prevPoints) {
          currentRank = index + 1;
          prevPoints = m.weekPoints;
        }
        return { ...m, rank: currentRank };
      });
    };

    const computeWeekRanking = (weekStart: string) => {
      const list = validMembers.map((m) => {
        const pointsSummary = calculateWeeklyPoints(m.history, weekStart);
        return {
          studentId: m.studentId,
          displayName: m.displayName,
          color: m.color,
          icon: m.icon,
          avatarUrl: m.avatarUrl,
          weekMinutes: pointsSummary.weekMinutes,
          weekStreakBonus: pointsSummary.weekStreakBonus,
          weekPhotoBonus: pointsSummary.weekPhotoBonus,
          weekPoints: pointsSummary.weekPoints,
          currentStreak: pointsSummary.currentStreak,
          isMe: m.isMe,
          isOptedOut: m.isOptedOut,
          liveTimer: m.liveTimer,
        };
      });
      return assignRanks(list);
    };

    const rankedMembers = isWeeklyMode
      ? computeWeekRanking(targetWeekStart)
      : assignRanks(
          validMembers.map((m) => {
            const summary = calculateRangePoints(m.history, rangeStart, rangeEnd);
            return {
              studentId: m.studentId,
              displayName: m.displayName,
              color: m.color,
              icon: m.icon,
              avatarUrl: m.avatarUrl,
              weekMinutes: summary.weekMinutes,
              weekStreakBonus: summary.weekStreakBonus,
              weekPhotoBonus: summary.weekPhotoBonus,
              weekPoints: summary.weekPoints,
              currentStreak: summary.currentStreak,
              isMe: m.isMe,
              isOptedOut: m.isOptedOut,
              liveTimer: m.liveTimer,
            };
          })
        );

    const topPoints = rankedMembers.length > 0 ? Math.max(...rankedMembers.map((m) => m.weekPoints), 0) : 0;
    const maxPoints = topPoints <= 100 ? 100 : Math.ceil(topPoints / 50) * 50;

    // 過去8週分のレース履歴サマリー
    const recentWeeks = Array.from({ length: 8 }, (_, idx) => {
      const wStart = offsetDateJst(currentWeekStart, -7 * (idx + 1));
      const wEnd = offsetDateJst(wStart, 6);
      const weekRanking = computeWeekRanking(wStart);
      const totalPoints = weekRanking.reduce((sum, m) => sum + m.weekPoints, 0);
      const top = weekRanking[0] && weekRanking[0].weekPoints > 0 ? weekRanking[0] : null;
      const tiedWinners = top
        ? weekRanking.filter((m) => m.rank === 1 && m.weekPoints === top.weekPoints).length > 1
        : false;
      const me = weekRanking.find((m) => m.isMe);
      const myTied =
        me && me.weekPoints > 0
          ? weekRanking.filter((m) => m.rank === me.rank).length > 1
          : false;
      return {
        weekStart: wStart,
        weekEnd: wEnd,
        totalPoints,
        participantCount: weekRanking.length,
        winner: top
          ? {
              studentId: top.studentId,
              displayName: top.displayName,
              color: top.color,
              avatarUrl: top.avatarUrl,
              weekPoints: top.weekPoints,
              isTied: tiedWinners,
            }
          : null,
        myRank: me && me.weekPoints > 0 ? me.rank : undefined,
        myPoints: me ? me.weekPoints : undefined,
        myTied,
      };
    });

    const weeklyGoalMinutes =
      typeof groupData.weeklyGoalMinutes === 'number' &&
      Number.isInteger(groupData.weeklyGoalMinutes) &&
      groupData.weeklyGoalMinutes >= 30 &&
      groupData.weeklyGoalMinutes <= 1800
        ? groupData.weeklyGoalMinutes
        : 120;
    const weeklyGoalPoints =
      typeof groupData.weeklyGoalPoints === 'number' &&
      Number.isInteger(groupData.weeklyGoalPoints) &&
      groupData.weeklyGoalPoints >= 30 &&
      groupData.weeklyGoalPoints <= 2000
        ? groupData.weeklyGoalPoints
        : 100;

    return json({
      serverNow,
      group: {
        id: groupId,
        name: groupData.name || 'クラスレース',
        inviteCode: auth.role === 'teacher' ? groupData.inviteCode : undefined,
        weeklyGoalMinutes,
        weeklyGoalPoints,
      },
      period,
      rangeStart,
      rangeEnd,
      isWeeklyMode,
      targetWeekStart,
      currentWeekStart,
      isCurrentWeek,
      maxPoints,
      members: rankedMembers,
      recentWeeks,
      currentUser: {
        role: auth.role,
        studentId: currentStudentId,
        rankingOptOut: studentOptOut,
      },
    });
  } catch (error) {
    return respondError('ランキングを取得できませんでした: ' + (error instanceof Error ? error.message : 'Unknown error'), 500);
  }
}

/**
 * グループ操作:
 * - create-group: 先生が新規グループ作成
 * - join-group: 招待コードでグループに参加
 * - toggle-opt-out: 生徒本人のランキングオプトアウト切り替え
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return respondError('認証が必要です', 401);

  const db = database();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return respondError('リクエストの形式が正しくありません', 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';

  // 1. オプトアウト切り替え (生徒本人のみ)
  if (action === 'toggle-opt-out') {
    if (auth.role !== 'student') return respondError('生徒のみ変更できます', 403);
    const optOut = Boolean(body.optOut);
    await db.collection('students').doc(auth.studentId).update({
      rankingOptOut: optOut,
      updatedAt: new Date().toISOString(),
    });
    return json({ success: true, rankingOptOut: optOut });
  }

  // 2. 招待コードで参加
  if (action === 'join-group') {
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '';
    if (!inviteCode) return respondError('招待コードを入力してください', 400);

    const groupQuery = await db.collection('groups').where('inviteCode', '==', inviteCode).limit(1).get();
    if (groupQuery.empty) return respondError('招待コードが見つかりません', 404);

    const targetGroup = groupQuery.docs[0];
    const groupId = targetGroup.id;

    // メンバー数チェック
    const membersSnap = await db.collection('groups').doc(groupId).collection('members').get();
    if (membersSnap.size >= MAX_MEMBERS_PER_GROUP) {
      return respondError(`グループの定員（最大${MAX_MEMBERS_PER_GROUP}人）に達しています`, 400);
    }

    const studentId = auth.role === 'student' ? auth.studentId : typeof body.studentId === 'string' ? body.studentId : '';
    if (!studentId) return respondError('対象の生徒IDが指定されていません', 400);

    const studentDoc = await db.collection('students').doc(studentId).get();
    if (!studentDoc.exists) return respondError('生徒が見つかりません', 404);
    const studentData = studentDoc.data() || {};

    await db.collection('groups').doc(groupId).collection('members').doc(studentId).set({
      studentId,
      teacherId: studentData.teacherId || 'default-teacher',
      displayName: studentData.displayName || studentData.name || '生徒',
      color: studentData.color || '#0F6F65',
      icon: studentData.icon || 'book',
      status: 'active',
      joinedAt: new Date().toISOString(),
    });

    return json({ success: true, groupId });
  }

  // 3. 新規グループ作成（先生のみ）
  if (action === 'create-group') {
    if (auth.role !== 'teacher') return respondError('先生のみグループを作成できます', 403);
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '新しいレースグループ';
    const newGroupId = `group-${crypto.randomBytes(6).toString('hex')}`;
    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const newGroupData = {
      name,
      teacherId: auth.teacherId,
      inviteCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('groups').doc(newGroupId).set(newGroupData);
    return json({ success: true, group: { id: newGroupId, ...newGroupData } });
  }

  // 4. グループの週間目標（時間・ポイント）を更新
  if (action === 'update-goal') {
    let teacherId = auth.role === 'teacher' ? auth.teacherId : auth.teacherId || 'default-teacher';
    if (auth.role === 'student') {
      const sDoc = await db.collection('students').doc(auth.studentId).get();
      if (sDoc.exists) {
        const sData = sDoc.data() || {};
        if (sData.teacherId) teacherId = sData.teacherId;
      }
    }

    const groupsSnap = await db.collection('groups').where('teacherId', '==', teacherId).limit(1).get();
    if (groupsSnap.empty) {
      return respondError('グループが見つかりません', 404);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.weeklyGoalMinutes !== undefined) {
      const mins = Number(body.weeklyGoalMinutes);
      if (!Number.isInteger(mins) || mins < 30 || mins > 1800) {
        return respondError('目標時間は30分〜30時間（1800分）の範囲で指定してください', 400);
      }
      updates.weeklyGoalMinutes = mins;
    }

    if (body.weeklyGoalPoints !== undefined) {
      const pts = Number(body.weeklyGoalPoints);
      if (!Number.isInteger(pts) || pts < 30 || pts > 2000) {
        return respondError('目標ポイントは30〜2000ptの範囲で指定してください', 400);
      }
      updates.weeklyGoalPoints = pts;
    }

    if (updates.weeklyGoalMinutes === undefined && updates.weeklyGoalPoints === undefined) {
      return respondError('変更する目標値を指定してください', 400);
    }

    await groupsSnap.docs[0].ref.set(updates, { merge: true });
    return json({
      success: true,
      weeklyGoalMinutes: updates.weeklyGoalMinutes,
      weeklyGoalPoints: updates.weeklyGoalPoints,
    });
  }

  return respondError('不明な操作です', 400);
}
