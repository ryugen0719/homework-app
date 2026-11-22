'use client';
/* eslint-disable @next/next/no-img-element */

import {
  Award,
  Crown,
  Flame,
  Gamepad2,
  Heart,
  Rocket,
  Smile,
  Sparkles,
  Zap,
} from 'lucide-react';
import { FiBookOpen } from 'react-icons/fi';

export const STUDENT_ICON_OPTIONS = [
  { key: 'book', label: '本' },
  { key: 'star', label: '星' },
  { key: 'rocket', label: 'ロケット' },
  { key: 'sparkles', label: 'キラキラ' },
  { key: 'flame', label: '炎' },
  { key: 'crown', label: '王冠' },
  { key: 'heart', label: 'ハート' },
  { key: 'smile', label: 'スマイル' },
  { key: 'gamepad', label: 'ゲーム' },
  { key: 'zap', label: 'イナズマ' },
] as const;

export const STUDENT_COLOR_OPTIONS = [
  '#0F6F65', // Teal
  '#2563EB', // Blue
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#E11D48', // Rose
  '#059669', // Emerald
  '#EA580C', // Orange
  '#DB2777', // Pink
] as const;

export function renderPresetIcon(iconName: string, size = 16) {
  switch (iconName) {
    case 'rocket':
      return <Rocket size={size} />;
    case 'star':
      return <Award size={size} />;
    case 'flame':
      return <Flame size={size} />;
    case 'sparkles':
      return <Sparkles size={size} />;
    case 'crown':
      return <Crown size={size} />;
    case 'heart':
      return <Heart size={size} />;
    case 'smile':
      return <Smile size={size} />;
    case 'gamepad':
      return <Gamepad2 size={size} />;
    case 'zap':
      return <Zap size={size} />;
    case 'book':
    default:
      return <FiBookOpen size={size} />;
  }
}

interface StudentAvatarProps {
  avatarUrl?: string;
  icon?: string;
  color?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'size-6', icon: 12 },
  sm: { box: 'size-8', icon: 15 },
  md: { box: 'size-10', icon: 18 },
  lg: { box: 'size-12', icon: 22 },
  xl: { box: 'size-16', icon: 28 },
};

export default function StudentAvatar({
  avatarUrl,
  icon = 'book',
  color = '#0F6F65',
  name = '生徒',
  size = 'sm',
  shape = 'circle',
  className = '',
}: StudentAvatarProps) {
  const { box, icon: iconSize } = SIZE_MAP[size];
  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  if (avatarUrl) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden bg-card-subtle ring-2 ring-white/80 dark:ring-card shadow-subtle ${box} ${radiusClass} ${className}`}
      >
        <img
          src={avatarUrl}
          alt={`${name}のアイコン`}
          className="w-full h-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      style={{ backgroundColor: color || '#0F6F65' }}
      className={`inline-grid place-items-center shrink-0 text-white shadow-subtle ring-2 ring-white/80 dark:ring-card ${box} ${radiusClass} ${className}`}
      aria-label={`${name}のアイコン`}
    >
      {renderPresetIcon(icon, iconSize)}
    </span>
  );
}
