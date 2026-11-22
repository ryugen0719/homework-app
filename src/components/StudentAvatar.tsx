'use client';
/* eslint-disable @next/next/no-img-element */

export const STUDENT_COLOR_OPTIONS = [
  '#0057FF', // Cobalt Blue
  '#2563EB', // Blue
  '#00A86B', // Signal Green
  '#0F6F65', // Teal
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#E11D48', // Rose
  '#EA580C', // Orange
] as const;

export const STUDENT_ICON_OPTIONS = [] as const;

export function renderPresetIcon() {
  return null;
}

interface StudentAvatarProps {
  avatarUrl?: string;
  icon?: string;
  color?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'size-6', text: 'text-[11px]' },
  sm: { box: 'size-8', text: 'text-xs' },
  md: { box: 'size-10', text: 'text-sm' },
  lg: { box: 'size-12', text: 'text-base' },
  xl: { box: 'size-16', text: 'text-2xl' },
  '2xl': { box: 'size-24', text: 'text-3xl' },
};

export default function StudentAvatar({
  avatarUrl,
  color = '#0057FF',
  name = '生徒',
  size = 'sm',
  shape = 'circle',
  className = '',
}: StudentAvatarProps) {
  const { box, text } = SIZE_MAP[size];
  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  if (avatarUrl) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden bg-card-subtle ring-2 ring-white/80 dark:ring-card shadow-subtle ${box} ${radiusClass} ${className}`}
      >
        <img
          src={avatarUrl}
          alt={`${name}のアバター`}
          className="w-full h-full object-cover"
        />
      </span>
    );
  }

  const initial = (name || '').trim().slice(0, 1) || '学';

  return (
    <span
      style={{ backgroundColor: color || '#0057FF' }}
      className={`inline-grid place-items-center shrink-0 text-white font-bold select-none shadow-subtle ring-2 ring-white/80 dark:ring-card ${box} ${text} ${radiusClass} ${className}`}
      aria-label={`${name}のアバター`}
    >
      {initial}
    </span>
  );
}
