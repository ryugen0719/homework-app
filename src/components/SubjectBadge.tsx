'use client';

import { classifySubject } from '../lib/subject-classifier';

interface SubjectBadgeProps {
  content: string;
  className?: string;
}

/**
 * 記録内容から自動分類された教科・テーマを小さく表示するバッジ
 */
export default function SubjectBadge({ content, className = '' }: SubjectBadgeProps) {
  const subject = classifySubject(content);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight leading-snug shrink-0 whitespace-nowrap ${subject.pillClass} ${className}`}
      title={`教科分類: ${subject.name}`}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: subject.color }}
        aria-hidden="true"
      />
      <span>{subject.name}</span>
    </span>
  );
}
