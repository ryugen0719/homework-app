import { NextResponse } from 'next/server';
import { database, ensureDefaultStudent } from '../../../../lib/homework-server';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * ログイン画面用の公開生徒リスト
 * ※ プライバシー保護: トークン、パスワード、学習データは一切含めず、選択肢表示用情報のみ返す
 */
export async function GET() {
  try {
    const db = database();
    await ensureDefaultStudent();
    const snapshot = await db.collection('students').where('status', '==', 'active').get();

    const students = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || '生徒',
        displayName: data.displayName || data.name || '生徒',
        color: data.color || '#0F6F65',
        icon: data.icon || 'book',
        avatarUrl: data.avatarUrl || '',
      };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

    return json({ students });
  } catch {
    return json({ students: [] });
  }
}
