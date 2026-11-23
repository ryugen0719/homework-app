import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  authenticate,
  database,
  DEFAULT_STUDENT_COLORS,
  DEFAULT_STUDENT_ICONS,
  ensureDefaultStudent,
  getStudentsForTeacher,
  hashPassword,
  MAX_STUDENTS_PER_TEACHER,
  verifyPassword,
  type Student,
} from '../../../lib/homework-server';

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return respond('ページを表示できません', 404);

  try {
    const db = database();
    if (auth.role === 'teacher') {
      const students = await getStudentsForTeacher(auth.teacherId);
      return NextResponse.json({ students, maxCount: MAX_STUDENTS_PER_TEACHER }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 生徒の場合：自身の情報
    const doc = await db.collection('students').doc(auth.studentId).get();
    if (!doc.exists) {
      if (auth.studentId === 'default-student') {
        const student = await ensureDefaultStudent();
        return NextResponse.json({ student }, { headers: { 'Cache-Control': 'no-store' } });
      }
      return respond('生徒情報が見つかりません', 404);
    }

    const data = doc.data() || {};
    const student: Student = {
      id: doc.id,
      teacherId: data.teacherId || 'default-teacher',
      name: data.name || '生徒',
      displayName: data.displayName || data.name || '生徒',
      color: data.color || DEFAULT_STUDENT_COLORS[0],
      icon: data.icon || DEFAULT_STUDENT_ICONS[0],
      avatarUrl: data.avatarUrl || '',
      token: data.token || '',
      status: data.status || 'active',
      rankingOptOut: Boolean(data.rankingOptOut),
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt || '',
    };

    return NextResponse.json({ student }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('生徒情報を読み込めませんでした', 503);
  }
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth || auth.role !== 'teacher') return respond('この操作はできません', 403);

  try {
    const body = (await request.json()) as {
      name?: unknown;
      displayName?: unknown;
      color?: unknown;
      icon?: unknown;
      password?: unknown;
    };

    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 30) {
      return respond('生徒の名前を入力してください（30文字以内）', 400);
    }

    const name = body.name.trim();
    const displayName = typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 20)
      : name.slice(0, 10);
    const color = typeof body.color === 'string' && body.color.startsWith('#')
      ? body.color
      : DEFAULT_STUDENT_COLORS[0];
    const icon = typeof body.icon === 'string' && body.icon.trim()
      ? body.icon.trim()
      : DEFAULT_STUDENT_ICONS[0];

    // パスワード設定（未入力の場合は4桁のランダム数字PIN）
    const plainPassword = typeof body.password === 'string' && body.password.trim()
      ? body.password.trim().slice(0, 20)
      : String(Math.floor(1000 + Math.random() * 9000));
    const { hash, salt } = hashPassword(plainPassword);

    const db = database();
    const currentStudents = await getStudentsForTeacher(auth.teacherId);
    if (currentStudents.length >= MAX_STUDENTS_PER_TEACHER) {
      return respond(`生徒の上限人数（最大${MAX_STUDENTS_PER_TEACHER}人）に達しています`, 400);
    }

    const newStudentId = `std_${crypto.randomBytes(8).toString('hex')}`;
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date().toISOString();

    const newStudent: Student = {
      id: newStudentId,
      teacherId: auth.teacherId,
      name,
      displayName,
      color,
      icon,
      token,
      status: 'active',
      rankingOptOut: false,
      passwordHash: hash,
      passwordSalt: salt,
      passwordPlain: plainPassword,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('students').doc(newStudentId).set(newStudent);
    return NextResponse.json({ ok: true, student: newStudent }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('生徒を作成できませんでした', 503);
  }
}

export async function PUT(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return respond('この操作はできません', 403);

  try {
    const body = (await request.json()) as {
      studentId?: unknown;
      name?: unknown;
      displayName?: unknown;
      color?: unknown;
      icon?: unknown;
      avatarUrl?: unknown;
      currentPassword?: unknown;
      password?: unknown;
      status?: unknown;
      rankingOptOut?: unknown;
      regenerateToken?: unknown;
    };

    const targetStudentId = typeof body.studentId === 'string' ? body.studentId : auth.role === 'student' ? auth.studentId : '';
    if (!targetStudentId) return respond('生徒を指定してください', 400);

    const db = database();
    const studentRef = db.collection('students').doc(targetStudentId);
    const doc = await studentRef.get();
    if (!doc.exists) return respond('生徒が見つかりません', 404);

    const data = doc.data() || {};
    const updates: Partial<Student> = { updatedAt: new Date().toISOString() };

    if (auth.role === 'teacher') {
      if (data.teacherId && data.teacherId !== auth.teacherId) return respond('権限がありません', 403);
      if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 30);
      if (typeof body.displayName === 'string' && body.displayName.trim()) updates.displayName = body.displayName.trim().slice(0, 20);
      if (typeof body.color === 'string' && body.color.startsWith('#')) updates.color = body.color;
      if (typeof body.icon === 'string' && body.icon.trim()) updates.icon = body.icon.trim();
      if (typeof body.avatarUrl === 'string') updates.avatarUrl = body.avatarUrl.trim();
      if (typeof body.password === 'string' && body.password.trim()) {
        const plain = body.password.trim().slice(0, 20);
        const { hash, salt } = hashPassword(plain);
        updates.passwordHash = hash;
        updates.passwordSalt = salt;
        updates.passwordPlain = plain;
      }
      if (body.status === 'active' || body.status === 'suspended') updates.status = body.status;
      if (typeof body.rankingOptOut === 'boolean') updates.rankingOptOut = body.rankingOptOut;
      if (body.regenerateToken === true) updates.token = crypto.randomBytes(32).toString('base64url');
    } else {
      // 生徒本人の場合: 自分の表示名・色・アイコン・アバター画像・オプトアウト・パスワードを変更可能
      if (targetStudentId !== auth.studentId) {
        return respond('他の生徒の情報は変更できません', 403);
      }
      if (typeof body.displayName === 'string' && body.displayName.trim()) updates.displayName = body.displayName.trim().slice(0, 20);
      if (typeof body.color === 'string' && body.color.startsWith('#')) updates.color = body.color;
      if (typeof body.icon === 'string' && body.icon.trim()) updates.icon = body.icon.trim();
      if (typeof body.avatarUrl === 'string') updates.avatarUrl = body.avatarUrl.trim();
      if (typeof body.rankingOptOut === 'boolean') updates.rankingOptOut = body.rankingOptOut;

      if (typeof body.password === 'string' && body.password.trim()) {
        const nextPlain = body.password.trim();
        if (nextPlain.length < 4 || nextPlain.length > 20) {
          return respond('パスワードは4〜20文字で入力してください', 400);
        }
        const currentPw = typeof body.currentPassword === 'string' ? body.currentPassword.trim() : '';
        if (!currentPw) {
          return respond('現在のパスワードを入力してください', 400);
        }

        let currentOk = false;
        if (data.passwordHash && data.passwordSalt) {
          currentOk = verifyPassword(currentPw, data.passwordHash, data.passwordSalt);
        } else if (data.passwordPlain) {
          currentOk = currentPw === data.passwordPlain;
        } else {
          currentOk = currentPw === '1234';
        }
        if (!currentOk) {
          return respond('現在のパスワードが正しくありません', 401);
        }

        const { hash, salt } = hashPassword(nextPlain);
        updates.passwordHash = hash;
        updates.passwordSalt = salt;
        updates.passwordPlain = nextPlain;
      }
    }

    await studentRef.set(updates, { merge: true });

    // 所属するレースグループのメンバー情報も同期更新
    try {
      const groupSync: Record<string, unknown> = {};
      if (updates.displayName !== undefined) groupSync.displayName = updates.displayName;
      if (updates.color !== undefined) groupSync.color = updates.color;
      if (updates.icon !== undefined) groupSync.icon = updates.icon;
      if (updates.avatarUrl !== undefined) groupSync.avatarUrl = updates.avatarUrl;
      if (Object.keys(groupSync).length > 0) {
        const groupsSnap = await db.collection('groups').get();
        for (const gDoc of groupsSnap.docs) {
          const memberRef = gDoc.ref.collection('members').doc(targetStudentId);
          const memberDoc = await memberRef.get();
          if (memberDoc.exists) {
            await memberRef.set(groupSync, { merge: true });
          }
        }
      }
    } catch {
      // ignore sync error
    }

    const safeUpdates = { ...updates };
    delete safeUpdates.passwordHash;
    delete safeUpdates.passwordSalt;
    if (auth.role !== 'teacher') {
      delete safeUpdates.passwordPlain;
    }

    return NextResponse.json({ ok: true, updates: safeUpdates }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return respond('生徒情報を更新できませんでした', 503);
  }
}
