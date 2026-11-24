/**
 * 宿題ノート 共通ポイント＆ボーナス計算モジュール（サーバー／クライアント両用）
 *
 * 【ポイント体系（継続重視・倍率方式 3本柱）】
 * 1. 基本学習ポイント: 1分 = 1pt
 * 2. 主役・連続学習ブースト（倍率）:
 *    - 1日合計 10分以上で継続日成立
 *    - Lv.0（1日目・点火）: ×1.0
 *    - Lv.1（2日連続）    : ×1.1（+10%）
 *    - Lv.2（3〜4日連続） : ×1.2（+20%）
 *    - Lv.3（5日連続〜）  : ×1.3（+30%・上限）
 *    - 適用上限: 1日最大 120分（2時間）まで倍率適用（超過分は 1分=1pt、最大 +36pt/日）
 *    - 1日セーフティ: 1日だけ休んだ場合（中1日）はゼロにならず 1レベルダウンで踏みとどまる
 *                     （2日以上連続休みで Lv.0 へリセット。1日おき学習では昇格不可）
 * 3. サブ・写真提出ボーナス: 学習写真を 1枚以上添付した日 +3pt/日（倍率対象外）
 * 4. サブ・ライブ計測ボーナス: ライブタイマーで 15分以上計測した日 +3pt/日（倍率対象外）
 */

export type PointSessionInput = {
  id?: string;
  minutes?: number;
  evidencePath?: string;
  source?: 'manual' | 'live';
};

export type BonusType = 'streak' | 'photo' | 'live';
export type BoostLevel = 0 | 1 | 2 | 3;

export const STREAK_MIN_DAILY_MINUTES = 10;
export const STREAK_BOOST_MAX_DAILY_MINUTES = 120;
export const BOOST_MULTIPLIERS: Record<BoostLevel, number> = {
  0: 1.0,
  1: 1.1,
  2: 1.2,
  3: 1.3,
};
export const PHOTO_DAILY_BONUS = 3;
export const LIVE_MIN_SESSION_MINUTES = 15;
export const LIVE_DAILY_BONUS = 3;

export interface BonusBreakdownItem {
  type: BonusType;
  label: string;
  reason: string;
  points: number;
  multiplier?: number;
  nextHint?: string;
}

export interface RangePointsSummary {
  weekMinutes: number;
  weekStreakBonus: number;
  weekPhotoBonus: number;
  weekLiveBonus: number;
  weekTotalBonus: number;
  weekPoints: number;
  currentStreak: number;
  currentBoostLevel: BoostLevel;
  currentMultiplier: number;
  activeDays: number;
  dailyBonusMap: Record<string, number>;
}

export interface SavePointsPreview {
  timePoints: number;
  streakBonus: number;
  liveBonus: number;
  totalBonus: number;
  totalPoints: number;
  appliedMultiplier: number;
  appliedBoostLevel: BoostLevel;
  appliedStreakDays: number;
  safetyRecovered: boolean;
  /** 初日（10分到達・×1.0）のブースト点火メッセージ */
  ignitionHint?: string;
  bonuses: BonusBreakdownItem[];
  isFirstOver10: boolean;
}

