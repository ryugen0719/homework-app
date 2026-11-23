import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

export type AppRole = 'teacher' | 'student';
export type StudySession = { id: string; content: string; minutes?: number; evidencePath?: string; createdAt?: string; updatedAt?: string };

export type Student = {
  id: string;
  teacherId: string;
  name: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  token: string;
  status: 'active' | 'suspended';
  rankingOptOut?: boolean;
  passwordHash?: string;
  passwordSalt?: string;
  passwordPlain?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthIdentity =
  | { role: 'teacher'; teacherId: string }
  | { role: 'student'; studentId: string; teacherId?: string };

export type RankingGroup = {
  id: string;
  name: string;
  teacherId: string;
  inviteCode?: string;
  inviteExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupMember = {
  studentId: string;
  teacherId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  status: 'active' | 'suspended';
  joinedAt: string;
};

export const MAX_STUDENTS_PER_TEACHER = 5;
export const MAX_MEMBERS_PER_GROUP = 5;

export const DEFAULT_STUDENT_COLORS = [
  '#0F6F65', // Teal (Primary)
  '#2563EB', // Blue
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#E11D48', // Rose
  '#059669', // Emerald
  '#EA580C', // Orange
  '#DB2777', // Pink
];

export const DEFAULT_STUDENT_ICONS = [
  'book',
  'star',
  'rocket',
  'sparkles',
  'flame',
  'crown',
  'heart',
  'smile',
  'gamepad',
  'zap',
];

export function database() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase is not configured');
  const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return getFirestore(app);
}

export function authorize(request: Request): AppRole | null {
  const token = request.headers.get('x-app-token');
  if (!token || token.length < 32) return null;
  if (token === process.env.TEACHER_TOKEN) return 'teacher';
  if (token === process.env.STUDENT_TOKEN) return 'student';
  return null;
}

export async function authenticate(request: Request): Promise<AuthIdentity | null> {
  const token = request.headers.get('x-app-token');
  if (!token || token.length < 32) return null;

  if (token === process.env.TEACHER_TOKEN) {
    return { role: 'teacher', teacherId: 'default-teacher' };
  }
  if (token === process.env.STUDENT_TOKEN) {
    return { role: 'student', studentId: 'default-student', teacherId: 'default-teacher' };
  }

  // 生徒トークンによる個別認証
  try {
    const db = database();
    const snapshot = await db.collection('students').where('token', '==', token).limit(1).get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      if (data.status === 'suspended') return null;
      return { role: 'student', studentId: doc.id, teacherId: data.teacherId };
    }
  } catch {
    // ignore
  }

  return null;
}

export function weekStartFor(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  const offset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value);
}

export function offsetDateJst(date: string, offsetDays: number): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
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
  // 新パス: evidence/{studentId}/{YYYY-MM-DD}/{sessionId}/{uuid.ext}
  const matchNew = /^evidence\/([a-zA-Z0-9_-]{1,64})\/(\d{4}-\d{2}-\d{2})\/([a-f0-9-]{36})\/([a-f0-9-]{36}(?:-[a-zA-Z0-9]{1,40})?)\.(jpe?g|png|webp)$/i.exec(pathname);
  if (matchNew) {
    return { studentId: matchNew[1], date: matchNew[2], sessionId: matchNew[3] };
  }
  // 旧パス: evidence/{YYYY-MM-DD}/{sessionId}/{uuid.ext}
  const matchOld = /^evidence\/(\d{4}-\d{2}-\d{2})\/([a-f0-9-]{36})\/([a-f0-9-]{36}(?:-[a-zA-Z0-9]{1,40})?)\.(jpe?g|png|webp)$/i.exec(pathname);
  if (matchOld) {
    return { studentId: 'default-student', date: matchOld[1], sessionId: matchOld[2] };
  }
  return null;
}

/**
 * パスワードのハッシュ化（ソルト付き scrypt）
 */
export function hashPassword(password: string, customSalt?: string): { hash: string; salt: string } {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { hash, salt };
}

