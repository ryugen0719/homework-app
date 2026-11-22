'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Calendar,
  Camera,
  Check,
  Clock,
  Compass,
  Flame,
  Lock,
  RotateCw,
  Sun,
  Zap,
} from 'lucide-react';
import type { DayEntry } from '../app/TimelineView';
import FlipCard from './FlipCard/FlipCard';

interface AchievementDeckProps {
  entries: Record<string, DayEntry>;
  longestStreak: number;
  subjectRules: ReadonlyArray<{ name: string; color: string; keywords: string[] }>;
}

interface CardTier {
  level: number;
  title: string;
  targetValue: number;
  condition: string;
  message: string;
}

interface CollectibleCard {
  id: string;
  number: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  currentValue: number;
  unit: string;
  tiers: CardTier[];
  currentLevel: number; // 0 (未解放) 〜 5 (LEGEND)
  maxLevel: number;
  currentTier: CardTier | null;
  nextTier: CardTier | null;
  progressPercent: number;
  progressText: string;
}

type FilterMode = 'all' | 'unlocked' | 'locked';

const CARD_THEMES: Record<
  number,
  {
    rarity: string;
    label: string;
    surface: string;
    aura: string;
    ring: string;
    accentText: string;
    pill: string;
    pipActive: string;
    slotColor: string;
    shadowColor: string;
    glareOpacity: number;
  }
> = {
  0: {
    rarity: 'LOCKED',
    label: '未解放',
    surface: 'linear-gradient(155deg, #23262d 0%, #16181d 100%)',
    aura: 'radial-gradient(circle at 50% 28%, rgba(148,163,184,0.12), transparent 65%)',
    ring: 'rgba(255,255,255,0.08)',
    accentText: '#94A3B8',
    pill: 'bg-white/8 text-slate-300 border-white/10',
    pipActive: 'bg-slate-400',
    slotColor: 'bg-line/80',
    shadowColor: '#000000',
    glareOpacity: 0.08,
  },
  1: {
    rarity: 'BRONZE',
    label: 'Lv.1 ブロンズ',
    surface: 'linear-gradient(155deg, #3c2618 0%, #20140d 55%, #2d1c12 100%)',
    aura: 'radial-gradient(circle at 50% 25%, rgba(217,119,6,0.34), transparent 65%)',
    ring: 'rgba(245,158,11,0.32)',
    accentText: '#FBBF24',
    pill: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    pipActive: 'bg-amber-400',
    slotColor: 'bg-amber-700',
    shadowColor: '#78350f',
    glareOpacity: 0.22,
  },
  2: {
    rarity: 'SILVER',
    label: 'Lv.2 シルバー',
    surface: 'linear-gradient(155deg, #333c4a 0%, #171c24 55%, #252d3a 100%)',
    aura: 'radial-gradient(circle at 50% 25%, rgba(226,232,240,0.28), transparent 65%)',
    ring: 'rgba(226,232,240,0.34)',
    accentText: '#E2E8F0',
    pill: 'bg-slate-200/15 text-slate-100 border-slate-200/30',
    pipActive: 'bg-slate-200',
    slotColor: 'bg-slate-400',
    shadowColor: '#334155',
    glareOpacity: 0.28,
  },
  3: {
    rarity: 'GOLD',
    label: 'Lv.3 ゴールド',
    surface: 'linear-gradient(155deg, #423110 0%, #1a1407 52%, #35270c 100%)',
    aura: 'radial-gradient(circle at 50% 25%, rgba(250,204,21,0.42), transparent 62%)',
    ring: 'rgba(250,204,21,0.48)',
    accentText: '#FDE047',
    pill: 'bg-yellow-400/20 text-yellow-200 border-yellow-300/40',
    pipActive: 'bg-yellow-300',
    slotColor: 'bg-amber-500',
    shadowColor: '#b45309',
    glareOpacity: 0.34,
  },
  4: {
    rarity: 'PLATINUM',
    label: 'Lv.4 プラチナ',
    surface: 'linear-gradient(155deg, #0d3b36 0%, #081c1a 52%, #0f3338 100%)',
    aura: 'radial-gradient(circle at 50% 25%, rgba(45,212,191,0.42), transparent 62%)',
    ring: 'rgba(94,234,212,0.48)',
    accentText: '#5EEAD4',
    pill: 'bg-teal-400/20 text-teal-100 border-teal-300/40',
    pipActive: 'bg-teal-300',
    slotColor: 'bg-teal-500',
    shadowColor: '#0f766e',
    glareOpacity: 0.38,
  },
  5: {
    rarity: 'LEGEND',
    label: 'Lv.5 レジェンド',
    surface: 'linear-gradient(145deg, #172554 0%, #131126 48%, #3b0764 100%)',
    aura: 'radial-gradient(circle at 50% 25%, rgba(129,140,248,0.5), rgba(232,121,249,0.22) 45%, transparent 70%)',
    ring: 'rgba(165,180,252,0.6)',
    accentText: '#C7D2FE',
    pill: 'bg-indigo-400/25 text-indigo-100 border-indigo-300/50',
    pipActive: 'bg-cyan-300',
    slotColor: 'bg-indigo-500',
    shadowColor: '#4f46e5',
    glareOpacity: 0.44,
  },
};

