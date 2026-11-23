'use client';

import { ChevronRight } from 'lucide-react';
import StudentAvatar from './StudentAvatar';
import { formatTimerClock, LiveMemberComputed } from '../hooks/useLiveTimer';

interface LivePresencePillProps {
  members: LiveMemberComputed[];
  onClick: () => void;
}

/**
 * 普段の画面で「あの人がいま勉強しているんだ！」と自然に分かる控えめなプレゼンスピル。
 * 他のメンバーが勉強中でないときは何も表示せず、既存UIを一切崩さない。
 */
export default function LivePresencePill({ members, onClick }: LivePresencePillProps) {
  if (members.length === 0) return null;

  const first = members[0];
  const othersCount = members.length - 1;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full bg-reward-soft/90 hover:bg-reward-soft border border-reward/25 text-xs font-bold text-reward-ink shadow-subtle transition-all cursor-pointer active:scale-[0.98] max-w-full"
      title="レース画面で勉強中の様子を見る"
    >
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-reward opacity-75" />
        <span className="relative inline-flex rounded-full size-2 bg-reward" />
      </span>

      <span className="flex items-center -space-x-1.5 shrink-0">
        {members.slice(0, 3).map((m) => (
          <StudentAvatar
            key={m.studentId}
            avatarUrl={m.avatarUrl}
            icon={m.icon}
            color={m.color}
            name={m.displayName}
            size="xs"
            shape="circle"
            className="!ring-2 !ring-card"
          />
        ))}
      </span>

      <span className="truncate">
        {othersCount === 0
          ? `${first.displayName}さんが勉強中`
          : `${first.displayName}さん ほか${othersCount}人が勉強中`}
      </span>

      {othersCount === 0 && (
        <span className="font-numbers tabular-nums text-[11px] font-extrabold px-1.5 py-0.5 rounded-md bg-card/80 text-ink shrink-0">
          {formatTimerClock(first.liveElapsedSec)}
        </span>
      )}

      <ChevronRight
        size={13}
        className="text-reward-ink/70 group-hover:translate-x-0.5 transition-transform shrink-0"
        aria-hidden="true"
      />
    </button>
  );
}
