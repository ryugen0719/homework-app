'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { upload } from '@vercel/blob/client';
import { CalendarDays, Camera, Check, ChevronLeft, ChevronRight, ClipboardList, Image as ImageIcon, MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import styles from './page.module.css';

type WeeklyTask = { id: string; text: string };
type Progress = { actual?: string; done?: boolean; evidencePath?: string; updatedAt?: string };
type Review = { stamp?: string; comment?: string; reviewedAt?: string };
type DayEntry = { date: string; plans?: Record<string, string>; planHistory?: { taskId: string; from: string; to: string; at: string }[]; progress?: Record<string, Progress>; review?: Review; text?: string; tasks?: { id: string; text: string; done?: boolean; evidencePath?: string }[]; done?: boolean; reviewedAt?: string; stamp?: string; comment?: string; evidencePath?: string };
type WeekData = { weekStart: string; tasks: WeeklyTask[] };

const stamps = ['確認しました', 'よくできました', 'ていねいです'];
const emptySubscribe = () => () => {};
const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dateAtJst = (date: string) => new Date(`${date}T12:00:00+09:00`);
function offsetDate(date: string, offset: number) { const value = dateAtJst(date); value.setDate(value.getDate() + offset); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value); }
function monday(date: string) { const value = dateAtJst(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value); }
function formatShort(date: string) { return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`; }
function formatDate(date: string) { const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date)); return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekday}）`; }
function weekLabel(start: string) { return `${formatShort(start)}〜${formatShort(offsetDate(start, 6))}`; }
function getDayEntry(legacy: Record<string, DayEntry>, date: string): DayEntry { return legacy[date] || { date }; }
function getLegacyProgress(entry: DayEntry, taskId: string): Progress | undefined {
  const task = entry.tasks?.find((item) => item.id === taskId);
  if (task) return { actual: task.done ? '完了' : '', done: task.done, evidencePath: task.evidencePath };
  return taskId === 'legacy' && entry.text ? { actual: entry.done ? '完了' : '', done: entry.done, evidencePath: entry.evidencePath } : undefined;
}

function EvidencePreview({ pathname, token, taskName }: { pathname: string; token: string; taskName: string }) {
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
  if (failed) return <span className={styles.quiet}>写真を表示できません</span>;
  if (!src) return <span className={styles.quiet}>写真を読み込み中</span>;
  return <a className={styles.evidence} href={src} target="_blank" rel="noreferrer" aria-label={`${taskName}の提出写真を開く`}>
    <img src={src} alt={`${taskName}の提出写真`} /><span><ImageIcon size={14} />写真を表示</span>
  </a>;
}

