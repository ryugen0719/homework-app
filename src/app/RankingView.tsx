'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Crown,
  Flag,
  Flame,
  History,
  Info,
  Maximize2,
  Play,
  RefreshCw,
} from 'lucide-react';
import StudentAvatar from '../components/StudentAvatar';
import CountUp from '../components/CountUp/CountUp';
import GlideSelect from '../components/GlideSelect/GlideSelect';
import DateRangePicker from '../components/DateRangePicker';
import RaceFullscreenOverlay from '../components/RaceFullscreenOverlay';
import { formatDuration } from '../lib/format-duration';
import {
  formatTimerClock,
  getLapProgress,
  LiveMemberComputed,
  LiveTimerState,
} from '../hooks/useLiveTimer';

type RankingPeriod =
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-30'
  | 'all'
  | 'custom';

type CompareMetric = 'points' | 'minutes';

interface RankingMember {
  studentId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  weekMinutes: number;
  weekStreakBonus: number;
  weekPhotoBonus?: number;
  weekPoints: number;
  currentStreak?: number;
  rank: number;
  isMe?: boolean;
  isOptedOut?: boolean;
}

interface RecentWeekSummary {
  weekStart: string;
  weekEnd: string;
  totalPoints: number;
  participantCount: number;
  winner: {
    studentId: string;
    displayName: string;
    color: string;
    avatarUrl?: string;
    weekPoints: number;
    isTied?: boolean;
  } | null;
  myRank?: number;
  myPoints?: number;
  myTied?: boolean;
}

interface RankingData {
  group: {
    id: string;
    name: string;
    inviteCode?: string;
  };
  period?: RankingPeriod;
  rangeStart?: string;
  rangeEnd?: string;
  isWeeklyMode?: boolean;
  targetWeekStart: string;
  currentWeekStart?: string;
  isCurrentWeek?: boolean;
  maxPoints: number;
  members: RankingMember[];
  recentWeeks?: RecentWeekSummary[];
  currentUser: {
    role: 'teacher' | 'student';
    studentId?: string;
    rankingOptOut?: boolean;
  };
}

interface RankedStanding extends RankingMember {
  metricValue: number;
  computedRank: number;
  isTied: boolean;
  hasScore: boolean;
}

interface RankingViewProps {
  token: string;
  role: '生徒' | '先生';
  currentStudentId?: string;
  refreshKey?: number;
  liveMembers?: LiveMemberComputed[];
  myTimer?: LiveTimerState | null;
  myElapsedSec?: number;
  liveBusy?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onStartLive?: () => void;
  onPauseLive?: () => void;
  onResumeLive?: () => void;
  onFinishLive?: () => void;
}

const PERIOD_OPTIONS = [
  { value: 'this-week', label: '今週' },
  { value: 'last-week', label: '先週' },
  { value: 'this-month', label: '今月' },
  { value: 'last-month', label: '先月' },
  { value: 'last-30', label: '直近30日' },
  { value: 'all', label: '全期間' },
  { value: 'custom', label: '期間を指定' },
] as const;

const INITIAL_HISTORY_COUNT = 4;

function todayJstStr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function offsetDateStr(dateStr: string, offsetDays: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
}

function formatRangeShort(start?: string, end?: string): string {
  if (!start) return '';
  const s = `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}`;
  if (!end || start === end) return s;
  const e = `${Number(end.slice(5, 7))}/${Number(end.slice(8, 10))}`;
  return `${s}〜${e}`;
}

function formatWeekRange(weekStart: string): string {
  if (!weekStart) return '';
  return formatRangeShort(weekStart, offsetDateStr(weekStart, 6));
}

function formatRankText(rank: number, isTied: boolean, hasAnyScore: boolean): string {
  if (!hasAnyScore) return '—';
  return isTied ? `${rank}位タイ` : `${rank}位`;
}

function computeStandings(members: RankingMember[], metric: CompareMetric): RankedStanding[] {
  const getVal = (m: RankingMember) => (metric === 'minutes' ? m.weekMinutes : m.weekPoints);
  const sorted = [...members].sort((a, b) => {
    const diff = getVal(b) - getVal(a);
    if (diff !== 0) return diff;
    return b.weekPoints - a.weekPoints;
  });

  let currentRank = 1;
  let prevVal = -1;
  const withRanks = sorted.map((m, index) => {
    const val = getVal(m);
    if (index === 0) {
      currentRank = 1;
      prevVal = val;
    } else if (val < prevVal) {
      currentRank = index + 1;
      prevVal = val;
    }
    return {
      ...m,
      metricValue: val,
      computedRank: currentRank,
      hasScore: val > 0,
    };
  });

  return withRanks.map((m) => ({
    ...m,
    isTied: withRanks.filter((other) => other.computedRank === m.computedRank).length > 1,
  }));
}

/**
 * トラックの表示基準値（スケール）と目標値を明確に分離して算出する
 * - 目標値（goalValue）を超過しても上限なしで加算され、バーは安全にスケール内に収まる
 * - 進捗率（%）とバー位置は必ず同一の scaleValue を基準にする
 */
function computeTrackScale(
  maxVal: number,
  metric: CompareMetric,
  period: RankingPeriod
): { scaleValue: number; goalValue: number; isGoalExceeded: boolean } {
  const isWeekly = period === 'this-week' || period === 'last-week';
  const goalValue =
    metric === 'minutes'
      ? isWeekly
        ? 120
        : 360
      : isWeekly
        ? 100
        : 300;

  if (maxVal <= goalValue) {
    return { scaleValue: goalValue, goalValue, isGoalExceeded: false };
  }

  const step = metric === 'minutes' ? 60 : 50;
  const scaleValue = Math.ceil(maxVal / step) * step;
  return { scaleValue, goalValue, isGoalExceeded: true };
}

// クエリ単位の簡易メモリキャッシュ
const rankingCache = new Map<string, RankingData>();

