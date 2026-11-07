import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export type AppRole = 'teacher' | 'student';
export type StudySession = { id: string; content: string; minutes?: number; evidencePath?: string; createdAt?: string; updatedAt?: string };

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

export function weekStartFor(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  const offset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value);
}

export function validDate(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}
export function sessionsFromDay(day: Record<string, unknown>): StudySession[] {
  if (!Array.isArray(day.sessions)) return [];
  return day.sessions.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const session = value as Record<string, unknown>;
    if (typeof session.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(session.id) || typeof session.content !== 'string' || !session.content.trim()) return [];
    return [{
      id: session.id,
      content: session.content,
      ...(Number.isInteger(session.minutes) && (session.minutes as number) > 0 && (session.minutes as number) <= 1440 ? { minutes: session.minutes as number } : {}),
      ...(typeof session.evidencePath === 'string' ? { evidencePath: session.evidencePath } : {}),
      ...(typeof session.createdAt === 'string' ? { createdAt: session.createdAt } : {}),
      ...(typeof session.updatedAt === 'string' ? { updatedAt: session.updatedAt } : {}),
    }];
  });
}

export function isStudentDate(date: string) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const yesterdayDate = new Date(`${today}T12:00:00+09:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(yesterdayDate);
  return date === today || date === yesterday;
}

export function parseEvidencePath(pathname: string) {
  const match = /^evidence\/(\d{4}-\d{2}-\d{2})\/([a-f0-9-]{36})\/([a-f0-9-]{36}(?:-[a-zA-Z0-9]{1,40})?)\.(jpe?g|png|webp)$/i.exec(pathname);
  if (!match) return null;
  return { date: match[1], sessionId: match[2] };
}
