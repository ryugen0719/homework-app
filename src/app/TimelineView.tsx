'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  LayoutGrid,
  ListFilter,
  LoaderCircle,
  MessageCircle,
  Search,
  X,
} from 'lucide-react';
import { formatDuration } from '../lib/format-duration';
import GlideSelect from '../components/GlideSelect/GlideSelect';
import SubjectBadge from '../components/SubjectBadge';

export type StudySession = {
  id: string;
  content: string;
  minutes?: number;
  evidencePath?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Review = {
  comment?: string;
  reviewedAt?: string;
};

export type DayEntry = {
  date: string;
  sessions: StudySession[];
  review?: Review;
};

interface TimelineViewProps {
  entries: Record<string, DayEntry>;
  role?: '生徒' | '先生';
  token: string;
  today: string;
  onSelectDate: (date: string) => void;
  onOpenPreview: (src: string, label: string) => void;
  onRequestAllData?: () => void;
  hasLoadedAll?: boolean;
  loadingAll?: boolean;
}

function formatDateFull(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T12:00:00+09:00`);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
    return {
      year: d.getFullYear(),
      month,
      day,
      weekday,
      display: `${month}月${day}日（${weekday}）`,
    };
  } catch {
    return { year: 0, month: 0, day: 0, weekday: '', display: dateStr };
  }
}

function formatTime(isoString?: string) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * タイムライン専用のインライン写真コンポーネント
 * クリックなしでも写真が美しく見え、タップでフルサイズ拡大可能
 */
function TimelineInlinePhoto({
  pathname,
  token,
  label,
  onOpenPreview,
}: {
  pathname: string;
  token: string;
  label: string;
  onOpenPreview: (src: string, label: string) => void;
}) {
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');

  useEffect(() => {
    let objectUrl = '';
    let active = true;

    fetch(`/api/evidence?pathname=${encodeURIComponent(pathname)}`, {
      headers: { 'x-app-token': token },
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setSrc(objectUrl);
          setStatus('success');
        }
      })
      .catch(() => {
        if (active) {
          setStatus('failed');
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pathname, token]);

  if (status === 'failed') {
    return (
      <div className="rounded-xl border border-line bg-card-subtle p-3 text-xs text-muted flex items-center gap-2">
        <ImageIcon size={14} className="opacity-50" />
        <span>写真を読み込めませんでした</span>
      </div>
    );
  }

  if (status === 'loading' || !src) {
    return (
      <div className="w-full h-44 rounded-xl bg-card-subtle flex items-center justify-center text-xs text-muted border border-line" role="status">
        <span className="flex items-center gap-1.5">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          写真読み込み中…
        </span>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-card-subtle/50 transition-all hover:border-line-strong hover:shadow-card">
      <img
        src={src}
        alt={label}
        className="w-full max-h-80 object-cover object-center cursor-pointer transition-transform duration-300 group-hover:scale-[1.01]"
        onClick={() => onOpenPreview(src, label)}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-3 pt-6 flex items-center justify-between text-white pointer-events-none">
        <span className="text-xs font-medium truncate max-w-[80%] drop-shadow-sm">{label}</span>
        <span className="text-[11px] font-semibold bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20 pointer-events-auto cursor-pointer" onClick={() => onOpenPreview(src, label)}>
          拡大表示
        </span>
      </div>
    </div>
  );
}

export default function TimelineView({
  entries,
  role = '生徒',
  token,
  today,
  onSelectDate,
  onOpenPreview,
  onRequestAllData,
  hasLoadedAll,
  loadingAll,
}: TimelineViewProps) {
  const [displayMode, setDisplayMode] = useState<'stream' | 'gallery'>('stream');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false);
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // 全期間の月一覧
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    Object.keys(entries).forEach((date) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        months.add(date.slice(0, 7));
      }
    });
    if (today) {
      months.add(today.slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }, [entries, today]);

  // すべての有効なエントリーを日付順に整理
  const allDaysWithRecords = useMemo(() => {
    const days: DayEntry[] = [];
    Object.values(entries).forEach((dayData) => {
      if (dayData && dayData.sessions && dayData.sessions.length > 0) {
        days.push(dayData);
      }
    });
    return days;
  }, [entries]);

  // フィルター適用後の日別エントリー
  const filteredDays = useMemo(() => {
    let result = allDaysWithRecords;

    if (monthFilter !== 'all') {
      result = result.filter((day) => day.date.startsWith(monthFilter));
    }

    if (onlyReviewed) {
      result = result.filter((day) => Boolean(day.review?.reviewedAt));
    }

    if (onlyUnreviewed) {
      result = result.filter((day) => !day.review?.reviewedAt);
    }

    if (onlyWithPhoto) {
      result = result.filter((day) => day.sessions.some((s) => Boolean(s.evidencePath)));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((day) => {
        const matchesSession = day.sessions.some((s) => s.content.toLowerCase().includes(q));
        const matchesComment = day.review?.comment?.toLowerCase().includes(q);
        return matchesSession || matchesComment;
      });
    }

    return result.sort((a, b) => {
      return sortOrder === 'desc'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date);
    });
  }, [allDaysWithRecords, monthFilter, onlyReviewed, onlyUnreviewed, onlyWithPhoto, searchQuery, sortOrder]);

  // 統計サマリー
  const totalSessions = useMemo(() => {
    return filteredDays.reduce((acc, d) => acc + d.sessions.length, 0);
  }, [filteredDays]);

  const totalMinutes = useMemo(() => {
    return filteredDays.reduce((acc, d) => {
      return acc + d.sessions.reduce((sAcc, s) => sAcc + (s.minutes || 0), 0);
    }, 0);
  }, [filteredDays]);

  // 写真アルバム用の写真アイテム一覧
  const allPhotos = useMemo(() => {
    const items: Array<{
      date: string;
      content: string;
      minutes?: number;
      evidencePath: string;
      reviewComment?: string;
    }> = [];

    filteredDays.forEach((day) => {
      day.sessions.forEach((s) => {
        if (s.evidencePath) {
          items.push({
            date: day.date,
            content: s.content,
            minutes: s.minutes,
            evidencePath: s.evidencePath,
            reviewComment: day.review?.comment,
          });
        }
      });
    });

    return items;
  }, [filteredDays]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* タイムライン ツールバー（読みやすいカラム幅に整理） */}
      <div className="space-y-3 max-w-3xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 表示モード切り替え: ストリーム / 写真アルバム */}
          <div className="inline-flex p-1 rounded-xl bg-card-subtle text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDisplayMode('stream')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                displayMode === 'stream'
                  ? 'bg-card text-ink shadow-subtle'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <ListFilter size={14} />
              <span>ノート</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('gallery')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                displayMode === 'gallery'
                  ? 'bg-card text-ink shadow-subtle'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <LayoutGrid size={14} />
              <span>写真 ({allPhotos.length})</span>
            </button>
          </div>

          {/* 全期間データ読み込みボタン */}
          {!hasLoadedAll && onRequestAllData && (
            <button
              type="button"
              onClick={onRequestAllData}
              disabled={loadingAll}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink bg-primary-soft hover:bg-primary/15 px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {loadingAll && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
              <span>{loadingAll ? '読み込み中…' : '全期間を取得'}</span>
            </button>
          )}
        </div>

        {/* フィルター＆検索バー */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          {/* 検索入力 */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="勉強内容や先生の言葉を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-line bg-card text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 shadow-subtle transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1"
                aria-label="検索条件をクリア"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 月選択（React Bits GlideSelect） */}
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-muted shrink-0" />
            <GlideSelect
              ariaLabel="月で絞り込み"
              value={monthFilter}
              onChange={(val) => setMonthFilter(val)}
              size="md"
              radius={12}
              menuWidth={184}
              surfaceColor="var(--card)"
              highlightColor="var(--card-subtle)"
              textColor="var(--text)"
              accentColor="var(--primary)"
              options={[
                {
                  value: 'all',
                  label: 'すべての期間',
                  tag: `${allDaysWithRecords.length}日`,
                },
                ...availableMonths.map((m) => {
                  const [y, mo] = m.split('-');
                  const count = allDaysWithRecords.filter((d) => d.date.startsWith(m)).length;
                  return {
                    value: m,
                    label: `${y}年 ${Number(mo)}月`,
                    tag: count > 0 ? `${count}日` : undefined,
                  };
                }),
              ]}
            />
          </div>

          {/* 写真ありフィルター */}
          <button
            type="button"
            onClick={() => setOnlyWithPhoto(!onlyWithPhoto)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer active:scale-95 ${
              onlyWithPhoto
                ? 'bg-primary text-white shadow-subtle'
                : 'bg-card-subtle/80 text-muted hover:text-ink hover:bg-card-subtle'
            }`}
          >
            <ImageIcon size={13} />
            写真あり
          </button>

          {/* 先生専用: 未確認のみフィルター */}
          {role === '先生' && (
            <button
              type="button"
              onClick={() => {
                const next = !onlyUnreviewed;
                setOnlyUnreviewed(next);
                if (next) setOnlyReviewed(false);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer active:scale-95 ${
                onlyUnreviewed
                  ? 'bg-amber-600 text-white shadow-subtle'
                  : 'bg-card-subtle/80 text-muted hover:text-ink hover:bg-card-subtle'
              }`}
            >
              <Clock size={13} />
              未確認のみ
            </button>
          )}

          {/* 先生確認済みフィルター */}
          <button
            type="button"
            onClick={() => {
              const next = !onlyReviewed;
              setOnlyReviewed(next);
              if (next) setOnlyUnreviewed(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer active:scale-95 ${
              onlyReviewed
                ? 'bg-reward text-white shadow-subtle'
                : 'bg-card-subtle/80 text-muted hover:text-ink hover:bg-card-subtle'
            }`}
          >
            <CheckCircle2 size={13} />
            {role === '先生' ? '確認済み' : '先生の返信あり'}
          </button>

          {/* ソート切り替え */}
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-card-subtle/80 text-muted hover:text-ink hover:bg-card-subtle transition-all cursor-pointer ml-auto active:scale-95"
            title={sortOrder === 'desc' ? '新しい順（最新が上）' : '古い順（昔から）'}
          >
            <ArrowDownUp size={13} />
            {sortOrder === 'desc' ? '新しい順' : '古い順'}
          </button>
        </div>

        {/* 絞り込み結果サマリー */}
        <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted flex-wrap">
          <div>
            <span>
              該当記録: <strong className="text-ink font-numbers font-bold">{filteredDays.length}</strong> 日分（{totalSessions} 件）
            </span>
            <span className="mx-2 opacity-40">|</span>
            <span>
              合計: <strong className="text-ink font-numbers font-bold">{formatDuration(totalMinutes)}</strong>
            </span>
          </div>

          {(searchQuery || monthFilter !== 'all' || onlyWithPhoto || onlyReviewed || onlyUnreviewed) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setMonthFilter('all');
                setOnlyWithPhoto(false);
                setOnlyReviewed(false);
                setOnlyUnreviewed(false);
              }}
              className="text-primary hover:underline font-semibold"
            >
              条件をクリア
            </button>
          )}
        </div>
      </div>

      {/* コンテンツエリア */}
      {filteredDays.length === 0 ? (
        <div className="max-w-3xl mx-auto w-full rounded-2xl bg-card p-10 sm:p-14 text-center shadow-card">
          <Clock size={40} className="mx-auto mb-3 opacity-40 text-muted" />
          <h3 className="text-base sm:text-lg font-bold text-ink mb-2">記録が見つかりませんでした</h3>
          <p className="text-xs sm:text-sm max-w-md mx-auto mb-6 text-ink/75 leading-relaxed">
            {allDaysWithRecords.length === 0
              ? role === '先生'
                ? 'この生徒の勉強記録はまだありません。'
                : 'まだ勉強記録がありません。カレンダー画面から今日の学びを記録してみましょう！'
              : '検索条件に一致する記録がありません。フィルターを変更してみてください。'}
          </p>
          {today && role !== '先生' && (
            <button
              type="button"
              onClick={() => onSelectDate(today)}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-primary text-white text-sm sm:text-base font-bold shadow-subtle hover:bg-primary-hover transition-all active:scale-95 cursor-pointer"
            >
              <Calendar size={18} className="text-white shrink-0" />
              <span className="tracking-wide">カレンダーで今日の勉強を記録する</span>
            </button>
          )}
        </div>
      ) : displayMode === 'gallery' ? (
        /* 写真アルバムギャラリーモード */
        allPhotos.length === 0 ? (
          <div className="rounded-2xl bg-card p-12 text-center text-muted shadow-card">
            <ImageIcon size={36} className="mx-auto mb-3 opacity-30 text-muted" />
            <h3 className="text-sm sm:text-base font-bold text-ink mb-1">提出された写真がありません</h3>
            <p className="text-xs sm:text-sm max-w-sm mx-auto">
              カレンダーから勉強記録を保存する際に写真（ノートやワーク）を添えると、ここにアルバムとしてコレクションされます。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allPhotos.map((photo, pIdx) => {
              const dInfo = formatDateFull(photo.date);
              return (
                <div
                  key={`${photo.evidencePath}-${pIdx}`}
                  className="rounded-2xl bg-card p-3 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between"
                >
                  <div>
                    <TimelineInlinePhoto
                      pathname={photo.evidencePath}
                      token={token}
                      label={photo.content}
                      onOpenPreview={onOpenPreview}
                    />
                    <div className="mt-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-semibold text-ink line-clamp-2 m-0 min-w-0">
                          {photo.content}
                        </p>
                        <SubjectBadge content={photo.content} className="mt-0.5" />
                      </div>
                      {photo.reviewComment && (
                        <p className="mt-1.5 text-xs text-reward-ink bg-reward-soft/55 p-2 rounded-lg line-clamp-2 m-0">
                          先生: {photo.reviewComment}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-xs text-muted">
                    <span className="font-numbers font-medium">{dInfo.display}</span>
                    <button
                      type="button"
                      onClick={() => onSelectDate(photo.date)}
                      className="text-primary-ink hover:underline font-bold flex items-center gap-1 text-[11px]"
                    >
                      <ExternalLink size={11} />
                      カレンダー
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ストリーム（交換ノート）モード */
        <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full">
          {filteredDays.map((dayItem) => {
            const dateInfo = formatDateFull(dayItem.date);
            const isToday = dayItem.date === today;
            const dayMinutes = dayItem.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
            const hasReview = Boolean(dayItem.review?.reviewedAt && dayItem.review?.comment);

            return (
              <article
                key={dayItem.date}
                className="rounded-2xl bg-card shadow-card overflow-hidden transition-all"
              >
                {/* 日付ヘッダーバー */}
                <div className="bg-[#E5ECF4] dark:bg-card-subtle/60 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-primary shrink-0" />
                    <span className="font-numbers text-sm sm:text-base font-bold text-ink tracking-tight">
                      {dateInfo.year}年 {dateInfo.display}
                    </span>
                    {isToday && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary text-white">
                        今日
                      </span>
                    )}
                    {dayItem.review?.reviewedAt && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-reward-soft text-reward-ink">
                        <Award size={11} />
                        確認済み
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {dayMinutes > 0 && (
                      <span className="text-xs font-semibold text-muted font-numbers">
                        計 {formatDuration(dayMinutes)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectDate(dayItem.date)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-ink hover:underline transition-colors cursor-pointer"
                      title="この日をカレンダーで開いて編集・確認する"
                    >
                      <span>カレンダーで開く</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>

                {/* 生徒の記録エリア（左に時刻・学習時間、右に内容で対応関係を明確化） */}
                <div className="divide-y divide-line/70 px-4 sm:px-5">
                  {dayItem.sessions.map((session, sIndex) => {
                    const sessionTime = formatTime(session.createdAt);
                    return (
                      <div
                        key={session.id || sIndex}
                        className="py-3.5 sm:py-4 grid grid-cols-1 sm:grid-cols-[104px_minmax(0,1fr)] gap-1.5 sm:gap-4 items-start"
                      >
                        {/* 時刻・学習時間（モバイルは横並び、PCは左列に集約） */}
                        <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1.5 pt-0.5">
                          {sessionTime ? (
                            <span className="text-xs sm:text-sm font-bold font-numbers text-ink tabular-nums">
                              {sessionTime}
                            </span>
                          ) : !session.minutes ? (
                            <span className="text-xs font-medium text-muted" aria-hidden="true">
                              •
                            </span>
                          ) : null}
                          {session.minutes ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-soft text-primary-ink font-numbers tabular-nums">
                              <Clock size={11} />
                              {formatDuration(session.minutes)}
                            </span>
                          ) : null}
                        </div>

                        {/* 勉強内容と提出写真（教科バッジは内容の横に配置して縦スペースを消費しない） */}
                        <div className="min-w-0 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2.5">
                            <p className="text-sm sm:text-[15px] leading-relaxed text-ink whitespace-pre-wrap break-words m-0 font-normal min-w-0">
                              {session.content}
                            </p>
                            <SubjectBadge content={session.content} className="mt-1" />
                          </div>

                          {session.evidencePath && (
                            <div className="mt-0.5">
                              <TimelineInlinePhoto
                                pathname={session.evidencePath}
                                token={token}
                                label={session.content}
                                onOpenPreview={onOpenPreview}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 先生からの返信スレッド（交換ノート吹き出し） */}
                {hasReview && (
                  <div className="bg-reward-soft/30 border-t border-reward-line/30 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-reward-ink">
                        <span className="size-6 rounded-full bg-reward text-white inline-flex items-center justify-center">
                          <MessageCircle size={13} />
                        </span>
                        <span>先生からのメッセージ</span>
                      </div>
                      <span className="text-[11px] text-muted font-numbers">
                        {formatTime(dayItem.review?.reviewedAt)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-ink m-0 whitespace-pre-wrap pl-8">
                      {dayItem.review?.comment}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
