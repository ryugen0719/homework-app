'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { upload } from '@vercel/blob/client';
import {
  BadgeCheck,
  BarChart3,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Moon,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FiBookOpen } from 'react-icons/fi';
import { ui } from './ui';
import TimelineView from './TimelineView';
import StatsView from './StatsView';
import RankingView from './RankingView';
import LoginView from './LoginView';
import HoldButton from '../components/HoldButton/HoldButton';
import RubberSegment from '../components/RubberSegment/RubberSegment';
import StudentAvatar, {
  renderPresetIcon,
  STUDENT_COLOR_OPTIONS,
  STUDENT_ICON_OPTIONS,
} from '../components/StudentAvatar';
import ProfileModal from '../components/ProfileModal';

type StudySession = { id: string; content: string; minutes?: number; evidencePath?: string; createdAt?: string; updatedAt?: string };
type Review = { comment?: string; reviewedAt?: string };
type DayEntry = { date: string; sessions: StudySession[]; review?: Review };
type Draft = { id: string; content: string; minutes: string };

type StudentInfo = {
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
  passwordPlain?: string;
  createdAt?: string;
};

const QUICK_MINUTES = [15, 30, 45, 60];
const DEFAULT_STUDENT_COLORS = STUDENT_COLOR_OPTIONS;
const DEFAULT_STUDENT_ICONS = STUDENT_ICON_OPTIONS;

const emptySubscribe = () => () => {};
const getThemeSnapshot = () => {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
};
const subscribeTheme = (callback: () => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};
const getAuthSnapshot = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('homework_auth') || '';
};
const subscribeAuth = (callback: () => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};
const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dateAtJst = (date: string) => new Date(`${date}T12:00:00+09:00`);
function offsetDate(date: string, offset: number) {
  const value = dateAtJst(date);
  value.setDate(value.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value);
}
function formatDate(date: string) {
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date));
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekday}）`;
}
function monthLabel(monthStr: string) {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  return `${year}年 ${Number(month)}月`;
}
function blankEntry(date: string): DayEntry {
  return { date, sessions: [] };
}

function renderStudentIcon(iconName: string, size = 16) {
  return renderPresetIcon(iconName, size);
}

/**
 * 先生の確認済みチェックバッジ（lucide-react の BadgeCheck を使用）
 */
function TeacherCheckIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-grid place-items-center text-reward transition-transform ${className}`}
      aria-label="先生の確認チェック"
    >
      <BadgeCheck size={size} strokeWidth={2.2} className="fill-reward/15 text-reward stroke-reward" />
    </span>
  );
}

/**
 * 勉強完了シール（lucide-react の Check を使用）
 */
function RecordSeal({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`stamp-seal inline-grid place-items-center rounded-full bg-reward text-white ${className}`}
      aria-label="勉強完了シール"
    >
      <Check size={Math.round(size * 0.62)} strokeWidth={3} className="stroke-white" />
    </span>
  );
}

function EvidencePreview({
  pathname,
  token,
  label,
  onOpenPreview,
}: {
  pathname: string;
  token: string;
  label: string;
  onOpenPreview?: (src: string, label: string) => void;
}) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl = '';
    let active = true;
    fetch(`/api/evidence?pathname=${encodeURIComponent(pathname)}`, { headers: { 'x-app-token': token }, cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(); return response.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setSrc(objectUrl); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pathname, token]);
  if (failed) return <span className={ui.quiet}>写真を表示できません</span>;
  if (!src) return <span className={ui.quiet}>写真を読み込み中…</span>;
  return (
    <button
      type="button"
      className={ui.evidence}
      onClick={() => (onOpenPreview ? onOpenPreview(src, label) : window.open(src, '_blank'))}
      aria-label={`${label}の写真を開く`}
    >
      <img src={src} alt={`${label}の写真`} />
      <span><ImagePlus size={16} />写真を見る</span>
    </button>
  );
}