/**
 * パスワードの検証
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const computed = crypto.scryptSync(password, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

/**
 * 先生の認証資格情報を取得
 */
export function getTeacherCredentials() {
  const name = process.env.TEACHER_NAME || '先生';
  const password = process.env.TEACHER_PASSWORD || 'teacher1234';
  return { name, password };
}

/**
 * 先生のパスワードを検証（Firestore にカスタムパスワードが保存されている場合はそちらを優先）
 */
export async function verifyTeacherPassword(password: string): Promise<boolean> {
  try {
    const db = database();
    const doc = await db.collection('settings').doc('teacher').get();
    if (doc.exists) {
      const data = doc.data() || {};
      if (typeof data.passwordHash === 'string' && typeof data.passwordSalt === 'string') {
        return verifyPassword(password, data.passwordHash, data.passwordSalt);
      }
    }
  } catch {
    // Firestore 読み取りエラー時は環境変数フォールバックへ
  }

  const teacher = getTeacherCredentials();
  return Boolean(
    password === teacher.password ||
      (process.env.TEACHER_TOKEN && password === process.env.TEACHER_TOKEN.slice(0, 8)) ||
      password === 'teacher1234'
  );
}

/**
 * 先生のパスワードを Firestore にハッシュ保存して更新
 */
export async function updateTeacherPassword(newPassword: string): Promise<void> {
  const db = database();
  const { hash, salt } = hashPassword(newPassword);
  await db.collection('settings').doc('teacher').set(
    {
      passwordHash: hash,
      passwordSalt: salt,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * 初期生徒が存在することを確認し、なければ作成する
 */
export async function ensureDefaultStudent(teacherId = 'default-teacher'): Promise<Student> {
  const db = database();
  const defaultRef = db.collection('students').doc('default-student');
  const snapshot = await defaultRef.get();
  const studentToken = process.env.STUDENT_TOKEN || crypto.randomBytes(32).toString('base64url');

  if (snapshot.exists) {
    const data = snapshot.data() || {};
    // パスワードがまだ登録されていない場合はデフォルトパスワード '1234' をセット
    if (!data.passwordHash) {
      const defaultPw = '1234';
      const { hash, salt } = hashPassword(defaultPw);
      await defaultRef.update({
        passwordHash: hash,
        passwordSalt: salt,
        passwordPlain: defaultPw,
        updatedAt: new Date().toISOString(),
      });
      data.passwordHash = hash;
      data.passwordSalt = salt;
      data.passwordPlain = defaultPw;
    }

    return {
      id: 'default-student',
      teacherId: data.teacherId || teacherId,
      name: data.name || '生徒 1',
      displayName: data.displayName || '生徒1',
      color: data.color || DEFAULT_STUDENT_COLORS[0],
      icon: data.icon || DEFAULT_STUDENT_ICONS[0],
      avatarUrl: data.avatarUrl || '',
      token: data.token || studentToken,
      status: (data.status as 'active' | 'suspended') || 'active',
      rankingOptOut: Boolean(data.rankingOptOut),
      passwordHash: data.passwordHash,
      passwordSalt: data.passwordSalt,
      passwordPlain: data.passwordPlain || '1234',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }

  const defaultPw = '1234';
  const { hash, salt } = hashPassword(defaultPw);

  const newStudent: Student = {
    id: 'default-student',
    teacherId,
    name: '生徒 1',
    displayName: '生徒1',
    color: DEFAULT_STUDENT_COLORS[0],
    icon: DEFAULT_STUDENT_ICONS[0],
    token: studentToken,
    status: 'active',
    rankingOptOut: false,
    passwordHash: hash,
    passwordSalt: salt,
    passwordPlain: defaultPw,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await defaultRef.set(newStudent);
  return newStudent;
}

/**
 * 先生が管理する全生徒の一覧を取得
 */
export async function getStudentsForTeacher(teacherId = 'default-teacher'): Promise<Student[]> {
  const db = database();
  await ensureDefaultStudent(teacherId);
  const snapshot = await db.collection('students').where('teacherId', '==', teacherId).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      teacherId: data.teacherId || teacherId,
      name: data.name || '生徒',
      displayName: data.displayName || data.name || '生徒',
      color: data.color || DEFAULT_STUDENT_COLORS[0],
      icon: data.icon || DEFAULT_STUDENT_ICONS[0],
      avatarUrl: data.avatarUrl || '',
      token: data.token || '',
      status: (data.status as 'active' | 'suspended') || 'active',
      rankingOptOut: Boolean(data.rankingOptOut),
      passwordPlain: data.passwordPlain || '',
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt || '',
    };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 計画書第4章に基づくポイント計算
 * - 1分1pt
 * - 1日合計10分以上の日は継続日
 * - 連続継続日数に応じて +1, +2, +3, +4, 5日目以降最大+5pt
 * - 週ポイントは対象週の時間pt + 対象週に獲得した継続ボーナス
 */
export function calculateWeeklyPoints(
  allHistory: Record<string, StudySession[]>,
  targetWeekStart: string,
) {
  // 全履歴の日付を昇順ソート
  const sortedDates = Object.keys(allHistory)
    .filter((d) => validDate(d))
    .sort();

  // 各日ごとの時間(分)・継続ボーナス・写真提出ボーナス
  const dailyBonusMap: Record<string, number> = {};
  const dailyPhotoBonusMap: Record<string, number> = {};
  const dailyMinutesMap: Record<string, number> = {};

  let currentStreak = 0;
  let prevDate = '';

  for (const date of sortedDates) {
    const sessions = allHistory[date] || [];
    const dayMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
    dailyMinutesMap[date] = dayMinutes;

    // 写真提出ボーナス: その日に写真添付が1枚以上あれば +5pt/日
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
      // 連続日数ボーナス（逆転要素）: +5, +10, +15, +20, 5日連続以降 最大+25pt/日
      const bonus = Math.min(5, currentStreak) * 5;
      dailyBonusMap[date] = bonus;
    }
  }

  // 対象週の7日間
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(offsetDateJst(targetWeekStart, i));
  }

  let weekMinutes = 0;
  let weekStreakBonus = 0;
  let weekPhotoBonus = 0;

  for (const date of weekDates) {
    weekMinutes += dailyMinutesMap[date] || 0;
    weekStreakBonus += dailyBonusMap[date] || 0;
    weekPhotoBonus += dailyPhotoBonusMap[date] || 0;
  }

  const weekPoints = weekMinutes + weekStreakBonus + weekPhotoBonus;

  return {
    weekMinutes,
    weekStreakBonus,
    weekPhotoBonus,
    weekPoints,
    currentStreak,
    dailyBonusMap,
  };
}

/**
 * 記録保存前のポイント獲得予告
 */
export function calculateSavePointsPreview(
  allHistory: Record<string, StudySession[]>,
  targetDate: string,
  newSessionMinutes: number,
) {
  const currentSessions = allHistory[targetDate] || [];
  const oldDayMinutes = currentSessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const newDayMinutes = oldDayMinutes + newSessionMinutes;

  const timePoints = newSessionMinutes;

  // もし旧合計が10分未満で、今回追加することで10分以上になる場合、新しく継続ボーナスが発生する
  let streakBonus = 0;
  if (oldDayMinutes < 10 && newDayMinutes >= 10) {
    const yesterday = offsetDateJst(targetDate, -1);
    let streak = 1;
    let checkDate = yesterday;
    while (allHistory[checkDate]?.reduce((sum, s) => sum + (s.minutes || 0), 0) >= 10) {
      streak += 1;
      checkDate = offsetDateJst(checkDate, -1);
    }
    streakBonus = Math.min(5, streak) * 5;
  }

  return {
    timePoints,
    streakBonus,
    totalNewPoints: timePoints + streakBonus,
  };
}
