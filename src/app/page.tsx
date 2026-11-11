'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Award,
  BadgeCheck,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  ImagePlus,
  MessageCircle,
  Moon,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { ui } from './ui';

type StudySession = { id: string; content: string; minutes?: number; evidencePath?: string; createdAt?: string; updatedAt?: string };
type Review = { stamp?: string; comment?: string; reviewedAt?: string };
type DayEntry = { date: string; sessions: StudySession[]; review?: Review };
type Draft = { id: string; content: string; minutes: string };

const stamps = ['よくできました', 'ていねいです', '確認しました'];
const QUICK_MINUTES = [15, 30, 45, 60];

const emptySubscribe = () => () => {};
const getThemeSnapshot = () => {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
};
const subscribeTheme = (callback: () => void) => {
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
      className={`stamp-seal inline-grid place-items-center rounded-full bg-reward text-white shadow-[0_1.5px_4px_rgba(200,64,43,0.35)] transition-transform ${className}`}
      aria-label="勉強完了シール"
    >
      <Check size={Math.round(size * 0.62)} strokeWidth={3} className="stroke-white" />
    </span>
  );
}

/**
 * スタンプ名に応じた Lucide アイコン
 */
function getStampIcon(stampName?: string, size = 16) {
  if (stampName === 'よくできました') {
    return <BadgeCheck size={size} strokeWidth={2.4} className="text-reward fill-reward/20" />;
  }
  if (stampName === 'ていねいです') {
    return <Sparkles size={size} strokeWidth={2.2} className="text-[#D97706]" />;
  }
  return <CheckCheck size={size} strokeWidth={2.2} className="text-primary" />;
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
  const role = initialRole;
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

  // 表示中の月（YYYY-MM）
  const [selectedMonth, setSelectedMonth] = useState('');
  const currentMonth = selectedMonth || (today ? today.slice(0, 7) : '');

  // 選択中の日付（YYYY-MM-DD）
  const [selectedDate, setSelectedDate] = useState('');
  const day = selectedDate || today || '';

  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [loadedMonths, setLoadedMonths] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { stamp: string; comment: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [token] = useState(accessToken);
  const [showPastComposer, setShowPastComposer] = useState(false);

  const dataReady = Boolean(loadedMonths[currentMonth]);
  const loading = Boolean(token && currentMonth && !dataReady && !error);
  const entry = entries[day] || blankEntry(day);
  const sessions = entry.sessions || [];
  const draft = drafts[day] || { id: '', content: '', minutes: '' };
  const savedReview = entry.review || {};
  const reviewDraft = reviewDrafts[day] || { stamp: savedReview.stamp || stamps[0], comment: savedReview.comment || '' };

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

  // やる気応援メッセージ
  const motivationGoal = 16; // 月16日の習慣目安
  const progressPercent = Math.min(100, Math.round((monthRecordedDays / motivationGoal) * 100));

  // カレンダーのマス目を生成（月曜始まり）
  const calendarCells = useMemo(() => {
    if (!currentMonth) return [];
    const [yearStr, monthStr] = currentMonth.split('-');
    const year = Number(yearStr);
    const m = Number(monthStr);
    const daysInMonth = new Date(year, m, 0).getDate();
    const firstDayWeekday = new Date(`${currentMonth}-01T12:00:00+09:00`).getDay();
    // 月曜始まり: 月=0, 火=1, 水=2, 木=3, 金=4, 土=5, 日=6
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

    // 翌月の余白（7列グリッドを完成させる）
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

  const hasUnsavedChanges = Object.entries(drafts).some(([date, item]) => {
    if (!item.id) return Boolean(item.content.trim() || item.minutes.trim());
    const saved = entries[date]?.sessions.find((session) => session.id === item.id);
    return Boolean(saved && (item.content !== saved.content || item.minutes !== (saved.minutes?.toString() || '')));
  }) || Object.entries(reviewDrafts).some(([date, item]) => {
    const saved = entries[date]?.review || {};
    return item.stamp !== (saved.stamp || stamps[0]) || item.comment !== (saved.comment || '');
  });

  // 月データのフェッチ
  useEffect(() => {
    if (!token || !currentMonth) return;
    if (loadedMonths[currentMonth]) return;
    const controller = new AbortController();
    fetch(`/api/entries?month=${encodeURIComponent(currentMonth)}`, {
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
  }, [token, currentMonth, loadedMonths]);

  useEffect(() => {
    if (!hasUnsavedChanges && !saving && !uploading) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [hasUnsavedChanges, saving, uploading]);

  function changeMonth(offset: number) {
    if (!currentMonth) return;
    const [yearStr, monthStr] = currentMonth.split('-');
    const date = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(nextMonth);
    if (today && today.startsWith(nextMonth)) {
      setSelectedDate(today);
    } else {
      setSelectedDate(`${nextMonth}-01`);
    }
    setShowPastComposer(false);
    setError('');
  }

  function goToToday() {
    if (!today) return;
    setSelectedMonth(today.slice(0, 7));
    setSelectedDate(today);
    setShowPastComposer(false);
    setError('');
  }

  function updateDay(date: string, patch: Partial<DayEntry>) {
    setEntries((current) => ({ ...current, [date]: { ...blankEntry(date), ...current[date], ...patch } }));
  }
  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [day]: { ...(current[day] || { id: '', content: '', minutes: '' }), ...patch } }));
  }
  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 2400); }
  async function put(payload: Record<string, unknown>) {
    return fetch('/api/entries', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-app-token': token }, body: JSON.stringify(payload) }).catch(() => null);
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
    if (!window.confirm('この勉強記録を削除しますか？')) return;
    setSaving(true); setError('');
    const response = await put({ action: 'session-delete', date: day, sessionId: session.id });
    if (!response?.ok) { setError('記録を削除できませんでした。通信状況を確認してください。'); setSaving(false); return; }
    updateDay(day, { sessions: sessions.filter((item) => item.id !== session.id) });
    setDrafts((current) => {
      if (current[day]?.id !== session.id) return current;
      const next = { ...current }; delete next[day]; return next;
    });
    setSaving(false); notify('記録を削除しました');
  }
  async function uploadEvidence(session: StudySession, file: File) {
    if (role !== '生徒' || !token || !canAddPhoto) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('JPEG、PNG、WebP形式で5MB以下の写真を選んでください。'); return; }
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    setUploading(session.id); setUploadPercent(0); setError('');
    try {
      const blob = await upload(`evidence/${day}/${session.id}/${crypto.randomUUID()}.${extension}`, file, {
        access: 'private', handleUploadUrl: '/api/evidence/upload', clientPayload: JSON.stringify({ date: day, sessionId: session.id }), headers: { 'x-app-token': token },
        onUploadProgress: ({ percentage }) => setUploadPercent(Math.round(percentage)),
      });
      const response = await put({ action: 'session-photo', date: day, sessionId: session.id, evidencePath: blob.pathname });
      if (!response?.ok) throw new Error('Save failed');
      setEntries((current) => {
        const currentDay = current[day] || blankEntry(day);
        return { ...current, [day]: { ...currentDay, sessions: currentDay.sessions.map((item) => item.id === session.id ? { ...item, evidencePath: blob.pathname } : item) } };
      });
      notify('写真を保存しました');
    } catch {
      setError('写真を保存できませんでした。記録は残っています。通信状況を確認して、もう一度お試しください。');
    } finally { setUploading(''); setUploadPercent(0); }
  }
  async function saveReview() {
    if (!dataReady || !sessions.length) return;
    setSaving(true); setError('');
    const response = await put({ action: 'review', date: day, ...reviewDraft });
    if (!response?.ok) { setError('フィードバックを保存できませんでした。通信状況を確認してください。'); setSaving(false); return; }
    const nextReview = { ...reviewDraft, reviewedAt: new Date().toISOString() };
    updateDay(day, { review: nextReview });
    setReviewDrafts((current) => ({ ...current, [day]: { stamp: nextReview.stamp || stamps[0], comment: nextReview.comment || '' } }));
    setSaving(false); notify('生徒へのフィードバックを保存しました');
  }

  return (
    <main className={`shell ${ui.shell} bg-canvas text-ink`}>
      <header className={ui.header}>
        <div className={ui.brand}>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary font-bold text-sm">
              記
            </span>
            <p>宿題ノート／{role}用</p>
          </div>
          <button
            type="button"
            className={ui.themeToggle}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
        {today && (day !== today || currentMonth !== today.slice(0, 7)) && (
          <button
            type="button"
            className={ui.todayBadgeBtn}
            onClick={goToToday}
            title="今日の日付に戻る"
          >
            <RotateCcw size={13} />
            今日へ戻る
          </button>
        )}
      </header>

      {/* サマリー＆モチベーション */}
      <section className={role === '先生' ? ui.teacherIntro : `${ui.intro} ${ui.introCompact}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Study Calendar</span>
        </div>
        <h1 className={ui.pageTitle}>学習の記録</h1>
        
        <div className={ui.weekSummary} aria-label="今月の学習まとめ">
          <span>
            <strong className="text-primary">{dataReady ? `${monthRecordedDays}日` : '—'}</strong>
            <small>{monthLabel(currentMonth)}の勉強日数</small>
          </span>
          <span>
            <strong className="text-reward flex items-center justify-center gap-1.5">
              <BadgeCheck size={24} strokeWidth={2.2} className="fill-reward/20 text-reward" />
              {dataReady ? monthReviewedCount : '—'}
              <span className="text-sm font-normal text-muted">個</span>
            </strong>
            <small>先生の確認済み</small>
          </span>
          <span>
            <strong className="text-ink">{dataReady && monthTotalMinutes > 0 ? `${monthTotalMinutes}分` : '—'}</strong>
            <small>学習時間（合計）</small>
          </span>
        </div>
      </section>

      {/* 生徒向けモチベーションバー */}
      {role === '生徒' && dataReady && (
        <div className={ui.motivationCard}>
          <div className={ui.motivationHeading}>
            <span className="flex items-center gap-1.5 text-ink">
              <Flame size={15} className="text-reward" />
              <span>今月のがんばりペース</span>
            </span>
            <span className="font-numbers text-xs text-muted">
              <strong>{monthRecordedDays}</strong> / {motivationGoal}日 目標
            </span>
          </div>
          <div className={ui.motivationProgress}>
            <div
              className={ui.motivationBar}
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={monthRecordedDays}
              aria-valuemin={0}
              aria-valuemax={motivationGoal}
            />
          </div>
          <p className="mt-2 text-xs text-muted m-0">
            {monthRecordedDays >= motivationGoal ? (
              <span className="font-bold text-reward flex items-center gap-1">
                <Sparkles size={13} /> 今月の目標達成！素晴らしい継続力です！
              </span>
            ) : monthRecordedDays > 0 ? (
              `あと${motivationGoal - monthRecordedDays}日で今月の目標達成！シールを集めよう。`
            ) : (
              'まずは1日、小さな勉強からシールを貼っていきましょう。'
            )}
          </p>
        </div>
      )}

      {/* カレンダーカード（公開レベルの質感） */}
      <section className={ui.calendarCard} aria-label="月間カレンダー">
        {/* 月切り替えヘッダー */}
        <div className={ui.monthPicker}>
          <button
            type="button"
            className={ui.monthNavBtn}
            onClick={() => changeMonth(-1)}
            aria-label="前の月"
            title="前の月へ"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className={ui.monthTitle}>
            <Calendar size={18} className="text-primary" />
            <span>{monthLabel(currentMonth)}</span>
          </div>

          <button
            type="button"
            className={ui.monthNavBtn}
            onClick={() => changeMonth(1)}
            aria-label="次の月"
            title="次の月へ"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* 曜日ヘッダー */}
        <div className={ui.calendarWeekdays} aria-hidden="true">
          <span>月</span>
          <span>火</span>
          <span>水</span>
          <span>木</span>
          <span>金</span>
          <span className="text-[#2E5C8A] dark:text-[#8FA8D8]">土</span>
          <span className="text-reward">日</span>
        </div>

        {/* 日付グリッド */}
        <div className={ui.calendarGrid} role="grid" aria-label={`${monthLabel(currentMonth)}のカレンダー`}>
          {calendarCells.map((cell) => {
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

            return (
              <button
                key={cell.date}
                type="button"
                disabled={!cell.isCurrentMonth}
                className={`${ui.calendarCell} ${!cell.isCurrentMonth ? ui.calendarCellOtherMonth : ''} ${isSelected ? ui.calendarCellSelected : ''} ${isToday && !isSelected ? ui.calendarCellToday : ''} ${isFuture ? ui.calendarCellFuture : ''} ${hasRecord && !isSelected ? 'bg-reward-soft/35 border-reward/20' : ''}`}
                onClick={() => {
                  setSelectedDate(cell.date);
                  setShowPastComposer(false);
                }}
                aria-selected={isSelected}
                aria-label={`${formatDate(cell.date)}${hasRecord ? `、記録${sessionCount}件` : ''}${isReviewed ? '、先生の確認あり' : ''}`}
              >
                {/* 日付の数字 */}
                <span className={`${ui.calendarDayNum} ${isSat && !isSelected ? 'text-[#2E5C8A] dark:text-[#8FA8D8]' : ''} ${isSun && !isSelected ? 'text-reward' : ''}`}>
                  {cell.dayNumber}
                </span>

                {/* 記録マークエリア（Lucide Icons） */}
                <div className={ui.calendarMarkerArea}>
                  {isReviewed ? (
                    <TeacherCheckIcon size={22} className={isSelected ? '!text-white [&_svg]:!fill-white/30 [&_svg]:!stroke-white' : ''} />
                  ) : hasRecord ? (
                    <RecordSeal size={18} className={isSelected ? '!bg-white !text-primary' : ''} />
                  ) : isToday ? (
                    <span className="today-dot size-1.5 rounded-full bg-primary" title="今日" />
                  ) : null}

                  {/* 分数表示 */}
                  {hasRecord && cellMins > 0 && !isSelected && (
                    <span className="text-[10px] tabular-nums text-muted font-bold leading-tight mt-0.5">
                      {cellMins}分
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 凡例（Lucide アイコンのピル型バッジ） */}
        <div className={ui.calendarLegend}>
          <div className={ui.legendPill}>
            <TeacherCheckIcon size={16} />
            <span>先生の確認済み</span>
          </div>
          <div className={ui.legendPill}>
            <RecordSeal size={15} />
            <span>勉強した日</span>
          </div>
          <div className={ui.legendPill}>
            <span className="size-2 rounded-full bg-primary inline-block" />
            <span>今日</span>
          </div>
        </div>
      </section>

      {/* 選択した日の勉強記録 */}
      {role === '生徒' ? (
        <>
          {/* 過去日ですでに記録がある場合: 記録を一番上に表示 */}
          {day !== today && sessions.length > 0 ? (
            <section className={ui.panel}>
              <div className={ui.panelHeading}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-reward bg-reward-soft px-2 py-0.5 rounded-full">
                      <Award size={12} />記録済み
                    </span>
                  </div>
                  <h2>{day ? formatDate(day) : ''}の勉強</h2>
                </div>
                <span className={ui.count}>{sessions.length}件{dayMinutes > 0 ? `・計${dayMinutes}分` : ''}</span>
              </div>

              {/* 先生のフィードバック */}
              {entry.review?.reviewedAt && (
                <div className={`${ui.reviewReceived} mt-0 mb-4 border border-reward/25`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-extrabold flex items-center gap-1.5 text-sm text-reward-ink">
                      <MessageCircle size={16} />先生からのフィードバック
                    </span>
                    <span className="text-xs text-muted">
                      {entry.review.reviewedAt ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.review.reviewedAt)) : ''}
                    </span>
                  </div>
                  <div className="my-2 flex items-center gap-3">
                    <TeacherCheckIcon size={28} />
                    <span className={entry.review.stamp === 'よくできました' ? "hanko-badge hanko-flower" : "hanko-badge"}>
                      <span className="inline-flex items-center mr-1">{getStampIcon(entry.review.stamp, 18)}</span>
                      {entry.review.stamp}
                    </span>
                  </div>
                  {entry.review.comment && <p className="mt-2 leading-relaxed text-sm text-ink">{entry.review.comment}</p>}
                </div>
              )}

              {/* セッション一覧 */}
              <div className={ui.sessionList}>
                {sessions.map((session, index) => (
                  <article className={ui.session} key={session.id}>
                    <div className={ui.sessionNumber} aria-hidden="true">{index + 1}</div>
                    <div className={ui.sessionBody}>
                      <p>{session.content}</p>
                      {session.minutes && <span className={ui.sessionMeta}>{session.minutes}分</span>}
                      {session.evidencePath && (
                        <EvidencePreview
                          key={session.evidencePath}
                          pathname={session.evidencePath}
                          token={token}
                          label={session.content}
                          onOpenPreview={(src, label) => setPreviewImage({ src, label })}
                        />
                      )}
                      <div className={ui.sessionActions}>
                        <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => { setShowPastComposer(true); startEdit(session); }}><PencilLine size={16} />編集</button>
                        <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => void deleteSession(session)}><Trash2 size={14} />削除</button>
                        {canAddPhoto && (
                          <label className={ui.uploadButton}>
                            <ImagePlus size={16} />{uploading === session.id ? `送信中 ${uploadPercent}%` : session.evidencePath ? '写真を変更' : '写真を追加'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!dataReady || Boolean(uploading) || saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(session, file); event.target.value = ''; }} />
                          </label>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* 追加で記録するアコーディオン */}
              {canLog && (
                <div className="mt-6 pt-4 border-t border-line">
                  {!showPastComposer && !draft.content.trim() && !draft.id ? (
                    <button
                      type="button"
                      className={ui.addSessionToggle}
                      onClick={() => setShowPastComposer(true)}
                    >
                      <Plus size={16} />
                      この日に追加で勉強を記録する
                    </button>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-ink">追加で記録する</span>
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-ink cursor-pointer bg-transparent border-0"
                          onClick={() => {
                            setShowPastComposer(false);
                            if (!draft.id) setDrafts((current) => { const next = { ...current }; delete next[day]; return next; });
                          }}
                        >
                          閉じる
                        </button>
                      </div>
                      <div className={ui.composer}>
                        <label className={ui.fieldLabel} htmlFor="study-content">勉強した内容</label>
                        <textarea id="study-content" className={ui.textArea} rows={3} maxLength={1000} value={draft.content} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ content: event.target.value })} placeholder="例：算数の問題集を5ページ進めた" />
                        <div className={ui.composerFooter}>
                          <div className="flex flex-col gap-1">
                            <label className={ui.minutesField}>学習時間（任意）<span><input className={ui.minutesInput} type="number" min="1" max="1440" inputMode="numeric" value={draft.minutes} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ minutes: event.target.value })} aria-label="学習時間（分）" placeholder="30" />分</span></label>
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
                            {draft.id && <button type="button" className={ui.secondaryButton} disabled={saving || Boolean(uploading)} onClick={() => { setDrafts((current) => { const next = { ...current }; delete next[day]; return next; }); setShowPastComposer(false); }}><X size={16} />編集をやめる</button>}
                            <button type="button" className={ui.primaryButton} disabled={!dataReady || saving || Boolean(uploading) || !draft.content.trim()} onClick={() => void saveSession().then(() => setShowPastComposer(false))}><Check size={16} />{saving ? '保存中…' : draft.id ? '変更を保存' : '記録する'}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            /* 今日の日付、またはまだ記録がない過去日の場合 */
            <section className={ui.panel}>
              <div className={ui.panelHeading}>
                <div><h2>{day === today ? '今日の勉強' : `${day ? formatDate(day) : ''}の勉強`}</h2><p>勉強したことを、ひとつずつ残しておきましょう。</p></div>
                {sessions.length > 0 && <span className={ui.count}>{sessions.length}件{dayMinutes > 0 ? `・${dayMinutes}分` : ''}</span>}
              </div>
              {day && day > today && <p className={ui.empty}>未来の日付には記録できません。勉強したあとに記録しましょう。</p>}
              {canLog && (
                <div className={ui.composer}>
                  <label className={ui.fieldLabel} htmlFor="study-content">勉強した内容</label>
                  <textarea id="study-content" className={ui.textArea} rows={3} maxLength={1000} value={draft.content} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ content: event.target.value })} placeholder="例：算数の問題集を5ページ進めた" />
                  <div className={ui.composerFooter}>
                    <div className="flex flex-col gap-1">
                      <label className={ui.minutesField}>学習時間（任意）<span><input className={ui.minutesInput} type="number" min="1" max="1440" inputMode="numeric" value={draft.minutes} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ minutes: event.target.value })} aria-label="学習時間（分）" placeholder="30" />分</span></label>
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
                      {draft.id && <button type="button" className={ui.secondaryButton} disabled={saving || Boolean(uploading)} onClick={() => setDrafts((current) => { const next = { ...current }; delete next[day]; return next; })}><X size={16} />編集をやめる</button>}
                      <button type="button" className={ui.primaryButton} disabled={!dataReady || saving || Boolean(uploading) || !draft.content.trim()} onClick={() => void saveSession()}><Check size={16} />{saving ? '保存中…' : draft.id ? '変更を保存' : '記録する'}</button>
                    </div>
                  </div>
                  {day !== today && <p className={ui.quiet}>過去の日付の記録も追加できます。</p>}
                </div>
              )}

              {sessions.length > 0 ? (
                <div className={ui.sessionList}>
                  {sessions.map((session, index) => (
                    <article className={ui.session} key={session.id}>
                      <div className={ui.sessionNumber} aria-hidden="true">{index + 1}</div>
                      <div className={ui.sessionBody}>
                        <p>{session.content}</p>
                        {session.minutes && <span className={ui.sessionMeta}>{session.minutes}分</span>}
                        {session.evidencePath && <EvidencePreview key={session.evidencePath} pathname={session.evidencePath} token={token} label={session.content} onOpenPreview={(src, label) => setPreviewImage({ src, label })} />}
                        <div className={ui.sessionActions}>
                          <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => startEdit(session)}><PencilLine size={16} />編集</button>
                          <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => void deleteSession(session)}><Trash2 size={14} />削除</button>
                          {canAddPhoto && <label className={ui.uploadButton}><ImagePlus size={16} />{uploading === session.id ? `送信中 ${uploadPercent}%` : session.evidencePath ? '写真を変更' : '写真を追加'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!dataReady || Boolean(uploading) || saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(session, file); event.target.value = ''; }} /></label>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : dataReady && canLog ? (
                <p className={ui.empty}>まだ記録はありません。勉強したことをひとつ書いてみましょう。</p>
              ) : null}
              {sessions.length > 0 && <p className={ui.encouragement}>記録できました。この日の一歩を残せました。</p>}
            </section>
          )}

          {day && entry.review?.reviewedAt && day === today && (
            <section className={ui.reviewReceived}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-extrabold flex items-center gap-1.5 text-sm text-reward-ink">
                  <MessageCircle size={16} />先生からのフィードバック
                </span>
              </div>
              <div className="my-2 flex items-center gap-3">
                <TeacherCheckIcon size={28} />
                <span className={entry.review.stamp === 'よくできました' ? "hanko-badge hanko-flower" : "hanko-badge"}>
                  <span className="inline-flex items-center mr-1">{getStampIcon(entry.review.stamp, 18)}</span>
                  {entry.review.stamp}
                </span>
              </div>
              {entry.review.comment && <p className="mt-3 leading-relaxed">{entry.review.comment}</p>}
            </section>
          )}
        </>
      ) : (
        /* 先生画面 */
        <>
          <section className={ui.panel}>
            <div className={`${ui.panelHeading} teacher-record-heading`}>
              <div><h2>{day ? formatDate(day) : ''}</h2></div>
              {sessions.length > 0 && <span className={ui.count}>{sessions.length}件{dayMinutes > 0 ? `・${dayMinutes}分` : ''}</span>}
            </div>
            {sessions.length === 0 ? (
              <p className={ui.empty}>{day > today ? '未来の日付です。' : 'この日の学習記録はありません。'}</p>
            ) : (
              <div className={ui.sessionList}>
                {sessions.map((session) => (
                  <article className={`${ui.session} teacher-session`} key={session.id}>
                    <Check className="session-check" size={19} aria-label="記録あり" />
                    <div className={ui.sessionBody}>
                      <p>{session.content}</p>
                      {session.evidencePath && <EvidencePreview key={session.evidencePath} pathname={session.evidencePath} token={token} label={session.content} onOpenPreview={(src, label) => setPreviewImage({ src, label })} />}
                    </div>
                    {session.minutes && <span className="session-minutes">{session.minutes}分</span>}
                  </article>
                ))}
              </div>
            )}
          </section>
          {sessions.length > 0 && (
            <section className={ui.panel}>
              <div className={ui.panelHeading}>
                <div><h2>ひとこと返信</h2><p>取り組みを見た感想を返しましょう。</p></div>
                {savedReview.reviewedAt && <span className={ui.statusPill}>返信済み</span>}
              </div>
              <div className={ui.stamps} role="group" aria-label="励ましのスタンプ">
                {stamps.map((stamp) => {
                  const isGreat = stamp === 'よくできました';
                  const isPressed = reviewDraft.stamp === stamp;
                  const extraClass = isGreat
                    ? (isPressed ? '!border-reward !bg-reward !text-white' : '!border-reward !bg-reward-soft !text-reward-ink')
                    : (isPressed ? '!border-primary !bg-primary !text-white' : '');
                  const stampClass = stamp === 'よくできました' ? 'stamp-great' : stamp === 'ていねいです' ? 'stamp-neat' : 'stamp-checked';
                  return (
                    <button
                      type="button"
                      key={stamp}
                      className={`${stampClass} ${extraClass}`}
                      aria-pressed={isPressed}
                      disabled={!dataReady || saving}
                      onClick={() => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, stamp } }))}
                    >
                      <span className="mr-1.5 inline-flex items-center">
                        {getStampIcon(stamp, 18)}
                      </span>
                      {stamp}
                    </button>
                  );
                })}
              </div>
              <label className={ui.fieldLabel} htmlFor="teacher-comment">一言コメント</label>
              <textarea id="teacher-comment" className={ui.commentBox} rows={3} maxLength={120} value={reviewDraft.comment} disabled={!dataReady || saving} onChange={(event) => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, comment: event.target.value } }))} placeholder="がんばったところを伝えましょう" />
              <small className={ui.characterCount}>{reviewDraft.comment.length}/120文字</small>
              <button type="button" className={ui.primaryButton} disabled={!dataReady || saving} onClick={() => void saveReview()}><Check size={16} />{saving ? '保存中…' : '返信を保存'}</button>
            </section>
          )}
        </>
      )}

      {/* 写真拡大モーダル */}
      {previewImage && (
        <div
          className={ui.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="写真の拡大表示"
          onClick={() => setPreviewImage(null)}
        >
          <div className={ui.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={ui.modalCloseBtn}
              aria-label="閉じる"
              onClick={() => setPreviewImage(null)}
            >
              <X size={18} />
            </button>
            <img src={previewImage.src} alt={previewImage.label} className={ui.modalImage} />
            <div className="mt-2 flex w-full items-center justify-between gap-2 px-1">
              <p className={ui.modalCaption}>{previewImage.label}</p>
              <a
                href={previewImage.src}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-primary-ink underline hover:opacity-80"
              >
                元のサイズで開く
              </a>
            </div>
          </div>
        </div>
      )}

      {loading && <p className={ui.feedback} role="status">記録を読み込んでいます…</p>}
      {error && <p className={ui.error} role="alert">{error}</p>}
      {notice && <p className={ui.notice} role="status">{notice}</p>}
    </main>
  );
}
