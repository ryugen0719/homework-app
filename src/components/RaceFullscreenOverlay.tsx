'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Crown,
  Flag,
  Minimize2,
  Moon,
  Pause,
  Play,
  Sun,
} from 'lucide-react';
import StudentAvatar from './StudentAvatar';
import { formatDuration } from '../lib/format-duration';
import {
  formatTimerClock,
  getLapProgress,
  LiveMemberComputed,
  LiveTimerState,
} from '../hooks/useLiveTimer';

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

function formatRankShort(rank: number, isTied: boolean, hasAnyScore: boolean): string {
  if (!hasAnyScore) return '—';
  return isTied ? `${rank}位タイ` : `${rank}位`;
}

/**
 * スマホ・PCで勉強中に机に置いて表示しておける、落ち着いた全画面クラスレース表示。
 * - Fullscreen API（対応ブラウザ）＋ 100dvh 固定オーバーレイ（iOS Safari 等でも確実に全画面化）
 * - Screen Wake Lock API で勉強中の画面スリープを自動防止
 */
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
  const [wakeLocked, setWakeLocked] = useState(false);

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
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // 対応環境ではブラウザのネイティブ全画面も試みる（失敗してもオーバーレイで動作）
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
  }, [open, onClose]);

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
          setWakeLocked(true);
          lock.addEventListener('release', () => {
            if (active) setWakeLocked(false);
          });
        }
      } catch {
        if (active) setWakeLocked(false);
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
      setWakeLocked(false);
    };
  }, [open]);

  if (!open) return null;

  const hasAnyScore = standings.some((m) => m.hasScore);
  const runningCount = Array.from(liveByStudentId.values()).filter((m) => m.status === 'running').length;
  const isMyRunning = myTimer?.status === 'running';
  const myLap = myTimer ? getLapProgress(myElapsedSec) : null;
  const formatMetric = (val: number) => (metric === 'minutes' ? formatDuration(val) : `${val}pt`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="クラスレース全画面表示"
      className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* 上部バー：最小限の情報と静かな操作 */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-7 py-3 sm:py-4 border-b border-line/60 bg-card/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="m-0 text-sm sm:text-base font-extrabold tracking-tight text-ink truncate">
            {groupName}
          </h2>
          <span className="hidden sm:inline text-xs font-semibold text-muted font-numbers">
            {periodLabel}
          </span>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-reward-soft text-reward-ink text-[11px] font-bold shrink-0">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
                <span className="relative inline-flex rounded-full size-1.5 bg-reward" />
              </span>
              <span>{runningCount}人が勉強中</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {wakeLocked && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-card-subtle text-[10px] font-semibold text-muted">
              画面スリープ防止中
            </span>
          )}
          {clockText && (
            <span className="text-xs sm:text-sm font-bold font-numbers tabular-nums text-muted px-1.5">
              {clockText}
            </span>
          )}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="grid size-8 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card-subtle hover:bg-line/60 text-xs font-bold text-ink transition-colors cursor-pointer"
            aria-label="全画面を閉じる"
          >
            <Minimize2 size={14} />
            <span>閉じる</span>
          </button>
        </div>
      </header>

      {/* メイン領域：勉強の邪魔にならない落ち着いた余白と視認性 */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
        <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
          {/* 自分のフォーカスタイマーパネル（大きく見やすく・控えめな操作） */}
          <section
            aria-label="勉強タイマー"
            className="rounded-2xl bg-card border border-line/70 px-5 sm:px-7 py-4 sm:py-5 shadow-card"
          >
            {myTimer && myLap ? (
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl sm:text-5xl font-extrabold font-numbers tabular-nums tracking-tight text-ink leading-none">
                      {formatTimerClock(myElapsedSec)}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                        <span
                          className={`inline-block size-2 rounded-full ${
                            isMyRunning ? 'bg-reward' : 'bg-amber-500'
                          }`}
                        />
                        <span className={isMyRunning ? 'text-reward-ink' : 'text-amber-700 dark:text-amber-300'}>
                          {isMyRunning ? '勉強中' : '一時停止中'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-ink text-[11px] font-numbers">
                          LAP {myLap.lapNumber}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-muted font-numbers tabular-nums">
                        次の周回まであと {formatTimerClock(myLap.remainingSecInLap)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isMyRunning ? (
                      onPauseLive && (
                        <button
                          type="button"
                          disabled={liveBusy}
                          onClick={onPauseLive}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card-subtle hover:bg-line/60 text-xs font-bold text-ink transition-colors cursor-pointer disabled:opacity-50"
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card-subtle hover:bg-line/60 text-xs font-bold text-ink transition-colors cursor-pointer disabled:opacity-50"
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
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary !text-white text-xs font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
                      >
                        <Check size={14} strokeWidth={2.6} className="!text-white" />
                        <span className="!text-white">終了して記録</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 30分周回バー（5分目盛り付き）＋ 60秒ミニゲージ */}
                <div className="space-y-1.5">
                  <div className="relative h-2.5 w-full rounded-full bg-card-subtle overflow-visible">
                    {[1, 2, 3, 4, 5].map((tick) => (
                      <span
                        key={tick}
                        className="absolute inset-y-0 w-px bg-line-strong/60 pointer-events-none"
                        style={{ left: `${(tick / 6) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    <div
                      className={`h-full rounded-full bg-primary transition-[width] duration-700 ease-linear ${
                        isMyRunning ? 'live-shimmer' : ''
                      }`}
                      style={{ width: `${Math.max(1.2, myLap.lapProgressPct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold font-numbers tabular-nums text-muted">
                    <span>LAP {myLap.lapNumber} · {formatTimerClock(myLap.lapElapsedSec)} / 30:00</span>
                    {isMyRunning && (
                      <span className="inline-flex items-center gap-1.5 text-primary-ink">
                        <span>次の+1分</span>
                        <span className="inline-block w-16 h-1.5 rounded-full bg-card-subtle overflow-hidden">
                          <span
                            className="block h-full bg-primary transition-[width] duration-700 ease-linear"
                            style={{ width: `${myLap.minuteProgressPct}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-bold text-ink">勉強をスタートすると、この画面がリアルタイムに動き出します</p>
                  <p className="m-0 mt-0.5 text-xs text-muted">机に置いたまま、みんなと一緒に集中できます</p>
                </div>
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
          </section>

          {/* クラスレーストラック（全画面向けゆったりレイアウト） */}
          <section
            aria-label="クラスレース進行トラック"
            className="rounded-2xl bg-card border border-line/70 shadow-card overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_148px] items-center bg-[#E5ECF4] dark:bg-card-subtle/60 px-5 sm:px-6 py-2.5 text-xs font-semibold text-muted font-numbers tabular-nums">
              <span className="hidden sm:block">メンバー</span>
              <div className="flex items-center justify-between px-3 sm:px-4">
                <span className="font-bold text-ink">START</span>
                <span>50%（{formatMetric(Math.round(scaleValue * 0.5))}）</span>
                <span className="inline-flex items-center gap-1 font-bold text-ink">
                  <Flag size={12} className={isGoalExceeded ? 'text-amber-500' : 'text-primary'} />
                  <span>{isGoalExceeded ? formatMetric(scaleValue) : `GOAL ${formatMetric(scaleValue)}`}</span>
                </span>
              </div>
              <span className="hidden sm:block text-right">スコア</span>
            </div>

            <div className="divide-y divide-line/50">
              {standings.map((member) => {
                const rawRatio = scaleValue > 0 ? Math.min(1, member.metricValue / scaleValue) : 0;
                const progressPct = Math.round(rawRatio * 100);
                const isFirst = member.computedRank === 1 && member.hasScore;
                const liveMember = liveByStudentId.get(member.studentId) ?? null;
                const isRunning = liveMember?.status === 'running';
                const lap = liveMember ? getLapProgress(liveMember.liveElapsedSec) : null;
                const barColor = member.isMe ? 'var(--primary)' : 'var(--reward)';

                return (
                  <div
                    key={member.studentId}
                    className={`relative px-5 sm:px-6 py-4 sm:py-5 ${
                      member.isMe
                        ? 'bg-primary-soft/20'
                        : isRunning
                          ? 'bg-reward-soft/20'
                          : ''
                    }`}
                  >
                    {member.isMe && (
                      <span
                        className="absolute inset-y-2.5 left-0 w-1 rounded-r bg-primary"
                        aria-hidden="true"
                      />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_148px] items-center gap-3 sm:gap-5">
                      {/* 名前・順位・勉強中 */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center gap-1 min-w-[44px] text-xs sm:text-sm font-extrabold font-numbers tabular-nums shrink-0 ${
                                isFirst ? 'text-amber-500 dark:text-amber-400' : 'text-muted'
                              }`}
                            >
                              {isFirst && <Crown size={14} className="shrink-0" aria-hidden="true" />}
                              <span>{formatRankShort(member.computedRank, member.isTied, hasAnyScore)}</span>
                            </span>
                            <span className="font-bold text-sm sm:text-base text-ink truncate">
                              {member.displayName}
                            </span>
                          </div>
                          {liveMember && (
                            <div className="mt-1 pl-[52px]">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold font-numbers tabular-nums ${
                                  isRunning
                                    ? 'bg-reward-soft text-reward-ink'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {isRunning && (
                                  <span className="size-1.5 rounded-full bg-reward shrink-0" aria-hidden="true" />
                                )}
                                <span>
                                  {isRunning ? '勉強中' : '一時停止'} {formatTimerClock(liveMember.liveElapsedSec)}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>

                        <span className={`sm:hidden text-base font-extrabold font-numbers tabular-nums ${member.isMe ? 'text-primary' : 'text-ink'}`}>
                          {formatMetric(member.metricValue)}
                        </span>
                      </div>

                      {/* トラックバー */}
                      <div className="space-y-2 px-3 sm:px-4">
                        <div className="relative h-10 flex items-center">
                          <div className="relative w-full h-3 rounded-full bg-card-subtle">
                            {isGoalExceeded && scaleValue > 0 && (
                              <span
                                className="absolute -inset-y-1.5 border-l border-dashed border-amber-500/60 pointer-events-none"
                                style={{ left: `${Math.round((goalValue / scaleValue) * 100)}%` }}
                                title={`目標 ${formatMetric(goalValue)}`}
                                aria-hidden="true"
                              />
                            )}
                            <motion.div
                              initial={false}
                              animate={{ width: `${progressPct}%` }}
                              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                              className={`absolute inset-y-0 left-0 rounded-full ${isRunning ? 'live-shimmer' : ''}`}
                              style={{ backgroundColor: barColor }}
                            />
                            <motion.div
                              initial={false}
                              animate={{ left: `${progressPct}%` }}
                              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                            >
                              <div className="relative">
                                {isRunning && (
                                  <span
                                    className="live-ping absolute -inset-1 rounded-full border-2 border-reward/70 pointer-events-none"
                                    aria-hidden="true"
                                  />
                                )}
                                <StudentAvatar
                                  avatarUrl={member.avatarUrl}
                                  icon={member.icon}
                                  color={member.isMe ? '#3B82F6' : member.color}
                                  name={member.displayName}
                                  size="md"
                                  shape="circle"
                                  className={`!ring-2 ${
                                    isRunning
                                      ? '!ring-reward'
                                      : member.isMe
                                        ? '!ring-primary'
                                        : '!ring-reward/70'
                                  } shadow-card`}
                                />
                              </div>
                            </motion.div>
                          </div>
                        </div>

                        {/* 勉強中メンバーの30分周回ミニバー */}
                        {lap && (
                          <div className="flex items-center gap-2 text-[10px] font-bold font-numbers tabular-nums text-muted">
                            <span className={member.isMe ? 'text-primary-ink' : 'text-reward-ink'}>
                              LAP {lap.lapNumber}
                            </span>
                            <div className="relative flex-1 h-1.5 rounded-full bg-card-subtle overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-[width] duration-700 ease-linear ${
                                  isRunning ? 'live-shimmer' : ''
                                }`}
                                style={{
                                  width: `${Math.max(1.5, lap.lapProgressPct)}%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                            <span>{formatTimerClock(lap.lapElapsedSec)} / 30:00</span>
                          </div>
                        )}
                      </div>

                      {/* スコア */}
                      <div className="hidden sm:flex flex-col items-end font-numbers tabular-nums">
                        <span className={`text-lg font-extrabold tracking-tight ${member.isMe ? 'text-primary' : 'text-ink'}`}>
                          {formatMetric(member.metricValue)}
                        </span>
                        <span className="text-xs font-semibold text-muted">
                          {progressPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
