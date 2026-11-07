'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { upload } from '@vercel/blob/client';
import { Check, ChevronLeft, ChevronRight, ImagePlus, MessageCircle, Moon, PencilLine, Sun, Trash2, X } from 'lucide-react';
import { ui } from './ui';

type StudySession = { id: string; content: string; minutes?: number; evidencePath?: string; createdAt?: string; updatedAt?: string };
type Review = { stamp?: string; comment?: string; reviewedAt?: string };
type DayEntry = { date: string; sessions: StudySession[]; review?: Review };
type Draft = { id: string; content: string; minutes: string };

const stamps = ['確認しました', 'よくできました', 'ていねいです'];
const emptySubscribe = () => () => {};
const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dateAtJst = (date: string) => new Date(`${date}T12:00:00+09:00`);
function offsetDate(date: string, offset: number) { const value = dateAtJst(date); value.setDate(value.getDate() + offset); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value); }
function monday(date: string) { const value = dateAtJst(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value); }
function formatShort(date: string) { return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`; }
function formatDate(date: string) { const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date)); return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekday}）`; }
function weekLabel(start: string) { return `${formatShort(start)}〜${formatShort(offsetDate(start, 6))}`; }
function blankEntry(date: string): DayEntry { return { date, sessions: [] }; }

function EvidencePreview({ pathname, token, label }: { pathname: string; token: string; label: string }) {
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
  return <a className={ui.evidence} href={src} target="_blank" rel="noreferrer" aria-label={`${label}の写真を開く`}>
    <img src={src} alt={`${label}の写真`} /><span><ImagePlus size={16} />写真を見る</span>
  </a>;
}

