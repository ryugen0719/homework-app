export const instant = false;
import Home from '../../page';
export default async function TeacherPage({ params }: { params: Promise<{ token: string }> }) {
 const { token } = await params;
 if (!process.env.TEACHER_TOKEN || token !== process.env.TEACHER_TOKEN) return <main style={{maxWidth:720,margin:'64px auto',padding:24,color:'#1F2A44'}}><h1>ページを表示できません</h1><p>URLを確認してください。</p></main>;
 return <Home />;
}