export default function Home({ initialRole = '生徒', accessToken = '' }: { initialRole?: '生徒' | '先生'; accessToken?: string }) {
  const storedAuth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => '');
  const [authOverride, setAuthOverride] = useState<{ token: string; role: '生徒' | '先生' } | null>(null);

  const { token, role } = useMemo(() => {
    if (accessToken) return { token: accessToken, role: initialRole };
    if (authOverride) return authOverride;
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.token) {
          return {
            token: parsed.token as string,
            role: (parsed.role as '生徒' | '先生') || initialRole,
          };
        }
      } catch {}
    }
    return { token: '', role: initialRole };
  }, [accessToken, initialRole, authOverride, storedAuth]);

  // クライアントマウント判定
  const authChecked = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const today = useSyncExternalStore(emptySubscribe, todayJst, () => '');
  const storedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'light');
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(null);
  const theme = themeOverride ?? storedTheme;
  const [previewImage, setPreviewImage] = useState<{ src: string; label: string } | null>(null);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeOverride(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore
    }
  }

  // URLからaccessTokenが直接渡された場合のみ、外部ストレージに保存
  useEffect(() => {
    if (accessToken) {
      try {
        localStorage.setItem(
          'homework_auth',
          JSON.stringify({ token: accessToken, role: initialRole })
        );
      } catch {}
    }
  }, [accessToken, initialRole]);

  // 生徒一覧と選択中の生徒
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('default-student');
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentDisplayName, setNewStudentDisplayName] = useState('');
  const [newStudentColor, setNewStudentColor] = useState<string>(DEFAULT_STUDENT_COLORS[0]);
  const [newStudentIcon, setNewStudentIcon] = useState('book');
  const [newStudentPassword, setNewStudentPassword] = useState('1234');
  const [studentModalError, setStudentModalError] = useState('');
  const [copiedStudentId, setCopiedStudentId] = useState('');
  const [creatingStudent, setCreatingStudent] = useState(false);

  // 既存生徒の編集ステート
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editColor, setEditColor] = useState<string>(DEFAULT_STUDENT_COLORS[0]);
  const [editIcon, setEditIcon] = useState('book');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [uploadingTeacherAvatar, setUploadingTeacherAvatar] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [updatingStudent, setUpdatingStudent] = useState(false);
  const [showPlainPasswordMap, setShowPlainPasswordMap] = useState<Record<string, boolean>>({});

  // 表示中の月（YYYY-MM）
  const [selectedMonth, setSelectedMonth] = useState('');
  const currentMonth = selectedMonth || (today ? today.slice(0, 7) : '');

  // 選択中の日付（YYYY-MM-DD）
  const [selectedDate, setSelectedDate] = useState('');
  const teacherManuallyNavigated = useRef(false);
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline' | 'ranking' | 'stats'>('calendar');
  const [hasLoadedAll, setHasLoadedAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const day = selectedDate || today || '';

  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [loadedMonths, setLoadedMonths] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { comment: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [teacherSearchError, setTeacherSearchError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [showPastComposer, setShowPastComposer] = useState(false);

  // 生徒一覧の取得
  const fetchStudents = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/students', {
        headers: { 'x-app-token': token },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.students && Array.isArray(data.students)) {
          setStudents(data.students);
          if (data.students.length > 0 && (!selectedStudentId || !data.students.some((s: StudentInfo) => s.id === selectedStudentId))) {
            setSelectedStudentId(data.students[0].id);
          }
        } else if (data.student) {
          setStudents([data.student]);
          setSelectedStudentId(data.student.id);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    if (!token) return;
    fetch('/api/students', {
      headers: { 'x-app-token': token },
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.students && Array.isArray(data.students)) {
          setStudents(data.students);
          if (data.students.length > 0 && (!selectedStudentId || !data.students.some((s: StudentInfo) => s.id === selectedStudentId))) {
            setSelectedStudentId(data.students[0].id);
          }
        } else if (data.student) {
          setStudents([data.student]);
          setSelectedStudentId(data.student.id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, selectedStudentId]);

  // 選択中の生徒オブジェクト
  const currentStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || (students[0] as StudentInfo | undefined);
  }, [students, selectedStudentId]);

  // 生徒切り替え時にキャッシュクリア
  const handleSelectStudent = (newId: string) => {
    if (newId === selectedStudentId) return;
    setSelectedStudentId(newId);
    setEntries({});
    setLoadedMonths({});
    setDrafts({});
    setReviewDrafts({});
    setHasLoadedAll(false);
  };

  const dataReady = Boolean(loadedMonths[currentMonth]);
  const loading = Boolean(token && currentMonth && !dataReady && !error);
  const entry = entries[day] || blankEntry(day);
  const sessions = useMemo(() => entry.sessions || [], [entry.sessions]);
  const draft = drafts[day] || { id: '', content: '', minutes: '' };
  const savedReview = entry.review || {};
  const reviewDraft = reviewDrafts[day] || { comment: savedReview.comment || '' };
  const reviewHasChanges = reviewDraft.comment.trim() !== (savedReview.comment || '').trim();
  const reviewCanSave = reviewHasChanges || !savedReview.reviewedAt;

  const dayMinutes = sessions.reduce((sum, session) => sum + (session.minutes || 0), 0);
  const canLog = Boolean(today && day <= today);
  const canAddPhoto = Boolean(today && [today, offsetDate(today, -1)].includes(day));

  // 月全体の学習集計
  const monthEntries = useMemo(() => {
    return Object.values(entries).filter((item) => item.date.startsWith(currentMonth));
  }, [entries, currentMonth]);
  const monthRecordedDays = monthEntries.filter((item) => item.sessions.length > 0).length;
  const monthReviewedCount = monthEntries.filter((item) => item.review?.reviewedAt).length;
  const monthTotalMinutes = monthEntries.reduce((sum, item) => sum + item.sessions.reduce((daySum, session) => daySum + (session.minutes || 0), 0), 0);

  // 保存前ポイント獲得予告 (Preview)
  const pointPreview = useMemo(() => {
    if (role !== '生徒') return null;
    const minutesVal = Number(draft.minutes);
    if (!Number.isInteger(minutesVal) || minutesVal <= 0) return null;

    // 現在のその日の学習分数（編集中ならそのセッションを除外）
    const otherSessionsMinutes = sessions
      .filter((s) => s.id !== draft.id)
      .reduce((sum, s) => sum + (s.minutes || 0), 0);
    const newTotalMinutes = otherSessionsMinutes + minutesVal;

    // もし旧合計が10分未満で、今回で10分以上になるなら継続ボーナス発生
    let streakBonus = 0;
    if (otherSessionsMinutes < 10 && newTotalMinutes >= 10) {
      const recordDates = Object.keys(entries).filter(
        (d) => d !== day && (entries[d]?.sessions?.reduce((sum, s) => sum + (s.minutes || 0), 0) || 0) >= 10
      );
      let streak = 1;
      let checkDate = offsetDate(day, -1);
      while (recordDates.includes(checkDate)) {
        streak++;
        checkDate = offsetDate(checkDate, -1);
      }
      streakBonus = Math.min(5, streak) * 5;
    }

    return {
      timePoints: minutesVal,
      streakBonus,
      totalPoints: minutesVal + streakBonus,
      isFirstOver10: otherSessionsMinutes < 10 && newTotalMinutes >= 10,
    };
  }, [draft.minutes, draft.id, sessions, role, day, entries]);

  // カレンダーのマス目を生成（月曜始まり）
  const calendarCells = useMemo(() => {
    if (!currentMonth) return [];
    const [yearStr, monthStr] = currentMonth.split('-');
    const year = Number(yearStr);
    const m = Number(monthStr);
    const daysInMonth = new Date(year, m, 0).getDate();
    const firstDayWeekday = new Date(`${currentMonth}-01T12:00:00+09:00`).getDay();
    const startOffset = (firstDayWeekday + 6) % 7;

    const cells: Array<{
      date: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      dayOfWeek: number;
    }> = [];

    // 前月の余白
    const prevMonthDays = new Date(year, m - 1, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = offsetDate(`${currentMonth}-01`, -(i + 1));
      cells.push({
        date: prevDate,
        dayNumber: prevMonthDays - i,
        isCurrentMonth: false,
        dayOfWeek: dateAtJst(prevDate).getDay(),
      });
    }

    // 当月
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dayStr = String(dayNum).padStart(2, '0');
      const date = `${currentMonth}-${dayStr}`;
      cells.push({
        date,
        dayNumber: dayNum,
        isCurrentMonth: true,
        dayOfWeek: dateAtJst(date).getDay(),
      });
    }

    // 翌月の余白
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = offsetDate(`${currentMonth}-${String(daysInMonth).padStart(2, '0')}`, i);
      cells.push({
        date: nextDate,
        dayNumber: i,
        isCurrentMonth: false,
        dayOfWeek: dateAtJst(nextDate).getDay(),
      });
    }

    return cells;
  }, [currentMonth]);

  const selectedCalendarIndex = calendarCells.findIndex((cell) => cell.date === day);
  const selectedWeekStart = selectedCalendarIndex >= 0 ? Math.floor(selectedCalendarIndex / 7) * 7 : 0;
  const weekCalendarCells = calendarCells.slice(selectedWeekStart, selectedWeekStart + 7);
  const visibleCalendarCells = calendarView === 'week' ? weekCalendarCells : calendarCells;
  const calendarRangeLabel = calendarView === 'week' && weekCalendarCells.length === 7
    ? `${Number(weekCalendarCells[0].date.slice(5, 7))}/${Number(weekCalendarCells[0].date.slice(8, 10))}〜${Number(weekCalendarCells[6].date.slice(5, 7))}/${Number(weekCalendarCells[6].date.slice(8, 10))}`
    : monthLabel(currentMonth);
  const calendarLabel = calendarView === 'week' && weekCalendarCells.length === 7
    ? `${formatDate(weekCalendarCells[0].date)}から${formatDate(weekCalendarCells[6].date)}までの週間カレンダー`
    : `${monthLabel(currentMonth)}のカレンダー`;

  const hasUnsavedChanges = Object.entries(drafts).some(([date, item]) => {
    if (!item.id) return Boolean(item.content.trim() || item.minutes.trim());
    const saved = entries[date]?.sessions.find((session) => session.id === item.id);
    return Boolean(saved && (item.content !== saved.content || item.minutes !== (saved.minutes?.toString() || '')));
  }) || Object.entries(reviewDrafts).some(([date, item]) => {
    const saved = entries[date]?.review || {};
    return item.comment !== (saved.comment || '');
  });

  // 先生用: 未確認の提出日一覧
  const unreviewedDates = useMemo(() => {
    if (role !== '先生' || !dataReady) return [];
    return Object.values(entries)
      .filter((d) => (d?.sessions?.length || 0) > 0 && !d?.review?.reviewedAt)
      .map((d) => ({
        date: d.date,
        count: d.sessions.length,
        minutes: d.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, role, dataReady]);

  // 月データのフェッチ（生徒IDをパラメータに含める）
  useEffect(() => {
    if (!token || !currentMonth) return;
    if (loadedMonths[currentMonth]) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      month: currentMonth,
      ...(role === '先生' && selectedStudentId ? { studentId: selectedStudentId } : {}),
    });

    fetch(`/api/entries?${query.toString()}`, {
      headers: { 'x-app-token': token },
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { entries?: Record<string, DayEntry> };
      })
      .then((data) => {
        setEntries((current) => ({ ...current, ...(data.entries || {}) }));
        setLoadedMonths((current) => ({ ...current, [currentMonth]: true }));
        setError('');
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError('記録を読み込めませんでした。通信状況を確認してください。');
        }
      });
    return () => controller.abort();
  }, [token, currentMonth, loadedMonths, role, selectedStudentId]);

  useEffect(() => {
    if (role !== '先生' || !token || !today) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      oldestUnreviewed: 'true',
      ...(selectedStudentId ? { studentId: selectedStudentId } : {}),
    });

    fetch(`/api/entries?${query.toString()}`, {
      headers: { 'x-app-token': token },
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { date?: string | null };
      })
      .then(({ date }) => {
        if (typeof date === 'string' && !teacherManuallyNavigated.current) {
          setSelectedMonth(date.slice(0, 7));
          setSelectedDate(date);
          setShowPastComposer(false);
        }
        setTeacherSearchError('');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTeacherSearchError('未確認の学習記録を確認できませんでした。通信状況を確認してください。');
        }
      });
    return () => controller.abort();
  }, [role, token, today, selectedStudentId]);

  useEffect(() => {
    if (!hasUnsavedChanges && !saving && !uploading) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [hasUnsavedChanges, saving, uploading]);

  function changeCalendarRange(offset: number) {
    if (!currentMonth) return;
    teacherManuallyNavigated.current = true;
    if (calendarView === 'week') {
      const nextDate = offsetDate(day, offset * 7);
      setSelectedMonth(nextDate.slice(0, 7));
      setSelectedDate(nextDate);
    } else {
      const [yearStr, monthStr] = currentMonth.split('-');
      const date = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
      const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(nextMonth);
      if (today && today.startsWith(nextMonth)) {
        setSelectedDate(today);
      } else {
        setSelectedDate(`${nextMonth}-01`);
      }
    }
    setShowPastComposer(false);
    setError('');
  }

  function goToToday() {
    if (!today) return;
    teacherManuallyNavigated.current = true;
    setSelectedMonth(today.slice(0, 7));
    setSelectedDate(today);
    setShowPastComposer(false);
    setError('');
  }

  function updateDay(date: string, patch: Partial<DayEntry>) {
    setEntries((current) => ({ ...current, [date]: { ...blankEntry(date), ...current[date], ...patch } }));
  }

  const loadAllData = async () => {
    if (!token || loadingAll || hasLoadedAll) return;
    setLoadingAll(true);
    try {
      const query = new URLSearchParams({
        all: 'true',
        ...(role === '先生' && selectedStudentId ? { studentId: selectedStudentId } : {}),
      });
      const res = await fetch(`/api/entries?${query.toString()}`, {
        headers: { 'x-app-token': token },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { entries?: Record<string, DayEntry> };
      if (data.entries) {
        setEntries((current) => ({ ...current, ...data.entries }));
        setHasLoadedAll(true);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAll(false);
    }
  };

  function handleTimelineSelectDate(targetDate: string) {
    teacherManuallyNavigated.current = true;
    setSelectedMonth(targetDate.slice(0, 7));
    setSelectedDate(targetDate);
    setActiveTab('calendar');
    setShowPastComposer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [day]: { ...(current[day] || { id: '', content: '', minutes: '' }), ...patch } }));
  }

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 2400); }

  async function put(payload: Record<string, unknown>) {
    return fetch('/api/entries', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({
        ...payload,
        ...(role === '先生' && selectedStudentId ? { studentId: selectedStudentId } : {}),
      }),
    }).catch(() => null);
  }

  function startEdit(session: StudySession) {
    if (draft.content.trim() && draft.id !== session.id && !window.confirm('入力中の内容を破棄して、この記録を編集しますか？')) return;
    setDrafts((current) => ({ ...current, [day]: { id: session.id, content: session.content, minutes: session.minutes?.toString() || '' } }));
    document.getElementById('study-content')?.focus();
  }

  async function saveSession() {
    const content = draft.content.trim();
    const minutes = draft.minutes.trim() ? Number(draft.minutes) : undefined;
    if (!dataReady || !canLog || !content) { setError('勉強した内容を入力してください。'); return; }
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) { setError('学習時間は1〜1440分で入力してください。'); return; }
    const id = draft.id || crypto.randomUUID();
    const existing = sessions.find((session) => session.id === id);
    const now = new Date().toISOString();
    const next: StudySession = { id, content, ...(minutes ? { minutes } : {}), ...(existing?.evidencePath ? { evidencePath: existing.evidencePath } : {}), createdAt: existing?.createdAt || now, updatedAt: now };
    setSaving(true); setError('');
    const response = await put({ action: 'session-save', date: day, id, content, ...(minutes ? { minutes } : {}) });
    if (!response?.ok) { setError('記録を保存できませんでした。入力は残っています。もう一度お試しください。'); setSaving(false); return; }
    updateDay(day, { sessions: existing ? sessions.map((item) => item.id === id ? next : item) : [...sessions, next] });
    setDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[day]; return nextDrafts; });
    setSaving(false); notify(existing ? '記録を更新しました' : '勉強を記録しました');
  }

  async function deleteSession(session: StudySession) {
    if (!window.confirm('この記録を削除しますか？')) return;
    setSaving(true); setError('');
    const response = await put({ action: 'session-delete', date: day, id: session.id });
    if (!response?.ok) { setError('記録を削除できませんでした。もう一度お試しください。'); setSaving(false); return; }
    updateDay(day, { sessions: sessions.filter((item) => item.id !== session.id) });
    if (draft.id === session.id) setDrafts((current) => { const next = { ...current }; delete next[day]; return next; });
    setSaving(false); notify('記録を削除しました');
  }

  async function saveReview() {
    const comment = reviewDraft.comment.trim();
    if (!dataReady || !day) return;
    setSaving(true); setError('');
    const response = await put({ action: 'review-save', date: day, comment });
    if (!response?.ok) { setError('コメントを保存できませんでした。入力は残っています。もう一度お試しください。'); setSaving(false); return; }
    updateDay(day, { review: { comment, reviewedAt: new Date().toISOString() } });
    setSaving(false); notify('先生の確認コメントを保存しました');
  }

  async function uploadEvidence(session: StudySession, file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('JPG・PNG・WebP画像を選択してください。'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('画像サイズは5MB以下にしてください。'); return; }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const studentPrefix = currentStudent?.id || 'default-student';
    const pathname = `evidence/${studentPrefix}/${day}/${session.id}/${crypto.randomUUID()}.${ext}`;
    setUploading(session.id); setUploadPercent(0); setError('');
    try {
      const blob = await upload(pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/evidence/upload',
        headers: { 'x-app-token': token },
        clientPayload: JSON.stringify({ date: day, sessionId: session.id, studentId: studentPrefix }),
        onUploadProgress: (progress) => setUploadPercent(Math.round(progress.percentage)),
      });
      const response = await put({ action: 'session-save', date: day, id: session.id, content: session.content, ...(session.minutes ? { minutes: session.minutes } : {}), evidencePath: blob.pathname });
      if (!response?.ok) throw new Error();
      updateDay(day, { sessions: sessions.map((item) => item.id === session.id ? { ...item, evidencePath: blob.pathname } : item) });
      notify('写真を保存しました');
    } catch {
      setError('画像を保存できませんでした。もう一度お試しください。');
    } finally {
      setUploading(''); setUploadPercent(0);
    }
  }

  // 新規生徒の追加（先生のみ）
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    setCreatingStudent(true);
    setStudentModalError('');
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          name: newStudentName.trim(),
          displayName: newStudentDisplayName.trim() || newStudentName.trim(),
          color: newStudentColor,
          icon: newStudentIcon,
          password: newStudentPassword.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStudentModalError(json.error || '生徒の作成に失敗しました');
        return;
      }
      setNewStudentName('');
      setNewStudentDisplayName('');
      setNewStudentPassword('1234');
      await fetchStudents();
      setSelectedStudentId(json.student.id);
      notify('新しい生徒を追加しました');
    } catch {
      setStudentModalError('通信エラーが発生しました');
    } finally {
      setCreatingStudent(false);
    }
  };

  // 既存生徒の編集開始
  const startEditStudent = (student: StudentInfo) => {
    setEditingStudentId(student.id);
    setEditName(student.name);
    setEditDisplayName(student.displayName);
    setEditColor(student.color || DEFAULT_STUDENT_COLORS[0]);
    setEditIcon(student.icon || 'book');
    setEditAvatarUrl(student.avatarUrl || '');
    setEditPassword(student.passwordPlain || '');
    setStudentModalError('');
  };

  // 先生による生徒アバター画像アップロード
  const handleTeacherAvatarUpload = async (file: File) => {
    if (!editingStudentId) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setStudentModalError('JPG・PNG・WebP・GIF形式の画像を選択してください');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStudentModalError('画像サイズは5MB以下にしてください');
      return;
    }
    setUploadingTeacherAvatar(true);
    setStudentModalError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('studentId', editingStudentId);
      const res = await fetch('/api/avatar/upload', {
        method: 'POST',
        headers: { 'x-app-token': token },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setStudentModalError(json.error || '画像のアップロードに失敗しました');
        return;
      }
      setEditAvatarUrl(json.avatarUrl);
      await fetchStudents();
      setProfileRefreshKey((k) => k + 1);
      notify('アイコン画像を更新しました');
    } catch {
      setStudentModalError('通信エラーが発生しました');
    } finally {
      setUploadingTeacherAvatar(false);
    }
  };

  // 既存生徒の更新
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentId || !editName.trim()) return;
    setUpdatingStudent(true);
    setStudentModalError('');
    try {
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          studentId: editingStudentId,
          name: editName.trim(),
          displayName: editDisplayName.trim() || editName.trim(),
          color: editColor,
          icon: editIcon,
          avatarUrl: editAvatarUrl,
          password: editPassword.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStudentModalError(json.error || '生徒の更新に失敗しました');
        return;
      }
      setEditingStudentId(null);
      await fetchStudents();
      setProfileRefreshKey((k) => k + 1);
      notify('生徒情報を更新しました');
    } catch {
      setStudentModalError('通信エラーが発生しました');
    } finally {
      setUpdatingStudent(false);
    }
  };

  // ログアウト処理
  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      try {
        localStorage.removeItem('homework_auth');
      } catch {}
      setAuthOverride({ token: '', role: '生徒' });
      // キャッシュとステートを完全にリセット
      setEntries({});
      setLoadedMonths({});
      setDrafts({});
      setReviewDrafts({});
      setHasLoadedAll(false);
      setStudents([]);
      notify('ログアウトしました');
    }
  };

  // ログイン成功時の処理
  const handleLoginSuccess = (data: {
    role: 'teacher' | 'student';
    token: string;
    student?: {
      id: string;
      name: string;
      displayName: string;
      color: string;
      icon: string;
      avatarUrl?: string;
    };
  }) => {
    const roleLabel = data.role === 'teacher' ? '先生' : '生徒';
    try {
      localStorage.setItem(
        'homework_auth',
        JSON.stringify({ token: data.token, role: roleLabel })
      );
    } catch {}
    // キャッシュをクリアして新アカウントのデータを確実に再取得
    setEntries({});
    setLoadedMonths({});
    setDrafts({});
    setReviewDrafts({});
    setHasLoadedAll(false);

    setAuthOverride({ token: data.token, role: roleLabel });
    if (data.student) {
      setSelectedStudentId(data.student.id);
      setStudents([{
        id: data.student.id,
        teacherId: 'default-teacher',
        name: data.student.name,
        displayName: data.student.displayName,
        color: data.student.color,
        icon: data.student.icon,
        avatarUrl: data.student.avatarUrl || '',
        token: data.token,
        status: 'active',
      }]);
    }
    notify(
      data.role === 'teacher'
        ? '先生としてログインしました'
        : `${data.student?.displayName || data.student?.name || '生徒'}としてログインしました`
    );
  };

  // 生徒専用URLのコピー
  const copyStudentUrl = (studentToken: string, studentId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/s/${studentToken}`;
    navigator.clipboard.writeText(url);
    setCopiedStudentId(studentId);
    setTimeout(() => setCopiedStudentId(''), 2000);
  };

  // 未ログイン状態の場合、ログイン画面を表示
  if (authChecked && !token) {
    return (
      <div className={ui.shell}>
        {notice && <div className={ui.notice} role="status" aria-live="polite">{notice}</div>}
        <header className={ui.header}>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FiBookOpen size={20} aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-ink">宿題ノート</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-card-subtle border border-line text-muted">
                  ログイン
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className={ui.themeToggle}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <main className="py-6 sm:py-10">
          <LoginView onLoginSuccess={handleLoginSuccess} />
        </main>
      </div>
    );
  }

  return (
    <div className={ui.shell}>
      {notice && <div className={ui.notice} role="status" aria-live="polite">{notice}</div>}

      {/* ヘッダー */}
      <header className={ui.header}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FiBookOpen size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-ink">宿題ノート</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-card-subtle border border-line text-muted">
                {role}用
              </span>
            </div>
          </div>
        </div>

        {/* 先生・生徒別のアカウント表示/切り替えUI */}
        <div className="flex items-center gap-2">
          {role === '先生' ? (
            <div className="flex items-center gap-2">
              {/* 先生用: 担当生徒切り替えセレクター */}
              {students.length > 0 && (
                <div className="relative inline-flex items-center">
                  <select
                    value={selectedStudentId}
                    onChange={(e) => handleSelectStudent(e.target.value)}
                    className="appearance-none pl-8 pr-7 py-1.5 rounded-xl text-xs font-bold border border-line bg-card hover:bg-card-subtle text-ink cursor-pointer focus:outline-none focus:border-primary shadow-subtle"
                    title="担当生徒を切り替え"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.displayName})
                      </option>
                    ))}
                  </select>
                  {/* カラーピル */}
                  <span
                    className="absolute left-2.5 size-3 rounded-full pointer-events-none"
                    style={{ backgroundColor: currentStudent?.color || '#0F6F65' }}
                  />
                  <ChevronDown size={14} className="absolute right-2 text-muted pointer-events-none" />
                </div>
              )}

              {/* 生徒管理モーダル起動ボタン */}
              <button
                type="button"
                onClick={() => setStudentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-card border border-line hover:border-primary/50 text-ink hover:text-primary shadow-subtle transition-all cursor-pointer"
                title="生徒の管理・追加"
              >
                <Users size={15} className="text-primary" />
                <span>生徒管理</span>
              </button>

              {/* 先生用ログアウトボタン */}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-all cursor-pointer"
                title="ログアウト"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          ) : (
            /* 生徒用: ログイン中表示（タップでアイコン設定）＆切り替え（ログアウト）ボタン */
            <div className="flex items-center gap-2">
              {currentStudent && (
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-card border border-line hover:border-primary/50 text-xs font-bold text-ink shadow-subtle transition-all cursor-pointer group"
                  title="アイコンやカラーを設定"
                >
                  <StudentAvatar
                    avatarUrl={currentStudent.avatarUrl}
                    icon={currentStudent.icon}
                    color={currentStudent.color}
                    name={currentStudent.displayName}
                    size="xs"
                    shape="circle"
                  />
                  <span>{currentStudent.displayName}</span>
                  <PencilLine size={11} className="text-muted group-hover:text-primary transition-colors" />
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-all cursor-pointer"
                title="生徒を切り替える（ログアウト）"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">切り替え</span>
              </button>
            </div>
          )}

          {today && (day !== today || currentMonth !== today.slice(0, 7)) && (
            <button
              type="button"
              className={ui.todayBadgeBtn}
              onClick={goToToday}
              title="今日の日付に戻る"
            >
              <RotateCcw size={13} />
              <span>今日</span>
            </button>
          )}

          <button
            type="button"
            className={ui.themeToggle}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {/* 先生用コンパクトバー（生徒用は冗長な説明を省き即コンテンツへ） */}
      {role === '先生' && (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
            {currentStudent?.name || '生徒'}さんの学習記録
          </h1>
          <button
            type="button"
            onClick={() => setStudentModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-primary-soft hover:bg-primary/15 text-primary-ink border border-primary/25 transition-all cursor-pointer"
          >
            <Users size={14} />
            <span>生徒管理（{students.length}/5）</span>
          </button>
        </section>
      )}

      {/* ビュー切り替えタブ（React Bits RubberSegment） */}
      <div className="mb-6">
        <RubberSegment
          aria-label="表示モードの切り替え"
          value={activeTab}
          onChange={(val) => {
            const next = val as 'calendar' | 'timeline' | 'ranking' | 'stats';
            setActiveTab(next);
            if ((next === 'timeline' || next === 'stats') && !hasLoadedAll) {
              void loadAllData();
            }
          }}
          items={[
            { value: 'calendar', label: 'カレンダー', icon: <Calendar size={15} /> },
            { value: 'timeline', label: 'タイムライン', icon: <Clock size={15} /> },
            { value: 'ranking', label: 'レース', icon: <Trophy size={15} /> },
            { value: 'stats', label: '統計', icon: <BarChart3 size={15} /> },
          ]}
          trackColor="var(--card)"
          thumbColor="var(--primary)"
          textColor="var(--text-sub)"
          activeTextColor="#ffffff"
          size="lg"
          radius={14}
          inset={4}
          equalSlots={true}
          className="w-full sm:w-auto border border-line shadow-card"
        />
      </div>

      {/* 1. カレンダータブ */}
      {activeTab === 'calendar' && (
      <div className="flex flex-col gap-6 w-full">
        {/* 先生専用: 未確認の提出フィード（ToDoキュー） */}
        {role === '先生' && dataReady && (
          <section className="rounded-2xl border border-line bg-card p-4 sm:p-5 shadow-card">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock size={15} />
                </span>
                <h3 className="text-sm font-bold text-ink m-0">未確認の学習記録</h3>
              </div>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full font-numbers ${unreviewedDates.length > 0 ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                {unreviewedDates.length > 0 ? `${unreviewedDates.length}件の要確認` : 'すべて確認済み ✓'}
              </span>
            </div>

            {unreviewedDates.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {unreviewedDates.map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => {
                      teacherManuallyNavigated.current = true;
                      setSelectedMonth(item.date.slice(0, 7));
                      setSelectedDate(item.date);
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${day === item.date ? 'bg-primary text-white border-primary shadow-subtle' : 'bg-card hover:bg-card-subtle text-ink border-line'}`}
                  >
                    <span>{formatDate(item.date)}</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-numbers ${day === item.date ? 'bg-white/20 text-white' : 'bg-card-subtle text-muted'}`}>
                      {item.count}件{item.minutes > 0 ? `・${item.minutes}分` : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted m-0 leading-relaxed">
                提出された勉強記録はすべて確認・返信済みです。いつも温かいサポートをありがとうございます！
              </p>
            )}
          </section>
        )}

        <div className={ui.workspaceGrid}>
          <div className={ui.calendarColumn}>
            <section className={ui.calendarCard} aria-label={calendarView === 'week' ? '週間カレンダー' : '月間カレンダー'}>
              {/* 表示範囲のヘッダー */}
              <div className={ui.monthPicker}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={ui.monthNavBtn}
                    onClick={() => changeCalendarRange(-1)}
                    aria-label={calendarView === 'week' ? '前の週' : '前の月'}
                    title={calendarView === 'week' ? '前の週へ' : '前の月へ'}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className={ui.monthNavBtn}
                    onClick={() => changeCalendarRange(1)}
                    aria-label={calendarView === 'week' ? '次の週' : '次の月'}
                    title={calendarView === 'week' ? '次の週へ' : '次の月へ'}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                
                <div className={ui.monthTitle} title={calendarLabel}>
                  <Calendar size={15} className="text-primary" />
                  <span>{calendarRangeLabel}</span>
                </div>

                <button
                  type="button"
                  className={ui.calendarViewToggle}
                  onClick={() => setCalendarView(calendarView === 'week' ? 'month' : 'week')}
                  aria-expanded={calendarView === 'month'}
                  aria-controls="calendar-days"
                  aria-label={calendarView === 'week' ? '月全体を見る' : '週間表示に戻る'}
                  title={calendarView === 'week' ? '月全体を見る' : '週間表示に戻る'}
                >
                  <span>{calendarView === 'week' ? '月' : '週'}</span>
                </button>
              </div>

              {/* 曜日ヘッダー */}
              {calendarView === 'month' && <div className={ui.calendarWeekdays} aria-hidden="true">
                <span>月</span>
                <span>火</span>
                <span>水</span>
                <span>木</span>
                <span>金</span>
                <span className="text-primary-ink">土</span>
                <span className="text-reward-ink">日</span>
              </div>}

              {loading && (
                <p className={ui.loadingStatus} role="status" aria-live="polite">
                  <LoaderCircle size={15} aria-hidden="true" />
                  <span>{monthLabel(currentMonth)}の記録を読み込んでいます</span>
                </p>
              )}

              {/* 日付グリッド */}
              <div id="calendar-days" className={ui.calendarGrid} role="grid" aria-label={calendarLabel}>
                {visibleCalendarCells.map((cell) => {
                  const isSelected = cell.date === day;
                  const isToday = cell.date === today;
                  const isFuture = Boolean(today && cell.date > today);
                  const cellEntry = entries[cell.date];
                  const hasRecord = Boolean(cellEntry?.sessions?.length);
                  const isReviewed = Boolean(cellEntry?.review?.reviewedAt);
                  const cellMins = cellEntry?.sessions?.reduce((sum, s) => sum + (s.minutes || 0), 0) || 0;
                  const sessionCount = cellEntry?.sessions?.length || 0;
                  const isSat = cell.dayOfWeek === 6;
                  const isSun = cell.dayOfWeek === 0;
                  const weekdayLabel = ['日', '月', '火', '水', '木', '金', '土'][cell.dayOfWeek];

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      disabled={calendarView === 'month' && !cell.isCurrentMonth}
                      className={`${ui.calendarCell} ${calendarView === 'week' ? ui.calendarCellWeek : ''} ${calendarView === 'month' && !cell.isCurrentMonth ? ui.calendarCellOtherMonth : ''} ${isSelected ? ui.calendarCellSelected : ''} ${isToday && !isSelected ? ui.calendarCellToday : ''} ${isFuture ? ui.calendarCellFuture : ''} ${hasRecord && !isSelected ? 'bg-reward-soft/35 border-reward/20' : ''}`}
                      onClick={() => {
                        teacherManuallyNavigated.current = true;
                        if (cell.date.slice(0, 7) !== currentMonth) setSelectedMonth(cell.date.slice(0, 7));
                        setSelectedDate(cell.date);
                        setShowPastComposer(false);
                      }}
                      aria-pressed={isSelected}
                      aria-label={`${formatDate(cell.date)}${hasRecord ? `、記録${sessionCount}件` : ''}${isReviewed ? '、先生の確認あり' : ''}`}
                    >
                      {calendarView === 'week' && (
                        <span className={`${ui.calendarWeekdayLabel} ${isSat && !isSelected ? 'text-primary-ink' : ''} ${isSun && !isSelected ? 'text-reward-ink' : ''}`}>
                          {weekdayLabel}
                        </span>
                      )}
                      <span className={`${ui.calendarDayNum} ${isSat && !isSelected ? 'text-primary-ink' : ''} ${isSun && !isSelected ? 'text-reward-ink' : ''}`}>
                        {cell.dayNumber}
                      </span>

                      <div className={`${ui.calendarMarkerArea} ${calendarView === 'week' ? ui.calendarMarkerCompact : ''}`}>
                        {isReviewed ? (
                          <TeacherCheckIcon size={calendarView === 'week' ? 16 : 22} className={isSelected ? '!text-white [&_svg]:!fill-white/30 [&_svg]:!stroke-white' : ''} />
                        ) : hasRecord ? (
                          <RecordSeal size={calendarView === 'week' ? 14 : 18} className={isSelected ? '!bg-white !text-primary' : ''} />
                        ) : isToday ? (
                          <span className="today-dot size-1.5 rounded-full bg-primary" title="今日" />
                        ) : null}

                        {calendarView === 'month' && hasRecord && cellMins > 0 && !isSelected && (
                          <span className="text-[11px] tabular-nums text-muted font-bold leading-tight mt-0.5">
                            {cellMins}分
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* カレンダー下部サマリー */}
              <footer className="mt-4 pt-3.5 border-t border-line/60 flex items-center justify-center gap-3 sm:gap-6 text-xs text-muted flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <TeacherCheckIcon size={16} />
                  <span>確認済 {monthReviewedCount}日</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <RecordSeal size={16} />
                  <span>記録 {monthRecordedDays}日</span>
                </div>
                {monthTotalMinutes > 0 && (
                  <div className="flex items-center gap-1 text-xs font-bold text-ink">
                    <Clock size={14} className="text-primary" />
                    <span>合計 {monthTotalMinutes}分</span>
                  </div>
                )}
              </footer>
            </section>
          </div>

          {/* 右カラム: 詳細パネル */}
          <div className="flex flex-col gap-5 min-w-0 w-full">
            {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs font-semibold text-danger" role="alert">{error}</div>}
            {teacherSearchError && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs font-semibold text-danger" role="alert">{teacherSearchError}</div>}

            {/* 先生用ビュー */}
            {role === '先生' ? (
              <section className={ui.panel}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="m-0 text-lg sm:text-xl font-extrabold tracking-tight text-ink">
                    {day ? formatDate(day) : ''}
                  </h2>
                  {sessions.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card-subtle border border-line/70 text-xs font-bold text-muted font-numbers shrink-0">
                      <Clock size={12} className="text-primary" />
                      {dayMinutes > 0 ? `${dayMinutes}分` : ''}
                      {dayMinutes > 0 ? ' · ' : ''}
                      {sessions.length}件
                    </span>
                  )}
                </div>

                {sessions.length > 0 ? (
                  <div className={ui.sessionList}>
                    {sessions.map((session, index) => (
                      <article
                        className="rounded-2xl border border-line/80 bg-card-subtle/35 hover:bg-card-subtle/55 hover:border-line-strong p-4 transition-all"
                        key={session.id}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="grid size-6 place-items-center rounded-lg bg-reward-soft text-[11px] font-extrabold font-numbers text-reward-ink border border-reward-line/50"
                              aria-hidden="true"
                            >
                              {index + 1}
                            </span>
                            {session.minutes && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card border border-line/70 text-xs font-bold font-numbers text-ink">
                                <Clock size={11} className="text-primary" />
                                {session.minutes}分
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="m-0 text-sm sm:text-[15px] leading-relaxed text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {session.content}
                        </p>
                        {session.evidencePath && (
                          <div className="mt-3">
                            <EvidencePreview
                              key={session.evidencePath}
                              pathname={session.evidencePath}
                              token={token}
                              label={session.content}
                              onOpenPreview={(src, label) => setPreviewImage({ src, label })}
                            />
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={ui.empty}>この日の勉強記録はまだありません。</p>
                )}

                {/* 先生コメント入力 */}
                <div className="mt-6 pt-4 border-t border-line">
                  <label className={ui.fieldLabel} htmlFor="review-comment">先生からのコメント・スタンプ</label>
                  <textarea
                    id="review-comment"
                    className={ui.textArea}
                    rows={3}
                    maxLength={1000}
                    value={reviewDraft.comment}
                    disabled={!dataReady || saving}
                    onChange={(e) => setReviewDrafts((c) => ({ ...c, [day]: { comment: e.target.value } }))}
                    placeholder="例：今日もよくがんばりました！計算の工夫が素晴らしいですね。"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className={ui.primaryButton}
                      disabled={!dataReady || saving || !reviewCanSave}
                      onClick={saveReview}
                    >
                      <Check size={16} />
                      {saving ? '保存中…' : '確認完了として保存'}
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              /* 生徒用ビュー */
              <section className={ui.panel}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="m-0 text-lg sm:text-xl font-extrabold tracking-tight text-ink">
                    {day === today ? '今日の勉強' : `${day ? formatDate(day) : ''}の勉強`}
                  </h2>
                  {sessions.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card-subtle border border-line/70 text-xs font-bold text-muted font-numbers shrink-0">
                      <Clock size={12} className="text-primary" />
                      {dayMinutes > 0 ? `${dayMinutes}分 · ` : ''}
                      {sessions.length}件
                    </span>
                  )}
                </div>

                {/* 先生からの確認コメント（届いていれば上部に表示） */}
                {entry.review?.comment && (
                  <div className={ui.reviewReceived}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-xs text-primary">
                        <TeacherCheckIcon size={18} />
                        先生からのメッセージ
                      </span>
                      <span className="text-[11px] text-muted">
                        {entry.review.reviewedAt ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.review.reviewedAt)) : ''}
                      </span>
                    </div>
                    <p className="mt-2 leading-relaxed text-sm text-ink">{entry.review.comment}</p>
                  </div>
                )}

                {/* セッション一覧（洗練されたカード構成） */}
                {sessions.length > 0 && (
                  <div className={ui.sessionList}>
                    {sessions.map((session, index) => {
                      const hasAnyPhotoToday = sessions.some((s) => Boolean(s.evidencePath));
                      return (
                        <article
                          className="group rounded-2xl border border-line/80 bg-card-subtle/35 hover:bg-card-subtle/55 hover:border-line-strong p-4 transition-all"
                          key={session.id}
                        >
                          {/* 上段：番号・時間ピル ＋ 右上に控えめなアイコン操作 */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="grid size-6 place-items-center rounded-lg bg-reward-soft text-[11px] font-extrabold font-numbers text-reward-ink border border-reward-line/50"
                                aria-hidden="true"
                              >
                                {index + 1}
                              </span>
                              {session.minutes && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card border border-line/70 text-xs font-bold font-numbers text-ink">
                                  <Clock size={11} className="text-primary" />
                                  {session.minutes}分
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={!dataReady || saving || Boolean(uploading)}
                                onClick={() => { setShowPastComposer(true); startEdit(session); }}
                                className="grid size-7 place-items-center rounded-lg text-muted hover:text-ink hover:bg-card transition-colors cursor-pointer disabled:opacity-40"
                                title="編集"
                                aria-label="編集"
                              >
                                <PencilLine size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={!dataReady || saving || Boolean(uploading)}
                                onClick={() => void deleteSession(session)}
                                className="grid size-7 place-items-center rounded-lg text-muted hover:text-danger hover:bg-error-soft transition-colors cursor-pointer disabled:opacity-40"
                                title="削除"
                                aria-label="削除"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* 中段：主役の勉強内容テキスト */}
                          <p className="m-0 text-sm sm:text-[15px] leading-relaxed text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {session.content}
                          </p>

                          {/* 下段：写真プレビューまたは写真追加チップ */}
                          {(session.evidencePath || canAddPhoto) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                              {session.evidencePath && (
                                <EvidencePreview
                                  key={session.evidencePath}
                                  pathname={session.evidencePath}
                                  token={token}
                                  label={session.content}
                                  onOpenPreview={(src, label) => setPreviewImage({ src, label })}
                                />
                              )}
                              {canAddPhoto && (
                                <label className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-ink hover:border-primary/50 hover:text-primary transition-all shadow-subtle">
                                  <Camera size={13} className="text-primary" />
                                  <span>
                                    {uploading === session.id
                                      ? `送信中 ${uploadPercent}%`
                                      : session.evidencePath
                                      ? '写真を変更'
                                      : '写真を追加'}
                                  </span>
                                  {!hasAnyPhotoToday && !session.evidencePath && (
                                    <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-ink text-[10px] font-bold font-numbers">
                                      +5pt
                                    </span>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    disabled={!dataReady || Boolean(uploading) || saving}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) void uploadEvidence(session, file);
                                      event.target.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                {/* 記録入力フォーム（当日、または過去の追加記録） */}
                {canLog && (
                  <div className={sessions.length > 0 ? "mt-6 pt-4 border-t border-line" : ""}>
                    {sessions.length > 0 && !showPastComposer && !draft.content.trim() && !draft.id ? (
                      <button
                        type="button"
                        className={ui.addSessionToggle}
                        onClick={() => setShowPastComposer(true)}
                      >
                        <Plus size={16} />
                        この日に追加で勉強を記録する
                      </button>
                    ) : (
                      <div className={ui.composer}>
                        <label className={ui.fieldLabel} htmlFor="study-content">勉強した内容</label>
                        <textarea
                          id="study-content"
                          className={ui.textArea}
                          rows={3}
                          maxLength={1000}
                          value={draft.content}
                          disabled={!dataReady || saving || Boolean(uploading)}
                          onChange={(event) => updateDraft({ content: event.target.value })}
                          placeholder="例：算数の問題集を5ページ進めた"
                        />
                        <div className={ui.composerFooter}>
                          <div className="flex flex-col gap-1 w-full sm:w-auto">
                            <label className={ui.minutesField}>
                              学習時間（任意）
                              <span>
                                <input
                                  className={ui.minutesInput}
                                  type="number"
                                  min="1"
                                  max="1440"
                                  inputMode="numeric"
                                  value={draft.minutes}
                                  disabled={!dataReady || saving || Boolean(uploading)}
                                  onChange={(event) => updateDraft({ minutes: event.target.value })}
                                  aria-label="学習時間（分）"
                                  placeholder="30"
                                />分
                              </span>
                            </label>
                            <div className={ui.quickMinutesList} aria-label="学習時間の目安">
                              {QUICK_MINUTES.map((mins) => {
                                const active = draft.minutes === String(mins);
                                return (
                                  <button
                                    key={mins}
                                    type="button"
                                    className={`${ui.quickMinuteBtn} ${active ? ui.quickMinuteBtnActive : ''}`}
                                    disabled={!dataReady || saving || Boolean(uploading)}
                                    onClick={() => updateDraft({ minutes: active ? '' : String(mins) })}
                                    aria-pressed={active}
                                  >
                                    {mins}分
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className={ui.formActions}>
                            {draft.id && (
                              <button
                                type="button"
                                className={ui.secondaryButton}
                                disabled={saving || Boolean(uploading)}
                                onClick={() => {
                                  setDrafts((current) => { const next = { ...current }; delete next[day]; return next; });
                                  setShowPastComposer(false);
                                }}
                              >
                                <X size={16} />編集をやめる
                              </button>
                            )}
                            <HoldButton
                              size="md"
                              radius={14}
                              holdTime={1000}
                              waveAmplitude={3}
                              backgroundColor="var(--color-primary)"
                              fillColor="var(--color-primary-hover, #0A534C)"
                              textColor="#ffffff"
                              fillTextColor="#ffffff"
                              wave={true}
                              glow={true}
                              disabled={!dataReady || saving || Boolean(uploading) || !draft.content.trim()}
                              onHold={() => {
                                void saveSession().then(() => setShowPastComposer(false));
                              }}
                              onTap={() => {
                                if (!draft.content.trim()) {
                                  setError('勉強した内容を入力してください。');
                                  return;
                                }
                                notify('長押しすると記録できます');
                              }}
                              icon={saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={16} strokeWidth={2.4} />}
                              doneIcon={<Check size={16} strokeWidth={2.6} />}
                              doneLabel={draft.id ? '保存しました' : '記録しました'}
                              className="font-bold text-sm tracking-wide shadow-subtle hover:shadow-card cursor-pointer"
                            >
                              {saving ? '保存中…' : draft.id ? '長押しで保存' : '長押しで記録'}
                            </HoldButton>
                          </div>
                        </div>

                        {/* 保存前ポイント予告（コンパクトなアイコン表示） */}
                        {pointPreview && (
                          <div className="mt-3 px-3.5 py-2 rounded-xl bg-primary-soft/80 border border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs font-numbers">
                            <div className="flex items-center gap-3 text-muted font-semibold">
                              <span className="inline-flex items-center gap-1 text-ink">
                                <Clock size={13} className="text-primary" />
                                {pointPreview.timePoints}pt
                              </span>
                              {pointPreview.streakBonus > 0 && (
                                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-bold">
                                  <Trophy size={13} className="text-amber-700 dark:text-amber-400" />
                                  +{pointPreview.streakBonus}pt
                                </span>
                              )}
                            </div>
                            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-primary-ink">
                              <Sparkles size={13} />
                              +{pointPreview.totalPoints} pt
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 2. タイムラインタブ */}
      {activeTab === 'timeline' && (
        <TimelineView
          entries={entries}
          token={token}
          role={role}
          today={today}
          onSelectDate={handleTimelineSelectDate}
          onRequestAllData={loadAllData}
          hasLoadedAll={hasLoadedAll}
          loadingAll={loadingAll}
          onOpenPreview={(src, label) => setPreviewImage({ src, label })}
        />
      )}

      {/* 3. レース（ランキング）タブ */}
      {activeTab === 'ranking' && (
        <RankingView
          token={token}
          role={role}
          currentStudentId={selectedStudentId}
          refreshKey={profileRefreshKey}
          onOpenProfile={role === '生徒' ? () => setProfileModalOpen(true) : undefined}
        />
      )}

      {/* 4. 統計タブ */}
      {activeTab === 'stats' && (
        <StatsView
          entries={entries}
          today={today}
          onRequestAllData={loadAllData}
          hasLoadedAll={hasLoadedAll}
          loadingAll={loadingAll}
        />
      )}

      {/* 先生用: 生徒管理モーダル */}
      {studentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setStudentModalOpen(false)}
        >
          <div
            className="relative w-full max-w-xl rounded-3xl bg-white dark:bg-[#131417] border border-line p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setStudentModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users size={18} className="text-primary" />
                <h3 className="text-lg font-bold text-ink">担当生徒の管理</h3>
              </div>
              <p className="text-xs text-muted">
                先生1人につき最大5人までの生徒アカウントを管理できます（現在: {students.length}/5人）。
              </p>
            </div>

            {/* 生徒一覧 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted">登録中の生徒</h4>
              {students.map((student) => {
                const isEditing = editingStudentId === student.id;

                if (isEditing) {
                  return (
                    <form
                      key={student.id}
                      onSubmit={handleUpdateStudent}
                      className="p-4 rounded-2xl border-2 border-primary/40 bg-card shadow-sm space-y-3.5 animate-in fade-in duration-200"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-line/60">
                        <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <PencilLine size={14} />
                          生徒情報の編集
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingStudentId(null)}
                          className="p-1 rounded-lg text-muted hover:text-ink hover:bg-card-subtle cursor-pointer"
                          aria-label="編集をやめる"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">管理用の名前</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">レース表示名（任意）</label>
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          ログインパスワード / PIN（変更する場合のみ入力）
                        </label>
                        <input
                          type="text"
                          placeholder="例: 1234（空欄なら変更なし）"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">テーマカラー</label>
                        <div className="flex gap-2">
                          {DEFAULT_STUDENT_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              style={{ backgroundColor: c }}
                              className={`size-6 rounded-lg transition-transform cursor-pointer ${editColor === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'}`}
                              aria-label={`色 ${c}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted mb-1.5">アイコン画像</label>
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-card border border-line/70">
                          <StudentAvatar
                            avatarUrl={editAvatarUrl}
                            icon={editIcon}
                            color={editColor}
                            name={editDisplayName || editName}
                            size="md"
                            shape="circle"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-card-subtle hover:bg-card border border-line hover:border-primary/40 text-ink cursor-pointer transition-all">
                              {uploadingTeacherAvatar ? (
                                <LoaderCircle size={13} className="animate-spin text-primary" />
                              ) : (
                                <Camera size={13} className="text-primary" />
                              )}
                              <span>{uploadingTeacherAvatar ? 'アップロード中…' : editAvatarUrl ? '画像を変更' : '画像をアップロード'}</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                disabled={uploadingTeacherAvatar}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleTeacherAvatarUpload(f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {editAvatarUrl && (
                              <button
                                type="button"
                                onClick={() => setEditAvatarUrl('')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border border-line text-muted hover:text-danger hover:border-danger/40 cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>画像を消す</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">プリセットアイコン</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {DEFAULT_STUDENT_ICONS.map((ic) => (
                            <button
                              key={ic.key}
                              type="button"
                              onClick={() => {
                                setEditIcon(ic.key);
                                setEditAvatarUrl('');
                              }}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                !editAvatarUrl && editIcon === ic.key
                                  ? 'bg-primary/10 border-primary text-primary shadow-xs'
                                  : 'bg-card border-line text-muted hover:text-ink'
                              }`}
                            >
                              {renderStudentIcon(ic.key, 13)}
                              <span>{ic.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1 border-t border-line/60">
                        <button
                          type="button"
                          onClick={() => setEditingStudentId(null)}
                          disabled={updatingStudent}
                          className="px-3 py-1.5 text-xs rounded-xl border border-line text-muted hover:text-ink cursor-pointer"
                        >
                          キャンセル
                        </button>
                        <button
                          type="submit"
                          disabled={updatingStudent || !editName.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
                        >
                          <Check size={14} />
                          <span>{updatingStudent ? '保存中…' : '変更を保存'}</span>
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div
                    key={student.id}
                    className="p-3.5 rounded-2xl border border-line/70 bg-card-subtle/50 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <StudentAvatar
                        avatarUrl={student.avatarUrl}
                        icon={student.icon}
                        color={student.color}
                        name={student.displayName || student.name}
                        size="sm"
                        shape="circle"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-ink">{student.name}</span>
                          <span className="text-xs text-muted">（表示名: {student.displayName}）</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted font-mono">ID: {student.id}</span>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted text-[11px]">PIN:</span>
                            <span className="font-mono font-bold text-ink">
                              {showPlainPasswordMap[student.id] ? (student.passwordPlain || '1234') : '••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setShowPlainPasswordMap((prev) => ({
                                  ...prev,
                                  [student.id]: !prev[student.id],
                                }))
                              }
                              className="text-[11px] text-primary hover:underline cursor-pointer"
                            >
                              {showPlainPasswordMap[student.id] ? '隠す' : '表示'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditStudent(student)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-card border border-line hover:border-primary/40 text-ink hover:text-primary shadow-subtle transition-all cursor-pointer"
                        title="名前や表示名、色を変更"
                      >
                        <PencilLine size={13} className="text-primary" />
                        <span>名前変更</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyStudentUrl(student.token, student.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-card border border-line hover:border-primary/40 text-ink shadow-subtle transition-all cursor-pointer"
                        title="生徒専用のログインURLをコピー"
                      >
                        {copiedStudentId === student.id ? (
                          <>
                            <Check size={14} className="text-emerald-500" />
                            <span>URLコピー完了!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} className="text-muted" />
                            <span>URLコピー</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 新規生徒の追加（上限5人未満時） */}
            {students.length < 5 ? (
              <form onSubmit={handleCreateStudent} className="pt-3 border-t border-line space-y-4">
                <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <UserPlus size={15} className="text-primary" />
                  <span>新しい生徒を追加</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">管理用の名前</label>
                    <input
                      type="text"
                      placeholder="例: 山田 太郎"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">レース表示名（任意）</label>
                    <input
                      type="text"
                      placeholder="例: たろう"
                      value={newStudentDisplayName}
                      onChange={(e) => setNewStudentDisplayName(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    ログインパスワード / PIN（数字4桁など）
                  </label>
                  <input
                    type="text"
                    placeholder="例: 1234（空欄時は1234に設定）"
                    value={newStudentPassword}
                    onChange={(e) => setNewStudentPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-line bg-card text-ink focus:outline-none focus:border-primary font-mono"
                  />
                  <p className="text-[11px] text-muted mt-1">
                    生徒が名前と一緒にログインするために入力する合言葉です（初期値: 1234）
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">テーマカラー</label>
                  <div className="flex gap-2">
                    {DEFAULT_STUDENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewStudentColor(c)}
                        style={{ backgroundColor: c }}
                        className={`size-7 rounded-xl transition-transform ${newStudentColor === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'}`}
                        aria-label={`色 ${c}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">アイコン</label>
                  <div className="flex gap-2">
                    {DEFAULT_STUDENT_ICONS.map((ic) => (
                      <button
                        key={ic.key}
                        type="button"
                        onClick={() => setNewStudentIcon(ic.key)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                          newStudentIcon === ic.key
                            ? 'bg-primary/10 border-primary text-primary shadow-xs'
                            : 'bg-card border-line text-muted hover:text-ink'
                        }`}
                      >
                        {renderStudentIcon(ic.key, 14)}
                        <span>{ic.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {studentModalError && (
                  <p className="text-xs text-danger">{studentModalError}</p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingStudent || !newStudentName.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle disabled:opacity-50"
                  >
                    <UserPlus size={14} />
                    <span>{creatingStudent ? '作成中…' : '生徒を追加する'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-muted text-center py-2 bg-card-subtle/50 rounded-xl">
                生徒数の上限（5人）に達しています。
              </p>
            )}
          </div>
        </div>
      )}

      {/* 生徒用: プロフィール・アイコン設定モーダル */}
      {profileModalOpen && currentStudent && (
        <ProfileModal
          student={currentStudent}
          token={token}
          onClose={() => setProfileModalOpen(false)}
          onUpdated={(updated) => {
            setStudents((prev) =>
              prev.map((s) => (s.id === currentStudent.id ? { ...s, ...updated } : s))
            );
            setProfileRefreshKey((k) => k + 1);
            notify('アイコン・プロフィールを更新しました');
          }}
        />
      )}

      {/* 写真プレビューモーダル */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-line p-2 shadow-2xl overflow-hidden flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-ink/60 text-white hover:bg-ink transition-colors"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.label}
              className="max-h-[75vh] w-auto object-contain rounded-xl"
            />
            <p className="text-xs text-muted mt-2 font-medium">{previewImage.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
