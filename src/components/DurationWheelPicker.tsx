'use client';

import { useMemo } from 'react';
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker';
import '@ncdai/react-wheel-picker/style.css';
import { RotateCcw } from 'lucide-react';

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
  const safeMinutes = Math.max(0, Math.min(779, Math.floor(minutes || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  const pickerClassNames = useMemo(
    () => ({
      optionItem:
        'font-numbers tabular-nums text-[15px] font-semibold text-muted/45 select-none cursor-grab active:cursor-grabbing',
      highlightWrapper: 'bg-transparent',
      highlightItem:
        'font-numbers tabular-nums text-[22px] font-extrabold tracking-tight text-ink',
    }),
    []
  );

  const handleHourChange = (nextHour: number) => {
    if (disabled) return;
    onChange(nextHour * 60 + mins);
  };

  const handleMinuteChange = (nextMin: number) => {
    if (disabled) return;
    onChange(hours * 60 + nextMin);
  };

  return (
    <div data-vaul-no-drag="" className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      {/* リッチな精密タイマー風ドラムロール窓（コンパクト3行表示・単位固定） */}
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
