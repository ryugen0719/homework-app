import { NextResponse } from 'next/server';
import {
  database,
  ensureDefaultStudent,
  getTeacherCredentials,
  verifyPassword,
  verifyTeacherPassword,
} from '../../../../lib/homework-server';
import { verifyGateRequest } from '../../../../lib/google-gate';

function respond(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const gate = verifyGateRequest(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: '先に許可されたGoogleアカウントで認証してください', gateRequired: true },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = (await request.json()) as {
      role?: unknown;
      name?: unknown;
      password?: unknown;
    };

    const role = body.role === 'teacher' ? 'teacher' : 'student';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';

    if (!name || !password) {
      return respond('お名前とパスワードを入力してください', 400);
    }

    // 1. 先生ログイン
    if (role === 'teacher') {
      const teacher = getTeacherCredentials();
      const teacherToken = process.env.TEACHER_TOKEN;
      if (!teacherToken) {
        return respond('先生のアカウント設定がありません', 503);
      }

      // 名前が「先生」または設定された管理名、あるいは名前不問（先生タブでの入力）
      const nameMatch = name === teacher.name || name === '先生' || name.toLowerCase() === 'teacher';
      const passwordMatch = await verifyTeacherPassword(password);

      if (!nameMatch || !passwordMatch) {
        return respond('先生の名前、またはパスワードが正しくありません', 401);
      }

      return NextResponse.json({
        ok: true,
        role: 'teacher',
        token: teacherToken,
        name: teacher.name,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 2. 生徒ログイン
    const db = database();
    await ensureDefaultStudent();
    const studentsSnap = await db.collection('students').get();

    // 名前（管理名 または 表示名）が一致する生徒を探す
    const matchedDoc = studentsSnap.docs.find((doc) => {
      const d = doc.data() || {};
      if (d.status === 'suspended') return false;
      const docName = (d.name || '').trim().toLowerCase();
      const docDisplayName = (d.displayName || '').trim().toLowerCase();
      const target = name.toLowerCase();
      return docName === target || docDisplayName === target;
    });

    if (!matchedDoc) {
      return respond('指定された名前の生徒が見つかりません', 401);
    }

    const studentData = matchedDoc.data() || {};
    const hash = studentData.passwordHash;
    const salt = studentData.passwordSalt;

    // パスワード照合
    let passwordOk = false;
    if (hash && salt) {
      passwordOk = verifyPassword(password, hash, salt);
    } else if (studentData.passwordPlain) {
      passwordOk = password === studentData.passwordPlain;
    } else {
      // 初期生徒で未登録の場合はデフォルト '1234'
      passwordOk = password === '1234';
    }

    if (!passwordOk) {
      return respond('パスワードが正しくありません', 401);
    }

    return NextResponse.json({
      ok: true,
      role: 'student',
      token: studentData.token,
      student: {
        id: matchedDoc.id,
        name: studentData.name,
        displayName: studentData.displayName || studentData.name,
        color: studentData.color || '#0F6F65',
        icon: studentData.icon || 'book',
        avatarUrl: studentData.avatarUrl || '',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respond('ログイン処理中にエラーが発生しました: ' + (error instanceof Error ? error.message : 'Unknown error'), 500);
  }
}
