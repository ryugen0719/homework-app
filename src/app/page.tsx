'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type Entry = {
  date: string;
  text: string;
  isRestDay?: boolean;
  done?: boolean;
  doneAt?: string;
  stamp?: string;
  comment?: string;
  reviewedAt?: string;
};

const todayJst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const asJstDate = (date: string) => new Date(`${date}T12:00:00+09:00`);
const formatMonth = (date: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long' }).format(asJstDate(`${date.slice(0, 7)}-01`));
const stamps = ['確認しました', 'よくできました', 'ていねいです'];

function offsetDate(date: string, offset: number) {
  const value = asJstDate(date);
  value.setDate(value.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value);
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

export default function Home() {
  const [role, setRole] = useState<'生徒' | '先生'>('生徒');
  const [day, setDay] = useState('');
  const [entry, setEntry] = useState<Entry>({ date: '', text: '' });
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState('');
  const [stamp, setStamp] = useState(stamps[0]);
  const [comment, setComment] = useState('');
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const current = todayJst();
    setDay(current);
    setMonth(current.slice(0, 7));
    setEntry({ date: current, text: '' });
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] === 't' || parts[0] === 's') {
      setRole(parts[0] === 't' ? '先生' : '生徒');
      setToken(parts[1] || '');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/entries', { headers: { 'x-app-token': token } })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { entries?: Record<string, Entry> };
        const loaded = data.entries || {};
        setEntries(loaded);
        if (role === '先生') {
          let nextDate = todayJst();
          for (let i = 0; i < 365 && loaded[nextDate]; i++) nextDate = offsetDate(nextDate, 1);
          setEntry(loaded[nextDate] || { date: nextDate, text: '' });
        }
      })
      .catch(() => setError('データを読み込めませんでした。通信状況を確認してください。'))
      .finally(() => setLoading(false));
  }, [token, role]);

  useEffect(() => {
    if (token && role === '生徒') setEntry(entries[day] || { date: day, text: '' });
  }, [entries, token, role, day]);

  const firstWeekday = useMemo(() => {
    if (!month) return 0;
    return asJstDate(`${month}-01`).getDay();
  }, [month]);
  const daysInMonth = useMemo(() => {
    if (!month) return 0;
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber, 0).getDate();
  }, [month]);
  const streak = streakCount(entries, day);
  const completed = Object.values(entries).filter((item) => item.done && !item.isRestDay);
  const completedThisMonth = completed.filter((item) => item.date.startsWith(day.slice(0, 7))).length;
  const unreviewed = Object.values(entries).filter((item) => item.done && !item.reviewedAt).length;

  async function saveEntry(next: Entry) {
    if (!next.isRestDay && !next.text.trim()) {
      setError('宿題を入力してください');
      return false;
    }
    const previous = entries[next.date];
    const updated = { ...entries, [next.date]: next };
    setEntries(updated);
    setError('');
    if (!token) return true;
    const response = await fetch('/api/entries', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ entry: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setEntries((current) => {
        const restored = { ...current };
        if (previous) restored[next.date] = previous;
        else delete restored[next.date];
        return restored;
      });
      setError('保存できませんでした。通信状況を確認して、もう一度お試しください');
      return false;
    }
    return true;
  }

  async function toggleCompletion(target: Entry) {
    const next = { ...target, done: !target.done, doneAt: target.done ? undefined : new Date().toISOString() };
    if (target.date === day) setEntry(next);
    if (selected?.date === target.date) setSelected(next);
    if (!target.done) {
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 900);
      navigator.vibrate?.(12);
    } else {
      setCelebrate(false);
    }
    const saved = await saveEntry(next);
    if (!saved) {
      if (target.date === day) setEntry(target);
      if (selected?.date === target.date) setSelected(target);
      setCelebrate(false);
    }
  }

  async function removeEntry(date: string) {
    if (!window.confirm(`${date}の宿題を削除しますか？`)) return;
    const previous = entries[date];
    const updated = { ...entries };
    delete updated[date];
    setEntries(updated);
    setSelected(null);
    if (!token) return;
    const response = await fetch('/api/entries', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ date }),
    }).catch(() => null);
    if (!response?.ok && previous) {
      setEntries((current) => ({ ...current, [date]: previous }));
      setError('削除できませんでした。通信状況を確認して、もう一度お試しください');
    }
  }

  function openTeacherDetail(item: Entry) {
    setSelected(item);
    setStamp(item.stamp || stamps[0]);
    setComment(item.comment || '');
  }

  async function saveReview() {
    if (!selected) return;
    const next = { ...selected, stamp, comment: comment.slice(0, 60), reviewedAt: new Date().toISOString() };
    if (await saveEntry(next)) setSelected(next);
  }

  function moveMonth(delta: number) {
    if (!month) return;
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  const yesterday = day ? offsetDate(day, -1) : '';
  const selectedCanComplete = selected && (selected.date === day || selected.date === yesterday) && Boolean(selected.text) && !selected.isRestDay;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <b>宿題ノート</b>
        {!token && <nav><button onClick={() => setRole('生徒')}>生徒</button><button onClick={() => setRole('先生')}>先生</button></nav>}
      </header>

      {role === '生徒' ? <>
        <section className={styles.date}>
          <strong>{day ? Number(day.slice(-2)) : ''}</strong>
          <span><b>{day && formatMonth(day)}</b><small>{day && new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'long' }).format(asJstDate(day))}</small></span>
          <button onClick={() => setHistory((value) => !value)}>{history ? '今日に戻る' : '履歴を見る'}</button>
        </section>

        {history ? <section className={styles.calendarSection}>
          <div className={styles.month}>
            <button onClick={() => moveMonth(-1)}>前の月</button>
            <b>{month && formatMonth(month)}</b>
            <button onClick={() => moveMonth(1)}>次の月</button>
          </div>
          <div className={styles.calendar}>
            {['日', '月', '火', '水', '木', '金', '土'].map((name) => <span key={name}>{name}</span>)}
            {Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
              if (index < firstWeekday) return <i key={`blank-${index}`} />;
              const date = `${month}-${String(index - firstWeekday + 1).padStart(2, '0')}`;
              const item = entries[date];
              return <button key={date} className={date === day ? styles.currentDay : ''} onClick={() => setSelected(item || { date, text: '' })}>
                <span>{index - firstWeekday + 1}</span>{item?.done && <span className={styles.smallMark}>○</span>}
              </button>;
            })}
          </div>
        </section> : <>
          {loading ? <p className={styles.loading}>読み込み中</p> : <>
            <section className={styles.paper}>
              <h1>今日の宿題</h1>
              {entry.text && !entry.isRestDay ? <p>{entry.text}</p> : <p className={styles.muted}>今日の宿題はありません</p>}
              {entry.done && <div className={celebrate ? styles.celebrating : styles.completed}>
                <svg className={styles.doneMark} viewBox="0 0 100 100" aria-label="完了"><circle cx="50" cy="50" r="34" /></svg>
                <span>完了しました</span>
              </div>}
            </section>
            {entry.text && !entry.isRestDay && <div className={styles.actions}>
              <button className={entry.done ? styles.outline : styles.primary} onClick={() => void toggleCompletion(entry)}>{entry.done ? '完了を取り消す' : '完了にする'}</button>
            </div>}
            {entry.reviewedAt && <section className={styles.review}>
              <h2>先生から</h2><p className={styles.stamp}>{entry.stamp}</p>{entry.comment && <p>{entry.comment}</p>}
            </section>}
            <footer className={styles.stats}>
              {streak > 0 && <span>連続 {streak}日</span>}
              <span>今月 完了 {completedThisMonth}日</span><span>累計 {completed.length}日</span>
            </footer>
          </>}
        </>}
      </> : <>
        <section className={styles.teacher}>
          <h1>宿題の確認</h1><p>確認が必要な日を一覧で表示しています</p><b>{unreviewed}件 未確認</b>
        </section>
        <section className={styles.editor}>
          <h2>宿題を登録</h2>
          <label className={styles.fieldLabel}>日付<input type="date" value={entry.date} onChange={(event) => {
            const date = event.target.value;
            setEntry(entries[date] || { date, text: '' });
          }} /></label>
          <label className={styles.fieldLabel}>宿題<textarea rows={4} maxLength={5000} value={entry.text} onChange={(event) => setEntry({ ...entry, text: event.target.value, isRestDay: false })} /></label>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => void saveEntry({ ...entry, isRestDay: false })}>宿題を保存</button>
            <button className={styles.outline} onClick={() => { const rest = { ...entry, text: '', isRestDay: true, done: false }; setEntry(rest); void saveEntry(rest); }}>お休みにする</button>
          </div>
        </section>
        {loading ? <p className={styles.loading}>読み込み中</p> : <section className={styles.list}>
          {Object.values(entries).sort((a, b) => b.date.localeCompare(a.date)).map((item) => <button className={styles.row} key={item.date} onClick={() => openTeacherDetail(item)}>
            <span><b>{item.date}</b><small>{item.text || 'お休み'}</small></span>
            <span>{item.done ? '完了' : '未完了'}<small>{item.reviewedAt ? '確認済み' : '未確認'}</small></span>
          </button>)}
          {!Object.keys(entries).length && <p className={styles.emptyList}>登録済みの宿題はありません</p>}
        </section>}
      </>}

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {selected && <div className={styles.scrim} onClick={() => setSelected(null)}>
        <section className={styles.sheet} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => setSelected(null)}>閉じる</button>
          <h2>{selected.date}</h2>
          <p>{selected.text || (selected.isRestDay ? 'この日はお休みです' : 'この日の宿題はまだ入力されていません')}</p>
          {selected.doneAt && <p className={styles.muted}>完了日時 {new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selected.doneAt))}</p>}
          {role === '先生' ? <>
            {selected.done && <>
              <h3>確認スタンプ</h3>
              <div className={styles.stampOptions}>{stamps.map((label) => <button className={stamp === label ? styles.selectedStamp : ''} key={label} onClick={() => setStamp(label)}>{label}</button>)}</div>
              <label className={styles.fieldLabel}>一言コメント<textarea maxLength={60} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /><small>{comment.length}/60文字</small></label>
              <button className={styles.primary} onClick={() => void saveReview()}>{selected.reviewedAt ? '確認内容を保存' : '確認する'}</button>
            </>}
            <div className={styles.sheetActions}>
              <button className={styles.outline} onClick={() => { setEntry(selected); setSelected(null); }}>この宿題を編集</button>
              <button className={styles.outline} onClick={() => { const rest = { ...selected, text: '', isRestDay: true, done: false }; setEntry(rest); setSelected(null); void saveEntry(rest); }}>お休みにする</button><button className={styles.outline} onClick={() => void removeEntry(selected.date)}>宿題を削除</button>
            </div>
          </> : selectedCanComplete && <button className={selected.done ? styles.outline : styles.primary} onClick={() => void toggleCompletion(selected)}>{selected.done ? '完了を取り消す' : '完了にする'}</button>}
          {role === '生徒' && selected.reviewedAt && <section className={styles.review}><p className={styles.stamp}>{selected.stamp}</p>{selected.comment && <p>{selected.comment}</p>}</section>}
        </section>
      </div>}
    </main>
  );
}

