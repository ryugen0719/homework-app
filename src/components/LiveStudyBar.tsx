'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, Trophy, X } from 'lucide-react';
import {
  formatJstClockTime,
  formatTimerClock,
  getLapProgress,
  LiveTimerState,
} from '../hooks/useLiveTimer';

interface LiveStudyBarProps {
  timer: LiveTimerState;
  elapsedSec: number;
  busy: boolean;
  showRaceShortcut: boolean;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onOpenRace: () => void;
}

/**
 * 生徒がリアルタイム勉強計測中のみ画面下部に表示されるスリムなフローティングバー。
 * 上端に60秒の+1分プログレスラインを備え、毎分の前進感を伝える。
 */
export default function LiveStudyBar({
  timer,
  elapsedSec,
  busy,
  showRaceShortcut,
  onPause,
  onResume,
  onFinish,
  onCancel,
  onOpenRace,
}: LiveStudyBarProps) {
  const isRunning = timer.status === 'running';
  const isStalePaused = !isRunning && (timer.isStale || timer.autoPausedReason === 'stale');
  const flooredMinutes = Math.floor(elapsedSec / 60);
  const { lapNumber, minuteProgressPct } = getLapProgress(elapsedSec);
  const startedLabel = formatJstClockTime(timer.startedAt);
  const offlineLabel = formatJstClockTime(timer.offlineSince || timer.lastHeartbeatAt);

  const prevMinRef = useRef(flooredMinutes);
  const [minutePulse, setMinutePulse] = useState(false);

  useEffect(() => {
    if (flooredMinutes > prevMinRef.current) {
      prevMinRef.current = flooredMinutes;
      const startTimer = window.setTimeout(() => setMinutePulse(true), 0);
      const clearTimer = window.setTimeout(() => setMinutePulse(false), 1800);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(clearTimer);
      };
    }
    prevMinRef.current = flooredMinutes;
    return undefined;
  }, [flooredMinutes]);

  return (
    <div
      role="region"
      aria-label="リアルタイム勉強タイマー"
      className="fixed inset-x-0 bottom-3 sm:bottom-4 z-40 px-3 sm:px-4 pointer-events-none"
    >
      <div className="mx-auto max-w-xl pointer-events-auto relative overflow-hidden rounded-2xl border border-line bg-card/95 backdrop-blur-md shadow-2xl">
        {/* 次の+1分（+1pt）が満ちていく60秒プログレスライン */}
        <div className="h-1 w-full bg-card-subtle overflow-hidden" aria-hidden="true">
          <div
            className={`h-full transition-[width] duration-700 ease-linear ${
              isRunning ? 'bg-primary live-shimmer' : 'bg-amber-500/70'
            }`}
            style={{ width: `${minuteProgressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5">
          {/* 左: ステータス・経過時間・ラップ */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
              {isRunning ? (
                <>
                  <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
                  <span className="relative inline-flex rounded-full size-2.5 bg-reward" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
              )}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-extrabold font-numbers tabular-nums text-ink tracking-tight leading-none">
                  {formatTimerClock(elapsedSec)}
                </span>
                <span className="text-[10px] font-extrabold font-numbers px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-ink shrink-0">
                  LAP {lapNumber}
                </span>
                {minutePulse && (
                  <span className="text-[10px] font-extrabold font-numbers px-1.5 py-0.5 rounded-full bg-reward-soft text-reward-ink animate-bounce shrink-0">
                    +1分
                  </span>
                )}
              </div>
              <p className="m-0 mt-0.5 text-[11px] font-semibold text-muted truncate font-numbers tabular-nums">
                {isRunning
                  ? flooredMinutes > 0
                    ? `勉強中 · ${flooredMinutes}分記録可${startedLabel ? `（${startedLabel}〜）` : ''}`
                    : `勉強中 · 1分以上で記録可${startedLabel ? `（${startedLabel}〜）` : ''}`
                  : isStalePaused
                    ? '2時間以上画面非表示のため自動一時停止'
                    : timer.isCapped
                      ? '最大4時間に達しました（終了して記録してください）'
                      : `一時停止中${startedLabel ? ` · 開始 ${startedLabel}` : ''}`}
              </p>
            </div>
          </div>

          {/* 右: コントロール */}
          <div className="flex items-center gap-1.5 shrink-0">
            {showRaceShortcut && (
              <button
                type="button"
                onClick={onOpenRace}
                className="grid size-8 place-items-center rounded-xl text-muted hover:text-primary hover:bg-primary-soft/60 transition-colors cursor-pointer"
                title="レースを見る"
                aria-label="レースを見る"
              >
                <Trophy size={15} />
              </button>
            )}

            {isRunning ? (
              <button
                type="button"
                disabled={busy}
                onClick={onPause}
                className="grid size-8 place-items-center rounded-xl bg-card-subtle hover:bg-line/60 text-ink transition-colors cursor-pointer disabled:opacity-50"
                title="一時停止"
                aria-label="一時停止"
              >
                <Pause size={14} />
              </button>
            ) : (
              !timer.isCapped && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onResume}
                  className="grid size-8 place-items-center rounded-xl bg-card-subtle hover:bg-line/60 text-ink transition-colors cursor-pointer disabled:opacity-50"
                  title="再開"
                  aria-label="再開"
                >
                  <Play size={14} className="translate-x-[0.5px]" />
                </button>
              )
            )}

            <button
              type="button"
              disabled={busy}
              onClick={onFinish}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary !text-white text-xs font-bold hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
            >
              <Check size={14} strokeWidth={2.6} className="!text-white" />
              <span className="!text-white">終了して記録</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="grid size-8 place-items-center rounded-xl text-muted hover:text-danger hover:bg-error-soft transition-colors cursor-pointer disabled:opacity-50"
              title="計測をキャンセル"
              aria-label="計測をキャンセル"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 2時間以上画面非表示による自動停止時の詳細バー */}
        {isStalePaused && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 font-numbers tabular-nums">
            <span>2時間以上画面がオフだったため自動で一時停止しました</span>
            <span className="text-[10px] opacity-90">
              {startedLabel ? `計測開始 ${startedLabel}` : ''}
              {startedLabel && offlineLabel ? ' · ' : ''}
              {offlineLabel ? `画面オフ ${offlineLabel}頃` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
