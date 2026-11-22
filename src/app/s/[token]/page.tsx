export const instant = false;
import Home from '../../page';
import { database } from '../../../lib/homework-server';

export default async function StudentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) {
    return (
      <main style={{ maxWidth: 720, margin: '64px auto', padding: 24, color: 'var(--color-ink)', background: 'var(--color-canvas)' }}>
        <h1>ページを表示できません</h1>
        <p>URLを確認してください。</p>
      </main>
    );
  }

  // 1. 環境変数の旧共通生徒トークンと一致するか
  let isValid = Boolean(process.env.STUDENT_TOKEN && token === process.env.STUDENT_TOKEN);

  // 2. Firestore students コレクションに登録されている生徒トークンか
  if (!isValid) {
    try {
      const db = database();
      const snapshot = await db.collection('students').where('token', '==', token).limit(1).get();
      if (!snapshot.empty) {
        const studentData = snapshot.docs[0].data();
        if (studentData.status !== 'suspended') {
          isValid = true;
        }
      }
    } catch {
      isValid = false;
    }
  }

  if (isValid) {
    return <Home initialRole="生徒" accessToken={token} />;
  }

  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: 24, color: 'var(--color-ink)', background: 'var(--color-canvas)' }}>
      <h1>ページを表示できません</h1>
      <p>URLを確認してください、または先生に新しいURLを発行してもらってください。</p>
    </main>
  );
}