function SummaryCardSkeleton() {
  return (
    <section
      aria-label="成績サマリーを読み込み中"
      aria-busy="true"
      className="rounded-2xl bg-card p-5 sm:p-6 shadow-card animate-pulse"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 items-end">
        <div>
          <div className="h-3.5 w-16 rounded-md bg-card-subtle mb-2.5" />
          <div className="flex items-baseline gap-2">
            <div className="h-9 w-20 rounded-lg bg-card-subtle" />
            <div className="h-4 w-10 rounded-md bg-card-subtle/80" />
          </div>
        </div>
        <div>
          <div className="h-3.5 w-20 rounded-md bg-card-subtle mb-2.5" />
          <div className="h-9 w-28 rounded-lg bg-card-subtle" />
        </div>
        <div className="sm:border-l sm:border-line/50 sm:pl-6">
          <div className="h-3.5 w-20 rounded-md bg-card-subtle mb-2.5" />
          <div className="h-8 w-24 rounded-lg bg-card-subtle" />
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-line/50 flex flex-wrap items-center gap-5">
        <div className="h-4 w-32 rounded-md bg-card-subtle/85" />
        <div className="h-4 w-36 rounded-md bg-card-subtle/85" />
      </div>
    </section>
  );
}

const SKELETON_TRACK_PCTS = [68, 46, 30, 54, 22] as const;

