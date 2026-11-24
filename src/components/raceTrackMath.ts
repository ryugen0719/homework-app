import type { FullscreenStanding } from './RaceFullscreenOverlay';
import type { LiveMemberComputed } from '../hooks/useLiveTimer';
import { formatDuration } from '../lib/format-duration';

export type TrackZoomMode = '10m' | '30m' | 'full';

export interface TrackWindow {
  min: number;
  max: number;
  span: number;
  ticks: number[];
  isZoomed: boolean;
}

export interface WindowedBarState {
  /** ウィンドウ内の 0..100 (%) 位置 */
  pct: number;
  /** ウィンドウ範囲内か、左右どちらの画面外か */
  position: 'below' | 'in-range' | 'above';
  /** サブミニット加算済みの実効値 */
  effectiveValue: number;
}

/**
 * 集計軸（分 or pt）に応じた絶対値フォーマット
 */
export function formatTrackMetric(value: number, metric: 'points' | 'minutes'): string {
  const safe = Math.max(0, Math.round(value));
  return metric === 'minutes' ? formatDuration(safe) : `${safe}pt`;
}

/**
 * 符号付き差分フォーマット（同点は '同率' または '±0'）
 */
export function formatTrackSignedDiff(
  diff: number,
  metric: 'points' | 'minutes',
  zeroLabel = '同率'
): string {
  const rounded = Math.round(diff);
  if (rounded === 0) return zeroLabel;
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatTrackMetric(Math.abs(rounded), metric)}`;
}

/**
 * ズームモードに応じた表示ウィンドウ（[min, max] と目盛り配列）を算出する。
 * - '10m'（超拡大）: 幅 10（1分/1pt 刻み目盛り）— 1秒ごとの前進が目に見えてわかる
 * - '30m'（拡大）  : 幅 30（5分/5pt 刻み目盛り）— 前進感と周囲ライバルの視認性を両立
 * - 'full'（全体） : 0 〜 scaleValue
 *
 * ウィンドウ左端をグリッド単位（5 or 10）でスナップすることで、
 * 勉強中は自分のバーとアバターが固定目盛りを右へ次々と突破していく強い前進感を生む。
 */
export function computeTrackWindow(
  zoomMode: TrackZoomMode,
  anchorValue: number,
  scaleValue: number
): TrackWindow {
  const safeScale = Math.max(1, scaleValue);

  if (zoomMode === 'full') {
    const mid = Math.round(safeScale * 0.5);
    return {
      min: 0,
      max: safeScale,
      span: safeScale,
      ticks: [0, mid, safeScale],
      isZoomed: false,
    };
  }

  const span = zoomMode === '10m' ? 10 : 30;
  const snapStep = zoomMode === '10m' ? 5 : 10;
  const tickStep = zoomMode === '10m' ? 1 : 5;

  // anchorValue がウィンドウの左から 20%〜75% 付近に収まるようスナップ
  const desiredMin = Math.max(0, anchorValue - span * 0.25);
  const snappedMin = Math.floor(desiredMin / snapStep) * snapStep;
  const min = Math.max(0, snappedMin);
  const max = min + span;

  const ticks: number[] = [];
  for (let v = min; v <= max; v += tickStep) {
    ticks.push(v);
  }

  return {
    min,
    max,
    span,
    ticks,
    isZoomed: true,
  };
}

/**
 * 毎秒のサブミニット連続進捗を現在のウィンドウ（[min, max]）へ投影する。
 */
export function computeWindowedBarState(
  metricValue: number,
  window: TrackWindow,
  liveMember: LiveMemberComputed | null
): WindowedBarState {
  const subMinuteBonus =
    liveMember && liveMember.status === 'running'
      ? (liveMember.liveElapsedSec % 60) / 60
      : 0;
  const effectiveValue = Math.max(0, metricValue + subMinuteBonus);

  if (window.span <= 0) {
    return { pct: 0, position: 'in-range', effectiveValue };
  }

  if (effectiveValue < window.min) {
    return { pct: 0, position: 'below', effectiveValue };
  }
  if (effectiveValue > window.max) {
    return { pct: 100, position: 'above', effectiveValue };
  }

  const pct = Number((((effectiveValue - window.min) / window.span) * 100).toFixed(3));
  return { pct, position: 'in-range', effectiveValue };
}

/**
 * 毎秒のサブミニット連続進捗率（0..100%、全体スケール基準）を算出する。
 */
export function computeContinuousBarPct(
  metricValue: number,
  scaleValue: number,
  liveMember: LiveMemberComputed | null
): number {
  const win = computeTrackWindow('full', metricValue, scaleValue);
  return computeWindowedBarState(metricValue, win, liveMember).pct;
}

export interface BattleRivalInfo {
  member: FullscreenStanding;
  diff: number; // member - me
  isRunning: boolean;
  liveElapsedSec: number;
  isCloseBattle: boolean;
  proximityPct: number;
  estimatedMinutesToCatch: number;
}

export interface RaceBattleSummary {
  myMember: FullscreenStanding | null;
  myIndex: number;
  ahead: BattleRivalInfo | null;
  behind: BattleRivalInfo | null;
  isLeading: boolean;
}

/**
 * 自分を中心とした前後ライバルとの競争状況（接近中 / 並走バトル / 追撃警報 / 首位リード）を分析する。
 */
export function analyzeRaceBattle(
  standings: FullscreenStanding[],
  liveByStudentId: Map<string, LiveMemberComputed>,
  goalValue: number
): RaceBattleSummary {
  const myIndex = standings.findIndex((m) => m.isMe);
  if (myIndex === -1) {
    return {
      myMember: null,
      myIndex: -1,
      ahead: null,
      behind: null,
      isLeading: false,
    };
  }

  const me = standings[myIndex];
  const closeThreshold = Math.max(15, Math.round(goalValue * 0.08));

  const buildInfo = (target: FullscreenStanding): BattleRivalInfo => {
    const diff = target.metricValue - me.metricValue;
    const absDiff = Math.abs(diff);
    const live = liveByStudentId.get(target.studentId) ?? null;
    const maxVal = Math.max(1, target.metricValue, me.metricValue);
    const proximityPct =
      absDiff === 0 ? 100 : Math.max(8, Math.min(98, Math.round((1 - absDiff / maxVal) * 100)));

    return {
      member: target,
      diff,
      isRunning: live?.status === 'running',
      liveElapsedSec: live?.liveElapsedSec ?? 0,
      isCloseBattle: absDiff > 0 && absDiff <= closeThreshold,
      proximityPct,
      estimatedMinutesToCatch: diff > 0 ? Math.max(1, Math.ceil(diff)) : 0,
    };
  };

  const aheadMember = myIndex > 0 ? standings[myIndex - 1] : null;
  const behindMember = myIndex < standings.length - 1 ? standings[myIndex + 1] : null;

  return {
    myMember: me,
    myIndex,
    ahead: aheadMember ? buildInfo(aheadMember) : null,
    behind: behindMember ? buildInfo(behindMember) : null,
    isLeading: me.hasScore && me.computedRank === 1,
  };
}
