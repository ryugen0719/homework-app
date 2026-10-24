'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { upload } from '@vercel/blob/client';
import { BarChart3, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, Image as ImageIcon, ListChecks, MessageSquare, Plus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import styles from './page.module.css';

type HomeworkTask = {
  id: string;
  text: string;
  done?: boolean;
  evidencePath?: string;
  evidenceAt?: string;
};

type Entry = {
  date: string;
  text: string;
  tasks?: HomeworkTask[];
  evidencePath?: string;
  isRestDay?: boolean;
  done?: boolean;
  doneAt?: string;
  stamp?: string;
  comment?: string;
  reviewedAt?: string;
};

function tasksForEntry(entry: Entry): HomeworkTask[] {
  if (Array.isArray(entry.tasks) && entry.tasks.length) return entry.tasks;
  if (entry.text.trim()) return [{ id: 'legacy', text: entry.text, done: Boolean(entry.done), ...(entry.evidencePath ? { evidencePath: entry.evidencePath } : {}) }];
  return [];
}

function isStudentActionDate(date: string, today: string) {
  return date === today || date === offsetDate(today, -1);
}

const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const asJstDate = (date: string) => new Date(date + 'T12:00:00+09:00');
const stamps = ['確認しました', 'よくできました', 'ていねいです'];
const isReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeToToday = (callback: () => void) => {
  window.addEventListener('focus', callback);
  document.addEventListener('visibilitychange', callback);
  return () => {
    window.removeEventListener('focus', callback);
    document.removeEventListener('visibilitychange', callback);
  };
};

function offsetDate(date: string, offset: number) {
  const value = asJstDate(date);
  value.setDate(value.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value);
}

function formatDate(date: string) {
  const value = asJstDate(date);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'narrow' }).format(value);
  return month + '月' + day + '日（' + weekday + '）';
}

function formatDateTime(instant: string) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
  const time = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(instant));
  return formatDate(date) + ' ' + time;
}

function dateDistance(start: string, end: string) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

function streakCount(entries: Record<string, Entry>, today: string) {
  if (!today) return 0;
  let cursor = entries[today]?.done ? today : offsetDate(today, -1);
  let streak = 0;
  for (let i = 0; i < 500; i++) {
    const entry = entries[cursor];
    if (!entry || entry.isRestDay || !entry.text) {
      cursor = offsetDate(cursor, -1);
      continue;
    }
    if (!entry.done) break;
    streak++;
    cursor = offsetDate(cursor, -1);
  }
  return streak;
}

function statusFor(entry?: Entry) {
  if (!entry) return '未登録';
  if (entry.isRestDay) return 'お休み';
  if (entry.done && entry.reviewedAt) return '確認済み';
  if (entry.done) return '確認待ち';
  return '未完了';
}

function EvidencePreview({ pathname, token }: { pathname: string; token: string }) {
  const [image, setImage] = useState<{ pathname: string; source?: string; failed?: boolean }>();
  const [expanded, setExpanded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    fetch(`/api/evidence?pathname=${encodeURIComponent(pathname)}`, {
      headers: { 'x-app-token': token },
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Image unavailable');
        return response.blob();
      })
      .then((image) => {
        objectUrl = URL.createObjectURL(image);
        if (active) setImage({ pathname, source: objectUrl });
      })
      .catch(() => { if (active) setImage({ pathname, failed: true }); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pathname, token]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (expanded && dialog && !dialog.open) dialog.showModal();
    if (!expanded && dialog?.open) dialog.close();
  }, [expanded]);

  useEffect(() => {
    if (expanded) closeButtonRef.current?.focus();
  }, [expanded]);

  if (image?.pathname !== pathname) return <span className={styles.evidenceLoading}>画像を読み込んでいます</span>;
  if (image.failed) return <span className={styles.evidenceUnavailable}>画像を表示できません</span>;
  if (!image.source) return <span className={styles.evidenceLoading}>画像を読み込んでいます</span>;
  // Private images are fetched with the app token and displayed from a temporary object URL.
  return <>
    <button type="button" className={styles.evidenceThumbnailButton} aria-label="提出写真を拡大表示" onClick={() => { setZoomed(false); setExpanded(true); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.evidenceThumbnail} src={image.source} alt="提出された宿題の証拠画像" />
    </button>
    <dialog
      ref={dialogRef}
      className={styles.evidenceDialog}
      aria-label="提出写真"
      onClose={() => { setExpanded(false); setZoomed(false); }}
      onClick={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}
    >
      <div className={styles.evidenceDialogToolbar}>
        <button type="button" ref={closeButtonRef} aria-label="写真を閉じる" onClick={() => setExpanded(false)}><X size={20} /></button>
        <button type="button" aria-label={zoomed ? '写真を縮小' : '写真を拡大'} aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>{zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}</button>
        <a href={image.source} download={`homework-${pathname.split('/').pop() || 'evidence'}`} aria-label="写真をダウンロード"><Download size={20} /></a>
      </div>
      <div className={styles.evidenceDialogImageViewport}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={zoomed ? `${styles.evidenceDialogImage} ${styles.evidenceDialogImageZoomed}` : styles.evidenceDialogImage} src={image.source} alt="提出された宿題の証拠画像" />
      </div>
    </dialog>
  </>;
}

function StudentTaskRow({
  date,
  task,
  token,
  disabled,
  uploading,
  uploadProgress,
  onToggle,
  onUpload,
}: {
  date: string;
  task: HomeworkTask;
  token: string;
  disabled: boolean;
  uploading: boolean;
  uploadProgress: number;
  onToggle: (checked: boolean) => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <li className={styles.studentTaskRow}>
      <label className={styles.studentTaskCheck}>
        <input type="checkbox" checked={Boolean(task.done)} aria-label={`${date}の「${task.text}」を完了`} disabled={disabled} onChange={(event) => onToggle(event.target.checked)} />
        <span>{task.text}</span>
      </label>
      <div className={styles.taskEvidence}>
        {task.evidencePath && <EvidencePreview pathname={task.evidencePath} token={token} />}
        <button type="button" className={styles.evidenceButton} disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? `送信中 ${uploadProgress}%` : <><Camera size={16} aria-hidden="true" />{task.evidencePath ? '写真を変更' : '写真を追加'}</>}
        </button>
        <input
          ref={inputRef}
          className={styles.visuallyHidden}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`${task.text}の証拠画像を選択`}
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = '';
          }}
        />
      </div>
    </li>
  );
}

