'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Drawer } from 'vaul';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Calendar,
  Check,
  Clock,
  LoaderCircle,
  Plus,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import HoldButton from './HoldButton/HoldButton';
import DurationWheelPicker from './DurationWheelPicker';
import CountUp from './CountUp/CountUp';
import { formatDuration } from '../lib/format-duration';
import { ui } from '../app/ui';
import { playAppSound } from './sounds';

function subscribeMobile(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(max-width: 639px)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getIsMobileSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 639px)').matches;
}

function getIsMobileServerSnapshot() {
  return false;
}

export interface StudyComposerDraft {
  id: string;
  content: string;
  minutes: string;
}

export interface StudyPointPreview {
  timePoints: number;
  streakBonus: number;
  totalPoints: number;
}

interface CelebrationState {
  minutes: number;
  points: number;
  streakBonus: number;
  newDayTotalMinutes: number;
}

interface StudyComposerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateLabel: string;
  dayTotalMinutes: number;
  draft: StudyComposerDraft;
  onChangeDraft: (patch: Partial<StudyComposerDraft>) => void;
  onSave: () => Promise<boolean>;
  onCancelEdit: () => void;
  onNotify: (message: string) => void;
  onError: (message: string) => void;
  error?: string;
  saving: boolean;
  disabled: boolean;
  pointPreview: StudyPointPreview | null;
}

const AUTO_CLOSE_MS = 3400;

