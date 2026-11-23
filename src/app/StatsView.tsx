'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  LoaderCircle,
  PieChart,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayEntry } from './TimelineView';
import CountUp from '../components/CountUp/CountUp';
import AchievementDeck from '../components/AchievementDeck';
import GlideSelect from '../components/GlideSelect/GlideSelect';
import { formatDuration } from '../lib/format-duration';
import { classifySubject, OTHER_SUBJECT, SUBJECT_RULES } from '../lib/subject-classifier';

interface StatsViewProps {
  entries: Record<string, DayEntry>;
  today: string;
  onRequestAllData?: () => void;
  hasLoadedAll?: boolean;
  loadingAll?: boolean;
}

type PeriodType = 'this-month' | 'last-month' | 'last-30' | 'all';

interface SubjectStat {
  name: string;
  color: string;
  minutes: number;
  count: number;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
}

export default function StatsView({
  entries,
  today,
  onRequestAllData,
  hasLoadedAll,
  loadingAll,
}: StatsViewProps) {
  const [period, setPeriod] = useState<PeriodType>('this-month');

  const currentMonth = today ? today.slice(0, 7) : '';
  const lastMonth = useMemo(() => {
    if (!currentMonth) return '';
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [currentMonth]);

  // 選択された期間に含まれる日付一覧とエントリー
  const { periodDates, periodEntries } = useMemo(() => {
    if (!today) return { periodDates: [], periodEntries: [] };

    let start = '';
    let end = today;

    if (period === 'this-month') {
      start = `${currentMonth}-01`;
    } else if (period === 'last-month') {
      const [y, m] = lastMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      start = `${lastMonth}-01`;
      end = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;
    } else if (period === 'last-30') {
      start = offsetDate(today, -29);
      end = today;
    } else {
      // all: 全登録データから最古の日付を取得
      const dates = Object.keys(entries).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      start = dates[0] || `${currentMonth}-01`;
      end = dates[dates.length - 1] && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
    }

    // start から end までの全日付配列を生成
    const dates: string[] = [];
    let cur = start;
    let safety = 0;
    while (cur <= end && safety < 1000) {
      dates.push(cur);
      cur = offsetDate(cur, 1);
      safety++;
    }

    const filteredEntries = dates.map((date) => entries[date] || { date, sessions: [] });
    return { periodDates: dates, periodEntries: filteredEntries };
  }, [entries, period, today, currentMonth, lastMonth]);

  // 主要サマリーの計算
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let totalSessions = 0;
    let recordedDaysCount = 0;
    let reviewedDaysCount = 0;

    periodEntries.forEach((dayEntry) => {
      const hasRecord = dayEntry.sessions && dayEntry.sessions.length > 0;
      if (hasRecord) {
        recordedDaysCount++;
        totalSessions += dayEntry.sessions.length;
        totalMinutes += dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      }
      if (dayEntry.review?.reviewedAt) {
        reviewedDaysCount++;
      }
    });

    const totalDaysInPeriod = periodDates.length || 1;
    const studyRate = Math.round((recordedDaysCount / totalDaysInPeriod) * 100);
    const avgMinutesPerStudyDay = recordedDaysCount > 0 ? Math.round(totalMinutes / recordedDaysCount) : 0;
    const avgMinutesPerDay = Math.round(totalMinutes / totalDaysInPeriod);

    return {
      totalMinutes,
      totalSessions,
      recordedDaysCount,
      reviewedDaysCount,
      totalDaysInPeriod,
      studyRate,
      avgMinutesPerStudyDay,
      avgMinutesPerDay,
    };
  }, [periodEntries, periodDates]);

  // ストリーク（連続記録日数）の計算（全期間エントリーから計算）
  const streakInfo = useMemo(() => {
    if (!today) return { current: 0, longest: 0 };
    const dates = Object.keys(entries)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && entries[d]?.sessions?.length > 0)
      .sort();

    const recordSet = new Set(dates);

    // 現在のストリーク
    let curStreak = 0;
    let checkDate = today;
    // 今日まだ記録がなければ昨日のストリークを見る
    if (!recordSet.has(checkDate)) {
      checkDate = offsetDate(today, -1);
    }
    while (recordSet.has(checkDate)) {
      curStreak++;
      checkDate = offsetDate(checkDate, -1);
    }

    // 最長ストリーク
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate = '';

    dates.forEach((d) => {
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const expected = offsetDate(prevDate, 1);
        if (d === expected) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDate = d;
    });

    return { current: curStreak, longest: Math.max(longestStreak, curStreak) };
  }, [entries, today]);

  // 曜日別の学習時間と日数
  const dayOfWeekStats = useMemo(() => {
    const daysName = ['日', '月', '火', '水', '木', '金', '土'];
    const distribution = daysName.map((name) => ({ name, minutes: 0, count: 0 }));

    periodEntries.forEach((dayEntry) => {
      if (!dayEntry.sessions || dayEntry.sessions.length === 0) return;
      const d = new Date(`${dayEntry.date}T12:00:00+09:00`);
      const dayIdx = d.getDay();
      const mins = dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      distribution[dayIdx].minutes += mins;
      distribution[dayIdx].count += 1;
    });

    const maxMins = Math.max(...distribution.map((d) => d.minutes), 1);
    return { distribution, maxMins };
  }, [periodEntries]);

  // 教科・キーワード別の内訳
  const subjectStats = useMemo(() => {
    const counts: Record<string, { minutes: number; count: number; color: string }> = {};
    SUBJECT_RULES.forEach((r) => {
      counts[r.name] = { minutes: 0, count: 0, color: r.color };
    });
    counts[OTHER_SUBJECT.name] = { minutes: 0, count: 0, color: OTHER_SUBJECT.color };

    periodEntries.forEach((dayEntry) => {
      dayEntry.sessions?.forEach((session) => {
        const subject = classifySubject(session.content);
        counts[subject.name].minutes += session.minutes || 0;
        counts[subject.name].count += 1;
      });
    });

    const result: SubjectStat[] = Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.minutes - a.minutes);

    const totalSubjectMinutes = result.reduce((sum, s) => sum + s.minutes, 0) || 1;

    return { list: result, totalMinutes: totalSubjectMinutes };
  }, [periodEntries]);

  // Recharts 用データ変換
  const chartData = useMemo(() => {
    return periodEntries.map((dayEntry) => {
      const minutes = dayEntry.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
      const monthNum = Number(dayEntry.date.slice(5, 7));
      const dayNum = Number(dayEntry.date.slice(8, 10));
      return {
        date: dayEntry.date,
        dayLabel: period === 'all' ? `${monthNum}/${dayNum}` : `${dayNum}`,
        fullLabel: `${monthNum}月${dayNum}日`,
        minutes,
        isReviewed: Boolean(dayEntry.review?.reviewedAt),
        isToday: dayEntry.date === today,
      };
    });
  }, [periodEntries, period, today]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 期間選択バー（React Bits GlideSelect） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted">集計期間</span>
          <GlideSelect
            ariaLabel="集計期間を選択"
            value={period}
            onChange={(val) => setPeriod(val as PeriodType)}
            size="md"
            radius={12}
            menuWidth={172}
            surfaceColor="var(--card)"
            highlightColor="var(--card-subtle)"
            textColor="var(--text)"
            accentColor="var(--primary)"
            options={[
              { value: 'this-month', label: '今月' },
              { value: 'last-month', label: '先月' },
              { value: 'last-30', label: '直近30日' },
              { value: 'all', label: '全期間' },
            ]}
          />
        </div>

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

      {/* エディトリアル・学習サマリー（外枠なし） */}
      <section className="rounded-2xl bg-card p-5 sm:p-6 shadow-card">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* 主役: 総学習時間 */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-line/60 pb-5 lg:pb-0 lg:pr-6">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">
              累計学習時間
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-numbers tracking-tight text-ink">
                {stats.totalMinutes >= 60 ? (
                  <>
                    <CountUp to={Math.floor(stats.totalMinutes / 60)} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1 mr-2">時間</span>
                    <CountUp to={stats.totalMinutes % 60} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1">分</span>
                  </>
                ) : (
                  <>
                    <CountUp to={stats.totalMinutes} duration={0.7} trigger="load" />
                    <span className="text-base sm:text-lg font-bold text-muted ml-1">分</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* 脇役: 4分割メトリクス */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">勉強した日</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums">
                {stats.recordedDaysCount}
                <span className="text-xs font-normal text-muted ml-1">/ {stats.totalDaysInPeriod}日</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">記録率 {stats.studyRate}%</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">継続ストリーク</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums flex items-baseline gap-1">
                <span>{streakInfo.current}</span>
                <span className="text-xs font-normal text-muted">日</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">最長: {streakInfo.longest}日</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">勉強日の平均</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-ink tabular-nums">
                {stats.avgMinutesPerStudyDay}
                <span className="text-xs font-normal text-muted ml-1">分</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">全体 {stats.avgMinutesPerDay}分/日</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-muted block mb-1">先生の確認</span>
              <div className="text-xl sm:text-2xl font-bold font-numbers text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats.reviewedDaysCount}
                <span className="text-xs font-normal text-muted ml-1">日分</span>
              </div>
              <p className="text-[10px] text-muted font-numbers mt-0.5 m-0">
                {stats.recordedDaysCount > 0 ? `確認率 ${Math.round((stats.reviewedDaysCount / stats.recordedDaysCount) * 100)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 学習時間の推移チャート（Recharts） */}
      <section className="rounded-2xl bg-card p-4 sm:p-6 shadow-card w-full min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <h3 className="text-base font-bold text-ink flex items-center gap-2 m-0">
            <BarChart3 size={17} className="text-primary" />
            <span>日別の学習時間推移</span>
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary inline-block" />
              学習時間
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-reward inline-block" />
              確認済み
            </span>
          </div>
        </div>

        <div className="w-full h-56 sm:h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              barCategoryGap="22%"
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--line)"
                opacity={0.85}
              />
              <XAxis
                dataKey="dayLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-sub)', fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-sub)', fontSize: 11 }}
                unit="分"
                width={52}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--card-subtle)', opacity: 0.65, radius: 6 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as (typeof chartData)[number];
                  return (
                    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-card text-xs">
                      <div className="font-bold text-ink mb-0.5">{item.fullLabel}</div>
                      <div className="flex items-center gap-2 font-numbers">
                        <span className="font-extrabold text-primary-ink text-sm">
                          {formatDuration(item.minutes)}
                        </span>
                        {item.isReviewed && (
                          <span className="px-1.5 py-0.5 rounded bg-reward-soft text-reward-ink text-[10px] font-bold">
                            確認済
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={24}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={
                      entry.minutes === 0
                        ? 'var(--line)'
                        : entry.isReviewed
                        ? 'var(--reward)'
                        : 'var(--primary)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2カラム構成: 曜日別分布 & 教科別内訳 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 曜日別の学習傾向 */}
        <section className="rounded-2xl bg-card p-4 sm:p-5 shadow-card">
          <h3 className="text-base font-bold text-ink flex items-center gap-2 mb-1 m-0">
            <Calendar size={17} className="text-primary" />
            <span>曜日ごとの学習傾向</span>
          </h3>
          <p className="text-xs text-muted mb-4 m-0">
            どの曜日に勉強時間が多く確保できているかの集計です。
          </p>

          <div className="flex flex-col gap-3">
            {dayOfWeekStats.distribution.map((dow, index) => {
              const percent = dayOfWeekStats.maxMins > 0 ? Math.round((dow.minutes / dayOfWeekStats.maxMins) * 100) : 0;
              const isWeekend = index === 0 || index === 6;

              return (
                <div key={dow.name} className="flex items-center gap-3 text-xs">
                  <span
                    className={`w-6 font-bold text-center ${
                      index === 0 ? 'text-reward-ink' : index === 6 ? 'text-primary-ink' : 'text-ink'
                    }`}
                  >
                    {dow.name}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-card-subtle overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isWeekend ? 'bg-reward' : 'bg-primary'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-20 text-right font-numbers font-semibold text-muted tabular-nums whitespace-nowrap">
                    {formatDuration(dow.minutes)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 教科・学習テーマ別の内訳 */}
        <section className="rounded-2xl bg-card p-4 sm:p-5 shadow-card">
          <h3 className="text-base font-bold text-ink flex items-center gap-2 mb-1 m-0">
            <PieChart size={17} className="text-primary" />
            <span>教科・学習テーマの内訳</span>
          </h3>
          <p className="text-xs text-muted mb-4 m-0">
            記録された勉強内容からキーワードを自動分類しています。
          </p>

          {subjectStats.list.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted py-6 text-center">
              この期間の記録がありません。
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {subjectStats.list.map((sub) => {
                const percent = Math.round((sub.minutes / subjectStats.totalMinutes) * 100);
                return (
                  <div key={sub.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5 text-ink">
                        <span className="size-2 rounded-full inline-block" style={{ backgroundColor: sub.color }} />
                        {sub.name}
                      </span>
                      <span className="text-muted font-numbers text-[11px]">
                        <strong className="text-ink">{formatDuration(sub.minutes)}</strong>（{sub.count}回 / {percent}%）
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-card-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: sub.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* コレクティブル実績カード図鑑（React Bits FlipCard） */}
      <AchievementDeck
        entries={entries}
        longestStreak={streakInfo.longest}
        subjectRules={SUBJECT_RULES}
      />
    </div>
  );
}