export default function Home({ initialRole = '生徒', accessToken = '' }: { initialRole?: '生徒' | '先生'; accessToken?: string }) {
  const role = initialRole;
  const today = useSyncExternalStore(emptySubscribe, todayJst, () => '');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setTheme('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      setTheme('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore
    }
  }

  const [selectedWeek, setSelectedWeek] = useState('');
  const weekStart = selectedWeek || (today ? monday(today) : '');
  const dates = useMemo(() => weekStart ? Array.from({ length: 7 }, (_, index) => offsetDate(weekStart, index)) : [], [weekStart]);
  const [selectedDate, setSelectedDate] = useState('');
  const day = dates.includes(selectedDate) ? selectedDate : (dates.includes(today) ? today : dates[0] || '');
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [loadedWeeks, setLoadedWeeks] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { stamp: string; comment: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [token] = useState(accessToken);
  const dataReady = Boolean(loadedWeeks[weekStart]);
  const loading = Boolean(token && weekStart && !dataReady && !error);
  const entry = entries[day] || blankEntry(day);
  const sessions = entry.sessions || [];
  const draft = drafts[day] || { id: '', content: '', minutes: '' };
  const savedReview = entry.review || {};
  const reviewDraft = reviewDrafts[day] || { stamp: savedReview.stamp || stamps[0], comment: savedReview.comment || '' };
  const weekEntries = dates.map((date) => entries[date] || blankEntry(date));
  const recordedDays = weekEntries.filter((item) => item.sessions.length > 0).length;
  const weeklyMinutes = weekEntries.reduce((sum, item) => sum + item.sessions.reduce((daySum, session) => daySum + (session.minutes || 0), 0), 0);
  const dayMinutes = sessions.reduce((sum, session) => sum + (session.minutes || 0), 0);
  const isCurrentWeek = Boolean(today && weekStart === monday(today));
  const weeklyEncouragement = recordedDays >= 4
    ? `今週の目安クリア！${recordedDays}日も記録できたね。`
    : recordedDays === 0
      ? 'まずはひとつ。小さな勉強からで大丈夫。'
      : `あと${4 - recordedDays}日で今週の目安。自分のペースで続けよう。`;
  const latestTeacherReview = Object.values(entries).filter((item) => item.review?.reviewedAt).sort((a, b) => (b.review?.reviewedAt || '').localeCompare(a.review?.reviewedAt || ''))[0];
  const canLog = Boolean(today && day <= today);
  const canAddPhoto = Boolean(today && [today, offsetDate(today, -1)].includes(day));
  const hasUnsavedChanges = Object.entries(drafts).some(([date, item]) => {
    if (!item.id) return Boolean(item.content.trim() || item.minutes.trim());
    const saved = entries[date]?.sessions.find((session) => session.id === item.id);
    return Boolean(saved && (item.content !== saved.content || item.minutes !== (saved.minutes?.toString() || '')));
  }) || Object.entries(reviewDrafts).some(([date, item]) => {
    const saved = entries[date]?.review || {};
    return item.stamp !== (saved.stamp || stamps[0]) || item.comment !== (saved.comment || '');
  });

  useEffect(() => {
    if (!token || !weekStart) return;
    const controller = new AbortController();
    fetch(`/api/entries?weekStart=${encodeURIComponent(weekStart)}`, { headers: { 'x-app-token': token }, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { entries?: Record<string, DayEntry> }; })
      .then((data) => {
        setEntries((current) => ({ ...current, ...(data.entries || {}) }));
        setLoadedWeeks((current) => ({ ...current, [weekStart]: true }));
        setError('');
      })
      .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('記録を読み込めませんでした。通信状況を確認してください。'); });
    return () => controller.abort();
  }, [token, weekStart]);

  useEffect(() => {
    if (!hasUnsavedChanges && !saving && !uploading) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [hasUnsavedChanges, saving, uploading]);

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
  function changeWeek(offset: number) {
    setSelectedWeek(offsetDate(weekStart, offset * 7));
    setSelectedDate('');
    setError('');
  }
  function dayStatus(date: string) {
    const selected = entries[date];
    if (!selected?.sessions.length) {
      if (date > today) return role === '先生' ? 'これから' : '';
      return role === '先生' ? '記録なし' : '';
    }
    return selected.review?.reviewedAt ? '返信あり' : '記録あり';
  }

  return <main className={`shell ${ui.shell} bg-canvas text-ink`}>
    <header className={ui.header}>
      <div className={ui.brand}>
        <p>宿題ノート／{role}用</p>
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
      <div className={ui.weekPicker} aria-label="週を選ぶ">
        <button type="button" aria-label="前の週" disabled={!weekStart} onClick={() => changeWeek(-1)}><ChevronLeft size={19} /></button>
        <div><span>学習の記録</span><strong>{weekStart ? weekLabel(weekStart) : '読み込み中'}</strong></div>
        <button type="button" aria-label="次の週" disabled={!weekStart} onClick={() => changeWeek(1)}><ChevronRight size={19} /></button>
      </div>
    </header>

    <section className={role === '先生' ? ui.teacherIntro : `${ui.intro} ${ui.introCompact}`}>
      <h1 className={ui.pageTitle}>勉強の記録</h1>
      <div className={ui.weekSummary} aria-label="今週の学習まとめ">
        <span><strong className="text-primary">{dataReady ? `${recordedDays}日` : '—'}</strong><small>記録した日</small></span>
        <span><strong className="text-primary">{dataReady && weeklyMinutes > 0 ? `${weeklyMinutes}分` : '—'}</strong><small>学習時間（任意）</small></span>
      </div>
      {role === '生徒' && dataReady && isCurrentWeek && <div className={`${ui.weekGoal} ${recordedDays >= 4 ? ui.weekGoalReward : ''}`}>
        <div className={ui.weekGoalHeading}>
          <span>今週のリズム</span><strong>{recordedDays} / 4日</strong>
        </div>
        <div className={ui.weekGoalSteps} role="img" aria-label={`週4日の目安、${recordedDays}日記録済み`}>
          {Array.from({ length: 4 }, (_, index) => <span key={index} className={index < recordedDays ? ui.weekGoalStepComplete : ui.weekGoalStep} />)}
        </div>
        <p className={ui.weekGoalMessage}>{recordedDays >= 4 && <span aria-hidden="true">✓ </span>}{weeklyEncouragement}</p>
      </div>}
    </section>

    {role === '生徒' && latestTeacherReview && latestTeacherReview.date !== day && <aside className={ui.teacherMessage}>
      <span><MessageCircle size={16} />先生から・{formatDate(latestTeacherReview.date)}</span><strong>{latestTeacherReview.review?.stamp}</strong>
      {latestTeacherReview.review?.comment && <p>{latestTeacherReview.review.comment}</p>}
    </aside>}

    <section className={ui.panel}>
      <div className={ui.panelHeading}>
        <div><h2>{role === '生徒' ? '日付を選ぶ' : '確認する日を選ぶ'}</h2>{role === '生徒' && <p>日付を選ぶと、その日の記録が見られます。</p>}</div>
      </div>
      <div className={ui.dayGrid} role="group" aria-label="記録の日付">
        {dates.map((date) => {
          const status = dayStatus(date);
          return <button type="button" key={date} className={`${ui.dayTile} ${date === day ? ui.selectedDay : ''} ${date === today ? ui.today : ''} ${entries[date]?.sessions.length ? ui.dayHasRecord : ''} ${date > today ? 'future-day' : ''}`} onClick={() => setSelectedDate(date)} aria-pressed={date === day} aria-label={`${formatDate(date)}${status ? `、${status}` : ''}`}>
            <span>{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date))}</span><strong>{Number(date.slice(8, 10))}</strong><small>{entries[date]?.sessions.length ? <span className="day-has-record-indicator"><Check size={14} aria-hidden="true" /></span> : date <= today ? <span className="day-no-record-indicator" aria-hidden="true">−</span> : <span aria-hidden="true">　</span>}</small>
          </button>;
        })}
      </div>
      <p className={ui.dayScrollHint}>左右に動かして日付を切り替えられます</p>
    </section>

    {role === '生徒' ? <>
      <section className={ui.panel}>
        <div className={ui.panelHeading}>
          <div><h2>{day === today ? '今日の勉強' : `${day ? formatDate(day) : ''}の勉強`}</h2><p>勉強したことを、ひとつずつ残しておきましょう。</p></div>
          {sessions.length > 0 && <span className={ui.count}>{sessions.length}件{dayMinutes > 0 ? `・${dayMinutes}分` : ''}</span>}
        </div>
        {day && day > today && <p className={ui.empty}>未来の日付には記録できません。勉強したあとに記録しましょう。</p>}
        {canLog && <div className={ui.composer}>
          <label className={ui.fieldLabel} htmlFor="study-content">勉強した内容</label>
          <textarea id="study-content" className={ui.textArea} rows={3} maxLength={1000} value={draft.content} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ content: event.target.value })} placeholder="例：算数の問題集を5ページ進めた" />
          <div className={ui.composerFooter}>
            <label className={ui.minutesField}>学習時間（任意）<span><input className={ui.minutesInput} type="number" min="1" max="1440" inputMode="numeric" value={draft.minutes} disabled={!dataReady || saving || Boolean(uploading)} onChange={(event) => updateDraft({ minutes: event.target.value })} aria-label="学習時間（分）" placeholder="30" />分</span></label>
            <div className={ui.formActions}>
              {draft.id && <button type="button" className={ui.secondaryButton} disabled={saving || Boolean(uploading)} onClick={() => setDrafts((current) => { const next = { ...current }; delete next[day]; return next; })}><X size={16} />編集をやめる</button>}
              <button type="button" className={ui.primaryButton} disabled={!dataReady || saving || Boolean(uploading) || !draft.content.trim()} onClick={() => void saveSession()}><Check size={16} />{saving ? '保存中…' : draft.id ? '変更を保存' : '記録する'}</button>
            </div>
          </div>
          {day !== today && <p className={ui.quiet}>過去の日付の記録も追加できます。</p>}
        </div>}

        {sessions.length > 0 ? <div className={ui.sessionList}>
          {sessions.map((session, index) => <article className={ui.session} key={session.id}>
            <div className={ui.sessionNumber} aria-hidden="true">{index + 1}</div>
            <div className={ui.sessionBody}>
              <p>{session.content}</p>
              {session.minutes && <span className={ui.sessionMeta}>{session.minutes}分</span>}
              {session.evidencePath && <EvidencePreview key={session.evidencePath} pathname={session.evidencePath} token={token} label={session.content} />}
              <div className={ui.sessionActions}>
              <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => startEdit(session)}><PencilLine size={16} />編集</button>
                <button type="button" className={ui.textButton} disabled={!dataReady || saving || Boolean(uploading)} onClick={() => void deleteSession(session)}><Trash2 size={14} />削除</button>
                {canAddPhoto && <label className={ui.uploadButton}><ImagePlus size={16} />{uploading === session.id ? `送信中 ${uploadPercent}%` : session.evidencePath ? '写真を変更' : '写真を追加'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!dataReady || Boolean(uploading) || saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(session, file); event.target.value = ''; }} /></label>}
              </div>
            </div>
          </article>)}
        </div> : dataReady && canLog ? <p className={ui.empty}>まだ記録はありません。勉強したことをひとつ書いてみましょう。</p> : null}
        {sessions.length > 0 && <p className={ui.encouragement}>記録できました。この日の一歩を残せました。</p>}
      </section>

      {day && entry.review?.reviewedAt && <section className={ui.reviewReceived}>
        <span><MessageCircle size={16} />先生からのフィードバック</span><strong>{entry.review.stamp}</strong>
        {entry.review.comment && <p>{entry.review.comment}</p>}
      </section>}
    </> : <>
      <section className={ui.panel}>
        <div className={`${ui.panelHeading} teacher-record-heading`}>
          <div><h2>{day ? formatDate(day) : ''}</h2></div>
          {sessions.length > 0 && <span className={ui.count}>{sessions.length}件{dayMinutes > 0 ? `・${dayMinutes}分` : ''}</span>}
        </div>
        {sessions.length === 0 ? <p className={ui.empty}>{day > today ? '未来の日付です。' : 'この日の学習記録はありません。'}</p> : <div className={ui.sessionList}>
          {sessions.map((session) => <article className={`${ui.session} teacher-session`} key={session.id}>
            <Check className="session-check" size={19} aria-label="記録あり" />
            <div className={ui.sessionBody}><p>{session.content}</p>{session.evidencePath && <EvidencePreview key={session.evidencePath} pathname={session.evidencePath} token={token} label={session.content} />}</div>{session.minutes && <span className="session-minutes">{session.minutes}分</span>}
          </article>)}
        </div>}
      </section>
      {sessions.length > 0 && <section className={ui.panel}>
        <div className={ui.panelHeading}><div><h2>ひとこと返信</h2><p>取り組みを見た感想を返しましょう。</p></div>{savedReview.reviewedAt && <span className={ui.statusPill}>返信済み</span>}</div>
        <div className={ui.stamps} role="group" aria-label="励ましのスタンプ">
          {stamps.map((stamp) => {
            const isGreat = stamp === 'よくできました';
            const isPressed = reviewDraft.stamp === stamp;
            const extraClass = isGreat
              ? (isPressed ? '!border-reward !bg-reward !text-white' : '!border-reward !bg-reward-soft !text-reward-ink')
              : (isPressed ? '!border-primary !bg-primary !text-white' : '');
            return (
              <button
                type="button"
                key={stamp}
                className={`${isGreat ? 'stamp-great' : ''} ${extraClass}`}
                aria-pressed={isPressed}
                disabled={!dataReady || saving}
                onClick={() => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, stamp } }))}
              >
                {stamp}
              </button>
            );
          })}
        </div>
        <label className={ui.fieldLabel} htmlFor="teacher-comment">一言コメント</label>
        <textarea id="teacher-comment" className={ui.commentBox} rows={3} maxLength={120} value={reviewDraft.comment} disabled={!dataReady || saving} onChange={(event) => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, comment: event.target.value } }))} placeholder="がんばったところを伝えましょう" />
        <small className={ui.characterCount}>{reviewDraft.comment.length}/120文字</small>
        <button type="button" className={ui.primaryButton} disabled={!dataReady || saving} onClick={() => void saveReview()}><Check size={16} />{saving ? '保存中…' : '返信を保存'}</button>
      </section>}
    </>}

    {loading && <p className={ui.feedback} role="status">記録を読み込んでいます…</p>}
    {error && <p className={ui.error} role="alert">{error}</p>}
    {notice && <p className={ui.notice} role="status">{notice}</p>}
  </main>;
}
