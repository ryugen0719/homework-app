'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface DateRangePreset {
  label: string;
  start: string;
  end: string;
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  maxDate: string;
  onChange: (start: string, end: string) => void;
  presets?: DateRangePreset[];
  className?: string;
}

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { year: y || 2026, month: m || 1, day: d || 1 };
}

function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

function getWeekdayMon0(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // 0=Mon..6=Sun
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function diffDaysInclusive(start: string, end: string): number {
  const s = new Date(`${start}T12:00:00+09:00`).getTime();
  const e = new Date(`${end}T12:00:00+09:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 1;
  return Math.max(1, Math.round(Math.abs(e - s) / 86_400_000) + 1);
}

function formatDateWithWeekday(ymd: string, showYear = false): string {
  const { year, month, day } = parseYmd(ymd);
  const wd = WEEKDAY_LABELS[getWeekdayMon0(year, month, day)];
  return showYear ? `${year}/${month}/${day} (${wd})` : `${month}/${day} (${wd})`;
}

interface CalendarCell {
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
  weekdayIndex: number; // 0=Mon..6=Sun
}

function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstWd = getWeekdayMon0(year, month, 1);
  const daysInCurr = getDaysInMonth(year, month);
  const prev = addMonths(year, month, -1);
  const daysInPrev = getDaysInMonth(prev.year, prev.month);
  const next = addMonths(year, month, 1);

  const cells: CalendarCell[] = [];

  for (let i = firstWd - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const ymd = toYmd(prev.year, prev.month, day);
    cells.push({
      ymd,
      day,
      inCurrentMonth: false,
      weekdayIndex: cells.length % 7,
    });
  }

  for (let day = 1; day <= daysInCurr; day++) {
    const ymd = toYmd(year, month, day);
    cells.push({
      ymd,
      day,
      inCurrentMonth: true,
      weekdayIndex: cells.length % 7,
    });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const ymd = toYmd(next.year, next.month, day);
    cells.push({
      ymd,
      day,
      inCurrentMonth: false,
      weekdayIndex: cells.length % 7,
    });
  }

  return cells;
}

export default function DateRangePicker({
  startDate,
  endDate,
  maxDate,
  onChange,
  presets = [],
  className = '',
}: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const maxParts = useMemo(() => parseYmd(maxDate), [maxDate]);
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => {
    const p = parseYmd(endDate || maxDate);
    return { year: p.year, month: p.month };
  });

  // 2クリック範囲選択用の一時状態
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const closePopover = () => {
    setOpen(false);
    setDraftStart(null);
    setHoverDate(null);
  };

  const togglePopover = () => {
    if (open) {
      closePopover();
    } else {
      const target = parseYmd(endDate || maxDate);
      setViewMonth({ year: target.year, month: target.month });
      setDraftStart(null);
      setHoverDate(null);
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraftStart(null);
        setHoverDate(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setDraftStart(null);
        setHoverDate(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const cells = useMemo(
    () => buildMonthGrid(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month]
  );

  // 表示上の選択範囲（ホバープレビュー対応）
  const [displayStart, displayEnd] = useMemo(() => {
    if (draftStart) {
      const candidate = hoverDate && hoverDate <= maxDate ? hoverDate : draftStart;
      return draftStart <= candidate ? [draftStart, candidate] : [candidate, draftStart];
    }
    return startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  }, [draftStart, hoverDate, maxDate, startDate, endDate]);

  const isPreviewing = Boolean(draftStart);
  const dayCount = diffDaysInclusive(startDate, endDate);
  const previewDayCount = diffDaysInclusive(displayStart, displayEnd);
  const showYearInTrigger =
    parseYmd(startDate).year !== maxParts.year || parseYmd(endDate).year !== maxParts.year;

  const canGoNextMonth =
    viewMonth.year < maxParts.year ||
    (viewMonth.year === maxParts.year && viewMonth.month < maxParts.month);
  const isCurrentMaxMonth =
    viewMonth.year === maxParts.year && viewMonth.month === maxParts.month;

  const handleSelectDay = (ymd: string) => {
    if (ymd > maxDate) return;

    if (!draftStart) {
      setDraftStart(ymd);
      setHoverDate(ymd);
      return;
    }

    const nextStart = draftStart <= ymd ? draftStart : ymd;
    const nextEnd = draftStart <= ymd ? ymd : draftStart;
    onChange(nextStart, nextEnd);
    setDraftStart(null);
    setHoverDate(null);
  };

  const handleSelectPreset = (preset: DateRangePreset) => {
    onChange(preset.start, preset.end);
    const p = parseYmd(preset.end);
    setViewMonth({ year: p.year, month: p.month });
    setDraftStart(null);
    setHoverDate(null);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* メインバー：期間トリガー + クイックプリセット */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 shadow-card">
        {/* カレンダートリガーボタン */}
        <button
          type="button"
          onClick={togglePopover}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`group inline-flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
            open
              ? 'bg-primary-soft/80 ring-1 ring-primary/40'
              : 'bg-card-subtle/75 hover:bg-card-subtle'
          }`}
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${
              open
                ? 'bg-primary text-white'
                : 'bg-card text-primary shadow-subtle'
            }`}
          >
            <Calendar size={14} />
          </span>

          <div className="flex items-center gap-1.5 font-numbers tabular-nums text-xs sm:text-sm font-bold text-ink">
            <span>{formatDateWithWeekday(startDate, showYearInTrigger)}</span>
            <ArrowRight size={13} className="text-muted shrink-0" />
            <span>{formatDateWithWeekday(endDate, showYearInTrigger)}</span>
          </div>

          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-bold font-numbers tabular-nums text-primary-ink">
            {dayCount}日間
          </span>

          <ChevronDown
            size={15}
            className={`text-muted transition-transform duration-200 ${
              open ? 'rotate-180 text-primary' : 'group-hover:text-ink'
            }`}
          />
        </button>

        {/* クイックプリセット */}
        {presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            {presets.map((preset) => {
              const active = startDate === preset.start && endDate === preset.end;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                    active
                      ? 'bg-primary text-white font-bold shadow-subtle'
                      : 'bg-card-subtle/70 text-muted hover:text-ink hover:bg-card-subtle'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* フローティングカレンダーポップオーバー */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="比較期間カレンダー"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 sm:right-auto top-full mt-2 z-40 sm:w-[332px] rounded-2xl border border-line bg-card p-4 shadow-2xl"
          >
            {/* 月ナビゲーション */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                onClick={() => setViewMonth((v) => addMonths(v.year, v.month, -1))}
                className="grid size-8 place-items-center rounded-xl text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                aria-label="前の月"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold font-numbers tabular-nums text-ink">
                  {viewMonth.year}年 {viewMonth.month}月
                </span>
                {!isCurrentMaxMonth && (
                  <button
                    type="button"
                    onClick={() =>
                      setViewMonth({ year: maxParts.year, month: maxParts.month })
                    }
                    className="rounded-md bg-card-subtle px-2 py-0.5 text-[11px] font-bold text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    今月
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={!canGoNextMonth}
                onClick={() =>
                  canGoNextMonth && setViewMonth((v) => addMonths(v.year, v.month, 1))
                }
                className={`grid size-8 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  canGoNextMonth
                    ? 'text-muted hover:text-ink hover:bg-card-subtle cursor-pointer'
                    : 'text-muted/30 cursor-not-allowed'
                }`}
                aria-label="次の月"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* 選択ステップのガイド */}
            <div
              className={`mb-3 flex items-center justify-between rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                isPreviewing
                  ? 'bg-primary-soft text-primary-ink'
                  : 'bg-card-subtle/70 text-muted'
              }`}
            >
              <span>
                {isPreviewing
                  ? '終了日を選択してください'
                  : '開始日と終了日をタップして選択'}
              </span>
              <span className="font-numbers tabular-nums font-bold">
                {previewDayCount}日間
              </span>
            </div>

            {/* 曜日ヘッダー（月曜始まり） */}
            <div className="grid grid-cols-7 mb-1.5 text-center">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={`py-1 text-[11px] font-bold ${
                    idx === 5
                      ? 'text-primary/80'
                      : idx === 6
                        ? 'text-rose-400/85'
                        : 'text-muted'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div
              className="grid grid-cols-7 gap-y-1"
              onMouseLeave={() => {
                if (draftStart) setHoverDate(draftStart);
              }}
            >
              {cells.map((cell) => {
                const disabled = cell.ymd > maxDate;
                const isToday = cell.ymd === maxDate;
                const isStart = cell.ymd === displayStart;
                const isEnd = cell.ymd === displayEnd;
                const isSingleDay = displayStart === displayEnd;
                const isInRange =
                  !disabled && cell.ymd > displayStart && cell.ymd < displayEnd;
                const isEndpoint = !disabled && (isStart || isEnd);

                return (
                  <div
                    key={cell.ymd}
                    className="relative h-9 flex items-center justify-center"
                  >
                    {/* 連続する範囲ハイライト帯 */}
                    {!isSingleDay && !disabled && (isInRange || isStart || isEnd) && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-y-0.5 ${
                          isPreviewing ? 'bg-primary-soft/65' : 'bg-primary-soft'
                        } ${
                          isStart
                            ? 'left-1/2 right-0'
                            : isEnd
                              ? 'left-0 right-1/2'
                              : 'inset-x-0'
                        }`}
                      />
                    )}

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectDay(cell.ymd)}
                      onMouseEnter={() => {
                        if (draftStart && !disabled) setHoverDate(cell.ymd);
                      }}
                      aria-label={formatDateWithWeekday(cell.ymd, true)}
                      aria-pressed={isEndpoint}
                      className={`relative z-10 flex size-8 flex-col items-center justify-center rounded-lg text-xs font-numbers tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                        disabled
                          ? 'text-muted/25 cursor-not-allowed'
                          : isEndpoint
                            ? 'bg-primary text-white font-extrabold shadow-subtle cursor-pointer'
                            : isInRange
                              ? 'text-primary-ink font-bold hover:bg-primary/20 cursor-pointer'
                              : cell.inCurrentMonth
                                ? 'text-ink font-semibold hover:bg-card-subtle cursor-pointer'
                                : 'text-muted/45 font-medium hover:bg-card-subtle/60 cursor-pointer'
                      }`}
                    >
                      <span>{cell.day}</span>
                      {isToday && (
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 size-1 rounded-full ${
                            isEndpoint ? 'bg-white' : 'bg-primary'
                          }`}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* フッター：選択中の期間サマリーと閉じるボタン */}
            <div className="mt-3.5 pt-3 border-t border-line/70 flex items-center justify-between gap-2">
              <div className="text-xs font-bold font-numbers tabular-nums text-ink truncate">
                {formatDateWithWeekday(displayStart)} 〜 {formatDateWithWeekday(displayEnd)}
              </div>

              <button
                type="button"
                onClick={closePopover}
                className="shrink-0 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-hover transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              >
                完了
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
