'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { RotateCcw } from 'lucide-react';

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

const HOUR_OPTIONS: WheelPickerOption<number>[] = Array.from({ length: 13 }, (_, i) => ({
  value: i,
  label: String(i),
  textValue: `${i}時間`,
}));

const MINUTE_OPTIONS: WheelPickerOption<number>[] = Array.from({ length: 60 }, (_, i) => ({
  value: i,
  label: String(i).padStart(2, '0'),
  textValue: `${i}分`,
}));

const PRESETS = [
  { label: '15分', minutes: 15 },
  { label: '30分', minutes: 30 },
  { label: '45分', minutes: 45 },
  { label: '1時間', minutes: 60 },
  { label: '1時間30分', minutes: 90 },
] as const;

interface DurationWheelPickerProps {
  minutes: number;
  onChange: (nextMinutes: number) => void;
  disabled?: boolean;
}

export default function DurationWheelPicker({
  minutes,
  onChange,
  disabled = false,
}: DurationWheelPickerProps) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  );
  const safeMinutes = Math.max(0, Math.min(779, Math.floor(minutes || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  // キーボード直接入力中の一時ドラフト（フォーカス中のみ使用し、確定時にホイールと完全同期）
  const [hourDraft, setHourDraft] = useState<string | null>(null);
  const [minDraft, setMinDraft] = useState<string | null>(null);

  const pickerClassNames = useMemo(
    () => ({
      optionItem:
        'font-numbers tabular-nums text-[15px] font-semibold text-muted/45 select-none cursor-grab active:cursor-grabbing',
      highlightWrapper: 'bg-card',
      highlightItem:
        'font-numbers tabular-nums text-[22px] font-extrabold tracking-tight text-ink',
    }),
    []
  );

  const handleHourChange = (nextHour: number) => {
    if (disabled) return;
    setHourDraft(null);
    onChange(nextHour * 60 + mins);
  };

  const handleMinuteChange = (nextMin: number) => {
    if (disabled) return;
    setMinDraft(null);
    onChange(hours * 60 + nextMin);
  };

  const commitHourInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    const parsed = digits ? Math.min(12, Number(digits)) : 0;
    onChange(parsed * 60 + mins);
    setHourDraft(null);
  };

  const commitMinInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) {
      onChange(hours * 60);
      setMinDraft(null);
      return;
    }
    const parsed = Number(digits);
    // 例: 「90」と入力した場合は 1時間30分 として自然に繰り上げる
    if (parsed >= 60) {
      const total = Math.min(779, hours * 60 + parsed);
      onChange(total);
    } else {
      onChange(hours * 60 + parsed);
    }
    setMinDraft(null);
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(12, hours + 1);
      setHourDraft(null);
      onChange(next * 60 + mins);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(0, hours - 1);
      setHourDraft(null);
      onChange(next * 60 + mins);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitHourInput(hourDraft ?? String(hours));
      e.currentTarget.blur();
    }
  };

  const handleMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextTotal = Math.min(779, safeMinutes + step);
      setMinDraft(null);
      onChange(nextTotal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextTotal = Math.max(0, safeMinutes - step);
      setMinDraft(null);
      onChange(nextTotal);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitMinInput(minDraft ?? String(mins));
      e.currentTarget.blur();
    }
  };

  return (
    <div data-vaul-no-drag="" className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      {isMobile ? (
        /* モバイル: 精密タイマー風ドラムロール入力 */
        <div className="relative rounded-2xl border border-line/90 bg-card-subtle/60 px-4 py-1 overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_2px_14px_rgba(0,0,0,0.4)]">
          {/* 中央を貫く一体型フォーカスレンズ */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 h-[38px] rounded-xl bg-card border border-line-strong/75 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.45)]"
          >
            {/* 左端のさりげないプライマリアクセントインジケーター */}
            <span className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-1 rounded-full bg-primary/80" />
          </div>

          {/* 上下の奥行きフェード（見える範囲をコンパクトに絞る） */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-9 bg-gradient-to-b from-card-subtle via-card-subtle/75 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-9 bg-gradient-to-t from-card-subtle via-card-subtle/75 to-transparent"
          />

          {/* ドラム本体（数字のみ回転・単位は中央に固定） */}
          <WheelPickerWrapper className="relative z-10 !w-fit mx-auto flex items-center !justify-center gap-2">
            <div className="flex items-center">
              <div className="w-11">
                <WheelPicker
                  options={HOUR_OPTIONS}
                  value={hours}
                  onValueChange={handleHourChange}
                  optionItemHeight={34}
                  visibleCount={12}
                  classNames={pickerClassNames}
                />
              </div>
              <span
                className="pointer-events-none select-none pl-0.5 text-xs font-bold text-muted"
                aria-hidden="true"
              >
                時間
              </span>
            </div>

            <span
              className="pointer-events-none select-none px-1 text-base font-extrabold text-muted/45 font-numbers"
              aria-hidden="true"
            >
              :
            </span>

            <div className="flex items-center">
              <div className="w-11">
                <WheelPicker
                  options={MINUTE_OPTIONS}
                  value={mins}
                  onValueChange={handleMinuteChange}
                  infinite
                  optionItemHeight={34}
                  visibleCount={12}
                  classNames={pickerClassNames}
                />
              </div>
              <span
                className="pointer-events-none select-none pl-0.5 text-xs font-bold text-muted"
                aria-hidden="true"
              >
                分
              </span>
            </div>
          </WheelPickerWrapper>
        </div>
      ) : (
        /* PC: キーボード直接入力（数字入力・Tab移動・↑↓キー対応） */
        <div className="rounded-2xl border border-line/90 bg-card-subtle/50 px-4 py-3.5">
          <div className="flex items-center justify-center gap-2.5 font-numbers tabular-nums">
            <label className="inline-flex items-baseline gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                aria-label="学習時間（時間）"
                disabled={disabled}
                value={hourDraft ?? String(hours)}
                onFocus={(e) => {
                  setHourDraft(String(hours));
                  e.currentTarget.select();
                }}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                  setHourDraft(digits);
                  if (digits !== '') {
                    const parsed = Math.min(12, Number(digits));
                    onChange(parsed * 60 + mins);
                  }
                }}
                onBlur={() => commitHourInput(hourDraft ?? String(hours))}
                onKeyDown={handleHourKeyDown}
                className="w-16 rounded-xl border border-line-strong/80 bg-card px-2 py-2 text-center text-2xl font-extrabold text-ink shadow-subtle transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs font-bold text-muted select-none">時間</span>
            </label>

            <span className="text-xl font-extrabold text-muted/50 select-none pb-0.5" aria-hidden="true">
              :
            </span>

            <label className="inline-flex items-baseline gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                aria-label="学習時間（分）"
                disabled={disabled}
                value={minDraft ?? String(mins).padStart(2, '0')}
                onFocus={(e) => {
                  setMinDraft(String(mins));
                  e.currentTarget.select();
                }}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                  setMinDraft(digits);
                  if (digits !== '' && Number(digits) < 60) {
                    onChange(hours * 60 + Number(digits));
                  }
                }}
                onBlur={() => commitMinInput(minDraft ?? String(mins))}
                onKeyDown={handleMinKeyDown}
                className="w-16 rounded-xl border border-line-strong/80 bg-card px-2 py-2 text-center text-2xl font-extrabold text-ink shadow-subtle transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs font-bold text-muted select-none">分</span>
            </label>
          </div>
          <p className="m-0 mt-2 text-center text-[11px] font-medium text-muted">
            数字を直接入力（↑↓キーで増減・Shift+↑↓で5分刻み）
          </p>
        </div>
      )}

      {/* ワンタップ時間プリセット ＋ リセット */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="よく使う時間">
        {PRESETS.map((preset) => {
          const active = safeMinutes === preset.minutes;
          return (
            <button
              key={preset.minutes}
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? 0 : preset.minutes)}
              aria-pressed={active}
              className={`inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-xs font-bold font-numbers transition-all active:scale-95 cursor-pointer ${
                active
                  ? 'border-primary bg-primary !text-white shadow-subtle'
                  : 'border-line bg-card text-muted hover:border-primary/60 hover:text-ink'
              }`}
            >
              {preset.label}
            </button>
          );
        })}

        {safeMinutes > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(0)}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted hover:text-ink hover:bg-card-subtle transition-colors cursor-pointer"
            title="時間を未設定に戻す"
          >
            <RotateCcw size={12} />
            <span>リセット</span>
          </button>
        )}
      </div>
    </div>
  );
}