export default function Home({ initialRole = '生徒', accessToken = '' }: { initialRole?: '生徒' | '先生'; accessToken?: string }) {
  const role = initialRole;
  const today = useSyncExternalStore(emptySubscribe, todayJst, () => '');
  const [selectedWeek, setSelectedWeek] = useState('');
  const weekStart = selectedWeek || (today ? monday(today) : '');
  const dates = useMemo(() => weekStart ? Array.from({ length: 7 }, (_, index) => offsetDate(weekStart, index)) : [], [weekStart]);
  const [selectedDate, setSelectedDate] = useState('');
  const day = dates.includes(selectedDate) ? selectedDate : (dates.includes(today) ? today : dates[0] || '');
  const [weeks, setWeeks] = useState<Record<string, WeekData>>({});
  const [entries, setEntries] = useState<Record<string, DayEntry>>({});
  const [weekDrafts, setWeekDrafts] = useState<Record<string, WeeklyTask[]>>({});
  const [planDrafts, setPlanDrafts] = useState<Record<string, Record<string, string>>>({});
  const [progressDrafts, setProgressDrafts] = useState<Record<string, Record<string, { actual: string; done: boolean }>>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { stamp: string; comment: string }>>({});
  const [view, setView] = useState<'assign' | 'review'>('assign');
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [token] = useState(accessToken);
  const tasks = weekDrafts[weekStart] || weeks[weekStart]?.tasks || [];
  const savedTasks = weeks[weekStart]?.tasks || [];
  const tasksDirty = JSON.stringify(tasks) !== JSON.stringify(savedTasks);
  const dayEntry = getDayEntry(entries, day);
  const planned = planDrafts[day] || dayEntry.plans || {};
  const progress = progressDrafts[day] || Object.fromEntries(tasks.map((task) => {
    const current = dayEntry.progress?.[task.id] || getLegacyProgress(dayEntry, task.id) || {};
    return [task.id, { actual: current.actual || '', done: Boolean(current.done) }];
  }));
  const review = dayEntry.review || { stamp: dayEntry.stamp || stamps[0], comment: dayEntry.comment || '' };
  const reviewDraft = reviewDrafts[day] || { stamp: review.stamp || stamps[0], comment: review.comment || '' };
  const weeklyPlanCount = dates.reduce((total, date) => total + Object.values(entries[date]?.plans || {}).filter((text) => text?.trim()).length, 0);
  const weeklyDoneCount = dates.reduce((total, date) => total + Object.values(entries[date]?.progress || {}).filter((item) => item.done).length, 0);
  const allPlans = dates.reduce((total, date) => total + Object.values(entries[date]?.plans || {}).filter((text) => text?.trim()).length, 0);
  const pastRecords = Object.values(entries).filter((item) => item.text?.trim() || item.tasks?.length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/entries', { headers: { 'x-app-token': token }, signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { weeks?: Record<string, WeekData>; entries?: Record<string, DayEntry> }; })
      .then((data) => { setWeeks(data.weeks || {}); setEntries(data.entries || {}); })
      .catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('データを読み込めませんでした。通信状況を確認して再読み込みしてください。'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);


  function setTasks(next: WeeklyTask[]) { setWeekDrafts((current) => ({ ...current, [weekStart]: next })); }
  function setPlan(date: string, taskId: string, value: string) {
    const base = planDrafts[date] || entries[date]?.plans || {};
    setPlanDrafts((current) => ({ ...current, [date]: { ...base, [taskId]: value } }));
  }
  function setProgress(date: string, taskId: string, patch: Partial<{ actual: string; done: boolean }>) {
    const source = progressDrafts[date] || Object.fromEntries(tasks.map((task) => {
      const current = entries[date]?.progress?.[task.id] || getLegacyProgress(getDayEntry(entries, date), task.id) || {};
      return [task.id, { actual: current.actual || '', done: Boolean(current.done) }];
    }));
    setProgressDrafts((current) => ({ ...current, [date]: { ...source, [taskId]: { ...source[taskId], ...patch } } }));
  }
  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 2400); }

  async function put(payload: Record<string, unknown>) {
    return fetch('/api/entries', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-app-token': token }, body: JSON.stringify(payload) }).catch(() => null);
  }
  async function saveWeek() {
    const valid = tasks.filter((task) => task.text.trim());
    if (valid.length === 0) { setError('宿題を1件以上入力してください。'); return; }
    setSaving(true); setError('');
    const response = await put({ action: 'week', weekStart, tasks: valid });
    if (!response?.ok) { setError('週の宿題を保存できませんでした。入力を確認してください。'); setSaving(false); return; }
    const next = { weekStart, tasks: valid };
    setWeeks((current) => ({ ...current, [weekStart]: next })); setWeekDrafts((current) => ({ ...current, [weekStart]: valid })); setSaving(false); notify('今週の宿題を保存しました');
  }
  async function savePlans() {
    const dayPlans = planDrafts[day];
    if (!dayPlans) return;
    setSaving(true); setError('');
    const response = await put({ action: 'plan', date: day, plans: dayPlans });
    if (!response?.ok) { setError(`${formatDate(day)}の計画を保存できませんでした。`); setSaving(false); return; }
    setEntries((current) => ({ ...current, [day]: { ...getDayEntry(current, day), plans: dayPlans } }));
    setPlanDrafts((current) => { const next = { ...current }; delete next[day]; return next; });
    setSaving(false); notify(`${formatDate(day)}の計画を保存しました`);
  }  async function saveDailyProgress() {
    setSaving(true); setError('');
    const current = progressDrafts[day] || progress;
    for (const task of tasks) {
      const value = current[task.id] || { actual: '', done: false };
      const response = await put({ action: 'progress', date: day, taskId: task.id, actual: value.actual, done: value.done });
      if (!response?.ok) { setError('今日の記録を保存できませんでした。'); setSaving(false); return; }
    }
    setEntries((existing) => ({ ...existing, [day]: { ...getDayEntry(existing, day), progress: { ...(existing[day]?.progress || {}), ...Object.fromEntries(tasks.map((task) => [task.id, current[task.id] || { actual: '', done: false }])) } } }));
    setProgressDrafts((existing) => { const next = { ...existing }; delete next[day]; return next; });
    setSaving(false); notify('今日の実績を保存しました');
  }
  async function saveReview() {
    setSaving(true); setError('');
    const response = await put({ action: 'review', date: day, ...reviewDraft });
    if (!response?.ok) { setError('先生の確認を保存できませんでした。'); setSaving(false); return; }
    const nextReview = { ...reviewDraft, reviewedAt: new Date().toISOString() };
    setEntries((existing) => ({ ...existing, [day]: { ...getDayEntry(existing, day), review: nextReview } })); setReviewDrafts((current) => ({ ...current, [day]: { stamp: nextReview.stamp || stamps[0], comment: nextReview.comment || '' } })); setSaving(false); notify('生徒への確認を保存しました');
  }
  async function uploadEvidence(task: WeeklyTask, file: File) {
    if (role !== '生徒' || !token || ![today, offsetDate(today, -1)].includes(day)) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('JPEG、PNG、WebP形式で5MB以下の画像を選んでください。'); return; }
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    setUploading(task.id); setUploadPercent(0); setError('');
    try {
      const blob = await upload(`evidence/${day}/${task.id}/${crypto.randomUUID()}.${extension}`, file, {
        access: 'private', handleUploadUrl: '/api/evidence/upload', clientPayload: JSON.stringify({ date: day, taskId: task.id }), headers: { 'x-app-token': token },
        onUploadProgress: ({ percentage }) => setUploadPercent(Math.round(percentage)),
      });
      const value = progress[task.id] || { actual: '', done: false };
      const response = await put({ action: 'progress', date: day, taskId: task.id, actual: value.actual, done: value.done, evidencePath: blob.pathname });
      if (!response?.ok) throw new Error('Save failed');
      setEntries((existing) => ({ ...existing, [day]: { ...getDayEntry(existing, day), progress: { ...(existing[day]?.progress || {}), [task.id]: { ...value, evidencePath: blob.pathname } } } }));
      notify('写真を提出しました');
    } catch { setError('写真を送信できませんでした。設定と通信状況を確認してください。'); }
    finally { setUploading(''); setUploadPercent(0); }
  }

  function changeWeek(offset: number) { setSelectedWeek(offsetDate(weekStart, offset * 7)); setSelectedDate(''); }
  function taskSummary(date: string) {
    const entry = getDayEntry(entries, date);
    const planMap = entry.plans || {};
    const plannedTasks = tasks.filter((task) => (planMap[task.id] || '').trim());
    const achieved = plannedTasks.filter((task) => (entry.progress?.[task.id] || {}).done).length;
    const reported = plannedTasks.filter((task) => (entry.progress?.[task.id] || {}).actual?.trim()).length;
    return { total: plannedTasks.length, achieved, reported };
  }
  function progressTone(date: string) {
    const summary = taskSummary(date);
    if (!summary.total) return '';
    if (summary.achieved === summary.total) return styles.dayComplete;
    if (summary.achieved || summary.reported) return styles.dayChanged;
    return styles.dayPending;
  }
  function planSummary(date: string) {
    const planMap = planDrafts[date] || entries[date]?.plans || {};
    const count = Object.values(planMap).filter((text) => text?.trim()).length;
    return { count, unsaved: Boolean(planDrafts[date]) };
  }
  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandIcon} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</span><div><p>宿題ノート</p><span>{role === '先生' ? '先生用' : '生徒用'}・週の学習記録</span></div></div>
      <div className={styles.weekPicker} aria-label="対象週">
        <button type="button" aria-label="前の週" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button>
        <div><span>対象の週</span><strong>{weekStart ? weekLabel(weekStart) : '読み込み中'}</strong></div>
        <button type="button" aria-label="次の週" onClick={() => changeWeek(1)}><ChevronRight size={20} /></button>
      </div>
    </header>

    <section className={styles.intro}>
      <h1>今週の歩幅を、ととのえる。</h1>
      <p>{role === '先生' ? '課題を決めて、毎日の取り組みを一緒に見守ります。' : '決めた課題を、できる日に少しずつ進めていきましょう。'}</p>
      <div className={styles.weekSummary}><span><strong>{role === '先生' ? tasks.length : weeklyPlanCount}</strong><small>{role === '先生' ? '今週の課題' : '計画した目標'}</small></span><span><strong>{role === '先生' ? allPlans : weeklyDoneCount}</strong><small>{role === '先生' ? '日ごとの目標' : '達成した目標'}</small></span></div>
    </section>

    {role === '先生' && <nav className={styles.tabs} aria-label="先生用メニュー">
      <button type="button" className={view === 'assign' ? styles.activeTab : ''} aria-pressed={view === 'assign'} onClick={() => setView('assign')}><ClipboardList size={17} />週の宿題</button>
      <button type="button" className={view === 'review' ? styles.activeTab : ''} aria-pressed={view === 'review'} onClick={() => setView('review')}><MessageSquare size={17} />進捗を確認</button>
    </nav>}

    {role === '先生' && view === 'assign' && <section className={styles.panel}>
      <div className={styles.panelHeading}><div><div><h2>今週の宿題</h2><p>一週間を通して取り組む課題を登録します。</p></div></div><span className={styles.count}>{tasks.length} / 20 件</span></div>
      {!tasks.length && <p className={styles.empty}>まだ課題がありません。下のボタンから追加してください。</p>}
      <div className={styles.assignmentList}>{tasks.map((task, index) => <div className={styles.assignmentRow} key={task.id}><span className={styles.taskNumber}>{index + 1}</span><label className={styles.visuallyHidden} htmlFor={`task-${task.id}`}>宿題{index + 1}</label><input id={`task-${task.id}`} value={task.text} maxLength={500} placeholder="例：数学ワーク p.12〜18" disabled={saving} onChange={(event) => setTasks(tasks.map((item) => item.id === task.id ? { ...item, text: event.target.value } : item))} /><button type="button" className={styles.iconButton} aria-label={`宿題${index + 1}を削除`} disabled={saving} onClick={() => setTasks(tasks.filter((item) => item.id !== task.id))}><Trash2 size={17} /></button></div>)}</div>
      <div className={styles.panelActions}><button type="button" className={styles.secondaryButton} disabled={saving || tasks.length >= 20} onClick={() => setTasks([...tasks, { id: crypto.randomUUID(), text: '' }])}><Plus size={17} />宿題を追加</button><button type="button" className={styles.primaryButton} disabled={saving || !tasksDirty || !tasks.some((task) => task.text.trim())} onClick={() => void saveWeek()}><Save size={17} />{saving ? '保存中…' : '週の宿題を保存'}</button></div>
      <div className={styles.teacherWeekPreview}><h3><CalendarDays size={17} />今週の進捗</h3><div className={styles.dayGrid}>{dates.map((date) => { const summary = taskSummary(date); const todayClass = date === today ? styles.today : ''; const tone = progressTone(date); return <button type="button" key={date} className={`${styles.dayTile} ${todayClass} ${tone}`} aria-label={`${formatDate(date)}、${summary.total ? `${summary.achieved}/${summary.total}件達成` : '計画なし'}`} onClick={() => { setSelectedDate(date); setView('review'); }}><span>{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date))}</span><strong>{Number(date.slice(8, 10))}</strong><small>{summary.total ? `${summary.achieved}/${summary.total}` : '未計画'}</small></button>; })}</div><div className={styles.statusLegend} aria-label="進捗の見方"><span><i className={styles.legendComplete} />達成</span><span><i className={styles.legendChanged} />計画との差</span><span><i className={styles.legendPending} />未着手（記録なし）</span><span><i className={styles.legendUnplanned} />未計画</span></div></div>
    </section>}

    {role === '先生' && view === 'review' && <>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><div><h2>日ごとの進み具合</h2><p>日付を選ぶと、その日の計画と実績を確認できます。</p></div></div><span className={styles.count}>{dates.findIndex((date) => date === day) + 1} / 7 日</span></div>
        <div className={styles.dayGrid}>{dates.map((date) => { const summary = taskSummary(date); const active = date === day; const tone = progressTone(date); return <button type="button" key={date} className={`${styles.dayTile} ${active ? styles.selectedDay : ''} ${date === today ? styles.today : ''} ${tone}`} onClick={() => setSelectedDate(date)} aria-pressed={active} aria-label={`${formatDate(date)}、${summary.total ? `${summary.achieved}/${summary.total}件達成` : '計画なし'}`}><span>{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date))}</span><strong>{Number(date.slice(8, 10))}</strong><small>{summary.total ? `${summary.achieved}/${summary.total}` : '未計画'}</small></button>; })}</div>
        <div className={styles.statusLegend} aria-label="進捗の見方"><span><i className={styles.legendComplete} />達成</span><span><i className={styles.legendChanged} />計画との差</span><span><i className={styles.legendPending} />未着手（記録なし）</span><span><i className={styles.legendUnplanned} />未計画</span></div>
        <div className={styles.selectedDateHeading}><div><span>選択した日</span><h3>{day && formatDate(day)}</h3></div><span className={styles.statusPill}>{taskSummary(day).total ? `${taskSummary(day).achieved} / ${taskSummary(day).total} 目標達成` : '計画なし'}</span></div>
        {!tasks.length ? <p className={styles.empty}>この週の宿題はまだ登録されていません。</p> : <div className={styles.reviewList}>{tasks.map((task) => {
          const plan = dayEntry.plans?.[task.id] || '';
          const record = dayEntry.progress?.[task.id] || getLegacyProgress(dayEntry, task.id) || {};
          const status = !plan.trim() ? '計画なし' : record.done ? '目標達成' : record.actual?.trim() ? '目標との差あり' : '未記録';
          const statusStyle = record.done ? styles.successStatus : record.actual?.trim() ? styles.warningStatus : styles.neutralStatus;
          return <article className={styles.reviewTask} key={task.id}><div className={styles.reviewTaskTop}><h3>{task.text}</h3><span className={`${styles.statusPill} ${statusStyle}`}>{status}</span></div><div className={styles.comparison}><div><span>今日の計画</span><p>{plan || '計画はありません'}</p></div><div><span>生徒の実績</span><p>{record.actual || 'まだ記録されていません'}</p></div></div>{record.evidencePath && <EvidencePreview pathname={record.evidencePath} token={token} taskName={task.text} />}</article>;
        })}</div>}
        {dayEntry.planHistory?.length ? <details className={styles.history}><summary>計画の変更履歴（{dayEntry.planHistory.length}件）</summary><ul>{dayEntry.planHistory.slice().reverse().map((change, index) => <li key={`${change.taskId}-${change.at}-${index}`}><strong>{tasks.find((task) => task.id === change.taskId)?.text || '変更された課題'}</strong><span>{change.from || '未設定'} → {change.to || '未設定'}</span><time>{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(change.at))}</time></li>)}</ul></details> : null}
      </section>
      <section className={`${styles.panel} ${styles.reviewPanel}`}><div className={styles.panelHeading}><div><div><h2>先生からの確認</h2><p>その日の取り組みにコメントを返します。</p></div></div>{review.reviewedAt && <span className={`${styles.statusPill} ${styles.successStatus}`}>確認済み</span>}</div><div className={styles.stamps} role="group" aria-label="確認スタンプ">{stamps.map((stamp) => <button type="button" key={stamp} className={reviewDraft.stamp === stamp ? styles.selectedStamp : ''} aria-pressed={reviewDraft.stamp === stamp} onClick={() => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, stamp } }))}>{stamp}</button>)}</div><label className={styles.fieldLabel}>一言コメント<textarea rows={3} maxLength={120} value={reviewDraft.comment} onChange={(event) => setReviewDrafts((current) => ({ ...current, [day]: { ...reviewDraft, comment: event.target.value } }))} placeholder="取り組みを見た感想を書きましょう" /><small>{reviewDraft.comment.length}/120文字</small></label><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveReview()}><Check size={17} />{saving ? '保存中…' : '確認を保存'}</button></section>
    </>}

    {role === '生徒' && <>
      {!tasks.length ? <section className={styles.panel}><div className={styles.emptyState}><span className={styles.emptyIcon}><ClipboardList size={24} /></span><h2>今週の宿題はまだありません</h2><p>先生が宿題を登録すると、ここに表示されます。</p></div></section> : <>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><div><h2>一週間の計画</h2><p>日付を選び、その日の目標を決めます。</p></div></div><span className={styles.count}>{weekLabel(weekStart)}</span></div>
          <div className={styles.dayGrid} role="group" aria-label="計画する日を選ぶ">{dates.map((date) => { const summary = planSummary(date); return <button type="button" key={date} className={`${styles.dayTile} ${date === day ? styles.selectedDay : ''} ${date === today ? styles.today : ''} ${summary.unsaved ? styles.dayHasDraft : ''}`} onClick={() => setSelectedDate(date)} aria-pressed={date === day} aria-label={`${formatDate(date)}、${summary.count ? `${summary.count}件の目標${summary.unsaved ? '、未保存' : ''}` : '目標なし'}`}><span>{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(dateAtJst(date))}</span><strong>{Number(date.slice(8, 10))}</strong><small>{summary.unsaved ? '未保存' : summary.count ? `${summary.count}件` : '未計画'}</small></button>; })}</div>
          <div className={styles.selectedDateHeading}><div><span>計画する日</span><h3>{day && formatDate(day)}</h3></div></div>
          <div className={styles.planList}>{tasks.map((task, index) => <article className={styles.planTask} key={task.id}><div className={styles.planTaskTitle}><span className={styles.taskNumber}>{index + 1}</span><h3>{task.text}</h3></div><label className={styles.planInputLabel}><span>今日の目標</span><textarea aria-label={`${task.text}、${formatDate(day)}の目標`} rows={2} maxLength={500} value={planDrafts[day]?.[task.id] ?? entries[day]?.plans?.[task.id] ?? ''} onChange={(event) => setPlan(day, task.id, event.target.value)} placeholder="例：ワーク p.12〜14" /></label></article>)}</div>
          <div className={styles.planFooter}><span>週の途中でも予定を調整できます。</span><button type="button" className={styles.primaryButton} disabled={saving || !planDrafts[day]} onClick={() => void savePlans()}><Save size={17} />{saving ? '保存中…' : 'この日の計画を保存'}</button></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><div><h2>日々の実績</h2><p>その日の目標に対して、進んだ内容を記録します。</p></div></div></div>
          {day && <div className={styles.selectedDateHeading}><div><span>{day === today ? '今日の記録' : day === offsetDate(today, -1) ? '昨日の記録' : '選択した日'}</span><h3>{formatDate(day)}</h3></div>{day !== today && ![today, offsetDate(today, -1)].includes(day) && <span className={styles.quiet}>記録できるのは当日と前日です</span>}</div>}
          <div className={styles.dailyList}>{tasks.map((task) => {
            const item = progress[task.id] || { actual: '', done: false };
            const plan = planned[task.id] || '';
            const canEdit = [today, offsetDate(today, -1)].includes(day);
            const currentEvidence = dayEntry.progress?.[task.id]?.evidencePath || getLegacyProgress(dayEntry, task.id)?.evidencePath;
            return <article className={styles.dailyTask} key={task.id}><div className={styles.dailyTaskHead}><div><span>宿題</span><h3>{task.text}</h3></div><label className={styles.doneToggle}><input type="checkbox" checked={item.done} disabled={!canEdit || saving} onChange={(event) => setProgress(day, task.id, { done: event.target.checked })} /><span>今日の目標までできた</span></label></div><div className={styles.dailyComparison}><div><span>今日の目標</span><p>{plan || '目標を設定していません'}</p></div><label className={styles.fieldLabel}>進んだ内容<textarea rows={2} maxLength={1000} disabled={!canEdit || saving} value={item.actual} onChange={(event) => setProgress(day, task.id, { actual: event.target.value })} placeholder="例：ワーク p.12〜14まで進みました" /></label></div><div className={styles.dailyActions}>{currentEvidence && <EvidencePreview pathname={currentEvidence} token={token} taskName={task.text} />}{canEdit && <label className={styles.uploadButton}><Camera size={16} />{uploading === task.id ? `送信中 ${uploadPercent}%` : currentEvidence ? '写真を変更' : '写真を追加'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading) || saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(task, file); event.target.value = ''; }} /></label>}</div></article>;
          })}</div>
          <div className={styles.planFooter}><span>記録は当日または翌日まで編集できます。</span><button type="button" className={styles.primaryButton} disabled={saving || ![today, offsetDate(today, -1)].includes(day)} onClick={() => void saveDailyProgress()}><Save size={17} />{saving ? '保存中…' : '今日の実績を保存'}</button></div>
          {dayEntry.review?.reviewedAt && <div className={styles.teacherMessage}><span><MessageSquare size={17} />先生から</span><strong>{dayEntry.review.stamp}</strong>{dayEntry.review.comment && <p>{dayEntry.review.comment}</p>}</div>}
        </section>
      </>}
    </>}

    {pastRecords.length > 0 && <section className={`${styles.panel} ${styles.legacyPanel}`}><details><summary>これまでの日別記録（旧形式）</summary><p>新しい週の記録とは分けて、以前の宿題履歴を表示しています。</p><ul>{pastRecords.map((entry) => <li key={entry.date}><strong>{formatDate(entry.date)}</strong><span>{entry.tasks?.map((item) => `${item.done ? '済' : '未'} ${item.text}`).join(' / ') || entry.text}</span>{entry.tasks?.filter((item) => item.evidencePath).map((item) => <EvidencePreview key={item.id} pathname={item.evidencePath!} token={token} taskName={item.text} />)}{!entry.tasks?.length && entry.evidencePath && <EvidencePreview pathname={entry.evidencePath} token={token} taskName={entry.text || '宿題'} />}</li>)}</ul></details></section>}

    {loading && <p className={styles.feedback} role="status">データを読み込んでいます…</p>}{error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
  </main>;
}