export default function Home({ initialRole = '生徒', accessToken = '' }: { initialRole?: '生徒' | '先生'; accessToken?: string }) {
  const [role] = useState<'生徒' | '先生'>(initialRole);
  const [teacherView, setTeacherView] = useState<'homework' | 'reports'>('homework');
  const today = useSyncExternalStore(subscribeToToday, todayJst, () => '');
  const [selectedDay, setSelectedDay] = useState('');
  const day = selectedDay || today;
  const [drafts, setDrafts] = useState<Record<string, Entry>>({});
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const entry = drafts[day] || entries[day] || { date: day, text: '' };
  const [token] = useState(accessToken);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [loadingError, setLoadingError] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingTask, setUploadingTask] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState('');
  const month = selectedMonth || day.slice(0, 7);
  const [monthSheet, setMonthSheet] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { stamp: string; comment: string }>>({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  const stripRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef(new Map<string, HTMLElement>());
  const scrollTimer = useRef<number | undefined>(undefined);
  const programmaticTimer = useRef<number | undefined>(undefined);
  const programmaticScroll = useRef(false);
  const pendingBehavior = useRef<ScrollBehavior>('auto');
  const monthCloseRef = useRef<HTMLButtonElement>(null);
  const monthTriggerRef = useRef<HTMLButtonElement>(null);
  const monthDialogRef = useRef<HTMLElement>(null);
  const stamp = reviewDrafts[day]?.stamp ?? entries[day]?.stamp ?? stamps[0];
  const comment = reviewDrafts[day]?.comment ?? entries[day]?.comment ?? '';

  useEffect(() => {
    if (!token || !today) return;
    const controller = new AbortController();
    fetch('/api/entries', { headers: { 'x-app-token': token }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { entries?: Record<string, Entry> };
        const loaded = data.entries || {};
        setEntries(loaded);
        if (role === '先生') {
          setSelectedDay(today);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setLoadingError(true);
        setError('データを読み込めませんでした。通信状況を確認して、再読み込みしてください。');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, role, today]);

  function setEntry(next: Entry) {
    setDrafts((current) => ({ ...current, [next.date]: next }));
  }

  function setStamp(nextStamp: string) {
    setReviewDrafts((current) => ({ ...current, [day]: { stamp: nextStamp, comment: current[day]?.comment ?? entries[day]?.comment ?? '' } }));
  }

  function setComment(nextComment: string) {
    setReviewDrafts((current) => ({ ...current, [day]: { stamp: current[day]?.stamp ?? entries[day]?.stamp ?? stamps[0], comment: nextComment } }));
  }

  const days = useMemo(() => {
    if (!today) return [];
    const entryDates = Object.values(entries)
      .map((item) => item.date)
      .filter(Boolean)
      .sort();
    const homeworkDates = Object.values(entries)
      .filter((item) => item.text.trim() && !item.isRestDay)
      .map((item) => item.date)
      .sort();
    const first = (role === '生徒' ? entryDates[0] : homeworkDates[0]) || today;
    const end = role === '先生' ? offsetDate(today, 14) : today;
    const start = first < today ? first : today;
    const lastEntryDate = entryDates[entryDates.length - 1];
    const visibleEnd = role === '生徒' && lastEntryDate && lastEntryDate > end ? lastEntryDate : end;
    return Array.from({ length: Math.max(1, dateDistance(start, visibleEnd) + 1) }, (_, index) => offsetDate(start, index));
  }, [entries, role, today]);

  const dayIndex = Math.max(0, days.indexOf(day));
  const visibleDays = days.slice(Math.max(0, dayIndex - 2), Math.min(days.length, dayIndex + 3));
  const visibleDaysKey = visibleDays.join(',');
  const savedEntry = entries[day];
  const entryReady = role !== '先生' || entry.date === day;
  const entryTasks = tasksForEntry(entry);
  const entryTaskText = entryTasks.map((task) => task.text).join('\n');
  const entryTaskReady = entryTasks.length > 0 && entryTasks.every((task) => task.text.trim()) && entryTaskText.length <= 5000;
  const entryIsDirty = role === '先生' && entryReady && (
    savedEntry
      ? JSON.stringify(tasksForEntry(savedEntry).map(({ id, text }) => ({ id, text }))) !== JSON.stringify(entryTasks.map(({ id, text }) => ({ id, text }))) || Boolean(savedEntry.isRestDay) !== Boolean(entry.isRestDay)
      : Boolean(entryTasks.length || entry.isRestDay)
  );

  const completed = Object.values(entries).filter((item) => item.done && !item.isRestDay);
  const assignedHomeworkCount = Object.values(entries).reduce((count, item) => count + (item.isRestDay ? 0 : tasksForEntry(item).length), 0);
  const streak = streakCount(entries, today);
  const completedThisMonth = completed.filter((item) => item.date.startsWith(today.slice(0, 7))).length;
  const pendingReviews = Object.values(entries)
    .filter((item) => item.done && !item.isRestDay && !item.reviewedAt)
    .sort((a, b) => a.date.localeCompare(b.date));
  const unreviewed = pendingReviews.length;

  const navigateTo = useCallback((date: string, behavior: ScrollBehavior = 'smooth') => {
    if (!days.includes(date)) return;
    pendingBehavior.current = isReducedMotion() ? 'auto' : behavior;
    programmaticScroll.current = true;
    if (programmaticTimer.current) window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(() => { programmaticScroll.current = false; }, 450);
    setSelectedDay(date);
    if (date === day) {
      const card = slideRefs.current.get(date);
      const carousel = carouselRef.current;
      if (card && carousel) carousel.scrollTo({
        left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2,
        behavior: pendingBehavior.current,
      });
    }
  }, [day, days]);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    const card = slideRefs.current.get(day);
    if (!carousel || !card) return;
    carousel.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2,
      behavior: pendingBehavior.current,
    });
  }, [day, visibleDaysKey]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[data-date="' + day + '"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: isReducedMotion() ? 'auto' : 'smooth' });
      setUnderline({ left: active.offsetLeft, width: active.offsetWidth });
    }
  }, [day, visibleDaysKey]);

  useEffect(() => {
    const onResize = () => {
      const active = stripRef.current?.querySelector<HTMLElement>('[data-date="' + day + '"]');
      if (active) setUnderline({ left: active.offsetLeft, width: active.offsetWidth });
      const card = slideRefs.current.get(day);
      const carousel = carouselRef.current;
      if (card && carousel) carousel.scrollLeft = card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [day]);

  useEffect(() => {
    if (!monthSheet) return;
    const trigger = monthTriggerRef.current;
    monthCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMonthSheet(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = monthDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [monthSheet]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (monthSheet) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      const nextIndex = dayIndex + (event.key === 'ArrowRight' ? 1 : -1);
      if (days[nextIndex]) {
        event.preventDefault();
        navigateTo(days[nextIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dayIndex, days, monthSheet, navigateTo]);

  function handleScroll() {
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    if (programmaticScroll.current) return;
    scrollTimer.current = window.setTimeout(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;
      const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
      const nearest = visibleDays
        .map((date) => ({ date, element: slideRefs.current.get(date) }))
        .filter((item): item is { date: string; element: HTMLElement } => Boolean(item.element))
        .sort((a, b) => Math.abs(a.element.getBoundingClientRect().left + a.element.offsetWidth / 2 - center) - Math.abs(b.element.getBoundingClientRect().left + b.element.offsetWidth / 2 - center))[0];
      if (nearest && nearest.date !== day) {
        pendingBehavior.current = 'instant';
        setSelectedDay(nearest.date);
      }
    }, 100);
  }

  async function saveEntry(next: Entry) {
    const tasks = next.isRestDay ? [] : tasksForEntry(next);
    const text = tasks.map((task) => task.text).join('\n');
    if (!next.isRestDay && (!tasks.length || tasks.some((task) => !task.text.trim()) || text.length > 5000)) {
      setError('宿題を1件以上入力してください。各項目は500文字以内、合計5000文字以内です');
      return false;
    }
    const normalized = { ...next, text, tasks };
    const previous = entries[normalized.date];
    setEntries((current) => ({ ...current, [normalized.date]: normalized }));
    setError('');
    setSavedMessage('');
    setSaving(true);
    if (!token) {
      setSaving(false);
      return true;
    }
    const response = await fetch('/api/entries', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ entry: normalized }),
    }).catch(() => null);
    if (!response?.ok) {
      setEntries((current) => {
        const restored = { ...current };
        if (previous) restored[normalized.date] = previous;
        else delete restored[normalized.date];
        return restored;
      });
      setError('保存できませんでした。通信状況を確認して、もう一度お試しください');
      setSaving(false);
      return false;
    }
    setSaving(false);
    setSavedMessage(formatDate(normalized.date) + 'を保存しました');
    window.setTimeout(() => setSavedMessage(''), 2600);
    return true;
  }

  function setTeacherTasks(tasks: HomeworkTask[]) {
    setEntry({ ...entry, tasks, text: tasks.map((task) => task.text).join('\n'), isRestDay: false });
  }

  async function updateStudentTask(date: string, taskId: string, taskDone: boolean) {
    if (saving || role !== '生徒' || !isStudentActionDate(date, today)) return;
    const current = entries[date] || { date, text: '' };
    const tasks = tasksForEntry(current);
    if (!tasks.some((task) => task.id === taskId)) return;
    setSaving(true);
    setError('');
    const response = token ? await fetch('/api/entries', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ entry: { date, taskId, taskDone } }),
    }).catch(() => null) : null;
    if (token && !response?.ok) {
      setError('宿題の状態を保存できませんでした。もう一度お試しください');
      setSaving(false);
      return;
    }
    const updatedTasks = tasks.map((task) => task.id === taskId ? { ...task, done: taskDone } : task);
    const done = updatedTasks.length > 0 && updatedTasks.every((task) => task.done);
    const next: Entry = {
      ...current,
      tasks: updatedTasks,
      text: updatedTasks.map((task) => task.text).join('\n'),
      done,
      doneAt: done ? current.doneAt || new Date().toISOString() : undefined,
      ...(done ? {} : { stamp: undefined, comment: undefined, reviewedAt: undefined }),
    };
    setEntries((items) => ({ ...items, [date]: next }));
    setSaving(false);
    setSavedMessage('宿題の進み具合を保存しました');
    window.setTimeout(() => setSavedMessage(''), 2200);
    if (done) navigator.vibrate?.(12);
  }

  async function uploadStudentEvidence(date: string, task: HomeworkTask, file: File) {
    if (uploadingTask || role !== '生徒' || !isStudentActionDate(date, today)) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('JPEG、PNG、WebP形式の画像を選んでください');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('画像は5MB以下にしてください');
      return;
    }
    if (!token) {
      setError('画像を送るには、生徒用リンクから開いてください');
      return;
    }

    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const taskKey = `${date}:${task.id}`;
    setUploadingTask(taskKey);
    setUploadProgress(0);
    setError('');
    try {
      const blob = await upload(`evidence/${date}/${task.id}/${crypto.randomUUID()}.${extension}`, file, {
        access: 'private',
        handleUploadUrl: '/api/evidence/upload',
        clientPayload: JSON.stringify({ date, taskId: task.id }),
        headers: { 'x-app-token': token },
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });
      const response = await fetch('/api/entries', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-app-token': token },
        body: JSON.stringify({ entry: { date, taskId: task.id, evidencePath: blob.pathname } }),
      });
      if (!response.ok) throw new Error('Evidence could not be saved');
      setEntries((current) => {
        const base = current[date] || { date, text: '' };
        const tasks = tasksForEntry(base).map((item) => item.id === task.id
          ? { ...item, evidencePath: blob.pathname, evidenceAt: new Date().toISOString() }
          : item);
        return { ...current, [date]: { ...base, tasks, text: tasks.map((item) => item.text).join('\n') } };
      });
      setSavedMessage('証拠画像を送信しました');
      window.setTimeout(() => setSavedMessage(''), 2200);
    } catch {
      setError('画像を送信できませんでした。Vercel Blobの設定と通信状況を確認してください');
    } finally {
      setUploadingTask('');
      setUploadProgress(0);
    }
  }

  async function saveReview() {
    const current = entries[day];
    if (!current?.done || entryIsDirty) return;
    const next = { ...current, stamp, comment: comment.slice(0, 60), reviewedAt: new Date().toISOString() };
    if (!await saveEntry(next)) return;
    setStamp(next.stamp || stamps[0]);
    setComment(next.comment || '');
    const nextPending = pendingReviews.find((item) => item.date !== day);
    if (nextPending) window.setTimeout(() => navigateTo(nextPending.date), 600);
  }

  async function removeEntry(date: string, cancelRestDay = false) {
    const previous = entries[date];
    const dateDraft = drafts[date];
    const hasUnsavedDraft = dateDraft && (previous
      ? dateDraft.text !== previous.text || Boolean(dateDraft.isRestDay) !== Boolean(previous.isRestDay)
      : Boolean(dateDraft.text.trim() || dateDraft.isRestDay));
    if (hasUnsavedDraft && !window.confirm('この日の宿題に未保存の入力があります。破棄して続けますか？')) return;
    const prompt = cancelRestDay
      ? formatDate(date) + 'のお休みを取り消し、この日を未登録に戻しますか？'
      : formatDate(date) + 'の宿題を削除しますか？';
    if (!window.confirm(prompt)) return;
    const updated = { ...entries };
    delete updated[date];
    setEntries(updated);
    setSaving(true);
    if (!token) {
      setSaving(false);
      setDrafts((current) => { const next = { ...current }; delete next[date]; return next; });
      setReviewDrafts((current) => { const next = { ...current }; delete next[date]; return next; });
      setSavedMessage(cancelRestDay ? formatDate(date) + 'のお休みを取り消しました' : formatDate(date) + 'の宿題を削除しました');
      return;
    }
    const response = await fetch('/api/entries', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ date }),
    }).catch(() => null);
    if (!response?.ok) {
      if (previous) setEntries((current) => ({ ...current, [date]: previous }));
      setError('変更を保存できませんでした。通信状況を確認して、もう一度お試しください');
    } else {
      setDrafts((current) => { const next = { ...current }; delete next[date]; return next; });
      setReviewDrafts((current) => { const next = { ...current }; delete next[date]; return next; });
      setSavedMessage(cancelRestDay ? formatDate(date) + 'のお休みを取り消しました' : formatDate(date) + 'の宿題を削除しました');
      window.setTimeout(() => setSavedMessage(''), 2600);
    }
    setSaving(false);
  }

  function selectMonthDate(date: string) {
    navigateTo(date);
    setMonthSheet(false);
  }

  function moveMonth(delta: number) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setSelectedMonth(next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'));
  }

  const monthStartWeekday = month ? asJstDate(month + '-01').getDay() : 0;
  const monthDays = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;

  if (!today) return <main className={styles.shell}><p className={styles.loading} role="status">読み込み中</p></main>;

  return (
    <main className={styles.shell}>
      {role === '先生' && <header className={styles.teacherHeader}>
        <div className={styles.teacherHeaderCopy}>
          <span className={styles.teacherEyebrow}>先生用</span>
          <h1>宿題を管理</h1>
        </div>
        <div className={styles.teacherHeaderStats} aria-label="宿題の状況">
          <div className={styles.teacherMetric}><span>登録済み</span><strong>{assignedHomeworkCount}件</strong></div>
          {unreviewed > 0
            ? <button className={styles.teacherPendingMetric} onClick={() => { setTeacherView('reports'); navigateTo(pendingReviews[0].date); }} aria-label={`確認待ち${unreviewed}件を確認`}>
                <span>確認待ち</span><strong>{unreviewed}件</strong><ChevronRight size={16} aria-hidden="true" />
              </button>
            : <div className={styles.teacherMetric}><span>確認待ち</span><strong>0件</strong></div>}
        </div>
      </header>}

      <section className={role === '先生' ? `${styles.dateBand} ${styles.teacherDateBand}` : styles.dateBand} aria-label="日付">
        <div className={styles.dateControls}>
          <button
            ref={monthTriggerRef}
            className={styles.monthButton}
            aria-haspopup="dialog"
            aria-expanded={monthSheet}
            aria-label={`カレンダーを開く。現在の月: ${Number(day.slice(5, 7))}月`}
            onClick={() => { setSelectedMonth(day.slice(0, 7)); setMonthSheet(true); }}
          >
            {day && Number(day.slice(5, 7)) + '月'} <ChevronDown className={styles.monthChevron} size={16} aria-hidden="true" />
          </button>
          <div className={styles.dateStrip} ref={stripRef} role="group" aria-label="日付一覧。横にスクロールして日付を選べます">
            {days.map((date) => {
              const item = entries[date];
              const active = date === day;
              return (
                <button key={date} data-date={date} aria-current={active ? 'date' : undefined} aria-label={formatDate(date) + (date === today ? ' 今日' : '') + '、' + (role === '先生' ? statusFor(item) : item?.done ? '完了' : item?.isRestDay ? 'お休み' : item?.text ? '宿題あり、未完了' : '未登録')} className={styles.dateButton} onClick={() => navigateTo(date)}>
                  <span className={active ? styles.dateNumberActive : styles.dateNumber}>{Number(date.slice(-2))}</span>
                  <small>{date === today ? '今日' : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'narrow' }).format(asJstDate(date))}</small>
                  {role === '生徒' && item?.done && <span className={styles.dateMarkDone} aria-hidden="true"><Check size={12} /></span>}
                  {role === '生徒' && item?.text && !item.isRestDay && !item.done && <span className={[styles.dateMarker, styles.dateMarkScheduled].join(' ')} aria-hidden="true" />}
                  {role === '先生' && item?.done && !item.reviewedAt && <span className={[styles.dateMarker, styles.dateMarkWaiting].join(' ')} aria-hidden="true" />}
                  {role === '先生' && item?.done && item.reviewedAt && <span className={[styles.dateMarker, styles.dateMarkReviewed].join(' ')} aria-hidden="true"><Check size={12} /></span>}
                  {role === '先生' && item?.text && !item.isRestDay && !item.done && <span className={[styles.dateMarker, styles.dateMarkScheduled].join(' ')} aria-hidden="true" />}
                  {role === '先生' && !item && <span className={[styles.dateMarker, styles.dateMarkEmpty].join(' ')} aria-hidden="true" />}
                  {role === '先生' && item?.isRestDay && <span className={[styles.dateMarker, styles.dateMarkRest].join(' ')} aria-hidden="true" />}
                  {role === '生徒' && item?.isRestDay && <span className={styles.dateMarkRest} aria-hidden="true" />}
                </button>
              );
            })}
            <span className={styles.dateUnderline} style={{ left: underline.left, width: underline.width }} />
          </div>
          {day !== today && <button className={styles.todayButton} onClick={() => navigateTo(today)}>今日へ</button>}
        </div>
        {role === '先生' && <div className={styles.dateLegend} aria-label="日付の状態">
          <span><i className={[styles.legendMarker, styles.legendScheduled].join(' ')} aria-hidden="true" />宿題あり</span>
          <span><i className={[styles.legendMarker, styles.legendWaiting].join(' ')} aria-hidden="true" />確認待ち</span>
          <span><i className={[styles.legendMarker, styles.legendReviewed].join(' ')} aria-hidden="true"><Check size={12} /></i>確認済み</span>
          <span><i className={[styles.legendMarker, styles.legendEmpty].join(' ')} aria-hidden="true" />未登録</span>
          <span><i className={[styles.legendMarker, styles.legendRest].join(' ')} aria-hidden="true" />お休み</span>
        </div>}
        {role === '生徒' && <div className={styles.dateLegend} aria-label="日付の状態">
          <span><i className={[styles.legendMarker, styles.legendScheduled].join(' ')} aria-hidden="true" />宿題あり</span>
          <span><i className={[styles.legendMarker, styles.legendDone].join(' ')} aria-hidden="true"><Check size={12} /></i>完了</span>
        </div>}
      </section>

      <div className={styles.carouselWrap}>
        {dayIndex > 0 && <button className={[styles.arrow, styles.arrowLeft].join(' ')} aria-label="前の日" onClick={() => navigateTo(days[dayIndex - 1])}><ChevronLeft size={20} aria-hidden="true" /></button>}
        <div className={styles.carousel} ref={carouselRef} onScroll={handleScroll} aria-label="日別カード">
          <div className={styles.track}>
            {visibleDays.map((date) => {
              const item = role === '先生'
                ? (date === day && entry.date === day ? entry : entries[date] || { date, text: '' })
                : entries[date] || { date, text: '' };
              const saved = entries[date];
              const itemTasks = tasksForEntry(item);
              const isToday = date === today;
              const cardStatusClass = saved?.done
                ? saved.reviewedAt ? styles.statusReviewed : styles.statusWaiting
                : saved?.text && !saved.isRestDay ? styles.statusPending : styles.statusQuiet;

              return (
                <article
                  className={role === '生徒' ? `${styles.dayCard} ${styles.studentCard}` : `${styles.dayCard} ${styles.teacherCard}`}
                  key={date}
                  data-day={date}
                  ref={(element) => {
                    if (element) slideRefs.current.set(date, element);
                    else slideRefs.current.delete(date);
                  }}
                  aria-label={formatDate(date)}
                >
                  <div className={styles.cardDate}>
                    <strong>{Number(date.slice(-2))}</strong>
                    <div>
                      {role === '先生' ? <h2>{formatDate(date)}</h2> : <h1>{formatDate(date)}</h1>}
                      {role === '先生' && <span className={cardStatusClass}>{statusFor(saved)}</span>}
                    </div>
                  </div>

                  {role === '先生' && date === day && <nav className={styles.teacherWorkflowNav} aria-label="先生用メニュー">
                    <button type="button" className={teacherView === 'homework' ? styles.teacherWorkflowActive : ''} aria-pressed={teacherView === 'homework'} onClick={() => setTeacherView('homework')}>
                      <ClipboardList size={17} aria-hidden="true" />宿題を設定
                    </button>
                    <button type="button" className={teacherView === 'reports' ? styles.teacherWorkflowActive : ''} aria-pressed={teacherView === 'reports'} onClick={() => setTeacherView('reports')}>
                      <MessageSquare size={17} aria-hidden="true" />提出を確認{unreviewed > 0 && <span>{unreviewed}</span>}
                    </button>
                  </nav>}

                  {role === '生徒' ? (
                    <>
                      <section className={`${styles.homeworkPaper} ${styles.studentHomework}`}>
                        <h2><ListChecks size={17} aria-hidden="true" />やること</h2>
                        {itemTasks.length && !item.isRestDay
                          ? <ul className={styles.studentTaskList}>
                            {itemTasks.map((task) => {
                              const taskKey = `${date}:${task.id}`;
                              return <StudentTaskRow
                                key={task.id}
                                date={date}
                                task={task}
                                token={token}
                                disabled={loading || saving || Boolean(uploadingTask) || date !== day || !isStudentActionDate(date, today)}
                                uploading={uploadingTask === taskKey}
                                uploadProgress={uploadProgress}
                                onToggle={(checked) => void updateStudentTask(date, task.id, checked)}
                                onUpload={(file) => void uploadStudentEvidence(date, task, file)}
                              />;
                            })}
                          </ul>
                          : item.isRestDay
                            ? <div className={styles.studentOffDay}><p>{date === today ? '今日はお休みです。ゆっくり過ごしてください。' : 'この日はお休みです。'}</p></div>
                            : <p className={styles.emptyHomework}>この日の宿題はまだ決まっていません。</p>}
                      </section>
                      {item.reviewedAt && <section className={styles.teacherReview}>
                        <h2>先生から</h2><p className={styles.stamp}>{item.stamp}</p>{item.comment && <p>{item.comment}</p>}
                      </section>}
                      {isToday && <section className={styles.studentProgress} aria-label="がんばり記録">
                        <div className={styles.studentProgressHeading}>
                          <div><h2><BarChart3 size={16} aria-hidden="true" />記録</h2></div>
                        </div>
                        <div className={styles.studentStatsGrid}>
                          <div><strong>{streak}</strong><span>連続日</span></div>
                          <div><strong>{completedThisMonth}</strong><span>今月できた日</span></div>
                          <div><strong>{completed.length}</strong><span>これまで</span></div>
                        </div>
                      </section>}
                    </>
                  ) : teacherView === 'homework' ? (
                    <>
                      <section className={`${styles.homeworkLabel} ${styles.teacherHomeworkLabel}`}>
                        <h3 className={styles.teacherSectionTitle}><ClipboardList size={17} aria-hidden="true" />宿題の設定</h3>
                        {itemTasks.length > 0 && <ul className={styles.teacherTaskList}>
                          {itemTasks.map((task, index) => <li key={task.id} className={styles.teacherTaskRow}>
                            {date === day ? <>
                              <label className={styles.visuallyHidden} htmlFor={`task-${date}-${task.id}`}>宿題{index + 1}</label>
                              <input
                                id={`task-${date}-${task.id}`}
                                className={styles.teacherTaskInput}
                                value={task.text}
                                maxLength={500}
                                disabled={!entryReady || saving}
                                placeholder={`宿題 ${index + 1}（例: 数学 p.1〜15）`}
                                onChange={(event) => setTeacherTasks(itemTasks.map((current) => current.id === task.id ? { ...current, text: event.target.value } : current))}
                              />
                              <button type="button" className={styles.removeTaskButton} aria-label={`宿題${index + 1}を削除`} disabled={saving} onClick={() => {
                                if (itemTasks.length === 1 && saved) void removeEntry(date);
                                else setTeacherTasks(itemTasks.filter((current) => current.id !== task.id));
                              }}><Trash2 size={16} aria-hidden="true" /></button>
                            </> : <p className={styles.teacherTaskText}>{task.text}</p>}
                            {task.done && <span className={styles.taskDoneStatus}>完了</span>}
                          </li>)}
                        </ul>}
                        {date === day
                          ? <div className={styles.teacherTaskActions}>
                            <button type="button" className={styles.addTaskButton} disabled={saving || itemTasks.length >= 20} onClick={() => setTeacherTasks([...itemTasks, { id: crypto.randomUUID(), text: '', done: false }])}><Plus size={16} aria-hidden="true" />追加</button>
                          </div>
                          : itemTasks.length === 0 && <p className={styles.emptyHomework}>宿題はありません</p>}
                      </section>
                    </>
                  ) : (saved?.done || itemTasks.some((task) => task.evidencePath)) ? (
                    <section className={styles.report}>
                        <h2 className={styles.teacherSectionTitle}><MessageSquare size={17} aria-hidden="true" />生徒の報告</h2>
                        {saved?.doneAt && <p>{formatDateTime(saved.doneAt)}に完了</p>}
                        {saved?.reviewedAt && <p className={styles.reviewedMessage}>確認済み</p>}
                        {itemTasks.some((task) => task.evidencePath) && <div className={styles.teacherEvidenceGroup}>
                          <h3 className={styles.teacherSectionTitle}><ImageIcon size={16} aria-hidden="true" />提出写真</h3>
                          <ul className={styles.teacherEvidenceList}>
                            {itemTasks.filter((task) => task.evidencePath).map((task) => <li key={task.id}>
                              <span>{task.text}</span>
                              {task.evidencePath && <EvidencePreview pathname={task.evidencePath} token={token} />}
                            </li>)}
                          </ul>
                        </div>}
                        {saved?.done && date === day && <div className={styles.confirmArea}>
                          <h3 className={styles.teacherSectionTitle}><CheckCircle2 size={17} aria-hidden="true" />先生の確認</h3>
                          <div className={styles.stampOptions} role="group" aria-label="確認スタンプ">
                            {stamps.map((label) => <button key={label} className={stamp === label ? styles.selectedStamp : ''} disabled={saving} aria-pressed={stamp === label} onClick={() => setStamp(label)}>{label}</button>)}
                          </div>
                          <label className={styles.commentLabel}>一言コメント
                            <textarea rows={2} maxLength={60} value={comment} disabled={saving} onChange={(event) => setComment(event.target.value)} />
                            <small>{comment.length}/60文字</small>
                          </label>
                          <button className={styles.primaryAction} disabled={saving || !entryReady || entryIsDirty} onClick={() => void saveReview()}>
                            {saving ? '保存しています' : savedEntry?.reviewedAt ? '確認内容を保存' : '確認する'}
                          </button>
                        </div>}
                    </section>
                  ) : <div className={styles.teacherReportEmpty}><MessageSquare size={20} aria-hidden="true" /><span>この日の提出はありません</span></div>}
                </article>
              );
            })}
          </div>
        </div>
        {dayIndex < days.length - 1 && <button className={[styles.arrow, styles.arrowRight].join(' ')} aria-label="次の日" onClick={() => navigateTo(days[dayIndex + 1])}><ChevronRight size={20} aria-hidden="true" /></button>}
      </div>

      {loading && <p className={styles.loading} role="status">読み込み中</p>}
      {loadingError && !error && <p role="alert" className={styles.error}>データを読み込めませんでした。ページを再読み込みしてください。</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!error && savedMessage && <p role="status" className={styles.successMessage}>{savedMessage}</p>}

      {role === '先生' && teacherView === 'homework' && <section className={styles.bottomDock} aria-label="宿題設定の操作">
            <div className={styles.teacherActions}>
              <button className={styles.primaryAction} disabled={saving || !entryReady || !entryIsDirty || !entryTaskReady} onClick={() => void saveEntry({ ...entry, text: entryTaskText, tasks: entryTasks, isRestDay: false })}>{saving ? '保存しています' : '保存'}</button>
              {entry.isRestDay
                ? <button className={styles.secondaryAction} disabled={saving || !entryReady} onClick={() => void removeEntry(day, true)}>お休みを取り消す</button>
                : <button className={styles.secondaryAction} disabled={saving || !entryReady} onClick={() => {
                  if (entryIsDirty && !window.confirm('入力中の宿題を破棄して、この日をお休みにしますか？')) return;
                  const rest = { ...entry, text: '', tasks: [], isRestDay: true, done: false };
                  void saveEntry(rest).then((ok) => { if (ok) setEntry(rest); });
                }}>お休みにする</button>}
            </div>
      </section>}

      {monthSheet && <div className={styles.scrim} onClick={() => setMonthSheet(false)}>
        <section ref={monthDialogRef} className={styles.monthSheet} role="dialog" aria-modal="true" aria-labelledby="month-title" onClick={(event) => event.stopPropagation()}>
          <button ref={monthCloseRef} className={styles.closeMonth} onClick={() => setMonthSheet(false)}>閉じる</button>
          <h2 id="month-title">日付を選ぶ</h2>
          <div className={styles.monthNavigation}>
            <button onClick={() => moveMonth(-1)}>前の月</button>
            <strong>{month && Number(month.slice(5, 7)) + '月'}</strong>
            <button onClick={() => moveMonth(1)}>次の月</button>
          </div>
          <div className={styles.calendar}>
            {['日', '月', '火', '水', '木', '金', '土'].map((weekday) => <span key={weekday}>{weekday}</span>)}
            {Array.from({ length: monthStartWeekday + monthDays }, (_, index) => {
              if (index < monthStartWeekday) return <i key={'blank-' + index} />;
              const date = month + '-' + String(index - monthStartWeekday + 1).padStart(2, '0');
              const item = entries[date];
              const inRange = days.includes(date);
              return <button
                key={date}
                disabled={!inRange}
                className={[date === day ? styles.calendarCurrent : '', item?.done ? styles.calendarDone : ''].join(' ')}
                aria-label={formatDate(date) + (item?.done ? ' 完了' : '')}
                onClick={() => selectMonthDate(date)}
              >
                {Number(date.slice(-2))}{item?.done && <Check size={12} aria-hidden="true" />}
              </button>;
            })}
          </div>
        </section>
      </div>}
    </main>
  );
}

