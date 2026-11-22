import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import {
  authenticate,
  calculateWeeklyPoints,
  database,
  ensureDefaultStudent,
  MAX_MEMBERS_PER_GROUP,
  offsetDateJst,
  sessionsFromDay,
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

/**
 * 先生または生徒が所属するグループ、およびそのグループの週次ランキングを取得
 * 認可境界: 学習内容、提出写真、先生コメントは絶対に返さない。
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return respondError('認証が必要です', 401);

  const db = database();
  const targetWeekStart = request.nextUrl.searchParams.get('weekStart') || weekStartFor(todayJst());

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

    // 各メンバーの週次ポイント集計（Promise.allで完全並列取得 + 直近90日分に絞って高速化）
    // ※ プライバシー境界: 学習内容や写真、コメントは一切含めず、週の分数と継続ボーナスのみを集計する
    const historyStartDate = offsetDateJst(targetWeekStart, -90);
    const historyEndDate = offsetDateJst(targetWeekStart, 6);

    const activeMembers = members.filter((m) => m.status !== 'suspended');

    const memberResults = await Promise.all(
      activeMembers.map(async (member) => {
        const studentRef = db.collection('students').doc(member.studentId);
        const daysQuery = studentRef
          .collection('days')
          .where(FieldPath.documentId(), '>=', historyStartDate)
          .where(FieldPath.documentId(), '<=', historyEndDate);

        // 生徒情報と学習日ドキュメントを同時並列取得
        const [sDoc, daysSnapshot] = await Promise.all([
          studentRef.get(),
          daysQuery.get(),
        ]);

        const sData = sDoc.exists ? sDoc.data() || {} : {};
        const isOptedOut = Boolean(sData.rankingOptOut);

        // 他の生徒がオプトアウトしている場合はランキングに含めない
        if (isOptedOut && member.studentId !== currentStudentId) {
          return null;
        }

        const history: Record<string, ReturnType<typeof sessionsFromDay>> = {};
        for (const dayDoc of daysSnapshot.docs) {
          history[dayDoc.id] = sessionsFromDay(dayDoc.data() || {});
        }

        // default-student かつ新コレクションが空の場合のみ旧コレクションへフォールバック
        if (member.studentId === 'default-student' && Object.keys(history).length === 0) {
          const oldDaysSnapshot = await db
            .collection('days')
            .where(FieldPath.documentId(), '>=', historyStartDate)
            .where(FieldPath.documentId(), '<=', historyEndDate)
            .get();
          for (const dayDoc of oldDaysSnapshot.docs) {
            history[dayDoc.id] = sessionsFromDay(dayDoc.data() || {});
          }
        }

        const pointsSummary = calculateWeeklyPoints(history, targetWeekStart);

        return {
          studentId: member.studentId,
          displayName: sData.displayName || member.displayName,
          color: sData.color || member.color,
          icon: sData.icon || member.icon,
          avatarUrl: sData.avatarUrl || '',
          weekMinutes: pointsSummary.weekMinutes,
          weekStreakBonus: pointsSummary.weekStreakBonus,
          weekPhotoBonus: pointsSummary.weekPhotoBonus,
          weekPoints: pointsSummary.weekPoints,
          currentStreak: pointsSummary.currentStreak,
          isMe: auth.role === 'student' && member.studentId === auth.studentId,
          isOptedOut,
        };
      })
    );

    const rankingList = memberResults.filter((item): item is NonNullable<typeof item> => item !== null);

    // ポイント順にソート (降順)
    rankingList.sort((a, b) => b.weekPoints - a.weekPoints);

    // 順位付与（同点は同順位）
    let currentRank = 1;
    let prevPoints = -1;
    const rankedMembers = rankingList.map((m, index) => {
      if (index === 0) {
        currentRank = 1;
        prevPoints = m.weekPoints;
      } else if (m.weekPoints < prevPoints) {
        currentRank = index + 1;
        prevPoints = m.weekPoints;
      }
      return {
        ...m,
        rank: currentRank,
      };
    });

    const maxPoints = rankedMembers.length > 0 ? Math.max(...rankedMembers.map((m) => m.weekPoints), 10) : 100;

    return json({
      group: {
        id: groupId,
        name: groupData.name || 'クラスレース',
        inviteCode: auth.role === 'teacher' ? groupData.inviteCode : undefined,
      },
      targetWeekStart,
      maxPoints,
      members: rankedMembers,
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

  return respondError('不明な操作です', 400);
}
