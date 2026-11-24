'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flag,
  Flame,
  Minimize2,
  Moon,
  Pause,
  Play,
  Sun,
  Target,
  ZoomIn,
} from 'lucide-react';
import StudentAvatar from './StudentAvatar';
import RubberSegment from './RubberSegment/RubberSegment';
import RaceGridCanvas from './RaceGridCanvas';
import { playAppSound } from './sounds';
import {
  formatJstClockTime,
  formatTimerClock,
  getLapProgress,
  LiveMemberComputed,
  LiveTimerState,
} from '../hooks/useLiveTimer';
import {
  analyzeRaceBattle,
  computeTrackWindow,
  computeWindowedBarState,
  formatTrackMetric,
  formatTrackSignedDiff,
  type TrackZoomMode,
} from './raceTrackMath';

export interface FullscreenStanding {
  studentId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  weekMinutes: number;
  weekPoints: number;
  metricValue: number;
  computedRank: number;
  isTied: boolean;
  hasScore: boolean;
  isMe?: boolean;
}

interface RaceFullscreenOverlayProps {
  open: boolean;
  onClose: () => void;
  groupName: string;
  periodLabel: string;
  metric: 'points' | 'minutes';
  scaleValue: number;
  goalValue: number;
  isGoalExceeded: boolean;
  standings: FullscreenStanding[];
  liveByStudentId: Map<string, LiveMemberComputed>;
  myTimer: LiveTimerState | null;
  myElapsedSec: number;
  liveBusy: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onStartLive?: () => void;
  onPauseLive?: () => void;
  onResumeLive?: () => void;
  onFinishLive?: () => void;
}

function formatClockJst(now: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
}

/**
 * 壁紙クオリティのアンビエント全画面「ライブクラスレース」。
 * - カード枠や不要な補助テキストを削ぎ落とし、画面全体（100vw × 100dvh）を
 *   極大タイマー＋フルブリード大型レーストラックとして構成。
 * - ① 進んでいる感じ：毎秒のサブミニット連続前進、45度シームレス前進ストライプ、60秒連動マイクロエッジ
 * - ② 競争している感じ：全レーン縦断の自分基準線、直前/直後ギャップ帯、1行戦況テレメトリ
 */
const ZOOM_STORAGE_KEY = 'homework_race_zoom_mode';

function readStoredZoomMode(): TrackZoomMode {
  if (typeof window === 'undefined') return '30m';
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === '10m' || raw === '30m' || raw === 'full') return raw;
  } catch {
    // ignore storage errors
  }
  return '30m';
}

