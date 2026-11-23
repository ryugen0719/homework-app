'use client';

import { motion } from 'motion/react';

interface AppTitleProps {
  variant?: 'header' | 'hero';
  badge?: string;
  subtitle?: string;
}

/**
 * 宿題ノート専用のシンプルなノートマークSVG（装飾やグラデーションを排したフラット造形）
 */
function NotebookMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* ノート本体 */}
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="3"
        className="fill-primary/12 stroke-primary"
        strokeWidth="1.8"
      />
      {/* 背表紙ライン */}
      <line
        x1="8.5"
        y1="3.5"
        x2="8.5"
        y2="20.5"
        className="stroke-primary"
        strokeWidth="1.6"
      />
      {/* 書き込まれた2本の罫線 */}
      <line
        x1="11.5"
        y1="9"
        x2="16.5"
        y2="9"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="11.5"
        y1="13"
        x2="15"
        y2="13"
        className="stroke-primary/65"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TITLE_CHARS = ['宿', '題', 'ノ', 'ー', 'ト'] as const;

export default function AppTitle({
  variant = 'header',
  badge,
  subtitle,
}: AppTitleProps) {
  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mb-3 grid size-13 place-items-center rounded-2xl bg-card border border-line shadow-subtle"
        >
          <NotebookMark size={28} />
        </motion.div>

        <h1 className="m-0 flex items-center justify-center text-2xl sm:text-[28px] font-extrabold tracking-[-0.02em] text-ink leading-tight">
          {TITLE_CHARS.map((char, idx) => (
            <motion.span
              key={`${char}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.28,
                delay: 0.04 * idx,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block"
            >
              {char}
            </motion.span>
          ))}
        </h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.22 }}
            className="m-0 mt-2 text-xs sm:text-sm text-muted"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 min-w-0 select-none">
      <motion.span
        whileHover={{ rotate: -4 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-xl bg-card border border-line/80 shadow-subtle"
      >
        <NotebookMark size={20} />
      </motion.span>

      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-extrabold text-[15px] sm:text-[17px] tracking-[-0.02em] text-ink leading-none whitespace-nowrap">
          宿題ノート
        </span>
        {badge && (
          <span className="text-[11px] font-semibold text-muted leading-none shrink-0">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
