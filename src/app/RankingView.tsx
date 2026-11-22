'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Camera,
  Check,
  Clock,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Info,
  Medal,
  RefreshCw,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import StudentAvatar from '../components/StudentAvatar';
import CountUp from '../components/CountUp/CountUp';

interface RankingMember {
  studentId: string;
  displayName: string;
  color: string;
  icon: string;
  avatarUrl?: string;
  weekMinutes: number;
  weekStreakBonus: number;
  weekPhotoBonus?: number;
  weekPoints: number;
  currentStreak?: number;
  rank: number;
  isMe?: boolean;
  isOptedOut?: boolean;
}

interface RankingData {
  group: {
    id: string;
    name: string;
    inviteCode?: string;
  };
  targetWeekStart: string;
  maxPoints: number;
  members: RankingMember[];
  currentUser: {
    role: 'teacher' | 'student';
    studentId?: string;
    rankingOptOut?: boolean;
  };
}

interface RankingViewProps {
  token: string;
  role: '生徒' | '先生';
  currentStudentId?: string;
  refreshKey?: number;
  onOpenProfile?: () => void;
}

function getRankStyle(rank: number) {
  if (rank === 1) {
    return {
      badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-600/30',
      ring: 'ring-amber-500/70',
      icon: <Crown size={13} className="text-amber-700 dark:text-amber-400 fill-amber-500/20" />,
      label: '1位',
    };
  }
  if (rank === 2) {
    return {
      badge: 'bg-slate-500/12 text-slate-700 dark:text-slate-200 border-slate-500/30',
      ring: 'ring-slate-400/70',
      icon: <Medal size={13} className="text-slate-600 dark:text-slate-300" />,
      label: '2位',
    };
  }
  if (rank === 3) {
    return {
      badge: 'bg-orange-600/12 text-orange-800 dark:text-orange-300 border-orange-600/30',
      ring: 'ring-orange-500/60',
      icon: <Medal size={13} className="text-orange-700 dark:text-orange-400" />,
      label: '3位',
    };
  }
  return {
    badge: 'bg-card-subtle text-muted border-line',
    ring: 'ring-line',
    icon: null,
    label: `${rank}位`,
  };
}