export default function AchievementDeck({
  entries,
  longestStreak,
  subjectRules,
}: AchievementDeckProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  const cards = useMemo((): CollectibleCard[] => {
    const allDays = Object.values(entries).filter((d) => (d?.sessions?.length || 0) > 0);
    const allDaysCount = allDays.length;
    const allSessions = allDays.flatMap((d) => d.sessions || []);
    const allTotalMinutes = allSessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
    const maxSingleSessionMinutes = Math.max(0, ...allSessions.map((s) => s.minutes || 0));
    const allPhotoCount = allSessions.filter((s) => Boolean(s.evidencePath)).length;
    const allReviewedCount = Object.values(entries).filter((d) => Boolean(d?.review?.reviewedAt)).length;

    const weekendDaysCount = allDays.filter((d) => {
      try {
        const wd = new Date(`${d.date}T12:00:00+09:00`).getDay();
        return wd === 0 || wd === 6;
      } catch {
        return false;
      }
    }).length;

    const touchedSubjects = new Set<string>();
    allSessions.forEach((s) => {
      const text = s.content.toLowerCase();
      for (const rule of subjectRules) {
        if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
          touchedSubjects.add(rule.name);
          break;
        }
      }
    });
    const touchedSubjectsCount = touchedSubjects.size;

    const definitions = [
      {
        id: 'streak_flame',
        number: '01',
        name: '継続の炎',
        icon: Flame,
        currentValue: longestStreak,
        unit: '日',
        tiers: [
          { level: 1, title: '小さな火種', targetValue: 3, condition: '3日連続で記録', message: '三日坊主を突破した最初の証。' },
          { level: 2, title: 'かがり火', targetValue: 7, condition: '7日連続で記録', message: '1週間途切れず続けた確かなリズム。' },
          { level: 3, title: '燃え上がる炎', targetValue: 14, condition: '14日連続で記録', message: '2週間の継続。勉強が日常になった。' },
          { level: 4, title: '不滅の聖火', targetValue: 30, condition: '30日連続で記録', message: '1ヶ月間毎日学び続けた鉄の習慣。' },
          { level: 5, title: '伝説の太陽', targetValue: 60, condition: '60日連続で記録', message: '2ヶ月連続達成。揺るぎない継続の象徴。' },
        ],
      },
      {
        id: 'time_hourglass',
        number: '02',
        name: '努力の砂時計',
        icon: Clock,
        currentValue: allTotalMinutes,
        unit: '分',
        tiers: [
          { level: 1, title: 'はじめの1時間', targetValue: 60, condition: '累計60分', message: '学びの砂時計が動き出した。' },
          { level: 2, title: '見習い探求者', targetValue: 300, condition: '累計5時間', message: '5時間の積み重ねが自信に変わる。' },
          { level: 3, title: '熟練の学習者', targetValue: 900, condition: '累計15時間', message: '15時間突破。確かな実力の土台。' },
          { level: 4, title: '努力の金字塔', targetValue: 3000, condition: '累計50時間', message: '50時間の大台。誰にも奪えない財産。' },
          { level: 5, title: '時の賢者', targetValue: 6000, condition: '累計100時間', message: '100時間到達。圧倒的な努力の結晶。' },
        ],
      },
      {
        id: 'deep_focus',
        number: '03',
        name: 'ディープフォーカス',
        icon: Zap,
        currentValue: maxSingleSessionMinutes,
        unit: '分',
        tiers: [
          { level: 1, title: 'クイックスパート', targetValue: 15, condition: '1回15分集中', message: 'サッと始めて集中する第一歩。' },
          { level: 2, title: 'ポモドーロ', targetValue: 30, condition: '1回30分集中', message: '30分の質の高い集中タイム。' },
          { level: 3, title: 'ディープゾーン', targetValue: 45, condition: '1回45分集中', message: '授業1コマ分の深い没頭力。' },
          { level: 4, title: '無我の境地', targetValue: 60, condition: '1回60分集中', message: '1時間じっくり向き合い切った集中力。' },
          { level: 5, title: '超集中マスター', targetValue: 90, condition: '1回90分集中', message: '90分の限界突破。最高峰の没入。' },
        ],
      },
      {
        id: 'calendar_traveler',
        number: '04',
        name: 'カレンダーの旅人',
        icon: Calendar,
        currentValue: allDaysCount,
        unit: '日',
        tiers: [
          { level: 1, title: '歩きはじめ', targetValue: 3, condition: '通算3日記録', message: 'カレンダーに最初の足跡がついた。' },
          { level: 2, title: '習慣の芽', targetValue: 10, condition: '通算10日記録', message: '10日分の記録。マイペースに前進中。' },
          { level: 3, title: 'コツコツの達人', targetValue: 30, condition: '通算30日記録', message: '通算1ヶ月分！戻ってこられる粘り強さ。' },
          { level: 4, title: '季節の冒険者', targetValue: 60, condition: '通算60日記録', message: '60日の軌跡。学びが生活の一部。' },
          { level: 5, title: '百日の覇者', targetValue: 100, condition: '通算100日記録', message: '100日達成！一生モノの学習習慣。' },
        ],
      },
      {
        id: 'photo_archivist',
        number: '05',
        name: 'ノートの記録者',
        icon: Camera,
        currentValue: allPhotoCount,
        unit: '枚',
        tiers: [
          { level: 1, title: 'はじめての1枚', targetValue: 1, condition: '写真1枚提出', message: '頑張ったノートを写真で残した。' },
          { level: 2, title: 'アルバム職人', targetValue: 5, condition: '写真5枚提出', message: '5枚の記録。見返すのが楽しくなる。' },
          { level: 3, title: 'ノートコレクター', targetValue: 15, condition: '写真15枚提出', message: '15枚の努力の証がずらり。' },
          { level: 4, title: 'ギャラリー館長', targetValue: 30, condition: '写真30枚提出', message: '30枚の積み重ね。立派な成長記録。' },
          { level: 5, title: '伝説の記録官', targetValue: 50, condition: '写真50枚提出', message: '50枚突破！圧巻の学習アーカイブ。' },
        ],
      },
      {
        id: 'subject_palette',
        number: '06',
        name: '学びのパレット',
        icon: Compass,
        currentValue: touchedSubjectsCount,
        unit: '教科',
        tiers: [
          { level: 1, title: '二刀流', targetValue: 2, condition: '2教科以上', message: '複数の分野へ視野が広がった。' },
          { level: 2, title: 'トリコロール', targetValue: 3, condition: '3教科以上', message: '3教科を切り替えて学ぶ好奇心。' },
          { level: 3, title: '四方八方', targetValue: 4, condition: '4教科以上', message: '4教科をバランスよく攻略中。' },
          { level: 4, title: '五教科制覇', targetValue: 5, condition: '5教科以上', message: '主要5教科すべてに挑戦した万能型。' },
          { level: 5, title: '全領域マスター', targetValue: 6, condition: '全6カテゴリ', message: 'あらゆる学びを網羅した知の探求者。' },
        ],
      },
      {
        id: 'teacher_bond',
        number: '07',
        name: '先生との絆',
        icon: BadgeCheck,
        currentValue: allReviewedCount,
        unit: '回',
        tiers: [
          { level: 1, title: 'はじめの印', targetValue: 1, condition: '確認1回', message: '先生に最初の頑張りが届いた。' },
          { level: 2, title: 'キャッチボール', targetValue: 5, condition: '確認5回', message: '先生とのやりとりがリズムに乗ってきた。' },
          { level: 3, title: 'パートナー', targetValue: 15, condition: '確認15回', message: '15回の確認。二人三脚の成長。' },
          { level: 4, title: '黄金の信頼', targetValue: 30, condition: '確認30回', message: '30回の絆。応援を力に変えている。' },
          { level: 5, title: '永遠の師弟', targetValue: 50, condition: '確認50回', message: '50回達成！揺るぎない信頼の証。' },
        ],
      },
      {
        id: 'weekend_challenger',
        number: '08',
        name: '週末チャレンジャー',
        icon: Sun,
        currentValue: weekendDaysCount,
        unit: '日',
        tiers: [
          { level: 1, title: '休日の第一歩', targetValue: 1, condition: '土日1日記録', message: '休みの日にも机に向かえた。' },
          { level: 2, title: '週末リズム', targetValue: 4, condition: '土日4日記録', message: '休日の勉強ペースができてきた。' },
          { level: 3, title: 'ホリデーマスター', targetValue: 10, condition: '土日10日記録', message: '土日もコツコツ積み上げる強さ。' },
          { level: 4, title: '週末の守護者', targetValue: 20, condition: '土日20日記録', message: '20回の休日学習。大きな差がつく。' },
          { level: 5, title: '無敵のウィークエンド', targetValue: 40, condition: '土日40日記録', message: '40日達成！休日を味方につけた王者。' },
        ],
      },
    ];

    return definitions.map((def) => {
      let currentLevel = 0;
      let currentTier: CardTier | null = null;
      let nextTier: CardTier | null = null;

      for (const tier of def.tiers) {
        if (def.currentValue >= tier.targetValue) {
          currentLevel = tier.level;
          currentTier = tier;
        } else if (!nextTier) {
          nextTier = tier;
        }
      }

      const maxLevel = def.tiers.length;
      const isMax = currentLevel === maxLevel;
      const prevTarget = currentTier ? currentTier.targetValue : 0;
      const nextTarget = nextTier ? nextTier.targetValue : currentTier?.targetValue || 1;
      const progressPercent = isMax
        ? 100
        : Math.min(100, Math.max(0, Math.round(((def.currentValue - prevTarget) / Math.max(1, nextTarget - prevTarget)) * 100)));

      const progressText = isMax
        ? `MAX`
        : `${def.currentValue}/${nextTarget}${def.unit}`;

      return {
        ...def,
        currentLevel,
        maxLevel,
        currentTier,
        nextTier,
        progressPercent,
        progressText,
      };
    });
  }, [entries, longestStreak, subjectRules]);

  const unlockedCount = cards.filter((c) => c.currentLevel > 0).length;
  const totalLevel = cards.reduce((sum, c) => sum + c.currentLevel, 0);
  const maxTotalLevel = cards.reduce((sum, c) => sum + c.maxLevel, 0);

  const visibleCards = useMemo(() => {
    if (filter === 'unlocked') return cards.filter((c) => c.currentLevel > 0);
    if (filter === 'locked') return cards.filter((c) => c.currentLevel === 0);
    return cards;
  }, [cards, filter]);

  return (
    <section className="space-y-4">
      {/* コレクション図鑑ヘッダー（カード枠を廃しキャンバスに直接配置） */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h3 className="text-base sm:text-lg font-extrabold text-ink tracking-tight m-0">
              実績カード
            </h3>
            <span className="text-xs font-semibold text-muted font-numbers">
              <strong className="text-ink">{unlockedCount}</strong>/{cards.length} 枚 · Lv.{totalLevel}/{maxTotalLevel}
            </span>
          </div>
        </div>

        {/* フィルター切替 */}
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 rounded-xl bg-card-subtle border border-line w-full sm:w-auto">
          {(
            [
              { key: 'all', label: `すべて (${cards.length})` },
              { key: 'unlocked', label: `獲得 (${unlockedCount})` },
              { key: 'locked', label: `未解放 (${cards.length - unlockedCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer font-numbers whitespace-nowrap ${
                filter === tab.key
                  ? 'bg-card text-ink shadow-subtle'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ミニカードスロットバー */}
      <div className="flex items-center gap-1.5">
        {cards.map((card) => {
          const theme = CARD_THEMES[card.currentLevel];
          return (
            <div
              key={card.id}
              title={`#${card.number} ${card.name} (${theme.label})`}
              className={`h-1.5 flex-1 rounded-full transition-all ${theme.slotColor}`}
            />
          );
        })}
      </div>

      {/* カード一覧（スマホでも2列でバインダーのように一覧表示） */}
      {visibleCards.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted">
          該当するカードはありません
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            const theme = CARD_THEMES[card.currentLevel];
            const isUnlocked = card.currentLevel > 0;
            const isMax = card.currentLevel === card.maxLevel;

            const frontFace = (
              <div
                className="relative w-full h-full rounded-[18px] p-3 sm:p-4 flex flex-col justify-between overflow-hidden text-white"
                style={{
                  background: theme.surface,
                  boxShadow: `inset 0 0 0 1px ${theme.ring}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                }}
              >
                {/* 背景の柔らかい発光オーラ */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: theme.aura }}
                  aria-hidden="true"
                />

                {/* 背景透かしエンブレム（トレカ風の奥行き） */}
                <div
                  className="absolute -right-5 -bottom-5 opacity-[0.06] pointer-events-none"
                  aria-hidden="true"
                >
                  <Icon size={110} strokeWidth={1.5} />
                </div>

                {/* 上部：シリアル番号・レアリティ・めくりアイコン */}
                <div className="relative z-10 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold font-numbers tracking-widest text-white/55">
                    NO.{card.number}
                  </span>
                  <div className="flex items-center gap-1">
                    <span
                      className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold tracking-wider border font-numbers ${theme.pill}`}
                    >
                      {theme.rarity}
                    </span>
                    <RotateCw size={10} className="text-white/40 shrink-0 hidden sm:block" />
                  </div>
                </div>

                {/* 中央：エンブレム＆タイトル */}
                <div className="relative z-10 flex flex-col items-center text-center my-auto py-1">
                  <div
                    className="size-12 sm:size-14 rounded-2xl grid place-items-center mb-2.5 backdrop-blur-sm"
                    style={{
                      background: isUnlocked
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255,255,255,0.04)',
                      boxShadow: `inset 0 0 0 1px ${theme.ring}, 0 8px 20px -6px rgba(0,0,0,0.5)`,
                      color: theme.accentText,
                    }}
                  >
                    {isUnlocked ? (
                      <Icon size={24} strokeWidth={2.1} />
                    ) : (
                      <Lock size={20} strokeWidth={2} />
                    )}
                  </div>

                  <h4 className="text-xs sm:text-sm font-extrabold tracking-tight text-white m-0 leading-tight">
                    {card.name}
                  </h4>
                  <p
                    className="text-[10px] sm:text-[11px] font-bold mt-0.5 m-0 truncate max-w-full"
                    style={{ color: theme.accentText }}
                  >
                    {card.currentTier ? card.currentTier.title : '未解放'}
                  </p>
                </div>

                {/* 下部：5段階レベルセグメント＋進捗 */}
                <div className="relative z-10 space-y-1.5 pt-2 border-t border-white/10">
                  <div className="grid grid-cols-5 gap-1" aria-label={`レベル ${card.currentLevel} / ${card.maxLevel}`}>
                    {Array.from({ length: card.maxLevel }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1 rounded-full transition-all ${
                          i < card.currentLevel ? theme.pipActive : 'bg-white/15'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-numbers">
                    <span className="font-bold text-white/60">
                      {isMax ? 'MAX' : `Lv.${card.currentLevel}`}
                    </span>
                    <span className="font-extrabold text-white/90">{card.progressText}</span>
                  </div>
                </div>
              </div>
            );

            const backFace = (
              <div
                className="relative w-full h-full rounded-[18px] p-3 sm:p-3.5 flex flex-col justify-between overflow-hidden text-white"
                style={{
                  background: theme.surface,
                  boxShadow: `inset 0 0 0 1px ${theme.ring}`,
                }}
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-1 pb-1.5 mb-2 border-b border-white/12">
                    <span className="text-[11px] font-extrabold text-white truncate">
                      {card.name}
                    </span>
                    <span
                      className="text-[10px] font-extrabold font-numbers shrink-0"
                      style={{ color: theme.accentText }}
                    >
                      Lv.{card.currentLevel}/{card.maxLevel}
                    </span>
                  </div>

                  {/* 5段階の進化リスト */}
                  <div className="space-y-1">
                    {card.tiers.map((tier) => {
                      const done = card.currentLevel >= tier.level;
                      const isNext = card.currentLevel + 1 === tier.level;
                      return (
                        <div
                          key={tier.level}
                          className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-md text-[10px] ${
                            done
                              ? 'bg-white/12 text-white font-semibold'
                              : isNext
                              ? 'bg-white/8 text-white/95 font-semibold ring-1 ring-white/25'
                              : 'text-white/45'
                          }`}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={`size-3.5 rounded grid place-items-center text-[8px] font-extrabold font-numbers shrink-0 ${
                                done
                                  ? 'bg-emerald-400 text-slate-950'
                                  : isNext
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-white/12 text-white/60'
                              }`}
                            >
                              {done ? <Check size={9} strokeWidth={3.5} /> : tier.level}
                            </span>
                            <span className="truncate">{tier.title}</span>
                          </div>
                          <span className="text-[9px] font-numbers text-white/65 shrink-0">
                            {tier.targetValue}{card.unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="relative z-10 text-[10px] leading-snug text-white/75 m-0 pt-1.5 border-t border-white/10 line-clamp-2">
                  {card.currentTier
                    ? card.currentTier.message
                    : card.nextTier
                    ? `条件: ${card.nextTier.condition}`
                    : ''}
                </p>
              </div>
            );

            return (
              <div key={card.id} className="w-full">
                <FlipCard
                  width="100%"
                  height={236}
                  radius={18}
                  background="transparent"
                  color="#ffffff"
                  shadow={isUnlocked}
                  shadowColor={theme.shadowColor}
                  shadowOpacity={isUnlocked ? 0.32 : 0.12}
                  glare={true}
                  glareOpacity={theme.glareOpacity}
                  tiltMax={10}
                  hoverScale={1.02}
                  ariaLabel={`${card.name}（${theme.label}）`}
                  front={frontFace}
                  back={backFace}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
