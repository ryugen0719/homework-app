import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export type AppRole = 'teacher' | 'student';

export type HomeworkTask = {
  id: string;
  text: string;
  done: boolean;
  evidencePath?: string;
  evidenceAt?: string;
};

export function authorize(request: Request): AppRole | null {
  const token = request.headers.get('x-app-token');
  if (!token || token.length < 32) return null;
  if (token === process.env.TEACHER_TOKEN) return 'teacher';
  if (token === process.env.STUDENT_TOKEN) return 'student';
  return null;
}

export function database() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase is not configured');
  const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return getFirestore(app);
}

export function tasksFromEntry(entry: Record<string, unknown>): HomeworkTask[] {
  if (Array.isArray(entry.tasks)) {
    return entry.tasks.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const task = value as Record<string, unknown>;
      if (typeof task.id !== 'string' || typeof task.text !== 'string' || !task.text.trim()) return [];
      return [{
        id: task.id,
        text: task.text,
        done: task.done === true,
        ...(typeof task.evidencePath === 'string' ? { evidencePath: task.evidencePath } : {}),
        ...(typeof task.evidenceAt === 'string' ? { evidenceAt: task.evidenceAt } : {}),
      }];
    });
  }
  if (typeof entry.text === 'string' && entry.text.trim()) {
    return [{
      id: 'legacy',
      text: entry.text,
      done: entry.done === true,
      ...(typeof entry.evidencePath === 'string' ? { evidencePath: entry.evidencePath } : {}),
    }];
  }
  return [];
}

export function isStudentDate(date: string) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const yesterdayDate = new Date(`${today}T12:00:00+09:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(yesterdayDate);
  return date === today || date === yesterday;
}

export function parseEvidencePath(pathname: string) {
  const match = /^evidence\/(\d{4}-\d{2}-\d{2})\/([a-zA-Z0-9_-]{1,64})\/([a-f0-9-]{36}(?:-[a-zA-Z0-9]{1,40})?)\.(jpe?g|png|webp)$/.exec(pathname);
  if (!match) return null;
  return { date: match[1], taskId: match[2] };
}