export default function RaceFullscreenOverlay({
  open,
  onClose,
  groupName,
  periodLabel,
  metric,
  scaleValue,
  goalValue,
  isGoalExceeded,
  standings,
  liveByStudentId,
  myTimer,
  myElapsedSec,
  liveBusy,
  theme = 'light',
  onToggleTheme,
  onStartLive,
  onPauseLive,
  onResumeLive,
  onFinishLive,
}: RaceFullscreenOverlayProps) {
  const [clockText, setClockText] = useState('');
  const [controlsQuiet, setControlsQuiet] = useState(false);
  const [zoomMode, setZoomMode] = useState<TrackZoomMode>(readStoredZoomMode);
  const onCloseRef = useRef(onClose);

  const handleChangeZoom = (next: TrackZoomMode) => {
    if (next !== zoomMode) {
      playAppSound('petal');
    }
    setZoomMode(next);
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 現在時刻（15秒ごとに静かに更新）
  useEffect(() => {
    if (!open) return;
    const update = () => setClockText(formatClockJst(new Date()));
    const initId = window.setTimeout(update, 0);
    const id = window.setInterval(update, 15000);
    return () => {
      window.clearTimeout(initId);
      window.clearInterval(id);
    };
  }, [open]);

  // Escape キー & ブラウザ Fullscreen 終了時の同期 + スクロールロック
  // ※ 依存配列は [open] のみとして毎秒再レンダリングでの全画面トグルを防止
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'z' || e.key === 'Z') {
        playAppSound('petal');
        setZoomMode((prev) => {
          const next: TrackZoomMode = prev === '30m' ? '10m' : prev === '10m' ? 'full' : '30m';
          try {
            window.localStorage.setItem(ZOOM_STORAGE_KEY, next);
          } catch {
            // ignore
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      root.requestFullscreen().catch(() => {});
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [open]);

  // Screen Wake Lock API（勉強中に画面が暗くならないようにする）
  useEffect(() => {
    if (!open) return;
    let active = true;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && navigator.wakeLock) {
          const lock = await navigator.wakeLock.request('screen');
          if (!active) {
            await lock.release().catch(() => {});
            return;
          }
          sentinel = lock;
        }
      } catch {
        // ignore unsupported/denied wake lock
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        sentinel.release().catch(() => {});
      }
    };
  }, [open]);

  const isMyRunning = myTimer?.status === 'running';

  // 勉強中の無操作時は操作ボタンを静かに薄くし、壁紙としての美しさを最大化
  useEffect(() => {
    if (!open || !isMyRunning) {
      const id = window.setTimeout(() => setControlsQuiet(false), 0);
      return () => window.clearTimeout(id);
    }
    let timerId = window.setTimeout(() => setControlsQuiet(true), 5000);
    const wake = () => {
      setControlsQuiet(false);
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => setControlsQuiet(true), 5000);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [open, isMyRunning]);

  const battle = useMemo(
    () => analyzeRaceBattle(standings, liveByStudentId, goalValue),
    [standings, liveByStudentId, goalValue]
  );

  if (!open) return null;

  const isDark = theme === 'dark';
  const hasAnyScore = standings.some((m) => m.hasScore);
  const runningCount = Array.from(liveByStudentId.values()).filter(
    (m) => m.status === 'running'
  ).length;
  const isMyStalePaused = Boolean(
    myTimer && !isMyRunning && (myTimer.isStale || myTimer.autoPausedReason === 'stale')
  );
  const myStartedLabel = formatJstClockTime(myTimer?.startedAt);
  const myOfflineLabel = formatJstClockTime(myTimer?.offlineSince || myTimer?.lastHeartbeatAt);
  const myLap = myTimer ? getLapProgress(myElapsedSec) : null;
  const secUntilNextMinute = myLap ? Math.max(1, 60 - myLap.secInMinute) : 60;
  const formatMetric = (val: number) => formatTrackMetric(val, metric);

  const myLive = battle.myMember ? liveByStudentId.get(battle.myMember.studentId) ?? null : null;
  const anchorMember = battle.myMember ?? standings[0] ?? null;
  const anchorLive = anchorMember ? liveByStudentId.get(anchorMember.studentId) ?? null : null;
  const anchorEffectiveValue =
    (anchorMember?.metricValue ?? 0) +
    (anchorLive && anchorLive.status === 'running' ? (anchorLive.liveElapsedSec % 60) / 60 : 0);

  const trackWindow = computeTrackWindow(zoomMode, anchorEffectiveValue, scaleValue);
  const myBarState = battle.myMember
    ? computeWindowedBarState(battle.myMember.metricValue, trackWindow, myLive)
    : null;
  const myBarPct = myBarState ? myBarState.pct : null;

  const goalInWindow = goalValue >= trackWindow.min && goalValue <= trackWindow.max;
  const goalPct =
    trackWindow.span > 0
      ? Math.max(0, Math.min(100, ((goalValue - trackWindow.min) / trackWindow.span) * 100))
      : 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="クラスレース全画面表示"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none text-ink"
      style={{
        height: '100dvh',
        background: isDark
          ? 'radial-gradient(ellipse at 50% 0%, #111D33 0%, #0A101B 48%, #070B12 100%)'
          : 'radial-gradient(ellipse at 50% 0%, #FFFFFF 0%, #F4F7FB 52%, #EAEFF7 100%)',
      }}
    >
      {/* 厳密時間同期の建築方眼グリッド＋四角オブジェクト＋勉強時間ルーラー */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          maskImage:
            'radial-gradient(ellipse 96% 94% at 50% 54%, rgba(0,0,0,0.98) 42%, rgba(0,0,0,0.32) 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 96% 94% at 50% 54%, rgba(0,0,0,0.98) 42%, rgba(0,0,0,0.32) 100%)',
        }}
      >
        <RaceGridCanvas
          isRunning={Boolean(isMyRunning)}
          elapsedSec={myElapsedSec}
          zoomMode={zoomMode}
          theme={theme}
        />
      </div>

      {/* 極薄アンビエントヘッダー（無操作時は操作ボタンのみ静かにフェード） */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 sm:px-10 lg:px-14 pt-3.5 sm:pt-5 pb-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="m-0 text-sm sm:text-base font-extrabold tracking-tight truncate text-ink/90">
            {groupName}
          </h2>
          <span className="hidden md:inline text-xs font-semibold font-numbers text-muted/80">
            {periodLabel}
          </span>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-reward-soft text-reward-ink shrink-0">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
              </span>
              <span>{runningCount}人 LIVE</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* 3段階ズーム切替（超拡大10分 / 拡大30分 / 全体） */}
          <div
            className={`transition-opacity duration-500 ${
              controlsQuiet ? 'opacity-35 hover:opacity-100' : 'opacity-100'
            }`}
            title="表示ズームを切り替え（Zキー）"
          >
            <RubberSegment
              items={[
                { value: '10m', label: '超拡大', icon: <ZoomIn size={11} /> },
                { value: '30m', label: '拡大' },
                { value: 'full', label: '全体' },
              ]}
              value={zoomMode}
              onChange={(val) =>
                handleChangeZoom(val === '10m' ? '10m' : val === 'full' ? 'full' : '30m')
              }
              size="sm"
              equalSlots={false}
              radius={10}
              trackColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'}
              thumbColor={isDark ? '#1E293B' : '#FFFFFF'}
              textColor={isDark ? '#94A3B8' : '#475569'}
              activeTextColor={isDark ? '#F8FAFC' : '#0B1220'}
              aria-label="トラックのズーム倍率"
            />
          </div>
          {clockText && (
            <span className="hidden sm:inline text-sm sm:text-base font-bold font-numbers tabular-nums text-muted/85">
              {clockText}
            </span>
          )}
          <div
            className={`flex items-center gap-1.5 transition-opacity duration-500 ${
              controlsQuiet ? 'opacity-20 hover:opacity-100' : 'opacity-100'
            }`}
          >
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="grid size-8 place-items-center rounded-xl transition-colors cursor-pointer text-muted hover:text-ink hover:bg-card-subtle/80"
                aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
                title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 text-xs font-bold transition-all cursor-pointer bg-card-subtle/75 hover:bg-line/70 text-ink"
              title="全画面を閉じる（Esc）"
              aria-label="全画面を閉じる"
            >
              <Minimize2 size={14} />
              <span className="hidden sm:inline">閉じる</span>
            </button>
          </div>
        </div>
      </header>

      {/* 上部ヒーロー：壁紙の顔になる極大タイマー＆1行戦況テレメトリ */}
      <section
        aria-label="勉強タイマーと戦況"
        className="relative z-10 px-5 sm:px-10 lg:px-14 pt-2 sm:pt-4 pb-4 sm:pb-6 shrink-0"
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 sm:gap-5">
          {/* 左：超大型タイマー＋コア状態 */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
            {myTimer && myLap ? (
              <>
                <span
                  className="font-extrabold font-numbers tabular-nums tracking-[-0.04em] text-ink leading-[0.92]"
                  style={{ fontSize: 'clamp(3.6rem, 9.5vw, 7.2rem)' }}
                >
                  {formatTimerClock(myElapsedSec)}
                </span>
                <div className="flex flex-col gap-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-extrabold font-numbers">
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        isMyRunning ? 'text-reward-ink' : 'text-amber-600 dark:text-amber-300'
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          isMyRunning ? 'bg-reward live-ping' : 'bg-amber-500'
                        }`}
                      />
                      <span>
                        {isMyRunning
                          ? 'LIVE'
                          : isMyStalePaused
                            ? 'AUTO PAUSED'
                            : 'PAUSED'}
                      </span>
                    </span>
                    <span className="opacity-30">/</span>
                    <span className="text-primary">LAP {myLap.lapNumber}</span>
                    {myLive && myLive.liveFlooredMinutes > 0 && (
                      <>
                        <span className="opacity-30">/</span>
                        <span className="text-reward-ink">
                          +{metric === 'minutes' ? `${myLive.liveFlooredMinutes}分` : `${myLive.liveFlooredMinutes}pt`}
                        </span>
                      </>
                    )}
                  </div>
                  {isMyRunning && (
                    <span className="text-xs sm:text-sm font-semibold text-muted font-numbers tabular-nums">
                      あと {secUntilNextMinute}秒 で +{metric === 'minutes' ? '1分' : '1pt'}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className="font-extrabold tracking-tight text-ink leading-none"
                  style={{ fontSize: 'clamp(1.75rem, 3.6vw, 2.75rem)' }}
                >
                  LIVE CLASS RACE
                </span>
                {onStartLive && (
                  <button
                    type="button"
                    disabled={liveBusy}
                    onClick={onStartLive}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-reward hover:opacity-90 !text-white text-sm font-bold active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
                  >
                    <Play size={15} className="fill-current !text-white" />
                    <span className="!text-white">勉強スタート</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 右：凝縮された1行バトル状況 ＋ 控えめなタイマー操作 */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 sm:gap-4">
            {/* 必要な競争情報だけを大きく1行表示 */}
            {battle.myMember && standings.length > 1 && (
              <div className="flex flex-wrap items-center gap-2.5 text-sm sm:text-base font-extrabold font-numbers tabular-nums">
                {battle.ahead ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-soft/75 text-primary border border-primary/25">
                    <Target size={15} className="shrink-0" />
                    <span className="truncate max-w-[140px] sm:max-w-[200px]">
                      {battle.ahead.member.displayName}
                    </span>
                    <span>
                      {battle.ahead.diff === 0
                        ? '同率並走'
                        : `あと +${formatMetric(Math.abs(battle.ahead.diff))}`}
                    </span>
                  </span>
                ) : (
                  hasAnyScore && (
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      <Crown size={15} className="text-amber-500 shrink-0" />
                      <span>
                        1位
                        {battle.behind && battle.behind.diff !== 0
                          ? ` · +${formatMetric(Math.abs(battle.behind.diff))} リード`
                          : ' · 首位'}
                      </span>
                    </span>
                  )
                )}

                {battle.behind?.isRunning && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-reward-soft text-reward-ink border border-reward/30 text-xs sm:text-sm">
                    <Flame size={14} className="text-reward shrink-0" />
                    <span>
                      {battle.behind.member.displayName} 追撃中（
                      {formatTrackSignedDiff(battle.behind.diff, metric)}）
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* タイマー操作（勉強中の無操作時は静かに薄くして壁紙感を維持） */}
            {myTimer && (
              <div
                className={`flex items-center gap-2 transition-opacity duration-500 ${
                  controlsQuiet ? 'opacity-20 hover:opacity-100' : 'opacity-100'
                }`}
              >
                {isMyRunning ? (
                  onPauseLive && (
                    <button
                      type="button"
                      disabled={liveBusy}
                      onClick={onPauseLive}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card-subtle/80 hover:bg-line/70 text-xs font-bold text-ink transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Pause size={14} />
                      <span>一時停止</span>
                    </button>
                  )
                ) : (
                  !myTimer.isCapped &&
                  onResumeLive && (
                    <button
                      type="button"
                      disabled={liveBusy}
                      onClick={onResumeLive}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card-subtle/80 hover:bg-line/70 text-xs font-bold text-ink transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Play size={14} className="fill-current" />
                      <span>再開</span>
                    </button>
                  )
                )}
                {onFinishLive && (
                  <button
                    type="button"
                    disabled={liveBusy}
                    onClick={() => {
                      onClose();
                      onFinishLive();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary !text-white text-xs font-bold hover:bg-primary-hover active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Check size={14} strokeWidth={2.6} className="!text-white" />
                    <span className="!text-white">終了して記録</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 自動一時停止の案内（該当時のみ） */}
        {isMyStalePaused && (
          <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 font-numbers tabular-nums">
            2時間以上画面オフのため自動一時停止
            {myStartedLabel ? `（開始 ${myStartedLabel}` : ''}
            {myOfflineLabel ? ` / オフ ${myOfflineLabel}頃）` : myStartedLabel ? '）' : ''}
          </div>
        )}

        {/* フル幅デュアル推進ライン（上: 30分LAP / 下: 60秒リズム） */}
        {myTimer && myLap && (
          <div className="mt-3.5 sm:mt-4 space-y-1">
            <div className="relative h-2 w-full rounded-full bg-line/45 overflow-hidden">
              {[1, 2, 3, 4, 5].map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-y-0 w-px bg-canvas/80 z-10 pointer-events-none"
                  style={{ left: `${(tick / 6) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              <div
                className={`relative h-full rounded-full bg-primary transition-[width] duration-700 ease-linear ${
                  isMyRunning ? 'track-flow-bar' : ''
                }`}
                style={{ width: `${Math.max(1.2, myLap.lapProgressPct)}%` }}
              >
                {isMyRunning && (
                  <span
                    aria-hidden="true"
                    className="track-head-pulse absolute right-0 top-1/2 -translate-y-1/2 size-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                  />
                )}
              </div>
            </div>
            {/* 60秒セコンド・パルスライン（1秒ごとの前進を視覚化） */}
            <div className="h-[3px] w-full rounded-full bg-line/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-reward/85 transition-[width] duration-700 ease-linear"
                style={{ width: `${isMyRunning ? Math.max(1, myLap.minuteProgressPct) : 0}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* 下部メイン：画面端から端まで縦いっぱいに広がる極大ライブクラスレーストラック（下端ルーラー用余白を確保） */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col px-5 sm:px-10 lg:px-14 pb-9 sm:pb-11 overflow-y-auto">
        {/* スケール目盛り（ズーム時は1分/5分刻みの精密ルーラーを表示） */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_170px] lg:grid-cols-[230px_1fr_200px] items-center pb-2.5 text-xs font-bold text-muted/80 font-numbers tabular-nums shrink-0 border-b border-line/50">
          <span className="hidden sm:block tracking-widest uppercase text-[10px]">
            {trackWindow.isZoomed
              ? `ZOOM ${trackWindow.span}${metric === 'minutes' ? 'MIN' : 'PT'}`
              : 'RANK / MEMBER'}
          </span>
          <div className="relative h-5 mx-6 sm:mx-8">
            {trackWindow.isZoomed ? (
              <>
                {trackWindow.ticks.map((tickVal, idx) => {
                  const tickPct = ((tickVal - trackWindow.min) / trackWindow.span) * 100;
                  const isEdge = idx === 0 || idx === trackWindow.ticks.length - 1;
                  const hideOnMobile = zoomMode === '10m' && idx % 2 === 1;
                  // GOAL バッジと近い目盛り数字は重なり防止のため非表示
                  const nearGoal =
                    goalInWindow && Math.abs(tickVal - goalValue) < trackWindow.span * 0.09;
                  if (nearGoal) return null;
                  return (
                    <span
                      key={tickVal}
                      style={{ left: `${tickPct}%` }}
                      className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap ${
                        idx === 0
                          ? 'translate-x-0 text-ink/75'
                          : idx === trackWindow.ticks.length - 1
                            ? '-translate-x-full text-ink/75'
                            : '-translate-x-1/2 text-muted/75'
                      } ${hideOnMobile ? 'hidden sm:inline' : ''} ${
                        isEdge ? 'font-extrabold' : 'font-semibold text-[11px]'
                      }`}
                    >
                      {formatMetric(tickVal)}
                    </span>
                  );
                })}
                {goalInWindow && (
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] font-extrabold text-amber-600 dark:text-amber-300 whitespace-nowrap ${
                      goalPct <= 6
                        ? 'translate-x-0'
                        : goalPct >= 94
                          ? '-translate-x-full'
                          : '-translate-x-1/2'
                    }`}
                    style={{ left: `${goalPct}%` }}
                  >
                    <Flag size={9} className="shrink-0" aria-hidden="true" />
                    <span>GOAL {formatMetric(goalValue)}</span>
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-ink/70">0</span>
                {isGoalExceeded ? (
                  <>
                    <span
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-300 whitespace-nowrap"
                      style={{ left: `${goalPct}%` }}
                    >
                      <Flag size={11} className="shrink-0" aria-hidden="true" />
                      <span>GOAL {formatMetric(goalValue)}</span>
                    </span>
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-ink/75 whitespace-nowrap">
                      {formatMetric(scaleValue)} →
                    </span>
                  </>
                ) : (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-primary whitespace-nowrap">
                    <Flag size={11} className="shrink-0" aria-hidden="true" />
                    <span>GOAL {formatMetric(goalValue)}</span>
                  </span>
                )}
              </>
            )}
            {myBarPct !== null && myBarPct > 1 && myBarPct < 99 && (
              <span
                className="pointer-events-none absolute -bottom-2 -translate-x-1/2 text-[10px] leading-none text-primary font-extrabold"
                style={{ left: `${myBarPct}%` }}
                aria-hidden="true"
              >
                ▼
              </span>
            )}
          </div>
          <span className="hidden sm:block text-right tracking-widest uppercase text-[10px]">
            {metric === 'minutes' ? 'TIME / GAP' : 'SCORE / GAP'}
          </span>
        </div>

        {/* メンバーレーン群（2人〜5人まで壁紙として黄金比の密度を保つ） */}
        <div className="flex-1 flex flex-col justify-center divide-y divide-line/40 min-h-0">
          {standings.map((member) => {
            const liveMember = liveByStudentId.get(member.studentId) ?? null;
            const isRunning = liveMember?.status === 'running';
            const isPaused = Boolean(liveMember && !isRunning);
            const barState = computeWindowedBarState(member.metricValue, trackWindow, liveMember);
            const barPct = barState.pct;
            const isOffLeft = barState.position === 'below';
            const isOffRight = barState.position === 'above';
            const reachedGoal = member.hasScore && member.metricValue >= goalValue;
            const isFirst = member.computedRank === 1 && member.hasScore;
            const lap = liveMember ? getLapProgress(liveMember.liveElapsedSec) : null;
            const liveDelta = liveMember?.liveFlooredMinutes ?? 0;
            const barColor = member.isMe ? 'var(--primary)' : 'var(--reward)';

            const diffFromMe = battle.myMember
              ? member.metricValue - battle.myMember.metricValue
              : null;
            const isMyAheadTarget = Boolean(
              battle.ahead && battle.ahead.member.studentId === member.studentId
            );
            const isMyBehindChaser = Boolean(
              battle.behind &&
                battle.behind.member.studentId === member.studentId &&
                battle.behind.isRunning
            );
            const showAheadGap =
              isMyAheadTarget && myBarPct !== null && barPct > myBarPct + 1.5;
            const showBehindChase =
              isMyBehindChaser && myBarPct !== null && myBarPct > barPct + 1.5;
            const barTransition =
              trackWindow.isZoomed && isRunning
                ? { duration: 0.95, ease: 'linear' as const }
                : { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const };

            return (
              <div
                key={member.studentId}
                className={`relative flex-1 min-h-[96px] max-h-[180px] flex items-center py-3 sm:py-4 transition-colors ${
                  member.isMe
                    ? isDark
                      ? 'bg-primary/[0.08]'
                      : 'bg-primary/[0.045]'
                    : isRunning
                      ? isDark
                        ? 'bg-reward/[0.06]'
                        : 'bg-reward/[0.035]'
                      : ''
                }`}
              >
                {member.isMe && (
                  <span
                    className="absolute inset-y-3 left-0 w-1.5 rounded-r-full bg-primary"
                    aria-hidden="true"
                  />
                )}

                <div className="w-full grid grid-cols-1 sm:grid-cols-[200px_1fr_170px] lg:grid-cols-[230px_1fr_200px] items-center gap-3 sm:gap-6 pl-3 sm:pl-4">
                  {/* 左：大きな順位・名前・LIVE状態 */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center min-w-[34px] text-xl sm:text-2xl lg:text-3xl font-extrabold font-numbers tabular-nums leading-none shrink-0 ${
                          isFirst ? 'text-amber-500 dark:text-amber-400' : 'text-muted/70'
                        }`}
                      >
                        {hasAnyScore ? member.computedRank : '—'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base sm:text-xl lg:text-2xl font-extrabold text-ink truncate leading-tight">
                            {member.displayName}
                          </span>
                          {isFirst && (
                            <Crown
                              size={16}
                              className="text-amber-500 shrink-0 hidden sm:inline"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        {liveMember && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs sm:text-sm font-bold font-numbers tabular-nums">
                            <span
                              className={`size-2 rounded-full shrink-0 ${
                                isRunning ? 'bg-reward live-ping' : 'bg-amber-500'
                              }`}
                            />
                            <span
                              className={
                                isRunning ? 'text-reward-ink' : 'text-amber-600 dark:text-amber-300'
                              }
                            >
                              {formatTimerClock(liveMember.liveElapsedSec)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* モバイル用スコア＆差 */}
                    <div className="flex sm:hidden flex-col items-end font-numbers tabular-nums shrink-0">
                      <span
                        className={`text-xl font-extrabold leading-none ${
                          member.isMe ? 'text-primary' : 'text-ink'
                        }`}
                      >
                        {formatMetric(member.metricValue)}
                      </span>
                      {!member.isMe && diffFromMe !== null && (
                        <span
                          className={`mt-1 text-xs font-bold ${
                            diffFromMe > 0 ? 'text-primary' : 'text-muted'
                          }`}
                        >
                          {formatTrackSignedDiff(diffFromMe, metric)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 中央：極太フルブリード・ライブトラックバー */}
                  <div className="relative h-14 sm:h-16 flex items-center mx-6 sm:mx-8">
                    {/* ガイドライン（1分/5分ズーム目盛り・目標・全レーン縦断の自分の現在地ライン） */}
                    <div className="absolute inset-y-0 inset-x-0 pointer-events-none">
                      {trackWindow.isZoomed &&
                        trackWindow.ticks.slice(1, -1).map((tickVal) => {
                          const tickPct = ((tickVal - trackWindow.min) / trackWindow.span) * 100;
                          const isMajor = zoomMode === '10m' ? tickVal % 5 === 0 : tickVal % 10 === 0;
                          return (
                            <div
                              key={tickVal}
                              className={`absolute inset-y-1 border-l ${
                                isMajor ? 'border-line-strong/45' : 'border-line/35'
                              }`}
                              style={{ left: `${tickPct}%` }}
                            />
                          );
                        })}
                      {goalInWindow && (trackWindow.isZoomed || isGoalExceeded) && (
                        <div
                          className="absolute inset-y-0 border-l-2 border-dashed border-amber-500/75"
                          style={{ left: `${goalPct}%` }}
                        />
                      )}
                      {myBarPct !== null && myBarPct > 0.5 && (
                        <div
                          className={`absolute -inset-y-2 border-l-2 ${
                            member.isMe
                              ? 'border-primary/40'
                              : 'border-dashed border-primary/55'
                          }`}
                          style={{ left: `${myBarPct}%` }}
                        />
                      )}
                    </div>

                    {/* 極太レール本体（h-7 sm:h-9） */}
                    <div
                      className={`relative w-full h-7 sm:h-9 rounded-full ${
                        isDark ? 'bg-white/[0.06]' : 'bg-slate-900/[0.06]'
                      } ${isRunning ? 'track-flow-rail' : ''}`}
                    >
                      {/* 直前ライバルとのギャップ帯 */}
                      {showAheadGap && myBarPct !== null && (
                        <div
                          className="pointer-events-none absolute -inset-y-1 rounded-md bg-primary/14 border-y-2 border-primary/40 z-[5] flex items-center justify-center"
                          style={{
                            left: `${myBarPct}%`,
                            width: `${Math.max(0, barPct - myBarPct)}%`,
                          }}
                        >
                          {!isOffRight && barPct - myBarPct >= 14 && diffFromMe !== null && (
                            <span className="hidden sm:inline-block rounded-full bg-canvas/95 border border-primary/40 px-2.5 py-0.5 text-xs font-extrabold text-primary font-numbers tabular-nums shadow-sm whitespace-nowrap">
                              あと +{formatMetric(Math.abs(diffFromMe))}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 後方追撃帯 */}
                      {showBehindChase && myBarPct !== null && (
                        <div
                          className="pointer-events-none absolute -inset-y-1 rounded-md bg-reward/16 border-y-2 border-reward/45 z-[5] flex items-center justify-center"
                          style={{
                            left: `${barPct}%`,
                            width: `${Math.max(0, myBarPct - barPct)}%`,
                          }}
                        >
                          {!isOffLeft && myBarPct - barPct >= 14 && diffFromMe !== null && (
                            <span className="hidden sm:inline-block rounded-full bg-canvas/95 border border-reward/45 px-2.5 py-0.5 text-xs font-extrabold text-reward-ink font-numbers tabular-nums shadow-sm whitespace-nowrap">
                              追撃 -{formatMetric(Math.abs(diffFromMe))}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 進行バー＆60秒前進ビームのクリップ領域 */}
                      <div className="pointer-events-none absolute inset-0 rounded-full overflow-hidden">
                        {/* 進行バー本体（サブミニット連続前進＋シームレス45度ストライプ） */}
                        <motion.div
                          initial={false}
                          animate={{ width: `${barPct}%` }}
                          transition={barTransition}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            isRunning ? 'track-flow-bar' : ''
                          }`}
                          style={{
                            minWidth: barPct > 0 && !isOffLeft ? '14px' : '0px',
                            backgroundColor: barColor,
                            boxShadow: isRunning
                              ? member.isMe
                                ? '0 0 24px -4px rgba(0, 87, 255, 0.45)'
                                : '0 0 24px -4px rgba(0, 168, 107, 0.4)'
                              : undefined,
                          }}
                        />

                        {/* 60秒連動マイクロ前進スラスト（アバターの前方から右へ毎秒伸びる光） */}
                        {isRunning && lap && !isOffLeft && !isOffRight && barPct < 98 && (
                          <div
                            aria-hidden="true"
                            className="absolute inset-y-1 rounded-r-full opacity-55 transition-[width] duration-700 ease-linear"
                            style={{
                              left: `${barPct}%`,
                              width: `${24 + Math.round((lap.minuteProgressPct / 100) * 34)}px`,
                              background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}66 55%, transparent 100%)`,
                            }}
                          />
                        )}
                      </div>

                      {/* ズーム画面外（左・後ろ）インジケータ */}
                      {isOffLeft && (
                        <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 z-[8] inline-flex items-center gap-0.5 rounded-full bg-canvas/90 border border-line px-2 py-0.5 text-[10px] font-bold text-muted font-numbers tabular-nums">
                          <ChevronLeft size={11} />
                          <span>
                            後方 {formatMetric(Math.max(1, Math.round(trackWindow.min - member.metricValue)))}
                          </span>
                        </span>
                      )}

                      {/* ズーム画面外（右・先行）インジケータ */}
                      {isOffRight && (
                        <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 z-[8] inline-flex items-center gap-0.5 rounded-full bg-canvas/90 border border-primary/35 px-2 py-0.5 text-[10px] font-bold text-primary font-numbers tabular-nums">
                          <span>
                            先行 +{formatMetric(Math.max(1, Math.round(member.metricValue - trackWindow.max)))}
                          </span>
                          <ChevronRight size={11} />
                        </span>
                      )}

                      {/* 大型ランナーアバター */}
                      <motion.div
                        initial={false}
                        animate={{ left: `${barPct}%` }}
                        transition={barTransition}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 ${
                          isOffLeft || isOffRight ? 'opacity-70' : 'opacity-100'
                        }`}
                      >
                        <div className="relative size-10 sm:size-12 grid place-items-center">
                          {isRunning && (
                            <>
                              <span
                                className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2"
                                aria-hidden="true"
                              >
                                {[
                                  { y: '-8px', delay: '0s', size: 'size-1.5' },
                                  { y: '7px', delay: '0.42s', size: 'size-1.5' },
                                  { y: '-2px', delay: '0.85s', size: 'size-[5px]' },
                                  { y: '3px', delay: '1.28s', size: 'size-1' },
                                ].map((p, idx) => (
                                  <span
                                    key={idx}
                                    className={`live-trail-particle absolute left-0 top-0 rounded-full ${p.size}`}
                                    style={{
                                      backgroundColor: barColor,
                                      color: barColor,
                                      animationDelay: p.delay,
                                      ['--trail-y' as string]: p.y,
                                    }}
                                  />
                                ))}
                              </span>
                              <span
                                className="live-avatar-glow absolute inset-0 rounded-full pointer-events-none"
                                style={{ ['--glow-color' as string]: barColor }}
                                aria-hidden="true"
                              />
                            </>
                          )}
                          <StudentAvatar
                            avatarUrl={member.avatarUrl}
                            icon={member.icon}
                            color={member.isMe ? '#3B82F6' : member.color}
                            name={member.displayName}
                            size="lg"
                            shape="circle"
                            className={`!size-10 sm:!size-12 !ring-[3px] ${
                              isPaused
                                ? '!ring-amber-500/80'
                                : member.isMe
                                  ? '!ring-primary'
                                  : isRunning
                                    ? '!ring-reward'
                                    : isFirst
                                      ? '!ring-amber-500'
                                      : '!ring-card'
                            } shadow-lg`}
                          />
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* 右：壁紙クオリティの極大スコア＆自分との差 */}
                  <div className="hidden sm:flex flex-col items-end font-numbers tabular-nums pr-1">
                    <div className="flex items-baseline gap-2">
                      {liveDelta > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-extrabold self-center ${
                            member.isMe
                              ? 'bg-primary-soft text-primary-ink'
                              : 'bg-reward-soft text-reward-ink'
                          }`}
                        >
                          +{metric === 'minutes' ? `${liveDelta}分` : `${liveDelta}pt`}
                        </span>
                      )}
                      <span
                        className={`text-2xl lg:text-3xl font-extrabold tracking-tight leading-none ${
                          member.isMe ? 'text-primary' : 'text-ink'
                        }`}
                      >
                        {formatMetric(member.metricValue)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs lg:text-sm font-bold">
                      {reachedGoal && (
                        <Flag size={12} className="text-amber-500 shrink-0" aria-hidden="true" />
                      )}
                      <span
                        className={
                          member.isMe
                            ? 'text-muted'
                            : diffFromMe !== null && diffFromMe > 0
                              ? 'text-primary'
                              : diffFromMe === 0
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-muted'
                        }
                      >
                        {member.isMe
                          ? isFirst && hasAnyScore
                            ? 'TOP'
                            : 'YOU'
                          : diffFromMe !== null
                            ? formatTrackSignedDiff(diffFromMe, metric)
                            : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
