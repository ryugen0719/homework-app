import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { authenticate, database } from '../../../../lib/homework-server';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function respond(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return respond('認証されていません', 401);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return respond('画像保存ストレージが設定されていません', 503);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const reqStudentId = formData.get('studentId') as string | null;

    if (!file) {
      return respond('画像ファイルが指定されていません', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return respond('JPG、PNG、WebP、GIF形式の画像を選択してください', 400);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return respond('画像サイズは5MB以下にしてください', 400);
    }

    // 対象生徒IDの特定と認可検証
    let targetStudentId = '';
    const db = database();

    if (auth.role === 'student') {
      targetStudentId = auth.studentId;
    } else if (auth.role === 'teacher') {
      if (!reqStudentId) return respond('生徒IDが指定されていません', 400);
      targetStudentId = reqStudentId;
      // 担当生徒かどうかの検証
      if (targetStudentId !== 'default-student') {
        const studentDoc = await db.collection('students').doc(targetStudentId).get();
        if (!studentDoc.exists) return respond('指定された生徒が見つかりません', 404);
        const studentData = studentDoc.data() || {};
        if (studentData.teacherId && studentData.teacherId !== auth.teacherId) {
          return respond('権限がありません', 403);
        }
      }
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
    const filename = `avatars/${targetStudentId}-${Date.now()}.${ext}`;

    // Vercel Blob へパブリックアクセスで保存
    const blob = await put(filename, file, { access: 'public' });

    // Firestore の生徒ドキュメントを更新
    const studentRef = db.collection('students').doc(targetStudentId);
    await studentRef.set(
      {
        avatarUrl: blob.url,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // 所属しているレースグループのメンバー情報も更新
    try {
      const groupsSnap = await db.collection('groups').get();
      for (const gDoc of groupsSnap.docs) {
        const memberRef = gDoc.ref.collection('members').doc(targetStudentId);
        const memberDoc = await memberRef.get();
        if (memberDoc.exists) {
          await memberRef.set({ avatarUrl: blob.url }, { merge: true });
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      avatarUrl: blob.url,
      studentId: targetStudentId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Avatar upload error:', err);
    return respond('アバター画像の保存に失敗しました', 500);
  }
}