function RaceTrackSkeleton({ laneCount = 3 }: { laneCount?: number }) {
  const rows = Math.max(2, Math.min(laneCount, 8));
  return (
    <section
      aria-label="クラスレースを読み込み中"
      aria-busy="true"
      className="rounded-2xl bg-card shadow-card overflow-hidden animate-pulse"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[172px_1fr_156px] items-center bg-[#E5ECF4] dark:bg-card-subtle/60 px-4 sm:px-6 py-3">
        <div className="hidden sm:block h-3.5 w-14 rounded-md bg-card-subtle" />
        <div className="flex items-center justify-between px-4 sm:px-5">
          <div className="h-3.5 w-12 rounded-md bg-card-subtle" />
          <div className="h-3.5 w-20 rounded-md bg-card-subtle" />
          <div className="h-3.5 w-24 rounded-md bg-card-subtle" />
        </div>
        <div className="hidden sm:flex justify-end">
          <div className="h-3.5 w-20 rounded-md bg-card-subtle" />
        </div>
      </div>

      <div className="divide-y divide-line/50">
        {Array.from({ length: rows }).map((_, idx) => {
          const pct = SKELETON_TRACK_PCTS[idx % SKELETON_TRACK_PCTS.length];
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[172px_1fr_156px] items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-6 w-9 rounded-lg bg-card-subtle shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-24 rounded-md bg-card-subtle" />
                  <div className="h-3 w-16 rounded-md bg-card-subtle/75" />
                </div>
              </div>

              <div className="px-4 sm:px-5 py-2">
                <div className="relative h-2.5 w-full rounded-full bg-card-subtle/80">
                  <div
                    className="h-full rounded-full bg-card-subtle"
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-8 rounded-full bg-card-subtle ring-2 ring-card"
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-1.5">
                <div className="h-5 w-16 rounded-md bg-card-subtle" />
                <div className="h-3.5 w-20 rounded-md bg-card-subtle/75" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RankingFullSkeleton({ showSummary }: { showSummary: boolean }) {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-label="クラスレースを読み込み中">
      {/* ヘッダースケルトン */}
      <div className="flex flex-wrap items-center justify-between gap-3 animate-pulse">
        <div className="flex items-baseline gap-2.5">
          <div className="h-7 w-36 rounded-lg bg-card-subtle" />
          <div className="h-4 w-24 rounded-md bg-card-subtle/80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-xl bg-card-subtle" />
          <div className="h-9 w-36 rounded-xl bg-card-subtle" />
          <div className="size-9 rounded-xl bg-card-subtle" />
        </div>
      </div>

      {showSummary && <SummaryCardSkeleton />}
      <RaceTrackSkeleton laneCount={3} />

      {/* 履歴スケルトン */}
      <div className="space-y-3 animate-pulse">
        <div className="flex items-center justify-between px-1">
          <div className="h-5 w-40 rounded-md bg-card-subtle" />
          <div className="h-3.5 w-44 rounded-md bg-card-subtle/75 hidden sm:block" />
        </div>
        <div className="rounded-2xl bg-card shadow-card divide-y divide-line/50 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="h-4 w-24 rounded-md bg-card-subtle" />
              <div className="flex items-center gap-2 flex-1">
                <div className="size-6 rounded-full bg-card-subtle" />
                <div className="h-4 w-28 rounded-md bg-card-subtle" />
              </div>
              <div className="h-4 w-16 rounded-md bg-card-subtle" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RankingView({
  token,
  role,
  refreshKey = 0,
  liveMembers = [],
  myTimer = null,
  myElapsedSec = 0,
  liveBusy = false,
  theme = 'light',
  onToggleTheme,
  onStartLive,
  onPauseLive,
  onResumeLive,
  onFinishLive,
}: RankingViewProps) {
  const [period, setPeriod] = useState<RankingPeriod>('this-week');
  const [detailWeekStart, setDetailWeekStart] = useState<string>('');
  const [metric, setMetric] = useState<CompareMetric>('points');
  const [customStart, setCustomStart] = useState<string>(() => offsetDateStr(todayJstStr(), -6));
  const [customEnd, setCustomEnd] = useState<string>(() => todayJstStr());
  const [showAllHistory, setShowAllHistory] = useState(false);

  const queryString = useMemo(() => {
    if (detailWeekStart) {
      return `weekStart=${encodeURIComponent(detailWeekStart)}`;
    }
    if (period === 'custom') {
      return `period=custom&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
    }
    if (period === 'this-week') {
      return '';
    }
    return `period=${encodeURIComponent(period)}`;
  }, [detailWeekStart, period, customStart, customEnd]);

  const cacheKey = `${token}:${queryString || 'current'}`;
  const [fetched, setFetched] = useState<{ key: string; data: RankingData } | null>(() => {
    const cached = rankingCache.get(cacheKey);
    return cached ? { key: cacheKey, data: cached } : null;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [rankDelta, setRankDelta] = useState<number>(0);
  const prevRankRef = useRef<{ key: string; rank: number } | null>(null);

  // 招待参加用モーダル
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinMessage, setJoinMessage] = useState('');

  const cachedForKey = rankingCache.get(cacheKey) ?? null;
  const currentData = fetched?.key === cacheKey ? fetched.data : cachedForKey;
  const displayData = currentData ?? fetched?.data ?? null;
  const isInitialLoading = !displayData && !error;
  const isPeriodLoading = !currentData && Boolean(displayData) && !error;
  const loading = isRefreshing || isInitialLoading || isPeriodLoading;

  const buildUrl = (qs: string) => (qs ? `/api/ranking?${qs}` : '/api/ranking');

  const fetchRanking = async () => {
    try {
      setIsRefreshing(true);
      setError('');
      const res = await fetch(buildUrl(queryString), {
        headers: { 'x-app-token': token },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('ランキングの取得に失敗しました');
      }
      const json: RankingData = await res.json();
      rankingCache.set(cacheKey, json);
      setFetched({ key: cacheKey, data: json });
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch(buildUrl(queryString), {
          headers: { 'x-app-token': token },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('ランキングの取得に失敗しました');
        }
        const json: RankingData = await res.json();
        rankingCache.set(cacheKey, json);
        if (active) {
          setFetched({ key: cacheKey, data: json });
          setError('');
        }
      } catch (e) {
        if (active && !rankingCache.has(cacheKey)) {
          setError(e instanceof Error ? e.message : '取得に失敗しました');
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token, refreshKey, queryString, cacheKey]);

  const todayStr = todayJstStr();
  const isDetailView = Boolean(detailWeekStart);
  const isLiveEligible =
    !isDetailView &&
    (period === 'this-week' ||
      period === 'this-month' ||
      period === 'last-30' ||
      period === 'all' ||
      (period === 'custom' && customEnd >= todayStr));

  const liveByStudentId = useMemo(() => {
    const map = new Map<string, LiveMemberComputed>();
    if (!isLiveEligible) return map;
    for (const m of liveMembers) {
      map.set(m.studentId, m);
    }
    return map;
  }, [liveMembers, isLiveEligible]);

  const activeRunningCount = useMemo(() => {
    if (!isLiveEligible) return 0;
    return liveMembers.filter((m) => m.status === 'running').length;
  }, [liveMembers, isLiveEligible]);

  const standings = useMemo(() => {
    if (!currentData) return [];
    const mergedMembers = isLiveEligible
      ? currentData.members.map((m) => {
          const live = liveByStudentId.get(m.studentId);
          if (!live || live.liveFlooredMinutes <= 0) return m;
          return {
            ...m,
            weekMinutes: m.weekMinutes + live.liveFlooredMinutes,
            weekPoints: m.weekPoints + live.liveFlooredMinutes,
          };
        })
      : currentData.members;
    return computeStandings(mergedMembers, metric);
  }, [currentData, metric, isLiveEligible, liveByStudentId]);

  const myStanding = useMemo(() => standings.find((m) => m.isMe) ?? null, [standings]);
  const myLive = useMemo(
    () => (myStanding ? liveByStudentId.get(myStanding.studentId) ?? null : null),
    [myStanding, liveByStudentId]
  );

  // 同一期間内での順位変動フィードバック
  useEffect(() => {
    if (!myStanding || !myStanding.hasScore) return;
    const prev = prevRankRef.current;
    const trackKey = `${cacheKey}:${metric}`;
    if (prev && prev.key === trackKey && prev.rank !== myStanding.computedRank) {
      const improvement = prev.rank - myStanding.computedRank;
      const timer = window.setTimeout(() => setRankDelta(improvement), 0);
      prevRankRef.current = { key: trackKey, rank: myStanding.computedRank };
      return () => window.clearTimeout(timer);
    }
    prevRankRef.current = { key: trackKey, rank: myStanding.computedRank };
    return undefined;
  }, [myStanding, cacheKey, metric]);

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      setJoinMessage('');
      const res = await fetch('/api/ranking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          action: 'join-group',
          inviteCode: joinCode.trim().toUpperCase(),
        }),
      });
      const resJson = await res.json();
      if (!res.ok) {
        setJoinMessage(resJson.error || '参加に失敗しました');
        return;
      }
      setJoinCode('');
      setShowJoinModal(false);
      void fetchRanking();
    } catch {
      setJoinMessage('通信エラーが発生しました');
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  if (isInitialLoading) {
    return <RankingFullSkeleton showSummary={role === '生徒'} />;
  }

  if (!displayData) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center my-6 shadow-card">
        <p className="text-danger text-sm mb-4">{error || 'データを読み込めませんでした'}</p>
        <button
          type="button"
          onClick={() => void fetchRanking()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-card-subtle hover:bg-card text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw size={14} />
          再読み込み
        </button>
      </div>
    );
  }

  const { group, targetWeekStart, currentWeekStart, recentWeeks = [] } = displayData;
  const isStudent = role === '生徒';
  const hasAnyScore = standings.some((m) => m.hasScore);
  const topVal = standings[0]?.metricValue ?? 0;
  const effectivePeriod: RankingPeriod = isDetailView ? 'last-week' : period;
  const { scaleValue, goalValue, isGoalExceeded } = computeTrackScale(topVal, metric, effectivePeriod);
  const leader = standings[0] ?? null;
  const second = standings[1] ?? null;
  const myBonusTotal = (myStanding?.weekStreakBonus || 0) + (myStanding?.weekPhotoBonus || 0);
  const myGoalReached = Boolean(myStanding && myStanding.hasScore && myStanding.metricValue >= goalValue);

  const formatMetric = (val: number) =>
    metric === 'minutes' ? formatDuration(val) : `${val}pt`;

  // 相手との差（1位は2位とのリード、2位以下は1位との差）
  const getGapInfo = (member: RankedStanding): { label: string; value: string; tone: 'gold' | 'blue' | 'muted' } => {
    if (!hasAnyScore) {
      return { label: '1位との差', value: '—', tone: 'muted' };
    }
    if (member.computedRank === 1) {
      if (member.isTied) {
        return { label: 'トップ状況', value: '同率1位', tone: 'gold' };
      }
      if (second && second.metricValue < member.metricValue) {
        return {
          label: '2位との差',
          value: `+${formatMetric(member.metricValue - second.metricValue)}`,
          tone: 'gold',
        };
      }
      return { label: 'トップ状況', value: '単独1位', tone: 'gold' };
    }
    if (!leader) return { label: '1位との差', value: '—', tone: 'muted' };
    const diff = leader.metricValue - member.metricValue;
    return {
      label: '1位まであと',
      value: formatMetric(diff),
      tone: 'blue',
    };
  };

  // レーン内の簡潔な差テキスト
  const getLaneGapText = (member: RankedStanding, index: number): string | null => {
    if (!hasAnyScore) return null;
    if (member.computedRank === 1) {
      if (member.isTied) return '同率1位';
      if (second && second.metricValue < member.metricValue) {
        return `2位と +${formatMetric(member.metricValue - second.metricValue)}差`;
      }
      return '単独1位';
    }
    const higher = standings
      .slice(0, index)
      .reverse()
      .find((m) => m.metricValue > member.metricValue);
    if (!higher) return null;
    return `${higher.computedRank}位まであと ${formatMetric(higher.metricValue - member.metricValue)}`;
  };

  // ヘッダー表示用の期間テキスト（custom時は日付入力欄と重複させない）
  const periodRangeText = isDetailView
    ? `${formatWeekRange(detailWeekStart)}（週次確定）`
    : period === 'all'
      ? '全期間'
      : currentData?.rangeStart && currentData?.rangeEnd
        ? formatRangeShort(currentData.rangeStart, currentData.rangeEnd)
        : formatWeekRange(targetWeekStart);

  const shiftDetailWeek = (deltaWeeks: number) => {
    const base = detailWeekStart || targetWeekStart || currentWeekStart;
    if (!base) return;
    const next = offsetDateStr(base, deltaWeeks * 7);
    if (currentWeekStart && next >= currentWeekStart) {
      setDetailWeekStart('');
      setPeriod('this-week');
    } else {
      setDetailWeekStart(next);
    }
  };

  const visibleHistoryWeeks = showAllHistory
    ? recentWeeks
    : recentWeeks.slice(0, INITIAL_HISTORY_COUNT);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 過去週の詳細ビュー用ナビゲーションバー */}
      {isDetailView && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 shadow-card">
          <button
            type="button"
            onClick={() => {
              setDetailWeekStart('');
              setPeriod('this-week');
              setRankDelta(0);
            }}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-primary rounded-md px-1 py-0.5"
          >
            <ArrowLeft size={15} />
            <span>今週のレースに戻る</span>
          </button>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftDetailWeek(-1)}
              className="grid size-8 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="前の週を見る"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2.5 text-xs sm:text-sm font-bold font-numbers text-ink tabular-nums">
              {formatWeekRange(detailWeekStart)}
              <span className="ml-1.5 text-[11px] font-semibold text-muted">確定</span>
            </span>
            <button
              type="button"
              onClick={() => shiftDetailWeek(1)}
              className="grid size-8 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="次の週を見る"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ヘッダー：1段目=情報（タイトル・期間・ライブ状況）＋ツール / 2段目=絞り込み操作 */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight m-0 truncate">
                {group.name}
              </h2>
              {activeRunningCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-reward-soft text-reward-ink text-xs font-bold">
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
                    <span className="relative inline-flex rounded-full size-2 bg-reward" />
                  </span>
                  <span>{activeRunningCount}人が勉強中</span>
                </span>
              )}
            </div>
            {/* custom 時は下の期間指定バーと重複させない */}
            {(isDetailView || period !== 'custom') && (
              isPeriodLoading && !isDetailView && period !== 'all' ? (
                <span
                  aria-label="期間を読み込み中"
                  className="mt-1 block h-4 w-24 rounded-md bg-card-subtle animate-pulse"
                />
              ) : (
                <p className="m-0 mt-0.5 text-xs sm:text-sm font-semibold text-muted font-numbers tabular-nums">
                  {periodRangeText}
                </p>
              )
            )}
          </div>

          {/* ツール群（アイコンで静かにまとめる） */}
          <div className="flex items-center gap-0.5 shrink-0">
            {role === '先生' && group.inviteCode && (
              <button
                type="button"
                onClick={() => copyInviteCode(group.inviteCode!)}
                className="inline-flex items-center gap-1.5 mr-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-card-subtle/70 hover:bg-card-subtle text-ink transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                title="招待コードをコピー"
              >
                {copiedInvite ? (
                  <>
                    <Check size={13} className="text-reward" />
                    <span>コピー済</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} className="text-muted" />
                    <span className="font-mono text-primary font-bold">{group.inviteCode}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              className={`grid size-9 place-items-center rounded-xl transition-colors cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${
                showRules
                  ? 'bg-primary-soft text-primary-ink'
                  : 'text-muted hover:text-ink hover:bg-card-subtle'
              }`}
              title="ポイントルール"
              aria-label="ポイントルール"
              aria-expanded={showRules}
            >
              <Info size={16} />
            </button>

            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="grid size-9 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
              title="全画面で表示（勉強中モード）"
              aria-label="全画面表示"
            >
              <Maximize2 size={16} />
            </button>

            <button
              type="button"
              onClick={() => void fetchRanking()}
              className="grid size-9 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
              title="最新の状態に更新"
              aria-label="更新"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 2段目：期間・比較軸 */}
        <div className="flex flex-wrap items-center gap-2">
          {!isDetailView && (
            <GlideSelect
              ariaLabel="比較期間を選択"
              value={period}
              onChange={(val) => {
                setPeriod(val as RankingPeriod);
                setRankDelta(0);
              }}
              size="sm"
              radius={10}
              menuWidth={156}
              surfaceColor="var(--card)"
              highlightColor="var(--card-subtle)"
              textColor="var(--text)"
              accentColor="var(--primary)"
              options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          )}

          <div
            role="radiogroup"
            aria-label="比較する指標"
            className="inline-flex items-center p-0.5 rounded-xl bg-card-subtle text-xs font-bold"
          >
            {(
              [
                { value: 'points', label: 'ポイント' },
                { value: 'minutes', label: '勉強時間' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={metric === opt.value}
                onClick={() => {
                  setMetric(opt.value);
                  setRankDelta(0);
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                  metric === opt.value
                    ? 'bg-card text-ink shadow-subtle'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 期間指定コントロール（custom 選択時のみリッチなカレンダーピッカーを表示） */}
        {!isDetailView && period === 'custom' && (
          <DateRangePicker
            startDate={customStart}
            endDate={customEnd}
            maxDate={todayStr}
            onChange={(nextStart, nextEnd) => {
              setCustomStart(nextStart);
              setCustomEnd(nextEnd);
            }}
            presets={[
              { label: '過去2日', start: offsetDateStr(todayStr, -1), end: todayStr },
              { label: '過去7日', start: offsetDateStr(todayStr, -6), end: todayStr },
              { label: '過去14日', start: offsetDateStr(todayStr, -13), end: todayStr },
              { label: '今月1日〜今日', start: `${todayStr.slice(0, 7)}-01`, end: todayStr },
            ]}
          />
        )}

        {/* 開閉式ルールガイド */}
        {showRules && (
          <div className="px-4 py-3 rounded-2xl bg-card-subtle/65 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-ink">
              <Clock size={14} className="text-primary shrink-0" />
              <span>勉強時間: <strong className="font-numbers">1分 = 1pt</strong></span>
            </div>
            <div className="flex items-center gap-2 text-ink">
              <Flame size={14} className="text-amber-500 shrink-0" />
              <span>連続10分+: <strong className="font-numbers">+5〜+25pt/日</strong></span>
            </div>
            <div className="flex items-center gap-2 text-ink">
              <Camera size={14} className="text-reward shrink-0" />
              <span>写真提出: <strong className="font-numbers">+5pt/日</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* サマリーカード（優先順位: 1.現在順位 → 2.獲得ポイント → 3.1位との差 → 4.学習時間 → 5.ボーナス） */}
      {isStudent && isPeriodLoading ? (
        <SummaryCardSkeleton />
      ) : isStudent && myStanding ? (
        <section aria-label="あなたの成績サマリー" className="rounded-2xl bg-card p-5 sm:p-6 shadow-card">
          {/* 上段：主役KPI 3列（順位・獲得スコア・1位との差） */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6 items-end">
            {/* 1. 現在順位 */}
            <div>
              <span className="block text-xs font-semibold text-muted mb-1.5">
                {isDetailView ? '確定順位' : '現在順位'}
              </span>
              <div className="flex items-baseline gap-2">
                {myStanding.computedRank === 1 && myStanding.hasScore && (
                  <Crown size={22} className="text-amber-500 self-center shrink-0" aria-hidden="true" />
                )}
                <span
                  className={`text-3xl sm:text-4xl font-extrabold font-numbers tabular-nums tracking-tight leading-none ${
                    myStanding.computedRank === 1 && myStanding.hasScore
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-ink'
                  }`}
                >
                  {formatRankText(myStanding.computedRank, myStanding.isTied, hasAnyScore)}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-muted font-numbers">
                  / {standings.length}人
                </span>
                {rankDelta > 0 && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary-soft text-primary-ink text-[11px] font-bold self-center"
                  >
                    <ArrowUpRight size={12} />
                    {rankDelta}UP
                  </motion.span>
                )}
              </div>
            </div>

            {/* 2. 獲得ポイント（または学習時間） */}
            <div>
              <span className="block text-xs font-semibold text-muted mb-1.5">
                {metric === 'minutes' ? '合計学習時間' : '獲得ポイント'}
              </span>
              <div className="flex items-baseline gap-1.5 font-numbers tabular-nums">
                {metric === 'minutes' ? (
                  <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-primary leading-none">
                    {formatDuration(myStanding.weekMinutes)}
                  </span>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-primary leading-none">
                      <CountUp
                        key={`${cacheKey}-pts`}
                        to={myStanding.weekPoints}
                        duration={0.5}
                        trigger="load"
                      />
                    </span>
                    <span className="text-sm sm:text-base font-bold text-primary">pt</span>
                  </>
                )}
              </div>
            </div>

            {/* 3. 1位との差（独立した明確な指標）＋ 勉強中は次の周回ターゲットも補助表示 */}
            {(() => {
              const gap = getGapInfo(myStanding);
              const myLap = myLive ? getLapProgress(myLive.liveElapsedSec) : null;
              return (
                <div className="sm:border-l sm:border-line/50 sm:pl-6">
                  <span className="block text-xs font-semibold text-muted mb-1.5">
                    {gap.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-2xl sm:text-3xl font-extrabold font-numbers tabular-nums tracking-tight leading-none ${
                        gap.tone === 'gold'
                          ? 'text-amber-500 dark:text-amber-400'
                          : gap.tone === 'blue'
                            ? 'text-ink'
                            : 'text-muted'
                      }`}
                    >
                      {gap.value}
                    </span>
                  </div>
                  {myLap && myLive?.status === 'running' && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold font-numbers tabular-nums text-reward-ink">
                      <span>LAP {myLap.lapNumber} クリアまであと {formatTimerClock(myLap.remainingSecInLap)}</span>
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 下段：補助情報（4. 学習時間・5. ボーナスポイント・目標達成） */}
          <div className="mt-5 pt-3.5 border-t border-line/50 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-numbers tabular-nums">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-muted">
              {metric === 'points' ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={14} className="text-muted shrink-0" />
                  <span>学習時間</span>
                  <strong className="text-ink font-bold">{formatDuration(myStanding.weekMinutes)}</strong>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Flag size={14} className="text-muted shrink-0" />
                  <span>獲得ポイント</span>
                  <strong className="text-ink font-bold">{myStanding.weekPoints}pt</strong>
                </span>
              )}

              <span className="inline-flex items-center gap-1.5">
                <Flame size={14} className="text-muted shrink-0" />
                <span>ボーナス</span>
                <strong className="text-ink font-bold">+{myBonusTotal}pt</strong>
                {(myStanding.weekStreakBonus > 0 || (myStanding.weekPhotoBonus || 0) > 0) && (
                  <span className="text-xs text-muted">
                    （連続+{myStanding.weekStreakBonus}
                    {(myStanding.weekPhotoBonus || 0) > 0 ? `・写真+${myStanding.weekPhotoBonus}` : ''}）
                  </span>
                )}
              </span>
            </div>

            {myGoalReached && (
              <motion.span
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold"
              >
                <CheckCircle2 size={13} />
                <span>
                  目標 {formatMetric(goalValue)} 達成
                  {myStanding.metricValue > goalValue
                    ? `（+${formatMetric(myStanding.metricValue - goalValue)}）`
                    : ''}
                </span>
              </motion.span>
            )}
          </div>
        </section>
      ) : null}

      {/* フォーカスバー：勉強の開始・全画面表示をここに集約（生徒・ライブ対象期間のみ） */}
      {isStudent && isLiveEligible && (
        <section
          aria-label="勉強タイマー"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 sm:px-5 py-3 ${
            myTimer
              ? myTimer.status === 'running'
                ? 'bg-reward-soft/60'
                : 'bg-amber-500/10'
              : 'bg-card shadow-card'
          }`}
        >
          {myTimer ? (
            (() => {
              const lap = getLapProgress(myElapsedSec);
              const running = myTimer.status === 'running';
              return (
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
                    {running && (
                      <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full size-2.5 ${running ? 'bg-reward' : 'bg-amber-500'}`}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 flex items-baseline gap-2 font-numbers tabular-nums">
                      <span className="text-xl font-extrabold tracking-tight text-ink leading-none">
                        {formatTimerClock(myElapsedSec)}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          running ? 'text-reward-ink' : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {running ? '勉強中' : '一時停止中'}
                      </span>
                    </p>
                    <p className="m-0 mt-0.5 text-[11px] font-semibold text-muted font-numbers tabular-nums truncate">
                      LAP {lap.lapNumber} · 次の周回まであと {formatTimerClock(lap.remainingSecInLap)}
                    </p>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="min-w-0">
              <p className="m-0 text-sm font-bold text-ink">
                {activeRunningCount > 0 ? 'いっしょに勉強しよう' : 'タイマーで勉強を記録しよう'}
              </p>
              <p className="m-0 mt-0.5 text-xs text-muted">
                計測中はレースにリアルタイムで反映されます
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card/80 hover:bg-card text-xs font-bold text-ink border border-line/70 transition-colors cursor-pointer active:scale-95"
            >
              <Maximize2 size={13} />
              <span>全画面で表示</span>
            </button>
            {!myTimer && onStartLive && (
              <button
                type="button"
                disabled={liveBusy}
                onClick={onStartLive}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-reward hover:opacity-90 !text-white text-xs font-bold active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
              >
                <Play size={13} className="fill-current !text-white" />
                <span className="!text-white">勉強スタート</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* メイン主役：レーストラック */}
      {error && !currentData ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <p className="text-danger text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={() => void fetchRanking()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-card-subtle hover:bg-card text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RefreshCw size={14} />
            再読み込み
          </button>
        </div>
      ) : isPeriodLoading ? (
        <RaceTrackSkeleton laneCount={displayData.members.length || 3} />
      ) : standings.length === 0 ? (
        <div className="rounded-2xl bg-card py-16 text-center text-muted text-sm shadow-card">
          <p className="m-0">まだ参加メンバーがいません</p>
        </div>
      ) : (
        <section
          aria-label="クラスレース進行トラック"
          className={`rounded-2xl bg-card shadow-card overflow-hidden transition-opacity ${isRefreshing ? 'opacity-65' : ''}`}
        >
          {/* トラック目盛りヘッダー（START・GOAL/表示上限のみに絞って視線を集中） */}
          <div className="grid grid-cols-1 sm:grid-cols-[172px_1fr_156px] items-center bg-card-subtle/60 px-4 sm:px-6 py-2.5 text-xs font-semibold text-muted font-numbers tabular-nums">
            <span className="hidden sm:block">メンバー</span>
            <div className="flex items-center justify-between px-4 sm:px-5">
              <span className="font-bold text-ink">START</span>
              <span className="inline-flex items-center gap-1 font-bold text-ink">
                <Flag size={12} className={isGoalExceeded ? 'text-amber-500' : 'text-primary'} />
                <span>
                  {isGoalExceeded
                    ? `表示上限 ${formatMetric(scaleValue)}`
                    : `GOAL ${formatMetric(scaleValue)}`}
                </span>
              </span>
            </div>
            <span className="hidden sm:block text-right">スコア</span>
          </div>

          {/* 各プレイヤーのレーン */}
          <div className="divide-y divide-line/50">
            {standings.map((member, index) => {
              const rawRatio = scaleValue > 0 ? Math.min(1, member.metricValue / scaleValue) : 0;
              const progressPct = Math.round(rawRatio * 100);
              const reachedGoal = member.hasScore && member.metricValue >= goalValue;
              const isFirst = member.computedRank === 1 && member.hasScore;
              const laneGap = getLaneGapText(member, index);
              const liveMember = liveByStudentId.get(member.studentId) ?? null;
              const isLiveRunning = liveMember?.status === 'running';
              const lapInfo = liveMember ? getLapProgress(liveMember.liveElapsedSec) : null;

              // 統一カラーシステム: ブルー=自分 / グリーン=相手（1位はゴールドアクセント）
              const barColor = member.isMe ? 'var(--primary)' : 'var(--reward)';

              return (
                <div
                  key={member.studentId}
                  className={`relative px-4 sm:px-6 py-4 sm:py-5 transition-colors ${
                    member.isMe
                      ? 'bg-primary-soft/20'
                      : isLiveRunning
                        ? 'bg-reward-soft/25'
                        : 'hover:bg-card-subtle/35'
                  }`}
                >
                  {/* 自分のレーン左端アクセント（ブルー） */}
                  {member.isMe && (
                    <span
                      className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-primary"
                      aria-hidden="true"
                    />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-[172px_1fr_156px] items-center gap-3 sm:gap-5">
                    {/* 1列目：順位・メンバー名・勉強中バッジ */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1 min-w-[48px] text-xs sm:text-sm font-extrabold font-numbers tabular-nums shrink-0 ${
                              isFirst ? 'text-amber-500 dark:text-amber-400' : 'text-muted'
                            }`}
                          >
                            {isFirst && <Crown size={15} className="shrink-0" aria-hidden="true" />}
                            <span>{formatRankText(member.computedRank, member.isTied, hasAnyScore)}</span>
                          </span>

                          <span className="font-bold text-sm sm:text-[15px] text-ink truncate">
                            {member.displayName}
                          </span>

                          {member.isMe && (
                            <span className="px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-ink text-[10px] font-bold shrink-0">
                              あなた
                            </span>
                          )}
                        </div>

                        {liveMember && (
                          <div className="mt-1 ml-[58px] flex items-center gap-1.5 min-w-0">
                            {isLiveRunning ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-reward-soft text-reward-ink text-[11px] font-bold font-numbers tabular-nums">
                                <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
                                  <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
                                  <span className="relative inline-flex rounded-full size-1.5 bg-reward" />
                                </span>
                                <span>勉強中 {formatTimerClock(liveMember.liveElapsedSec)}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold font-numbers tabular-nums">
                                <span>一時停止 {formatTimerClock(liveMember.liveElapsedSec)}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* モバイル用スコア・進捗率 */}
                      <div className="flex sm:hidden items-baseline gap-1.5 font-numbers tabular-nums shrink-0">
                        <span className={`text-base font-extrabold ${member.isMe ? 'text-primary' : 'text-ink'}`}>
                          {formatMetric(member.metricValue)}
                        </span>
                        <span className="text-xs font-semibold text-muted">
                          {progressPct}%
                        </span>
                      </div>
                    </div>

                    {/* 2列目：ワイドレーストラック＋進行バー＋アバター */}
                    <div className="relative h-12 flex items-center px-4 sm:px-5">
                      {/* START / 50% / GOAL ガイドライン */}
                      <div className="absolute inset-y-1 left-4 right-4 sm:left-5 sm:right-5 pointer-events-none">
                        {/* START ライン */}
                        <div className="absolute inset-y-0 left-0 border-l-2 border-line-strong/80" />
                        {/* 50% ライン */}
                        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-line-strong/60" />
                        {/* 目標超過時の目標ライン（goalValue < scaleValue のとき） */}
                        {isGoalExceeded && (
                          <div
                            className="absolute inset-y-0 border-l border-dashed border-amber-500/60"
                            style={{ left: `${Math.round((goalValue / scaleValue) * 100)}%` }}
                            title={`目標 ${formatMetric(goalValue)}`}
                          />
                        )}
                        {/* GOAL / 上限ライン */}
                        <div
                          className={`absolute inset-y-0 right-0 border-l-2 ${
                            reachedGoal ? 'border-amber-500/80' : 'border-line-strong/80'
                          }`}
                        />
                      </div>

                      {/* 落ち着いたダークトラックレール + 明確なソリッド進行ライン */}
                      <div className="relative w-full h-2.5 rounded-full bg-card-subtle">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                          className={`absolute inset-y-0 left-0 rounded-full ${isLiveRunning ? 'live-shimmer' : ''}`}
                          style={{ backgroundColor: barColor }}
                        />

                        {/* 進行位置のプレイヤーアバター */}
                        <motion.div
                          initial={{ left: '0%' }}
                          animate={{ left: `${progressPct}%` }}
                          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                        >
                          <div className="relative">
                            {isLiveRunning && (
                              <span
                                className="live-ping absolute -inset-1 rounded-full border-2 border-reward/70 pointer-events-none"
                                aria-hidden="true"
                              />
                            )}
                            {isFirst && (
                              <span
                                className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-amber-500"
                                aria-hidden="true"
                              >
                                <Crown size={12} className="fill-amber-500/20" />
                              </span>
                            )}
                            <StudentAvatar
                              avatarUrl={member.avatarUrl}
                              icon={member.icon}
                              color={member.isMe ? '#3B82F6' : member.color}
                              name={member.displayName}
                              size="md"
                              shape="circle"
                              className={`!ring-2 ${
                                isLiveRunning
                                  ? '!ring-reward'
                                  : member.isMe
                                    ? '!ring-primary'
                                    : isFirst
                                      ? '!ring-amber-500'
                                      : '!ring-reward/70'
                              } shadow-card`}
                            />
                            {reachedGoal && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-amber-500 text-white grid place-items-center ring-2 ring-card"
                                title={`目標 ${formatMetric(goalValue)} 達成`}
                              >
                                <Check size={9} strokeWidth={3} />
                              </span>
                            )}
                          </div>
                        </motion.div>
                      </div>
                    </div>

                    {/* 3列目：スコア・進捗率・相手との差 */}
                    <div className="flex sm:flex-col sm:items-end justify-between gap-1 font-numbers tabular-nums">
                      <div className="hidden sm:flex items-baseline gap-2">
                        <span className={`text-lg font-extrabold tracking-tight ${member.isMe ? 'text-primary' : 'text-ink'}`}>
                          {metric === 'minutes' ? (
                            formatDuration(member.weekMinutes)
                          ) : (
                            <>
                              <CountUp
                                key={`${cacheKey}-${member.studentId}`}
                                to={member.weekPoints}
                                duration={0.5}
                                trigger="load"
                              />
                              <span className="text-xs font-bold text-muted ml-0.5">pt</span>
                            </>
                          )}
                        </span>
                        <span className="text-xs font-bold text-muted">
                          {progressPct}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        {laneGap ? (
                          <span
                            className={`font-semibold ${
                              isFirst && !member.isTied
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-muted'
                            }`}
                          >
                            {laneGap}
                          </span>
                        ) : (
                          <span className="text-muted">
                            {metric === 'points'
                              ? formatDuration(member.weekMinutes)
                              : `${member.weekPoints}pt`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 勉強中メンバーのみ：30分周回のスリムな1行バー（数時間差でも1分=3.3%ずつ前進） */}
                  {liveMember && lapInfo && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[172px_1fr_156px] items-center gap-1.5 sm:gap-5">
                      <span className="hidden sm:block" aria-hidden="true" />
                      <div className="flex items-center gap-2.5 px-4 sm:px-5 text-[11px] font-bold font-numbers tabular-nums">
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded-md ${
                            member.isMe
                              ? 'bg-primary-soft text-primary-ink'
                              : 'bg-reward-soft text-reward-ink'
                          }`}
                          title="30分で1周"
                        >
                          LAP {lapInfo.lapNumber}
                        </span>
                        <div className="relative flex-1 h-1.5 rounded-full bg-card-subtle overflow-hidden">
                          {/* 5分ごとの目盛り */}
                          {[1, 2, 3, 4, 5].map((tick) => (
                            <span
                              key={tick}
                              className="absolute inset-y-0 w-px bg-card/90 z-10 pointer-events-none"
                              style={{ left: `${(tick / 6) * 100}%` }}
                              aria-hidden="true"
                            />
                          ))}
                          <div
                            className={`h-full rounded-full transition-[width] duration-700 ease-linear ${
                              isLiveRunning ? 'live-shimmer' : ''
                            }`}
                            style={{
                              width: `${Math.max(2, lapInfo.lapProgressPct)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                        <span className="shrink-0 text-muted">
                          <span className="text-ink">{formatTimerClock(lapInfo.lapElapsedSec)}</span>
                          <span className="font-semibold"> / 30:00</span>
                        </span>
                      </div>
                      {member.isMe && isLiveRunning ? (
                        <span className="hidden sm:inline-flex items-center justify-end gap-1.5 text-[10px] font-bold text-primary-ink">
                          <span>次の+1分</span>
                          <span className="inline-block w-12 h-1.5 rounded-full bg-card-subtle overflow-hidden">
                            <span
                              className="block h-full bg-primary transition-[width] duration-700 ease-linear"
                              style={{ width: `${lapInfo.minuteProgressPct}%` }}
                            />
                          </span>
                        </span>
                      ) : (
                        <span className="hidden sm:block text-right text-[10px] font-semibold text-muted font-numbers">
                          今回 +{liveMember.liveFlooredMinutes}分
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 過去の週次レース履歴（比較期間とは明確に区別して表示） */}
      {recentWeeks.length > 0 && (
        <section aria-label="過去の週次レース履歴" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h3 className="m-0 text-sm sm:text-base font-extrabold text-ink flex items-center gap-2">
              <History size={16} className="text-primary" />
              <span>過去の週次レース履歴</span>
            </h3>
            <span className="text-xs text-muted">毎週月曜〜日曜の確定結果・タップで詳細へ</span>
          </div>

          <div className="rounded-2xl bg-card shadow-card overflow-hidden divide-y divide-line/50">
            {visibleHistoryWeeks.map((week) => {
              const isSelected = isDetailView && week.weekStart === detailWeekStart;
              const hasRecords = week.totalPoints > 0 && Boolean(week.winner);

              return (
                <button
                  key={week.weekStart}
                  type="button"
                  onClick={() => {
                    setDetailWeekStart(week.weekStart);
                    setRankDelta(0);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`group w-full text-left px-4 sm:px-5 flex items-center justify-between gap-3 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary ${
                    hasRecords ? 'py-3.5' : 'py-2.5'
                  } ${
                    isSelected
                      ? 'bg-primary-soft/35'
                      : 'hover:bg-card-subtle/60'
                  }`}
                >
                  {/* 期間（視認性を維持） */}
                  <div className="flex items-center gap-2 min-w-[116px] sm:min-w-[140px] shrink-0">
                    <span
                      className={`text-xs sm:text-sm font-bold font-numbers tabular-nums ${
                        hasRecords ? 'text-ink' : 'text-muted'
                      }`}
                    >
                      {formatWeekRange(week.weekStart)}
                    </span>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold">
                        表示中
                      </span>
                    )}
                  </div>

                  {/* 1位の結果（記録ありは強調、なしは控えめだが読みやすいコントラスト） */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {hasRecords && week.winner ? (
                      <>
                        <Crown size={14} className="text-amber-500 shrink-0" aria-hidden="true" />
                        <StudentAvatar
                          avatarUrl={week.winner.avatarUrl}
                          color={week.winner.color}
                          name={week.winner.displayName}
                          size="xs"
                          shape="circle"
                        />
                        <span className="text-xs sm:text-sm font-bold text-ink truncate">
                          {week.winner.displayName}
                          {week.winner.isTied ? ' ほか' : ''}
                        </span>
                        <span className="text-xs sm:text-sm font-bold font-numbers tabular-nums text-muted shrink-0">
                          {week.winner.weekPoints}pt
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted/80">記録なし</span>
                    )}
                  </div>

                  {/* 自分の順位とポイント + 詳細導線 */}
                  <div className="flex items-center gap-2.5 shrink-0 font-numbers tabular-nums">
                    {isStudent && week.myRank && (
                      <span
                        className={`text-xs sm:text-sm font-extrabold ${
                          week.myRank === 1
                            ? 'text-amber-500 dark:text-amber-400'
                            : 'text-primary'
                        }`}
                      >
                        {formatRankText(week.myRank, Boolean(week.myTied), true)}
                        <span className="text-ink font-semibold ml-1.5">{week.myPoints}pt</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted group-hover:text-primary transition-colors">
                      <span className="hidden sm:inline">詳細</span>
                      <ChevronRight size={15} />
                    </span>
                  </div>
                </button>
              );
            })}

            {/* 履歴展開・折りたたみ */}
            {recentWeeks.length > INITIAL_HISTORY_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllHistory((v) => !v)}
                className="w-full py-2.5 px-4 flex items-center justify-center gap-1.5 text-xs font-bold text-muted hover:text-ink hover:bg-card-subtle/50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary"
              >
                {showAllHistory ? (
                  <>
                    <ChevronUp size={14} />
                    <span>直近{INITIAL_HISTORY_COUNT}週のみ表示</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    <span>さらに過去の履歴を表示（全{recentWeeks.length}週）</span>
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      )}

      {/* 勉強中の全画面クラスレース表示 */}
      <RaceFullscreenOverlay
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        groupName={group.name}
        periodLabel={periodRangeText}
        metric={metric}
        scaleValue={scaleValue}
        goalValue={goalValue}
        isGoalExceeded={isGoalExceeded}
        standings={standings}
        liveByStudentId={liveByStudentId}
        myTimer={myTimer}
        myElapsedSec={myElapsedSec}
        liveBusy={liveBusy}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onStartLive={onStartLive}
        onPauseLive={onPauseLive}
        onResumeLive={onResumeLive}
        onFinishLive={onFinishLive}
      />

      {/* 招待コードで参加モーダル */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="rounded-3xl border border-line bg-card p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-ink mb-2">グループに参加</h3>
            <p className="text-xs text-muted mb-4">
              8文字の招待コードを入力してください。
            </p>
            <form onSubmit={handleJoinGroup} className="space-y-4">
              <input
                type="text"
                maxLength={8}
                placeholder="例: A1B2C3D4"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full text-center font-mono text-xl tracking-widest uppercase px-4 py-3 rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                required
              />

              {joinMessage && (
                <p className="text-xs text-danger text-center">{joinMessage}</p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-sm rounded-xl text-muted hover:text-ink hover:bg-card-subtle cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover cursor-pointer"
                >
                  参加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