export default function RankingView({ token, role, refreshKey = 0, onOpenProfile }: RankingViewProps) {
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 招待参加用モーダル
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinMessage, setJoinMessage] = useState('');

  const fetchRanking = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/ranking', {
        headers: { 'x-app-token': token },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('ランキングの取得に失敗しました');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/ranking', {
          headers: { 'x-app-token': token },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('ランキングの取得に失敗しました');
        }
        const json = await res.json();
        if (active) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : '取得に失敗しました');
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  const handleToggleOptOut = async (currentOptOut: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/ranking', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-token': token,
          },
          body: JSON.stringify({
            action: 'toggle-opt-out',
            optOut: !currentOptOut,
          }),
        });
        if (res.ok) {
          fetchRanking();
        }
      } catch {
        // ignore
      }
    });
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      setJoinMessage('');
      const res = await fetch('/api/ranking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-token': token,
        },
        body: JSON.stringify({
          action: 'join-group',
          inviteCode: joinCode.trim().toUpperCase(),
        }),
      });
      const resJson = await res.json();
      if (!res.ok) {
        setJoinMessage(resJson.error || '参加に失敗しました');
        return;
      }
      setJoinCode('');
      setShowJoinModal(false);
      fetchRanking();
    } catch {
      setJoinMessage('通信エラーが発生しました');
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <RefreshCw size={24} className="animate-spin mb-3 text-primary" />
        <p className="text-sm font-medium">読み込み中…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-line bg-card p-8 text-center my-6">
        <p className="text-danger text-sm mb-4">{error || 'データを読み込めませんでした'}</p>
        <button
          type="button"
          onClick={fetchRanking}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-card-subtle hover:bg-card border border-line text-ink cursor-pointer"
        >
          <RefreshCw size={14} />
          再読み込み
        </button>
      </div>
    );
  }

  const { group, members, maxPoints, currentUser } = data;
  const isStudent = role === '生徒';
  const myData = members.find((m) => m.isMe);
  const isOptedOut = currentUser.rankingOptOut;
  const myBonusTotal = (myData?.weekStreakBonus || 0) + (myData?.weekPhotoBonus || 0);

  // トラックのゴール基準点
  const trackMax = Math.max(maxPoints, 50);

  return (
    <div className="space-y-5">
      {/* ヘッダー＆パーソナルメトリクス */}
      <div className="rounded-3xl border border-line bg-card p-5 sm:p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="size-9 rounded-xl bg-primary-soft text-primary-ink grid place-items-center shrink-0">
              <Trophy size={18} />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight leading-tight">
                {group.name}
              </h2>
              <span className="text-[11px] font-medium text-muted">毎週月曜リセット</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {role === '先生' && group.inviteCode && (
              <button
                type="button"
                onClick={() => copyInviteCode(group.inviteCode!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-card-subtle border border-line hover:border-primary/40 text-ink transition-all cursor-pointer"
                title="招待コードをコピー"
              >
                {copiedInvite ? (
                  <>
                    <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>コピー済</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} className="text-muted" />
                    <span className="font-mono text-primary font-bold">{group.inviteCode}</span>
                  </>
                )}
              </button>
            )}

            {isStudent && onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-card-subtle hover:bg-card border border-line hover:border-primary/40 text-ink transition-all cursor-pointer"
                title="アイコンやカラーを変更"
              >
                <SlidersHorizontal size={13} className="text-primary" />
                <span>アイコン</span>
              </button>
            )}

            {isStudent && (
              <button
                type="button"
                onClick={() => handleToggleOptOut(Boolean(isOptedOut))}
                disabled={isPending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  isOptedOut
                    ? 'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-600/30'
                    : 'bg-card-subtle text-muted hover:text-ink border-line'
                }`}
                title={isOptedOut ? '現在非公開（個人モード）' : '現在公開中'}
              >
                {isOptedOut ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{isOptedOut ? '非公開' : '公開中'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                showRules
                  ? 'bg-primary-soft text-primary-ink border-primary/30'
                  : 'bg-card-subtle text-muted hover:text-ink border-line'
              }`}
              title="ポイントルールを表示"
              aria-label="ポイントルール"
              aria-expanded={showRules}
            >
              <Info size={14} />
            </button>

            <button
              type="button"
              onClick={fetchRanking}
              className="p-2 rounded-xl text-muted hover:text-ink bg-card-subtle hover:bg-card border border-line transition-all cursor-pointer"
              title="更新"
              aria-label="更新"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 開閉式ルールガイド（通常時は非表示でスッキリ） */}
        {showRules && (
          <div className="mt-4 p-3.5 rounded-2xl bg-card-subtle/80 border border-line/70 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-ink">
              <Clock size={14} className="text-primary shrink-0" />
              <span>勉強時間: <strong className="font-numbers">1分 = 1pt</strong></span>
            </div>
            <div className="flex items-center gap-2 text-ink">
              <Flame size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
              <span>連続10分+: <strong className="font-numbers">+5〜+25pt/日</strong></span>
            </div>
            <div className="flex items-center gap-2 text-ink">
              <Camera size={14} className="text-primary shrink-0" />
              <span>写真提出: <strong className="font-numbers">+5pt/日</strong></span>
            </div>
          </div>
        )}

        {/* 生徒の自分サマリー（枠線ノイズを抑えたサーフェス設計） */}
        {isStudent && myData && (
          <div className="mt-5 pt-5 border-t border-line/60 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl bg-card-subtle/70">
              <span className="text-[11px] font-semibold text-muted flex items-center gap-1 mb-1">
                <Trophy size={11} />
                順位
              </span>
              <div className="flex items-baseline gap-1 font-numbers">
                <span className="text-2xl font-extrabold text-ink tracking-tight">
                  {isOptedOut ? '—' : `${myData.rank}位`}
                </span>
                {!isOptedOut && (
                  <span className="text-xs text-muted font-medium">/{members.length}</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-primary-soft">
              <span className="text-[11px] font-semibold text-primary-ink flex items-center gap-1 mb-1">
                <Flag size={11} />
                スコア
              </span>
              <div className="flex items-baseline gap-1 font-numbers">
                <span className="text-2xl font-extrabold text-primary-ink tracking-tight">
                  <CountUp to={myData.weekPoints} duration={0.7} trigger="load" />
                </span>
                <span className="text-xs font-bold text-primary-ink">pt</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-card-subtle/70">
              <span className="text-[11px] font-semibold text-muted flex items-center gap-1 mb-1">
                <Clock size={11} />
                時間
              </span>
              <div className="flex items-baseline gap-1 font-numbers">
                <span className="text-2xl font-extrabold text-ink tracking-tight">
                  <CountUp to={myData.weekMinutes} duration={0.7} trigger="load" />
                </span>
                <span className="text-xs text-muted font-medium">分</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-card-subtle/70">
              <span className="text-[11px] font-semibold text-muted flex items-center gap-1 mb-1">
                <Flame size={11} className="text-amber-700 dark:text-amber-400" />
                ボーナス
              </span>
              <div className="flex items-baseline gap-1 font-numbers">
                <span className="text-2xl font-extrabold text-amber-800 dark:text-amber-300 tracking-tight">
                  +<CountUp to={myBonusTotal} duration={0.7} trigger="load" />
                </span>
                <span className="text-xs text-muted font-medium">pt</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* メイン：レーストラック本体 */}
      <div className="rounded-3xl border border-line bg-card shadow-card overflow-hidden">
        <div className="px-5 sm:px-6 py-3.5 border-b border-line/70 bg-card-subtle/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag size={15} className="text-primary" />
            <h3 className="font-bold text-sm text-ink tracking-tight m-0">レーストラック</h3>
          </div>
          <span className="text-xs font-semibold text-muted font-numbers">
            GOAL <strong className="text-ink">{trackMax}pt</strong>
          </span>
        </div>

        {members.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            <p>まだ参加メンバーがいません</p>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* 距離スケールヘッダー */}
            <div className="hidden sm:grid grid-cols-[120px_1fr_92px] items-center gap-4 mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-muted font-numbers">
              <span>RUNNER</span>
              <div className="flex items-center justify-between px-1">
                <span>START</span>
                <span>{Math.round(trackMax * 0.25)}</span>
                <span>{Math.round(trackMax * 0.5)}</span>
                <span>{Math.round(trackMax * 0.75)}</span>
                <span className="inline-flex items-center gap-1 text-primary-ink">
                  <Flag size={10} />
                  {trackMax}pt
                </span>
              </div>
              <span className="text-right">SCORE</span>
            </div>

            {/* レーン一覧 */}
            <div className="space-y-3">
              {members.map((member, index) => {
                const rawRatio = trackMax > 0 ? Math.min(1, member.weekPoints / trackMax) : 0;
                const percent = Math.round(rawRatio * 100);
                const rankStyle = getRankStyle(member.rank);

                const higherMember = members
                  .slice(0, index)
                  .reverse()
                  .find((m) => m.weekPoints > member.weekPoints);
                const gapToHigher = higherMember ? higherMember.weekPoints - member.weekPoints : 0;

                const laneColor = member.color || '#0F6F65';

                return (
                  <div
                    key={member.studentId}
                    className={`relative rounded-2xl p-3.5 sm:p-4 transition-all ${
                      member.isMe
                        ? 'bg-primary-soft/55 ring-1 ring-primary/35'
                        : 'bg-card-subtle/45 hover:bg-card-subtle/75'
                    }`}
                  >
                    {/* 上段：ランナー情報＆スコア */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 font-numbers ${rankStyle.badge}`}
                        >
                          {rankStyle.icon}
                          <span>{rankStyle.label}</span>
                        </span>

                        <span className="font-bold text-sm sm:text-base text-ink truncate">
                          {member.displayName}
                        </span>

                        {member.isMe && (
                          <span className="px-1.5 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold shrink-0">
                            あなた
                          </span>
                        )}

                        {(member.currentStreak || 0) >= 2 && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold shrink-0 font-numbers"
                            title={`${member.currentStreak}日連続`}
                          >
                            <Flame size={11} />
                            {member.currentStreak}日
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 ml-auto font-numbers">
                        {gapToHigher > 0 && higherMember && (
                          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-card text-[11px] font-semibold text-muted border border-line/80">
                            {higherMember.rank}位まで <strong className="text-ink ml-1">-{gapToHigher}pt</strong>
                          </span>
                        )}
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                            <CountUp to={member.weekPoints} duration={0.7} trigger="load" />
                          </span>
                          <span className="text-xs font-bold text-muted">pt</span>
                        </div>
                      </div>
                    </div>

                    {/* 中段：トラック本体 */}
                    <div className="relative h-12 sm:h-14 w-full rounded-2xl bg-card border border-line/70 px-5 sm:px-6 flex items-center overflow-hidden">
                      <span
                        className="absolute left-2.5 text-[10px] font-extrabold text-muted-soft font-numbers select-none pointer-events-none"
                        aria-hidden="true"
                      >
                        L{index + 1}
                      </span>

                      <div className="absolute inset-y-0 left-5 right-5 sm:left-6 sm:right-6 pointer-events-none">
                        <div className="absolute inset-y-2 left-1/4 border-l border-dashed border-line" />
                        <div className="absolute inset-y-2 left-1/2 border-l border-dashed border-line" />
                        <div className="absolute inset-y-2 left-3/4 border-l border-dashed border-line" />
                        <div
                          className="absolute inset-y-0 right-0 w-2 opacity-20"
                          style={{
                            backgroundImage:
                              'repeating-conic-gradient(currentColor 0% 25%, transparent 0% 50%)',
                            backgroundSize: '6px 6px',
                          }}
                        />
                      </div>

                      <div className="relative w-full h-2.5 rounded-full bg-card-subtle dark:bg-white/10">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${percent}%`,
                            background: `linear-gradient(90deg, color-mix(in srgb, ${laneColor} 45%, transparent), ${laneColor})`,
                          }}
                        />

                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-700 ease-out z-10"
                          style={{ left: `${percent}%` }}
                        >
                          <div className="relative flex items-center justify-center">
                            {member.rank === 1 && member.weekPoints > 0 && (
                              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-amber-600 dark:text-amber-400">
                                <Crown size={13} className="fill-amber-400" />
                              </span>
                            )}
                            <StudentAvatar
                              avatarUrl={member.avatarUrl}
                              icon={member.icon}
                              color={laneColor}
                              name={member.displayName}
                              size="md"
                              shape="circle"
                              className={`ring-2 ${member.isMe ? 'ring-primary' : rankStyle.ring} shadow-card`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 下段：アイコン中心のコンパクト内訳 */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold font-numbers">
                      <div className="flex items-center gap-3 text-muted">
                        <span className="inline-flex items-center gap-1" title="勉強時間">
                          <Clock size={12} />
                          {member.weekMinutes}分
                        </span>
                        {member.weekStreakBonus > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300"
                            title="連続ボーナス"
                          >
                            <Flame size={12} />
                            +{member.weekStreakBonus}
                          </span>
                        )}
                        {(member.weekPhotoBonus || 0) > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-primary-ink"
                            title="写真提出ボーナス"
                          >
                            <Camera size={12} />
                            +{member.weekPhotoBonus}
                          </span>
                        )}
                      </div>

                      {gapToHigher > 0 && higherMember && (
                        <span className="sm:hidden text-[11px] font-semibold text-muted">
                          {higherMember.rank}位まで <strong className="text-ink">-{gapToHigher}pt</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 招待コードで参加モーダル */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm animate-fade-in">
          <div className="rounded-3xl border border-line bg-card p-6 w-full max-w-md shadow-card">
            <h3 className="text-lg font-bold text-ink mb-2">グループに参加</h3>
            <p className="text-xs text-muted mb-4">
              8文字の招待コードを入力してください。
            </p>
            <form onSubmit={handleJoinGroup} className="space-y-4">
              <input
                type="text"
                maxLength={8}
                placeholder="例: A1B2C3D4"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full text-center font-mono text-xl tracking-widest uppercase px-4 py-3 rounded-2xl border border-line bg-card text-ink focus:outline-none focus:border-primary"
                required
              />

              {joinMessage && (
                <p className="text-xs text-danger text-center">{joinMessage}</p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-line text-muted hover:text-ink cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover cursor-pointer"
                >
                  参加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