export default function StudyComposerModal({
  open,
  onOpenChange,
  dateLabel,
  dayTotalMinutes,
  draft,
  onChangeDraft,
  onSave,
  onCancelEdit,
  onNotify,
  onError,
  error,
  saving,
  disabled,
  pointPreview,
}: StudyComposerModalProps) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);

  const isEditing = Boolean(draft.id);
  const hasContent = Boolean(draft.content.trim());
  const parsedMinutes = draft.minutes.trim() ? Math.max(0, Number(draft.minutes) || 0) : 0;
  const preventAccidentalClose = saving || (hasContent && !celebration);

  // PC で新規・編集フォームを開いた直後にテキストエリアへフォーカス
  useEffect(() => {
    if (!open || isMobile || celebration) return;
    const id = window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, isMobile, celebration]);

  // 完了リビール表示後の自動クローズタイマー
  useEffect(() => {
    if (!celebration || !open) return;
    const timer = window.setTimeout(() => {
      setCelebration(null);
      onOpenChange(false);
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [celebration, open, onOpenChange]);

  const handleClose = () => {
    if (saving) return;
    if (celebration) {
      setCelebration(null);
      onOpenChange(false);
      return;
    }
    if (isEditing) {
      onCancelEdit();
    }
    onOpenChange(false);
  };

  const handleRecordAnother = () => {
    setCelebration(null);
  };

  const handleSave = () => {
    const wasEditing = isEditing;
    const snapshotMinutes = parsedMinutes;
    const snapshotPoints = pointPreview?.totalPoints ?? 0;
    const snapshotStreakBonus = pointPreview?.streakBonus ?? 0;
    const snapshotDayTotal = dayTotalMinutes + snapshotMinutes;

    void onSave().then((ok) => {
      if (!ok) return;
      if (wasEditing) {
        playAppSound('streak');
        onOpenChange(false);
        return;
      }

      // 連続ボーナス獲得時はトレジャー音、通常記録時はストリーク音を再生
      playAppSound(snapshotStreakBonus > 0 ? 'treasure' : 'streak');

      // 新規記録時: モーダル内完了リビール＋控えめな紙吹雪
      setCelebration({
        minutes: snapshotMinutes,
        points: snapshotPoints,
        streakBonus: snapshotStreakBonus,
        newDayTotalMinutes: snapshotDayTotal,
      });

      if (
        typeof window !== 'undefined' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        void confetti({
          particleCount: 38,
          spread: 58,
          startVelocity: 28,
          scalar: 0.9,
          ticks: 160,
          origin: { y: 0.58 },
          colors: ['#0057FF', '#3B82F6', '#00A86B', '#34D399', '#F59E0B'],
          disableForReducedMotion: true,
        });
      }
    });
  };

  const celebrationView = celebration ? (
    <motion.div
      key="celebration"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      data-vaul-no-drag=""
      className="flex flex-col items-center text-center px-6 pt-8 pb-6"
    >
      {/* チェックマーク・ドロー＆リングパルス */}
      <div className="relative mb-4 grid size-16 place-items-center">
        <motion.span
          initial={{ scale: 0.7, opacity: 0.55 }}
          animate={{ scale: 1.55, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="absolute inset-0 rounded-full border-2 border-primary"
          aria-hidden="true"
        />
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          className="grid size-16 place-items-center rounded-full bg-primary text-white shadow-card"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <motion.path
              d="M5 13l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.42, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
        </motion.div>
      </div>

      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.28 }}
        className="m-0 text-lg font-extrabold tracking-tight text-ink"
      >
        勉強を記録しました
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.28 }}
        className="m-0 mt-1 text-xs font-medium text-muted"
      >
        こつこつ積み上げていますね
      </motion.p>

      {/* 獲得ポイント・学習時間ハイライト */}
      {(celebration.points > 0 || celebration.minutes > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3 }}
          className="mt-5 w-full rounded-2xl border border-line/80 bg-card-subtle/50 px-4 py-3.5"
        >
          {celebration.points > 0 && (
            <div className="flex items-center justify-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <span className="text-2xl font-extrabold font-numbers tracking-tight text-primary-ink">
                <CountUp
                  to={celebration.points}
                  from={0}
                  duration={0.8}
                  prefix="+"
                  suffix=" pt"
                  mode="roll"
                  trigger="load"
                />
              </span>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted font-numbers">
            {celebration.minutes > 0 && (
              <span className="inline-flex items-center gap-1 text-ink">
                <Clock size={12} className="text-primary" />
                今回 {formatDuration(celebration.minutes)}
              </span>
            )}
            {celebration.newDayTotalMinutes > 0 && (
              <span>
                この日の合計 {formatDuration(celebration.newDayTotalMinutes)}
              </span>
            )}
          </div>

          {celebration.streakBonus > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 font-numbers">
              <Trophy size={11} />
              <span>連続ボーナス +{celebration.streakBonus}pt 獲得</span>
            </div>
          )}
        </motion.div>
      )}

      {/* 自動クローズ進行バー */}
      <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-line/60">
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: AUTO_CLOSE_MS / 1000, ease: 'linear' }}
          style={{ transformOrigin: 'left' }}
          className="h-full w-full bg-primary/70"
        />
      </div>

      {/* アクション */}
      <div className="mt-4 flex w-full flex-col-reverse sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 px-4 py-2.5 text-xs font-semibold rounded-xl border border-line bg-card text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
        >
          とじる
        </button>
        <button
          type="button"
          onClick={handleRecordAnother}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-primary !text-white hover:bg-primary-hover active:scale-95 transition-all shadow-subtle cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.5} className="!text-white" />
          <span className="!text-white">もう1件記録する</span>
        </button>
      </div>
    </motion.div>
  ) : null;

  const formContent = (
    <motion.div
      key="composer-form"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        data-vaul-no-drag=""
        className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
      >
        {/* セクション1: 勉強した内容 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="study-content-modal"
              className="text-xs font-bold text-ink"
            >
              勉強した内容 <span className="text-danger">*</span>
            </label>
            <span className="text-[11px] font-numbers text-muted">
              {draft.content.length} / 1000
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="study-content-modal"
            className={`${ui.textArea} min-h-[96px]`}
            rows={3}
            maxLength={1000}
            value={draft.content}
            disabled={disabled || saving}
            onChange={(event) => onChangeDraft({ content: event.target.value })}
            placeholder="例：算数の問題集を5ページ進めた"
          />
        </div>

        {/* セクション2: タイマー式ドラムロール時間入力 */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <Clock size={14} className="text-primary" />
              <span>学習時間（任意）</span>
            </span>
            <span
              className={`text-xs font-extrabold font-numbers px-2.5 py-0.5 rounded-full transition-colors ${
                parsedMinutes > 0
                  ? 'bg-primary-soft text-primary-ink'
                  : 'bg-card-subtle text-muted'
              }`}
            >
              {parsedMinutes > 0 ? formatDuration(parsedMinutes) : '時間なし'}
            </span>
          </div>

          <DurationWheelPicker
            minutes={parsedMinutes}
            disabled={disabled || saving}
            onChange={(nextMins) =>
              onChangeDraft({ minutes: nextMins > 0 ? String(nextMins) : '' })
            }
          />
        </div>

        {/* 保存前ポイント予告 */}
        {pointPreview && (
          <div className="px-3.5 py-2.5 rounded-xl bg-primary-soft/80 border border-primary/20 flex flex-wrap items-center justify-between gap-2 text-xs font-numbers">
            <div className="flex items-center gap-3 text-muted font-semibold">
              <span className="inline-flex items-center gap-1 text-ink">
                <Clock size={13} className="text-primary" />
                {pointPreview.timePoints}pt
              </span>
              {pointPreview.streakBonus > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-bold">
                  <Trophy size={13} className="text-amber-700 dark:text-amber-400" />
                  連続 +{pointPreview.streakBonus}pt
                </span>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-primary-ink">
              <Sparkles size={13} />
              +{pointPreview.totalPoints} pt
            </span>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <p
            role="alert"
            className="m-0 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-semibold text-danger"
          >
            {error}
          </p>
        )}
      </div>

      {/* フッター */}
      <div
        data-vaul-no-drag=""
        className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 px-5 py-3.5 border-t border-line/70 bg-card-subtle/40"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold rounded-xl border border-line bg-card text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-50"
        >
          {isEditing ? '編集をやめる' : '閉じる'}
        </button>
        <HoldButton
          size="md"
          radius={14}
          holdTime={900}
          waveAmplitude={3}
          backgroundColor="var(--color-primary)"
          fillColor="var(--color-primary-hover, #0047D4)"
          textColor="#ffffff"
          fillTextColor="#ffffff"
          wave={true}
          glow={true}
          disabled={disabled || saving || !hasContent}
          onHold={handleSave}
          onTap={() => {
            if (!hasContent) {
              onError('勉強した内容を入力してください。');
              return;
            }
            onNotify('長押しすると記録できます');
          }}
          icon={
            saving ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Check size={16} strokeWidth={2.4} />
            )
          }
          doneIcon={<Check size={16} strokeWidth={2.6} />}
          doneLabel={isEditing ? '保存しました' : '記録しました'}
          className="w-full sm:w-auto font-bold text-sm tracking-wide shadow-subtle hover:shadow-card cursor-pointer !text-white"
        >
          {saving ? '保存中…' : isEditing ? '長押しで保存' : '長押しで記録'}
        </HoldButton>
      </div>
    </motion.div>
  );

  // モバイル: Vaul ボトムシートドロワー
  if (isMobile) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleClose();
          } else {
            onOpenChange(true);
          }
        }}
        dismissible={!preventAccidentalClose}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mt-12 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-line bg-card shadow-2xl outline-none overflow-hidden">
            {/* ドラッグハンドル */}
            <div className="mx-auto mt-3 mb-1 h-1.5 w-11 shrink-0 rounded-full bg-line-strong/80" />

            {!celebration ? (
              <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-3 border-b border-line/60">
                <div className="min-w-0">
                  <Drawer.Title className="m-0 text-base font-extrabold text-ink tracking-tight">
                    {isEditing ? '記録を編集' : '勉強を記録'}
                  </Drawer.Title>
                  <Drawer.Description className="m-0 mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
                    <Calendar size={12} className="text-primary" />
                    <span>{dateLabel}</span>
                  </Drawer.Description>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-40"
                  aria-label="閉じる"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <>
                <Drawer.Title className="sr-only">勉強を記録しました</Drawer.Title>
                <Drawer.Description className="sr-only">記録完了サマリー</Drawer.Description>
              </>
            )}

            <AnimatePresence mode="wait">
              {celebration ? celebrationView : formContent}
            </AnimatePresence>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // デスクトップ: Radix Dialog 中央モーダル
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onInteractOutside={(event) => {
            if (preventAccidentalClose) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (saving) {
              event.preventDefault();
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl outline-none"
        >
          {!celebration ? (
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line/60">
              <div className="min-w-0">
                <Dialog.Title className="m-0 text-base font-extrabold text-ink tracking-tight">
                  {isEditing ? '記録を編集' : '勉強を記録'}
                </Dialog.Title>
                <Dialog.Description className="m-0 mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
                  <Calendar size={12} className="text-primary" />
                  <span>{dateLabel}</span>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={saving}
                  className="p-2 rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer disabled:opacity-40"
                  aria-label="閉じる"
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <>
              <Dialog.Title className="sr-only">勉強を記録しました</Dialog.Title>
              <Dialog.Description className="sr-only">記録完了サマリー</Dialog.Description>
            </>
          )}

          <AnimatePresence mode="wait">
            {celebration ? celebrationView : formContent}
          </AnimatePresence>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