function validDateStr(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function daysBetweenJst(prevDate: string, nextDate: string): number {
  const a = new Date(`${prevDate}T12:00:00+09:00`).getTime();
  const b = new Date(`${nextDate}T12:00:00+09:00`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function streakDaysToBoostLevel(streakDays: number): BoostLevel {
  if (streakDays >= 5) return 3;
  if (streakDays >= 3) return 2;
  if (streakDays >= 2) return 1;
  return 0;
}

function boostLevelToBaseDays(level: BoostLevel): number {
  if (level === 3) return 5;
  if (level === 2) return 3;
  if (level === 1) return 2;
  return 1;
}

/**
 * 1日の合計学習時間（上限120分）に対する連続倍率ボーナス分を算出する。
 */
export function computeDailyStreakMultiplierBonus(dayMinutes: number, level: BoostLevel): number {
  if (dayMinutes < STREAK_MIN_DAILY_MINUTES || level === 0) return 0;
  const multiplier = BOOST_MULTIPLIERS[level];
  const eligibleMinutes = Math.min(STREAK_BOOST_MAX_DAILY_MINUTES, dayMinutes);
  return Math.round(eligibleMinutes * (multiplier - 1));
}

/** その日にライブ計測ボーナス（タイマー15分以上）が成立しているか */
export function hasDailyLiveBonus(sessions: PointSessionInput[]): boolean {
  return sessions.some(
    (s) => s.source === 'live' && (s.minutes || 0) >= LIVE_MIN_SESSION_MINUTES
  );
}

interface DayStreakState {
  streakDays: number;
  boostLevel: BoostLevel;
  multiplier: number;
  safetyRecovered: boolean;
}

/**
 * 全履歴（日付→日別合計分）を昇順走査し、1日セーフティ付きの連続レベル推移を算出する。
 */
function computeStreakTimeline(dailyMinutesMap: Record<string, number>) {
  const sortedDates = Object.keys(dailyMinutesMap)
    .filter((d) => validDateStr(d))
    .sort();

  const stateByDate: Record<string, DayStreakState> = {};
  let lastQualifiedDate = '';
  let currentStreak = 0;
  let currentLevel: BoostLevel = 0;

  for (const date of sortedDates) {
    const dayMinutes = dailyMinutesMap[date] || 0;
    if (dayMinutes < STREAK_MIN_DAILY_MINUTES) continue;

    let safetyRecovered = false;
    if (!lastQualifiedDate) {
      currentStreak = 1;
      currentLevel = 0;
    } else {
      const gap = daysBetweenJst(lastQualifiedDate, date);
      if (gap === 1) {
        // 連続達成: +1日進み、レベルアップ判定
        currentStreak += 1;
        currentLevel = streakDaysToBoostLevel(currentStreak);
      } else if (gap === 2) {
        // 1日休み（中1日）: 1日セーフティにより1レベルダウンで踏みとどまる（Lv.0は0のまま）
        const nextLevel = Math.max(0, currentLevel - 1) as BoostLevel;
        safetyRecovered = currentLevel > 0;
        currentLevel = nextLevel;
        currentStreak = boostLevelToBaseDays(nextLevel);
      } else {
        // 2日以上連続休み: リセット
        currentStreak = 1;
        currentLevel = 0;
      }
    }

    lastQualifiedDate = date;
    stateByDate[date] = {
      streakDays: currentStreak,
      boostLevel: currentLevel,
      multiplier: BOOST_MULTIPLIERS[currentLevel],
      safetyRecovered,
    };
  }

  return {
    stateByDate,
    lastQualifiedDate,
    currentStreak,
    currentLevel,
    currentMultiplier: BOOST_MULTIPLIERS[currentLevel],
  };
}

/**
 * 任意期間 [rangeStart, rangeEnd] の学習時間・3種ボーナス・合計ポイントを一括算出する。
 */
export function calculateRangePointsSummary(
  allHistory: Record<string, PointSessionInput[]>,
  rangeStart: string,
  rangeEnd: string
): RangePointsSummary {
  const sortedDates = Object.keys(allHistory)
    .filter((d) => validDateStr(d))
    .sort();

  const dailyMinutesMap: Record<string, number> = {};
  const dailyPhotoMap: Record<string, number> = {};
  const dailyLiveMap: Record<string, number> = {};

  for (const date of sortedDates) {
    const sessions = allHistory[date] || [];
    const dayMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
    dailyMinutesMap[date] = dayMinutes;

    if (sessions.some((s) => Boolean(s.evidencePath))) {
      dailyPhotoMap[date] = PHOTO_DAILY_BONUS;
    }

    if (hasDailyLiveBonus(sessions)) {
      dailyLiveMap[date] = LIVE_DAILY_BONUS;
    }
  }

  const timeline = computeStreakTimeline(dailyMinutesMap);
  const dailyBonusMap: Record<string, number> = {};

  for (const [date, state] of Object.entries(timeline.stateByDate)) {
    const mins = dailyMinutesMap[date] || 0;
    const bonus = computeDailyStreakMultiplierBonus(mins, state.boostLevel);
    if (bonus > 0) {
      dailyBonusMap[date] = bonus;
    }
  }

  let weekMinutes = 0;
  let weekStreakBonus = 0;
  let weekPhotoBonus = 0;
  let weekLiveBonus = 0;
  let activeDays = 0;

  for (const date of sortedDates) {
    if (date < rangeStart || date > rangeEnd) continue;
    const sessions = allHistory[date] || [];
    if (sessions.length > 0) activeDays += 1;
    weekMinutes += dailyMinutesMap[date] || 0;
    weekStreakBonus += dailyBonusMap[date] || 0;
    weekPhotoBonus += dailyPhotoMap[date] || 0;
    weekLiveBonus += dailyLiveMap[date] || 0;
  }

  const weekTotalBonus = weekStreakBonus + weekPhotoBonus + weekLiveBonus;
  const weekPoints = weekMinutes + weekTotalBonus;

  return {
    weekMinutes,
    weekStreakBonus,
    weekPhotoBonus,
    weekLiveBonus,
    weekTotalBonus,
    weekPoints,
    currentStreak: timeline.currentStreak,
    currentBoostLevel: timeline.currentLevel,
    currentMultiplier: timeline.currentMultiplier,
    activeDays,
    dailyBonusMap,
  };
}

/**
 * 記録保存前のポイント＆ボーナス獲得予告（倍率・理由・次ヒント付き）
 */
export function calculateSavePointsBreakdown(params: {
  allHistory: Record<string, PointSessionInput[]>;
  targetDate: string;
  newSessionMinutes: number;
  editingSessionId?: string;
  isLiveSource?: boolean;
}): SavePointsPreview {
  const { allHistory, targetDate, newSessionMinutes, editingSessionId, isLiveSource } = params;
  const existingSessions = (allHistory[targetDate] || []).filter(
    (s) => !editingSessionId || s.id !== editingSessionId
  );

  const oldDayMinutes = existingSessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const newDayMinutes = oldDayMinutes + newSessionMinutes;
  const timePoints = Math.max(0, newSessionMinutes);
  const bonuses: BonusBreakdownItem[] = [];

  // targetDate 以前（当日含む）の日別学習分でタイムラインを計算
  const dailyMinutesBefore: Record<string, number> = {};
  const dailyMinutesAfter: Record<string, number> = {};
  for (const [d, list] of Object.entries(allHistory)) {
    if (!validDateStr(d) || d > targetDate) continue;
    if (d === targetDate) {
      dailyMinutesBefore[d] = oldDayMinutes;
      dailyMinutesAfter[d] = newDayMinutes;
    } else {
      const m = list.reduce((sum, s) => sum + (s.minutes || 0), 0);
      dailyMinutesBefore[d] = m;
      dailyMinutesAfter[d] = m;
    }
  }
  dailyMinutesBefore[targetDate] = oldDayMinutes;
  dailyMinutesAfter[targetDate] = newDayMinutes;

  const beforeTimeline = computeStreakTimeline(dailyMinutesBefore);
  const afterTimeline = computeStreakTimeline(dailyMinutesAfter);

  const beforeState = beforeTimeline.stateByDate[targetDate];
  const afterState = afterTimeline.stateByDate[targetDate];

  const oldStreakBonus = beforeState
    ? computeDailyStreakMultiplierBonus(oldDayMinutes, beforeState.boostLevel)
    : 0;
  const newStreakBonus = afterState
    ? computeDailyStreakMultiplierBonus(newDayMinutes, afterState.boostLevel)
    : 0;
  const streakBonus = Math.max(0, newStreakBonus - oldStreakBonus);

  const isFirstOver10 =
    oldDayMinutes < STREAK_MIN_DAILY_MINUTES && newDayMinutes >= STREAK_MIN_DAILY_MINUTES;
  const appliedMultiplier = afterState?.multiplier ?? 1.0;
  const appliedBoostLevel = afterState?.boostLevel ?? 0;
  const appliedStreakDays = afterState?.streakDays ?? 0;
  const safetyRecovered = Boolean(afterState?.safetyRecovered);

  let ignitionHint: string | undefined;

  if (afterState && streakBonus > 0) {
    const multText = `×${afterState.multiplier.toFixed(1)}`;
    const nextHint =
      afterState.boostLevel === 1
        ? '明日も10分以上続けると ×1.2倍 にランクアップ！'
        : afterState.boostLevel === 2
          ? afterState.streakDays === 3
            ? 'あと2日連続で最大 ×1.3倍 に到達！'
            : '明日も続けると最大 ×1.3倍 にランクアップ！'
          : '最大ブースト ×1.3倍 キープ中！';

    const reasonBase = safetyRecovered
      ? `1日セーフティで ${multText}倍 をキープして復帰`
      : `${afterState.streakDays}日連続（1日10分+）で勉強ポイントが ${multText}倍`;
    const capNote =
      newDayMinutes > STREAK_BOOST_MAX_DAILY_MINUTES ? '（1日上限120分まで適用）' : '';

    bonuses.push({
      type: 'streak',
      label: `連続ブースト ${multText}倍`,
      reason: `${reasonBase}${capNote}`,
      points: streakBonus,
      multiplier: afterState.multiplier,
      nextHint,
    });
  } else if (isFirstOver10 && appliedBoostLevel === 0) {
    ignitionHint = 'ブースト点火！明日も10分以上続けると ×1.1倍 が発動します';
  }

  // ライブ計測ボーナス（タイマーで15分以上計測し、当日まだ未獲得のとき）
  let liveBonus = 0;
  if (
    isLiveSource &&
    newSessionMinutes >= LIVE_MIN_SESSION_MINUTES &&
    !hasDailyLiveBonus(existingSessions)
  ) {
    liveBonus = LIVE_DAILY_BONUS;
    bonuses.push({
      type: 'live',
      label: 'ライブ計測ボーナス',
      reason: 'ライブタイマーで15分以上集中計測',
      points: liveBonus,
    });
  }

  const totalBonus = streakBonus + liveBonus;

  return {
    timePoints,
    streakBonus,
    liveBonus,
    totalBonus,
    totalPoints: timePoints + totalBonus,
    appliedMultiplier,
    appliedBoostLevel,
    appliedStreakDays,
    safetyRecovered,
    ignitionHint,
    bonuses,
    isFirstOver10,
  };
}
